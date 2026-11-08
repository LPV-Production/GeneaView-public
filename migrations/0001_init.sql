-- ============================================================
-- GENEAVIEW — structure de la base de données (Cloudflare D1)
-- Appliquée par :  npm run db:remote   (ou db:local pour la base de test)
--
-- Règle d'or : chaque donnée généalogique porte un tree_id.
-- Le serveur vérifie TOUJOURS que le compte connecté est membre de
-- l'arbre (table tree_members) avant de lire ou d'écrire quoi que ce soit.
-- ============================================================

-- ---------- Comptes et connexion (repris de Resale Manager) ----------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- identifiant de connexion, ex. 'camille'
  label         TEXT NOT NULL,               -- nom affiché, ex. 'Camille'
  password_hash TEXT NOT NULL,               -- pbkdf2$100000$sel$empreinte (jamais le mot de passe)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,              -- empreinte du jeton (le jeton reste dans le cookie)
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL               -- en millisecondes
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  first_at  INTEGER NOT NULL
);

-- ---------- Arbres et partage ----------
CREATE TABLE trees (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_person_id TEXT,                       -- personne racine (Sosa 1), facultative
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Qui a accès à quel arbre. Le propriétaire y figure aussi (rôle 'owner').
CREATE TABLE tree_members (
  tree_id   TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tree_id, user_id)
);
CREATE INDEX tree_members_user ON tree_members(user_id);

-- ---------- Lieux (réutilisables, avec position facultative) ----------
CREATE TABLE places (
  id          TEXT PRIMARY KEY,
  tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                 -- libellé affiché, ex. « Saint-Flour, Cantal »
  city        TEXT NOT NULL DEFAULT '',      -- commune
  department  TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  latitude    REAL,
  longitude   REAL,
  geocoded_at TEXT,                          -- date de la recherche Nominatim (cache)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX places_tree ON places(tree_id, name);

-- ---------- Personnes ----------
CREATE TABLE persons (
  id             TEXT PRIMARY KEY,
  tree_id        TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  given_names    TEXT NOT NULL DEFAULT '',   -- prénoms
  surname        TEXT NOT NULL DEFAULT '',   -- nom de naissance
  married_name   TEXT NOT NULL DEFAULT '',   -- nom d'usage / de jeune fille
  nickname       TEXT NOT NULL DEFAULT '',   -- surnom
  sex            TEXT NOT NULL DEFAULT 'U' CHECK (sex IN ('M', 'F', 'U')),
  living         INTEGER NOT NULL DEFAULT 0, -- 1 = personne vivante (masquée aux lecteurs)
  photo_media_id TEXT,                       -- photo principale (table media)
  occupations    TEXT NOT NULL DEFAULT '',   -- professions, séparées par des virgules
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX persons_tree ON persons(tree_id, surname, given_names);

-- ---------- Unions (familles). Une personne peut en avoir plusieurs. ----------
-- Les dates et lieux de mariage / divorce sont des événements rattachés à la famille.
CREATE TABLE families (
  id          TEXT PRIMARY KEY,
  tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  partner1_id TEXT REFERENCES persons(id) ON DELETE SET NULL,  -- l'un des deux peut être inconnu
  partner2_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  union_type  TEXT NOT NULL DEFAULT 'unknown' CHECK (union_type IN ('marriage', 'cohabitation', 'pacs', 'unknown')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX families_tree ON families(tree_id);
CREATE INDEX families_p1 ON families(partner1_id);
CREATE INDEX families_p2 ON families(partner2_id);

CREATE TABLE family_children (
  family_id  TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  tree_id    TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  relation   TEXT NOT NULL DEFAULT 'biological' CHECK (relation IN ('biological', 'adopted', 'unknown')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, child_id)
);
CREATE INDEX family_children_child ON family_children(child_id);

-- ---------- Événements (d'une personne OU d'une famille) ----------
-- Dates incertaines : on garde le texte saisi + un qualificatif + des valeurs triables.
--   date_sort / date_sort_end = AAAAMMJJ (00 si mois ou jour inconnu), ex. 18900000 pour « 1890 ».
--   « entre 1864 et 1868 » : date_sort = 18640000, date_sort_end = 18680000.
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  tree_id       TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  person_id     TEXT REFERENCES persons(id) ON DELETE CASCADE,
  family_id     TEXT REFERENCES families(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('birth', 'baptism', 'death', 'burial', 'marriage', 'divorce',
                                              'residence', 'occupation', 'military', 'census', 'other')),
  date_text     TEXT NOT NULL DEFAULT '',
  date_qual     TEXT NOT NULL DEFAULT 'exact' CHECK (date_qual IN ('exact', 'about', 'before', 'after', 'between')),
  date_sort     INTEGER,
  date_sort_end INTEGER,
  place_id      TEXT REFERENCES places(id) ON DELETE SET NULL,
  description   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((person_id IS NULL) <> (family_id IS NULL))
);
CREATE INDEX events_person ON events(person_id);
CREATE INDEX events_family ON events(family_id);
CREATE INDEX events_tree ON events(tree_id, type);

-- ---------- Sources et citations ----------
CREATE TABLE sources (
  id          TEXT PRIMARY KEY,
  tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('civil', 'parish', 'census', 'website', 'book', 'testimony', 'other')),
  url         TEXT NOT NULL DEFAULT '',
  reference   TEXT NOT NULL DEFAULT '',      -- cote ou référence d'archive
  reliability TEXT NOT NULL DEFAULT 'clue' CHECK (reliability IN ('proof', 'clue', 'hypothesis')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sources_tree ON sources(tree_id);

-- Lien entre une source et UNE cible : personne, famille ou événement
CREATE TABLE citations (
  id         TEXT PRIMARY KEY,
  tree_id    TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  source_id  TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  person_id  TEXT REFERENCES persons(id) ON DELETE CASCADE,
  family_id  TEXT REFERENCES families(id) ON DELETE CASCADE,
  event_id   TEXT REFERENCES events(id) ON DELETE CASCADE,
  detail     TEXT NOT NULL DEFAULT '',       -- page, vue, numéro d'acte…
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((person_id IS NOT NULL) + (family_id IS NOT NULL) + (event_id IS NOT NULL) = 1)
);
CREATE INDEX citations_source ON citations(source_id);
CREATE INDEX citations_person ON citations(person_id);
CREATE INDEX citations_family ON citations(family_id);
CREATE INDEX citations_event ON citations(event_id);

-- ---------- Photos et documents (fichiers dans R2, jamais publics) ----------
CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL UNIQUE,          -- trees/<arbre>/<id>.webp ou .pdf
  thumb_key   TEXT,                          -- miniature (photos seulement)
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  date_text   TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX media_tree ON media(tree_id);

-- Un document peut être rattaché à plusieurs personnes / familles / événements
CREATE TABLE media_links (
  media_id  TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  tree_id   TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  event_id  TEXT REFERENCES events(id) ON DELETE CASCADE,
  CHECK ((person_id IS NOT NULL) + (family_id IS NOT NULL) + (event_id IS NOT NULL) = 1)
);
CREATE UNIQUE INDEX media_links_unique ON media_links(media_id, IFNULL(person_id, ''), IFNULL(family_id, ''), IFNULL(event_id, ''));
CREATE INDEX media_links_person ON media_links(person_id);
CREATE INDEX media_links_family ON media_links(family_id);
CREATE INDEX media_links_event ON media_links(event_id);

-- ---------- Liste « à chercher » par personne ----------
CREATE TABLE todos (
  id         TEXT PRIMARY KEY,
  tree_id    TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX todos_person ON todos(person_id);

-- ---------- Notifications d'anniversaires (reprises de Resale Manager) ----------
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

-- Réglages par arbre ET par utilisateur
CREATE TABLE notification_prefs (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id   TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  enabled   INTEGER NOT NULL DEFAULT 1,
  births    INTEGER NOT NULL DEFAULT 1,
  deaths    INTEGER NOT NULL DEFAULT 1,
  marriages INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, tree_id)
);
