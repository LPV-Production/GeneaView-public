-- Unions plus précises :
--  - kind     : fiançailles ou liaison (le type « union_type » d'origine garde mariage / PACS / vie commune / inconnu ;
--               l'appli voit un seul « type », voir unionPourAppli dans worker/donnees.ts)
--  - end_type : comment l'union a pris fin (divorce, séparation, annulation ; vide = en cours ou fin par décès)
--  - hidden   : 1 = union cachée aux lecteurs (ex. une liaison secrète)
ALTER TABLE families ADD COLUMN kind TEXT NOT NULL DEFAULT '' CHECK (kind IN ('', 'engagement', 'liaison'));
ALTER TABLE families ADD COLUMN end_type TEXT NOT NULL DEFAULT '' CHECK (end_type IN ('', 'divorce', 'separation', 'annulment'));
ALTER TABLE families ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
