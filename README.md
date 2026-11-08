# GeneaView

Web app de généalogie, gratuite à héberger (Cloudflare Workers + D1 + R2), utilisable sur ordinateur et téléphone (installable comme une appli).
👉 **Pour avoir ta propre version en ligne** (gratuit, avec ta propre base de données) : suis **[TUTO.md](TUTO.md)**. Comptes, mises à jour, import GEDCOM et sauvegardes y sont aussi expliqués.

## Où en est le projet

| Étape | Contenu | État |
|---|---|---|
| Maquettes | 3 directions dans `maquettes/` — choix : **B « Épuré », palette Forêt** | ✅ |
| 1 | Socle, connexion, arbres (créer, renommer, supprimer), réglages | ✅ |
| 2 | Personnes, liens familiaux, unions, événements, dates incertaines, fiches, formulaires | ✅ |
| 3 | Vue arbre « personne centrale » (déplacement, zoom, pincement) + vue « famille proche » sur téléphone | ✅ |
| 4 | Sources et citations (fiabilité), photos et PDF dans R2 (compression, visionneuse, photo principale) | ✅ |
| 5 | Numérotation Sosa (implexes compris), alertes d'incohérence, liste avec filtres (nom, lieu, période, fiche incomplète) | ✅ |
| 6 | Import GEDCOM 5.5.1 (UTF-8, Windows-1252, ANSEL ; résumé avant validation), export GEDCOM, sauvegarde ZIP complète | ✅ |
| 7 | Partage et masquage des vivants, lien de parenté, éventail 4 à 8 générations, carte (Leaflet, Nominatim), rappels d'anniversaires, PDF (fiche, ascendance, descendance), lecture hors ligne | ✅ |
| Mise en ligne | Base D1, R2 (plafond 9,5 Go), notifications, invitations par lien — voir [TUTO.md](TUTO.md) | ✅ |

## Choix technique : la vue arbre

Deux options étaient possibles : la bibliothèque libre [family-chart](https://github.com/donatso/family-chart) (licence MIT, basée sur d3) ou un dessin « maison ». **Choix : maison**, pour quatre raisons.

| | family-chart | Dessin maison (retenu) |
|---|---|---|
| Poids | d3 + la bibliothèque : environ 100 Ko de plus à télécharger | ~300 lignes, aucune dépendance |
| Style | son propre dessin, difficile à accorder au style B / Forêt et au mode sombre | les mêmes cartes, couleurs et polices que le reste de l'appli |
| Téléphone | une seule vue, à zoomer | vue graphique **et** vue « famille proche » sans zoom |
| Maintenance | dépend d'un petit projet tenu par une seule personne | code commenté en français, testé (`tests/disposition.test.ts`) |

La vue « personne centrale » n'affiche qu'une fenêtre autour d'une personne (2 à 4 générations d'ancêtres, 2 de descendants) : le calcul (`src/lib/disposition.ts`) ne porte que sur quelques dizaines de cartes, même dans un arbre de 2 500 personnes (moins de 20 ms par vue dans les tests, environ 30 ms pour recentrer dans le navigateur).

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/` | Interface (Astro + Svelte 5) |
| `worker/` | Serveur Cloudflare (`/api/*`) : `auth.ts` connexion, `acces.ts` droits par arbre, `arbres.ts` arbres, `donnees.ts` personnes / unions / événements, `documents.ts` sources et fichiers R2 |
| `commun/` | Code partagé serveur + interface : `dates.ts` (dates incertaines), `libelles.ts` (libellés en français) |
| `migrations/` | Structure de la base D1 (toutes les tables, dès maintenant) |
| `scripts/` | `creer-compte.mjs` (comptes), `generer-cles-push.mjs` (clés des notifications), `generer-icones.mjs` (icônes de l'appli) |
| `tests/` | Tests automatiques (`npm test`), sur une vraie base SQLite en mémoire |
| `maquettes/` | Les maquettes HTML statiques (famille fictive) |

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm test` | Tests automatiques |
| `npm run dev:full` | Appli complète sur http://localhost:8787 (base de test locale) |
| `npm run compte -- --local` / `--remote` | Créer un compte ou changer son mot de passe |
| `npm run db:local` / `db:remote` | Appliquer les migrations |
| `npm run deploy` | Mettre en ligne depuis ce PC |

## Licence

[MIT](LICENSE) : tu peux reprendre, modifier et partager ce projet librement, y compris pour un usage commercial, en gardant la mention de licence.
