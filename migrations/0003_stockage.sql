-- Taille de la miniature de chaque photo, pour compter l'espace R2 réellement occupé
-- (l'appli refuse tout envoi qui ferait dépasser 9,5 Go : voir worker/documents.ts)
ALTER TABLE media ADD COLUMN thumb_size INTEGER NOT NULL DEFAULT 0;
