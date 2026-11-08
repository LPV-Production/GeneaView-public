// ============================================================
// Exports d'un arbre, préparés dans le navigateur :
//  - fichier GEDCOM (à ouvrir dans n'importe quel logiciel de généalogie) ;
//  - sauvegarde complète en ZIP : toutes les données (JSON), le GEDCOM
//    et tous les fichiers (photos, PDF).
// ============================================================
import { api } from './api';
import { DonneesArbre, type Paquet } from './donnees';
import { ecrireGedcom } from './gedcom';
import type { Arbre } from './store.svelte';

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

/** Nom de fichier sans caractères gênants : « Famille Martin – Dubois » → « Famille Martin - Dubois ». */
export const nomFichier = (s: string) => s.replace(/[–—]/g, '-').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'arbre';
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Fait télécharger un fichier préparé dans le navigateur. */
export function telecharger(contenu: Blob, nom: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(contenu);
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function chargerDonnees(arbre: Arbre) {
  const p = await api<Paquet>('GET', `/trees/${arbre.id}/data`);
  return { brut: p, D: new DonneesArbre(p) };
}

export async function exporterGedcom(arbre: Arbre, auteur: string) {
  const { D } = await chargerDonnees(arbre);
  const texte = ecrireGedcom(D, { nomArbre: arbre.name, auteur });
  telecharger(new Blob([texte], { type: 'text/plain;charset=utf-8' }), `${nomFichier(arbre.name)} ${aujourdhui()}.ged`);
}

/**
 * Sauvegarde complète. `progression` reçoit un message à afficher.
 * Les photos et PDF sont déjà compressés : ils sont rangés dans le ZIP sans recompression.
 */
export async function sauvegardeComplete(arbre: Arbre, auteur: string, progression: (msg: string) => void) {
  progression('Lecture des données…');
  const { brut, D } = await chargerDonnees(arbre);
  const { zipSync, strToU8 } = await import('fflate'); // chargé seulement quand on en a besoin
  const fichiers: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const medias = brut.media ?? [];
  const nomsPris = new Set<string>();
  const index: { id: string; fichier: string; titre: string }[] = [];
  for (const [i, m] of medias.entries()) {
    progression(`Fichier ${i + 1} sur ${medias.length}…`);
    const r = await fetch(`/api/trees/${arbre.id}/media/${m.id}/file`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`Impossible de lire « ${m.title || m.id} »`);
    let nom = `fichiers/${nomFichier(m.title || m.id)}.${EXT[m.mime] ?? 'bin'}`;
    if (nomsPris.has(nom)) nom = nom.replace(/(\.[a-z]+)$/, ` (${m.id.slice(0, 8)})$1`);
    nomsPris.add(nom);
    fichiers[nom] = [new Uint8Array(await r.arrayBuffer()), { level: 0 }];
    index.push({ id: m.id, fichier: nom, titre: m.title });
  }
  progression('Préparation du fichier ZIP…');
  const json = { format: 'geneaview-sauvegarde', version: 1, date: new Date().toISOString(), arbre: { nom: arbre.name, description: arbre.description, personne_racine: arbre.root_person_id }, fichiers: index, donnees: brut };
  fichiers['donnees.json'] = strToU8(JSON.stringify(json, null, 1));
  fichiers['arbre.ged'] = strToU8(ecrireGedcom(D, { nomArbre: arbre.name, auteur }));
  fichiers['LISEZ-MOI.txt'] = strToU8(
    `Sauvegarde GeneaView de l'arbre « ${arbre.name} » du ${new Date().toLocaleString('fr-FR')}\r\n\r\n` +
    `- donnees.json : toutes les données (personnes, unions, événements, lieux, sources, citations, notes, « à chercher »)\r\n` +
    `- arbre.ged : le même arbre au format GEDCOM 5.5.1, lisible par tous les logiciels de généalogie\r\n` +
    `- fichiers/ : ${medias.length} photo(s) et document(s)\r\n`,
  );
  const zip = zipSync(fichiers, { level: 6 });
  telecharger(new Blob([zip as BlobPart], { type: 'application/zip' }), `Sauvegarde ${nomFichier(arbre.name)} ${aujourdhui()}.zip`);
  return { personnes: D.personnes.size, fichiers: medias.length, taille: zip.length };
}
