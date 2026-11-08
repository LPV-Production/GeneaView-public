# GeneaView

Web app de généalogie, gratuite à héberger (Cloudflare Workers + D1 + R2), utilisable sur ordinateur et téléphone (installable comme une appli).
👉 **Pour avoir ta propre version en ligne** (gratuit, avec ta propre base de données) : suis **[TUTO.md](TUTO.md)**. Comptes, mises à jour, import GEDCOM et sauvegardes y sont aussi expliqués.

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
