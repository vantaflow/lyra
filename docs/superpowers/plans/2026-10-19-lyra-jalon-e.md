# Lyra — plan du jalon E : importer et exporter

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Développé en parallèle du jalon C, dans le worktree `lyra.worktrees/jalon-e` (branche `jalon-e`), fusionné dans `main` à la fin.

**Goal:** importer depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari et Orion (favoris, historique, onglets ouverts et groupes → constellations, moteurs et mots-clés, extensions, réglages transposables ; mots de passe : voir Task 4) et exporter (favoris HTML, historique CSV, ciel JSON, réglages JSON, paquet `.lyra` chiffré, sauvegarde automatique).

**Spec:** `docs/superpowers/specs/2026-10-19-lyra-design.md` §4 (Importer et exporter), §5 (`Importer`, `Exporter`), §9 (laissé au constructeur, réponse 10 sur `.lyra`). **Design (fait foi) :** `docs/design/project/Importation.dc.html`.

## Global Constraints
- **Aucune fenêtre visible** pendant le travail (tests et captures avec `LYRA_TEST=1`, jamais `LYRA_E2E_VISIBLE` ni `npm run dev`) — consigne de l'utilisateur.
- Lecture seule des profils des autres navigateurs : toujours **copier** le fichier (base verrouillée par le navigateur ouvert) dans un dossier temporaire, lire la copie, la supprimer. Jamais d'écriture dans leurs dossiers.
- Pas de module natif : SQLite via `sql.js` (WASM, pur JS), plist binaire via un lecteur JS, mozlz4 décodé en JS.
- Aucune requête réseau pendant l'import, sauf la réinstallation d'extensions (déléguée au jalon B).
- Chemins Windows et macOS (et Linux si trivial) ; tests unitaires sur des **fixtures** fabriquées (petites bases SQLite, JSON, plist, mozlz4) committées dans `src/main/import/fixtures/`.
- Commits en français terminés par `Claude-Session: https://claude.ai/code/session_014rF1oHCSDeDLpfg5ceCFns`.

## Review Focus
1. Navigateur ouvert (base verrouillée) → import réussi via la copie.
2. Données volumineuses (100 000 visites) → pas de blocage de l'interface (lecture par lots, progression).
3. Doublons : importer deux fois ne duplique ni favoris ni historique.
4. Paquet `.lyra` : mauvaise phrase de passe → erreur claire, rien d'écrasé ; jamais de mots de passe dedans.
5. Profil absent / corrompu → « Non trouvé » / erreur lisible, pas de crash.

### Task 1 : détection et lecteurs Chromium
`src/main/import/{detection,chromium}.ts` : profils de Chrome, Edge, Brave, Vivaldi (Windows `%LOCALAPPDATA%`, macOS `~/Library/Application Support`) ; `Bookmarks` (JSON, dossiers et barre), `History` (SQLite : urls/visits, 92 jours par défaut), moteurs (`Web Data` keywords), onglets ouverts et groupes (fichier `Sessions/Session_*`/`Tabs_*` au format SNSS : lecture best effort ; si illisible, l'élément est marqué indisponible avec raison), extensions (dossier `Extensions/<id>` + `Preferences` → IDs du Chrome Web Store), réglages transposables (page d'accueil, dossier de téléchargement, langue, zoom par site). Tests sur fixtures.

### Task 2 : lecteurs Firefox, Safari, Orion
`firefox.ts` : `profiles.ini`, `places.sqlite` (favoris, historique), `sessionstore-backups/recovery.jsonlz4` (onglets, groupes : mozlz4), `search.json.mozlz4`, `extensions.json` (IDs AMO). `safari.ts` (macOS) : `Bookmarks.plist`, `History.db` (accès disque complet : message clair si refusé). `orion.ts` (macOS) : structure WebKit sous `~/Library/Application Support/Orion` (best effort, documenté). Tests sur fixtures.

### Task 3 : application dans Lyra
`src/main/import/appliquer.ts` : favoris (dossier « Importés de <navigateur> », sans doublon), historique (fusion sans doublon), onglets → constellations (même nom, couleur la plus proche de la palette), moteurs et mots-clés, réglages transposables, extensions (liste mise en file pour le jalon B : `import.extensionsEnAttente`), cookies (optionnel, désactivé par défaut ; Chromium : chiffrés par l'OS → indisponibles en v1, dit dans l'interface). Progression par événements, travail par lots.

### Task 4 : exporter et paquet `.lyra`
`src/main/export/*` : favoris HTML Netscape, historique CSV, ciel JSON, réglages JSON ; paquet `.lyra` (zip : réglages, règles par site, ciel, favoris, historique, liste des extensions, thèmes ; cookies seulement si coché ; **jamais de mots de passe**) chiffré AES-256-GCM, clé PBKDF2-SHA-256 ≥ 600 000 itérations (Web Crypto) ; import d'un `.lyra` ; sauvegarde automatique nocturne dans un dossier choisi. Mots de passe : Lyra n'en stocke pas ; v1 = message « Exportez-les depuis le navigateur d'origine vers votre gestionnaire » (les mots de passe Chromium sont chiffrés par l'OS).

### Task 5 : interface et e2e
Page Réglages « Importer et exporter » conforme à `Importation.dc.html` (cartes des navigateurs détectés, cases à cocher avec compteurs, « Importer maintenant », « Aperçu détaillé », exports, paquet, sauvegarde automatique) ; e2e avec des profils de fixtures pointés par `LYRA_IMPORT_RACINE` (sous `LYRA_TEST` seulement).
