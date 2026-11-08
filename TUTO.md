# TUTO — Mettre en ligne et gérer GeneaView

Le code est sur **GitHub** ; le site, la base de données et les fichiers sont chez **Cloudflare**, dans les offres gratuites. Ce tuto part de zéro : à la fin, tu as **ta propre** GeneaView en ligne, avec ta propre base de données.

**Sommaire**
1. [Comment ça marche](#1-comment-ça-marche)
2. [Première mise en ligne (une seule fois)](#2-première-mise-en-ligne-une-seule-fois)
3. [Installer l'appli sur ton téléphone](#3-installer-lappli-sur-ton-téléphone)
4. [Au quotidien : mettre à jour l'appli](#4-au-quotidien--mettre-à-jour-lappli)
5. [Gérer les comptes](#5-gérer-les-comptes)
6. [Importer un fichier GEDCOM](#6-importer-un-fichier-gedcom)
7. [Faire une sauvegarde](#7-faire-une-sauvegarde)
8. [Tester sur ton ordinateur](#8-tester-sur-ton-ordinateur)
9. [Dépannage](#9-dépannage)

---

## 1. Comment ça marche

| Partie | Où | Rôle |
|---|---|---|
| L'interface | dossier `src/` | Les écrans (Astro + Svelte) |
| Le serveur | dossier `worker/` | Vérifie la connexion et les droits, lit/écrit dans la base et les fichiers |
| La base de données | Cloudflare **D1** | Les arbres, personnes, unions, événements, sources… |
| Les photos et documents | Cloudflare **R2** | Les fichiers eux-mêmes (jamais publics) |
| La structure de la base | dossier `migrations/` | Créée automatiquement par une commande |
| Les maquettes | dossier `maquettes/` | Les 3 propositions de design (B + palette Forêt retenue), avec une famille fictive |

- **Un arbre = un espace protégé.** À chaque demande, le serveur vérifie que le compte connecté fait partie de l'arbre (propriétaire, éditeur ou lecteur). Un compte qui n'en fait pas partie reçoit « Arbre introuvable », comme si l'arbre n'existait pas.
- **Les mots de passe ne sont jamais stockés**, seulement une empreinte chiffrée. Après 5 essais ratés, l'identifiant est bloqué 15 minutes. La connexion dure 60 jours sur chaque appareil.
- **Pas d'inscription publique** : c'est toi qui crées les comptes avec une commande (section 5).
- **Gratuit** : D1 (5 Go) et R2 (10 Go de fichiers) suffisent largement pour des milliers de personnes et de photos, d'autant que les photos sont réduites avant l'envoi.

---

## 2. Première mise en ligne (une seule fois)

Avant de commencer, il te faut :
- un compte **GitHub** (gratuit) et un compte **Cloudflare** (gratuit) ;
- **Node.js 22.12 ou plus récent** (https://nodejs.org) et **Git** (https://git-scm.com) installés sur ton ordinateur.

Toutes les commandes se tapent dans un terminal ouvert **dans le dossier du projet** (sous Windows : clic droit dans le dossier → « Ouvrir dans le Terminal »).

### 2.1 Récupérer ta propre copie du projet
1. Sur la page GitHub de ce projet, clique **Use this template → Create a new repository**.
2. Donne-lui un nom (par exemple `geneaview`), choisis **Private** (conseillé : ce sera ta version à toi), puis **Create repository**.
3. Récupère-la sur ton ordinateur (remplace `ton-pseudo` par ton identifiant GitHub) :
```bash
git clone https://github.com/ton-pseudo/geneaview.git
```
```bash
cd geneaview
```
Ta copie est **totalement indépendante** : elle a sa propre base de données, vide, et personne d'autre n'y a accès.

### 2.2 Installer les outils du projet
```bash
npm install
```

### 2.3 Se connecter à Cloudflare depuis ce PC
```bash
npx wrangler login
```
Une page s'ouvre dans ton navigateur : connecte-toi à ton compte Cloudflare et accepte.

### 2.4 Créer ta base de données
```bash
npx wrangler d1 create geneaview
```
La commande affiche un bloc contenant `"database_id": "xxxxxxxx-xxxx-…"`. Copie cet identifiant et colle-le dans `wrangler.jsonc`, à la place de `REMPLACE-PAR-TON-DATABASE-ID`. Enregistre.

Puis crée les tables (vides) :
```bash
npm run db:remote
```

### 2.5 Activer R2 et créer l'espace des fichiers
R2 est **gratuit jusqu'à 10 Go**, mais Cloudflare demande une **carte bancaire** pour l'activer (rien n'est prélevé tant que tu restes sous les limites gratuites).
1. https://dash.cloudflare.com → menu de gauche **R2 Object Storage** → **Activer R2** (ou **Purchase R2 plan**) → choisis l'offre gratuite et ajoute la carte.
2. Puis, dans le terminal :
```bash
npx wrangler r2 bucket create geneaview-fichiers
```
Ne rends **jamais** ce bucket public : les fichiers passent uniquement par le serveur, qui vérifie qui les demande.

**Pour ne jamais payer** : l'appli refuse tout envoi qui ferait dépasser **9,5 Go** au total (l'offre gratuite va jusqu'à 10 Go). L'espace utilisé s'affiche dans **Réglages → Espace de stockage**. Les photos sont déjà réduites avant l'envoi (1600 px, format WebP : environ 200 à 400 Ko par photo, soit plus de 25 000 photos possibles). Les PDF, eux, sont envoyés tels quels (15 Mo maximum chacun).

⚠️ Tant que R2 n'est pas activé, la mise en ligne (étape 2.8) **échoue** avec « bucket not found » ou « enable R2 » : c'est normal, active R2 d'abord.

### 2.6 Créer les clés des notifications
```bash
npm run cles-push
```
- La **clé publique** s'affiche : colle-la dans `wrangler.jsonc`, entre les guillemets de la ligne `"VAPID_PUBLIC_KEY": ""`. Enregistre.
- La **clé privée** est rangée dans le fichier `.dev.vars` de ton PC, qui n'est **jamais** envoyé sur GitHub. Tu l'enverras à Cloudflare à l'étape 2.9.

### 2.7 Envoyer tes réglages sur GitHub
```bash
git add wrangler.jsonc
```
```bash
git commit -m "Mes réglages Cloudflare"
```
```bash
git push
```
Les fichiers personnels (`.dev.vars`, `compte-test.local.txt`, sauvegardes) sont exclus automatiquement par `.gitignore`.

### 2.8 Connecter Cloudflare à GitHub
1. https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Import a repository** → **Get started**.
2. Choisis ton dépôt et configure :
   | Champ | Valeur |
   |---|---|
   | Project name | `geneaview` (**exactement** comme dans `wrangler.jsonc`) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Production branch | `main` |
3. **Save and Deploy**. Au bout de 1 à 2 minutes, Cloudflare affiche l'adresse de ton site, du type `https://geneaview.ton-sous-domaine.workers.dev`.
   Recopie cette adresse dans `wrangler.jsonc`, ligne `VAPID_SUBJECT` (à la place de `https://geneaview.TON-SOUS-DOMAINE.workers.dev`), puis refais `git add wrangler.jsonc`, `git commit -m "Adresse du site"` et `git push`.

### 2.9 Activer l'envoi des notifications
Envoie la clé privée (étape 2.6) à Cloudflare comme **secret** :
```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```
Quand c'est demandé, colle la valeur entre apostrophes de la ligne `VAPID_PRIVATE_KEY='…'` de `.dev.vars` (tout ce qui est entre `{` et `}`, accolades comprises).

### 2.10 Créer ton compte
```bash
npm run compte -- --remote
```
Le script demande l'identifiant (ex. `camille`), le nom affiché (ex. `Camille`) puis le mot de passe (rien ne s'affiche quand tu tapes, c'est normal). **10 caractères minimum.**

C'est le **seul** compte à créer avec le terminal : ta famille, elle, crée son compte toute seule grâce à un **lien d'invitation** (voir section 5).

### 2.11 Vérifier
Ouvre l'adresse du site, connecte-toi, crée un arbre. Il doit apparaître sur la page d'accueil.

---

## 3. Installer l'appli sur ton téléphone

**iPhone**
1. Ouvre l'adresse du site dans **Safari**.
2. Bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Ouvre l'appli **depuis sa nouvelle icône** (petit arbre blanc sur fond vert), puis connecte-toi.

**Android**
1. Ouvre l'adresse dans **Chrome** → menu ⋮ → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
2. Ouvre l'appli depuis son icône et connecte-toi.

Le mode clair ou sombre suit celui du téléphone. On peut le forcer dans **Réglages → Apparence**.

### Saisir sa famille
1. Ouvre un arbre → **Ajouter la première personne** (toi, ou la personne dont tu cherches les ancêtres).
2. Sur sa fiche, bloc **Famille** : **Ajouter un parent**, **Conjoint**, **Ajouter un enfant**. Chaque fois, tu peux créer une **nouvelle personne** ou relier quelqu'un **déjà dans l'arbre**.
3. Les **dates incertaines** : choisis la précision (Exacte, Vers, Avant, Après, Entre) puis tape `1890`, `03/1890`, `12/03/1890` ou `12 mars 1890`. Sous le champ, l'appli affiche comment elle a compris la date.
4. Les **lieux** déjà saisis sont proposés pendant que tu tapes. Écris-les sous la forme « Commune, Département, Pays ».
5. Le mariage se saisit dans la **fiche de l'union** (lien sous le nom du conjoint), avec les enfants du couple.
6. Le menu **⋯** d'une fiche permet de la définir comme **personne racine** (Sosa 1) ou de la supprimer.
7. **Familles recomposées** : en ajoutant un enfant, choisis **« Enfant de … et de… »** : l'une des unions existantes, **une autre personne déjà dans l'arbre** (l'union est créée toute seule), ou **autre parent inconnu**. Les demi-frères et demi-sœurs s'affichent avec le parent en commun (« même père »).
8. **Un enfant mal rattaché** (« ce n'est pas le fils de Marie mais de Jeanne ») : sur sa fiche, **Changer les parents**, puis choisis le bon couple.
9. **Type et fin d'une union** : dans la fiche de l'union → **Modifier** : mariage, PACS, vie commune, fiançailles, **liaison** ; fin par **divorce**, **séparation** ou annulation. Le **veuvage** s'affiche tout seul quand un conjoint est décédé. Dans l'arbre, une union terminée est tracée en tirets, une liaison en pointillés.
10. **Liaison secrète** : coche **« Cacher cette union aux lecteurs »** : les lecteurs ne voient ni l'union, ni le lien de ses enfants avec ce couple.
11. **Belle-famille** : chaque fiche a une rubrique qui liste beaux-parents, conjoints des parents (beau-père, belle-mère par remariage), beaux-frères et belles-sœurs, enfants du conjoint, gendres et belles-filles, avec des boutons pour ajouter les parents d'un conjoint. En ajoutant la mère d'un enfant dont le père a plusieurs compagnes, l'appli les propose en un clic (**« C'est … »**) ; une compagne qui n'est pas la mère reste une belle-mère : ne l'ajoute pas comme parent.

### Photos, documents et sources
- Sur une fiche (personne ou union), bloc **Photos et documents** → **Ajouter** : choisis une ou plusieurs photos, ou des PDF (actes scannés…). Sur téléphone, tu peux prendre la photo directement.
- Les photos sont **réduites automatiquement** avant l'envoi (1 600 px de côté, format WebP) : une photo de téléphone de 4 Mo pèse ensuite 200 à 500 Ko. Les PDF sont envoyés tels quels, **15 Mo maximum**.
- Touche une vignette pour l'ouvrir en grand : flèches pour passer à la suivante, **Télécharger**, **Photo principale** (elle apparaît alors sur la fiche et dans l'arbre).
- Bloc **Sources** → **Citer une source** : choisis une source déjà saisie ou crée-la (titre, type, cote d'archive, lien web) et indique sa **fiabilité** : *preuve* (un acte qui l'établit), *indice* (un élément concordant), *hypothèse* (à confirmer). Le champ « détail » sert pour la page ou la vue.
- Un événement (naissance, mariage…) peut aussi avoir ses sources et documents : ouvre-le depuis la chronologie.
- Les fichiers ne sont **jamais publics** : même avec l'adresse exacte d'une photo, il faut être connecté et membre de l'arbre pour la voir.

### Numéros Sosa, alertes et fiches incomplètes
- **Sosa** : choisis la personne racine (menu **⋯** de sa fiche → *Définir comme personne racine*). Elle porte le n° 1, son père le 2, sa mère le 3, le père d'une personne n° *n* porte le n° 2*n* et sa mère 2*n* + 1. Les numéros s'affichent sur les fiches, dans l'arbre et dans la liste. Un ancêtre présent par deux chemins (mariage entre cousins) a deux numéros.
- **Alertes** (encadré orange sur la fiche, ⚠ dans l'arbre) : enfant né avant un parent ou après le décès de sa mère, parent de moins de 13 ans ou de plus de 70 ans à la naissance, décès avant la naissance, mariage avant 13 ans, personne de plus de 110 ans sans date de décès. Ce ne sont que des avertissements : rien n'est bloqué. Avec des dates incertaines (« vers 1890 »), l'alerte n'apparaît que si l'incohérence est certaine.
- **Onglet Personnes** : recherche par nom, bouton **Filtres** (lieu, période de naissance), puis *Fiches incomplètes* (ce qui manque : date, lieu, parents, sources), *À vérifier* (alertes) et *Ancêtres*. Tri par nom, par date de naissance ou par Sosa.

### Se promener dans l'arbre
- En ouvrant un arbre, on arrive sur la **vue arbre** : ancêtres au-dessus, descendants en dessous, conjoints à côté.
- **Clic** sur une personne : elle passe au centre. **Double-clic** (ou bouton **Fiche** en bas à gauche) : sa fiche s'ouvre.
- **Se déplacer** : glisser avec la souris ou le doigt. **Zoomer** : molette, pincement à deux doigts, ou boutons **+ / −** en bas à droite.
- En haut : **Centrer sur…** pour retrouver quelqu'un, **2 / 3 / 4** générations d'ancêtres, et le choix de vue : **Arbre**, **Proche** (la famille proche, pratique sur téléphone) ou **Liste**.
- Les cases en pointillés **Ajouter le père / la mère** permettent de compléter les ancêtres directement depuis l'arbre.
- Le bouton **Retour** du téléphone ou du navigateur revient à la personne précédente.

---

## 4. Au quotidien : mettre à jour l'appli

Après une modification (par toi ou par Claude) :
```bash
git add .
```
```bash
git commit -m "Ce que j'ai changé"
```
```bash
git push
```
Cloudflare remet l'appli à jour tout seul en 1 à 2 minutes (onglet **Deployments**). Tes données ne bougent pas.

**Si une modification change la structure de la base** (nouveau fichier dans `migrations/`), lance aussi, une fois :
```bash
npm run db:remote
```

Tu peux aussi mettre en ligne directement depuis ton PC, sans passer par GitHub :
```bash
npm run deploy
```

---

## 5. Gérer les comptes

- **Inviter quelqu'un (sa compagne, ses parents, sa sœur…)** : **Réglages → Mes arbres → Partager → Créer un lien d'invitation**, en choisissant le rôle (Éditeur pour contribuer aux recherches, Lecteur pour seulement consulter). Envoie le lien par SMS, WhatsApp ou e-mail (bouton **Envoyer…** sur téléphone, ou **Copier**).
  - La personne ouvre le lien, choisit son prénom, son identifiant et son mot de passe, et arrive directement dans l'arbre. Si elle a déjà un compte, elle choisit « J'ai déjà un compte » et se connecte : l'arbre s'ajoute à ses autres arbres.
  - Le lien sert **une seule fois** et expire au bout de **7 jours**. Les invitations pas encore utilisées s'affichent dans la même fenêtre, avec un bouton **Annuler**.
  - Le lien n'est montré qu'au moment où il est créé : si tu l'as perdu, annule l'ancien et crée-en un nouveau.
  - Chacun peut créer **ses propres arbres** et inviter les autres de la même façon (par exemple ta compagne pour sa branche). Tous les arbres auxquels on a accès apparaissent sur la page d'accueil.
- **Créer un compte depuis le terminal** (si besoin) : `npm run compte -- --remote`, avec un nouvel identifiant.
- **Changer ton mot de passe** : dans l'appli, **Réglages → Mot de passe**. Tes autres appareils sont déconnectés.
- **Mot de passe oublié** : relance `npm run compte -- --remote` avec le même identifiant. Le mot de passe est remplacé, les arbres restent.
- **Partager avec un compte qui existe déjà** : **Réglages → Mes arbres → Partager → Ajouter un compte existant**, avec son identifiant et le rôle :
  - **Lecteur** : voit l'arbre, mais les personnes **vivantes** apparaissent comme « Personne vivante », sans nom, dates, lieux, photos, documents ni sources. Ne peut rien modifier.
  - **Éditeur** : voit tout et peut tout modifier, sauf renommer, partager ou supprimer l'arbre.
  - Ce masquage est fait par le serveur : les informations cachées ne sont jamais envoyées au téléphone du lecteur.
- **Quitter un arbre** partagé avec toi : **Réglages → Partagés avec moi → Quitter**.

---

## 6. Importer un fichier GEDCOM

Le GEDCOM est le format d'échange de tous les logiciels de généalogie (Geneanet, Heredis, MyHeritage, Ancestry, Gramps…).
1. Dans ton ancien logiciel, exporte ton arbre en **GEDCOM** (fichier `.ged`). Sur Geneanet : *Mon arbre → Télécharger mon arbre → GEDCOM*.
2. Dans GeneaView, page **Mes arbres** → **Importer GEDCOM** → choisis le fichier.
3. L'appli lit le fichier **sur ton appareil** et affiche un **résumé** : nombre de personnes, d'unions, d'événements, de lieux, de sources, et les éventuels avertissements (dates d'un autre calendrier gardées telles quelles, photos non comprises dans le fichier…).
4. Choisis le nom du nouvel arbre et clique **Créer l'arbre**. Garde la page ouverte pendant l'envoi (quelques secondes à une minute pour plusieurs milliers de personnes).
5. La première personne du fichier devient la **personne racine** (Sosa 1) ; tu peux en choisir une autre depuis sa fiche.

Bon à savoir :
- L'import crée **toujours un nouvel arbre** : tes arbres existants ne sont jamais modifiés.
- Les personnes sans décès connu et nées il y a moins de 100 ans sont marquées **vivantes** (masquées aux lecteurs).
- Les photos ne sont pas dans les fichiers GEDCOM : ajoute-les ensuite depuis les fiches.
- Si l'import échoue en cours de route, l'arbre à moitié rempli est supprimé automatiquement : tu peux réessayer.

---

## 7. Faire une sauvegarde

**Réglages → Exporter et sauvegarder**, pour chaque arbre :
- **GEDCOM** : le fichier `.ged`, à ouvrir dans n'importe quel logiciel de généalogie.
- **Sauvegarde ZIP** : une sauvegarde complète avec `donnees.json` (absolument toutes les données), `arbre.ged` et un dossier `fichiers/` avec toutes les photos et tous les PDF.

Conseil : fais une sauvegarde ZIP **une fois par mois** (et avant de gros changements), et range-la sur une clé USB ou un autre disque que ton ordinateur.

---

## 8. Tester sur ton ordinateur

Une base de **test** séparée existe sur ton PC, sans rapport avec celle en ligne.
```bash
npm run db:local
```
Crée un compte de test (une seule fois) :
```bash
npm run compte -- --local
```
Puis lance l'appli :
```bash
npm run dev:full
```
et ouvre http://localhost:8787.

Pour lancer les tests automatiques (connexion, droits d'accès…) :
```bash
npm test
```

Pour revoir les maquettes : double-clique sur `maquettes/index.html`.

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| La construction Cloudflare échoue avec « database_id » | Tu n'as pas remplacé l'identifiant dans `wrangler.jsonc` (étape 2.4). |
| La construction échoue avec « bucket » ou « R2 » | R2 n'est pas activé ou le bucket `geneaview-fichiers` n'existe pas (étape 2.5). |
| « Trop d’essais. Réessaie dans 15 min. » | Protection contre les devinettes de mot de passe : attends 15 minutes. |
| « Arbre introuvable » | L'arbre a été supprimé, ou ton compte n'en fait pas (ou plus) partie. |
| Voir les erreurs du serveur | Cloudflare → ton Worker `geneaview` → onglet **Logs**. |
