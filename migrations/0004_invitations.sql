-- Invitations : un lien à usage unique, valable 7 jours, qui crée un compte
-- (ou utilise un compte existant) et donne accès à un arbre.
-- Seule l'empreinte du code est gardée : même en lisant la base, on ne peut pas s'en servir.
CREATE TABLE invitations (
  id          TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL UNIQUE,
  tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,              -- en millisecondes
  expires_at  INTEGER NOT NULL,
  used_by     TEXT,                          -- compte qui l'a utilisée (vide tant qu'elle est libre)
  used_at     INTEGER
);
CREATE INDEX invitations_arbre ON invitations(tree_id);
