-- ============================================================
-- Notifications d'anniversaires : choix « anniversaires ronds seulement »
-- (1 = seulement tous les 10 ans pour les ancêtres, 0 = chaque année).
-- Les anniversaires des personnes vivantes sont envoyés chaque année.
-- ============================================================
ALTER TABLE notification_prefs ADD COLUMN round_only INTEGER NOT NULL DEFAULT 1;
