# SDD ledger — plan: docs/superpowers/plans/2026-10-19-lyra-jalon-e.md
Contrôleur : session ORION HELP (c72a5410, Mac). Tâches 1-2 faites et approuvées (Windows), fusionnées ; branche jalon-e mise à jour avec origin/main (830917a, jalon C terminé), typecheck OK, vitest 638/638.
Reste : Task 3 (découpée en 3.1..3.5 selon docs/superpowers/plans/2026-10-19-lyra-jalon-e-task3.md), Task 4 (export, paquet .lyra), Task 5 (interface Importation.dc.html + e2e).
Ruling: la Task 3 est exécutée en 5 sous-tâches dispatchées séparément (une relecture par sous-tâche), le plan détaillé servant de brief à chacune avec un périmètre explicite — le plan détaillé le prévoit (« un commit chacune ») et la tâche est trop large pour un seul implémenteur — coût si faux : plus de relectures.

## Pré-vol
| Paire / tâche | Produit vs consommé | Constat |
|---|---|---|
| 3.1 → 3.3 | 3.1 ajoute Compteurs.extensions.firefox, ExtensionImportee.imposee ; 3.3 les consomme | cohérent |
| 3.2 → 3.3 | 3.2 crée ajouterLot, importer, creerConstellation, ouvrirEndormie, PALETTE_CONSTELLATIONS, moteursPerso, Settings.import ; 3.3 les appelle via des interfaces de cibles | cohérent ; 3.3 doit utiliser exactement les signatures de 3.2 (à transmettre au dispatch) |
| 3.3 → 3.5 | ResultatImport / OptionsApplication (types.ts) consommés par l'IPC | cohérent |
| 3.4 → 3.5 | protocole worker ↔ main consommé par ipc.ts | cohérent |
| 3.5 → Task 5 | contrat IPC import:* consommé par l'interface | cohérent, le contrat est figé en §3 du plan détaillé |
| Task 3 ↔ jalon C | le plan détaillé est antérieur au jalon C : numéros de ligne périmés ; fenêtres privées désormais réelles | Ruling ci-dessous |
| Task 4 seule | export + .lyra ; importe aussi un .lyra → réutilise appliquer() de 3.3 | cohérent si 3.3 accepte des DonneesImportees d'une autre source |
| Task 5 seule | interface conforme à Importation.dc.html + e2e LYRA_IMPORT_RACINE | cohérent |
Ruling: les IPC import:* sont refusés depuis une fenêtre privée (estPrivee du jalon C) et l'import n'écrit jamais dans une fenêtre privée (onglets importés ouverts dans une fenêtre normale) — le plan détaillé le dit pour les IPC ; le jalon C a rendu les fenêtres privées réelles — coût si faux : aucun.
Ruling: les numéros de ligne du plan détaillé (index.ts, TabManager.ts…) sont indicatifs ; les implémenteurs se repèrent par les noms de fonctions — coût si faux : aucun.

## Journal
- 04:10 3.1 : implémenteur dispatché (sonnet), BASE 830917a
- Info ORION CLONE : jalon B tâches 1-4 approuvées ; file d'import = installerParId({ id, nom, magasin }) / installerFile(liste, surProgression) dans src/main/extensions/file.ts (jalon-b) ; branchement sur import.extensionsEnAttente par B (tâche 6) si E fusionné avant, sinon par E. Format de la file à garder : { id, nom, magasin: 'chrome'|'edge'|'firefox'|'inconnu' }.
- 3.1 : DONE_WITH_CONCERNS (0cbc1a9, 2428e26 ; vitest 647, typecheck OK) ; pas de RED observé ; jonction NTFS exercée sous Windows seulement.
- 3.1: minor (deferred): repli après boucle de lireOnglets (propagation du code) sans test (chromium.test.ts:36).
- 3.1: minor (deferred): pas de test de compter() avec firefox > 0.
- 3.1: minor (deferred): filtre !/generer/ sur le chemin complet et copie en doublon de fixtures/chromium (detection.test.ts:486).
- 3.1: minor (deferred): test jonction ne vérifie pas que le lien lui-même est ignoré (copie.systeme.test.ts:~303).
- 3.1: complete (commits 830917a..2428e26, review clean)
- 04:14 3.2 : implémenteur dispatché (sonnet), BASE 2428e26
- 3.2 : DONE (c26dfe4 ; vitest 669, typecheck OK)
- 3.2: minor (deferred → porté dans le brief de 3.3): ouvrirEndormie ne filtre aucun schéma d'URL (TabManager.ts:111-120) — appliquer.ts doit filtrer (SCHEMAS_OUVRABLES / interditAuxSites).
- 3.2: minor (deferred → 3.3): History.importer ignore v.prive (History.ts:121).
- 3.2: minor (deferred → 3.3): file d'extensions — fusion remplace les tableaux ; appliquer.ts envoie la file complète, une extension redemandée remonte en tête avec sa nouvelle date.
- 3.2: minor (deferred → 3.3): reglagesEnAttente.pageAccueil non effaçable par patch (validate.ts).
- 3.2: minor (deferred): commentaire Fiche.dates faux (History.ts:31) ; compacter() synchrone à mesurer au test de volume ; SOURCES duplique NavigateurSource (validate.ts:102) ; shared/types.ts importe un type de main/import ; couleur des moteurs perso dans Palette.tsx:17 ; Settings.import modifiable depuis le renderer.
- 3.2: complete (commits 2428e26..c26dfe4, review clean)
- 04:20 3.3 : implémenteur dispatché (sonnet), BASE c26dfe4
- 3.3 : DONE_WITH_CONCERNS (5cc56c1 ; 77 tests du module, suite 746, typecheck OK).
Ruling: le plan détaillé (§2 Favoris) demandait de retirer le « / » final d'un chemin vide (https://a.fr/ → https://a.fr) ; c'est faux : Lyra enregistre ses favoris natifs depuis l'URL WHATWG (https://a.fr/), donc les doublons ne seraient plus vus. Normalisation retenue = sérialisation WHATWG (`new URL(u).href`) sans fragment vide — la même forme que les favoris natifs — coût si faux : quelques doublons d'adresses équivalentes non détectés.
Ruling: couleur de constellation par distance OKLab avec poids de clarté 0,2 (au lieu de l'euclidienne pure du plan), parce que l'euclidienne envoyait cyan foncé → gris et jaune → orange — coût si faux : une couleur de groupe un peu différente de celle attendue.
Ruling: la file d'extensions passe par la cible `reglages` (pas de cible `extensions` séparée) — conforme à la décision 3 (file complète via setSettings) — coût si faux : aucun.
- 3.3 : relecture c26dfe4..1ec3c35 → Needs fixes. Important : (1) avance()/surProgression hors try peut rejeter appliquer ; (2) compteur visites absent du résultat.
Ruling: le §6 attendait « onglets annule » pour un abandon au 2e lot d'historique ; impossible avec l'ordre du §3 (onglets avant historique) — le test garde « onglets ok » — coût si faux : aucun, c'est l'ordre voulu.
- 3.3: minor (deferred): compteurs perdus si attendre()/sauver() lève dans le finally ; constellations vides créées avant le contrôle d'abandon ; extensionsChoisies compare l'id seul ; zoom 1 compté présent ; partiel dès ignores > 0 (moteurs Chromium presque toujours partiels, à traiter en Task 5) ; regex google trop large ; défaut Firefox perso perdu sans note ; note « https avec %s » vs http accepté ; règle des schémas dupliquée de TabManager ; doublon de source compté présent ; Edge/inconnu sans etat 'manuel' dans ExtensionEnAttente (note seulement).
- 3.3: fix round 1 dispatché, FIX_BASE 1ec3c35
- 3.3: fix round 1/5 (3 addressed, 0 open; commits 1ec3c35..c884dcd)
- 3.3: minor (deferred): annule écrasé par partiel si sauver() lève après abandon ; note « N visites » ajoutée aussi hors ok.
- 3.3: complete (commits c26dfe4..c884dcd, review clean)
- 04:33 3.4 : implémenteur dispatché (sonnet), BASE c884dcd
- 3.4 : DONE (a9266a4 ; vitest 774, typecheck, build OK) ; écart : protocole.ts pur ; pas de contre-pression des lots (à gérer en 3.5) ; utilityProcess réel non testé (e2e en 3.5).
- 3.4 : relecture c884dcd..a9266a4 → Needs fixes. Important : pas de contre-pression des lots d'historique (contredit « historique jamais entièrement en mémoire côté main »).
Ruling: la ronde inclut aussi les mineurs 2 (surLot asynchrone attendu et protégé) et 5 (message inconnu ignoré sans « fin ») — ils touchent le même contrat que la contre-pression, que 3.5 va figer — coût si faux : une ronde un peu plus longue.
- 3.4: minor (deferred): pas de délai global pour detecter/apercu/lire sans signal ; kill() après 3 s peut laisser une copie temporaire (balayée au démarrage) ; element.valeur typé unknown ; fini() ne suit que le dernier message ; tests manquants (fork qui lève, message ou exit après fin).
- 3.4: fix round 1 dispatché, FIX_BASE a9266a4
- 3.4: fix round 1/5 (3 addressed, 0 open; commits a9266a4..67a072c)
- 3.4: minor (deferred): Safari, abandon en plein redécoupage → message element historique avec le résumé complet au lieu d'annule (protocole.ts:510-511) ; exit/fin en file derrière un surLot qui ne se résout jamais (contrat de l'appelant).
- 3.4: complete (commits c884dcd..67a072c, review clean)
Ruling: risque d'interblocage repéré entre 3.3 et 3.4 — le lecteur lit dans l'ordre ELEMENTS_IMPORT (historique 2e) et attend l'accusé de chaque lot, alors qu'appliquer() traite l'historique en dernier (ordre du §3) ; 3.5 doit demander l'historique en dernier au lecteur (ou lancer appliquer() avec l'historique en flux pendant que les autres éléments sont déjà reçus) et prouver l'absence d'interblocage par un test — coût si faux : import figé sur l'historique.
- 04:45 3.5 : implémenteur dispatché (sonnet), BASE 67a072c
- 3.5 : contrat IPC `import:*` (`ipc.ts` + `importeur.ts` sans Electron), pont lot/flux sans interblocage (`executer.ts` : historique demandé en dernier, `FileLots`), câblage `index.ts` (cibles réelles, `balayerOrphelins` non bloquant), e2e `import.spec.ts` (vrai utilityProcess). Écart : `import:lancer` depuis une fenêtre privée rend `{ erreur: 'prive' }` ; les autres canaux lèvent.
- 3.5 : DONE_WITH_CONCERNS (9f62b61 ; vitest 791, e2e import 3, Playwright 92/92) ; écarts : refus privé = {erreur:'prive'} pour lancer, levée pour les autres ; évènements vers la seule page appelante ; TabManager.constellations() ajouté.
- 3.5: minor (deferred → brief de la Task 5): file de lots non retirée quand appliquer saute l'historique après un abandon (executer.ts:348-388) — retard de 3 s, worker vivant si appliquer rejette ; retirer la file dans le finally + test « abandon avant l'historique avec un lot en vol ».
- 3.5: minor (deferred): contrôle d'expéditeur et garde try/catch dupliqués (import/ipc.ts:680 ; importeur.ts:603 / executer.ts:340) ; fenêtre cible figée au lancement ; estPrivee ouvert en cas de doute ; shared/ipc.ts importe des types de main/import ; tests manquants (nouvelle-par-fenetre, aucune fenêtre normale, abandon e2e) ; constellations() sérialise tout l'arbre.
- 3.5: complete (commits 67a072c..9f62b61, review clean)
- Task 3: complete (commits 830917a..9f62b61, 5 sous-tâches relues)
- 04:59 Task 4 : implémenteur dispatché (sonnet), BASE 9f62b61
Ruling: l'import de fichiers (favoris HTML Netscape, historique CSV, ciel JSON, réglages JSON, paquet .lyra) entre dans la Task 4 — la spec §4 et la carte « Un fichier » d'Importation.dc.html l'exigent et aucune autre tâche ne le porte ; il réutilise appliquer() — coût si faux : Task 4 plus longue.
Ruling: mots de passe — le design montre « export vers un fichier chiffré (.csv.age) » côté import ; le plan dit v1 = message. Retenu : ligne affichée mais indisponible en v1, avec le message du plan (Chromium : chiffrés par le système ; Firefox : clé NSS key4.db) — coût si faux : la ligne promise par le design n'agit pas en v1.
- Task 4 : DONE_WITH_CONCERNS (7514392, c975fcb ; vitest 858, e2e export 4, Playwright 96/96) ; fflate ajouté ; safeStorage réel non testé ; pas de neutralisation des formules CSV ; pertes à la réimportation (hiérarchie des étoiles, dossiers vides).
- Task 4 : relecture 9f62b61..c975fcb → Needs fixes. Important : I1 injection de formules dans le CSV exporté (csv.ts:11-13) ; I2 analyse quadratique du HTML Netscape → gel du main sur un fichier hostile (netscape.ts:75, :113 ; mesuré 17,7 s pour 160 Ko).
Ruling: M1 (CSV : guillemet jamais refermé → mémoire du main épuisée) et M9 (faux coffre choisi sur LYRA_TEST même en binaire empaqueté) entrent dans la ronde — même famille que I1/I2 (fichier hostile, sécurité de la clé de sauvegarde) — coût si faux : ronde un peu plus longue.
- Task 4: minor (deferred): analyse des favoris et unzipSync synchrones dans le main (M2) ; ITERATIONS_MAX 10 000 000 généreux (M3) ; longueur minimale de phrase codée en dur au lieu de PHRASE_MIN (M4) ; export:sauvegardeAuto hors exclusif (M5) ; patch calculé après appliquer pour le paquet (M6) ; .tmp non unique / mode (M7) ; Math.max(...dates) dans History.pages (M8) ; liste des extensions du paquet = file en attente (à revoir avec le magasin du jalon B).
- Task 4: fix round 1 dispatché, FIX_BASE c975fcb
- Task 4: fix round 1/5 (4 addressed, 1 open — I2 résiduel : regex ATTRIBUT quadratique, ~445 ms par balise de 16 Ko ; nouveau : enTest() de ipc.ts sur LYRA_TEST seul, même défaut que M9 ; commits c975fcb..47d3b73)
Ruling: enTest() (chemin de fichier pris dans la charge utile) entre dans la ronde 2 avec la même garde !app.isPackaged que M9 — c'est un point d'entrée de sécurité — coût si faux : aucun.
- Task 4: minor (deferred): </abbr>/</address> ferment le lien trop tôt (« </a » sans \s*>) ; « > » dans une valeur d'attribut coupe la balise ; nombre de champs par ligne CSV non borné (borné par les 256 Mo).
- Task 4: fix round 2 dispatché, FIX_BASE 47d3b73
- e2e complet jalon-e sur 47d3b73 : 96/96 (contrôleur).
- Task 4: fix round 2/5 (2 addressed, 0 open; commits 47d3b73..7072421) ; 10 entrées hostiles de 100 000 répétitions mesurées linéaires (≤ 48 ms).
- Task 4: minor (deferred): entités nommées latines (&eacute;, &ccedil;…) non décodées à l'import Netscape (NOMMEES trop courte).
- Task 4: minor (deferred, transverse): plusieurs lectures de LYRA_TEST sans garde !app.isPackaged dans tout src/main (LYRA_IMPORT_RACINE, LYRA_PASSERELLES_*, file:// dans l'historique, canaux test:*) — schéma hérité du jalon A, à durcir d'un coup (relecture finale du jalon E).
- Task 4: complete (commits 9f62b61..7072421, review clean)
- 05:29 Task 5 : brief complété par les contrats IPC ; implémenteur dispatché (sonnet), BASE 7072421
Ruling: Task 5 — les phrases du design qui promettent ce que la v1 ne fait pas sont ajustées au plus près du design : « bloqueur Brave → Boucliers, Focus mode Orion → Ne pas déranger » retirés de la ligne Réglages transposables (aucun lecteur ne les produit) ; « réinstallées depuis le Chrome Web Store » devient « mises en file pour réinstallation » tant que le jalon B n'est pas fusionné ; Mots de passe et Cookies affichés indisponibles avec leur raison — coût si faux : écart de libellé visible face au design, mais jamais de promesse fausse.
- Task 5 : DONE_WITH_CONCERNS (b62f118, 691e52b ; vitest 880, importation.spec 4/4, Playwright 100/100 sur macOS).
Ruling: crochet de test globalThis.__lyraCheminsTest dans src/main/export/ipc.ts accepté, à condition qu'il ne soit actif que sous LYRA_TEST=1 et !app.isPackaged (même garde que enTest) — Playwright ne peut pas fournir de chemin à une page pilotée par des clics sans boîte de dialogue — coût si faux : une porte de test dans le main, fermée dans l'application empaquetée.
- Task 5: minor (deferred): annulation et progression sans test ; void invoke('import:annuler') sans catch, pas d'état « Annulation… », enCours bloqué si import:termine n'arrive jamais (PageImport.tsx:199/223).
- Task 5: minor (deferred): e2e sans les états Safari « accès », Chrome « ouvert », Brave.
- Task 5: minor (deferred): texte d'aide « X peut rester ouvert » même quand les onglets sont verrouillés (PageImport.tsx:329).
- Task 5: minor (deferred): textes figés (liste des réglages, « 92 jours ») ; étiquette des extensions ne compte que chrome (apercuImport.ts:78/88/139).
- Task 5: minor (deferred): entités oelig/aelig/copy/reg/deg manquantes ; CSS mort .barre-progres ; PageImport.tsx 576 lignes ; desactiverAuto sans occupe ; option cookies du paquet jamais proposée.
- Task 5: complete (commits 7072421..691e52b, review clean)
- Relecture finale du jalon E 830917a..691e52b : With fixes. I1 (filtre des secrets qui retire reseau.passerelles), I2 (un seul ciel dans le paquet), I3 (phrase non confirmée), I4 (LYRA_TEST sans !app.isPackaged, transverse), M-a (Math.max), M-b (README), I5 (asar jamais exercé → contrôle).
Ruling: I2 corrigé maintenant (liste des fenêtres normales dans ciel.json), VERSION_PAQUET reste 1 car le format n'est pas publié — coût si faux : aucun paquet existant.
Ruling: avant la release, à faire hors de ce jalon : chien de garde du lecteur (aucun message pendant N minutes → kill) et case cookies du paquet ; après la fusion avec B : retirer import de patchPage, lister extensions.installees dans le paquet, renommer EntreeImport, régénérer package-lock — coût si faux : notés dans ETAT.md, rien ne se perd.
- Vague finale dispatchée (final-fix-brief.md), FIX_BASE 691e52b
- Vague finale livrée (9ef20c5..63cc955 ; vitest 891, Playwright 100/100) ; réserve : @paquet existant met LYRA_TEST=1 sur l'app empaquetée, désormais ignoré → dist:mac + @paquet lancés par le contrôleur.
- dist:mac OK + @paquet 2/2 (contrôleur, macOS) : app empaquetée démarre, listes et moteur OK, pub bloquée ; asar contient import-worker.js, sql-wasm.wasm, fflate. Import réel dans l'app installée non exercé (l'app empaquetée ignore LYRA_IMPORT_RACINE) → contrôle manuel avant release.
- Vague finale : 7/7 addressed (9ef20c5..63cc955), re-relecture propre.
Ruling: résidu de la vague finale (import statique de @electron/asar, dépendance transitive, en tête de paquet.spec.ts) corrigé par le contrôleur en import dynamique (85ed1d7) plutôt qu'un ajout à package.json, qui entre en conflit avec le jalon B — vérifié : typecheck, @paquet 2/2, smoke — coût si faux : correctif du contrôleur sans relecture dédiée (2 lignes de test).
- Final: minor (deferred): noms composés de secrets (accessToken, apiKey…) plus retirés par le filtre ; double import de ../modeTest dans TabManager.ts ; bouton de création actif avec deux champs vides (refus du main) ; manifest.comptes.etoiles compte aussi les étoiles lyra:// ; ciel JSON multi-fenêtres importé seul fusionne dans la fenêtre courante.
- Jalon E : complet (9d15766..85ed1d7)
- Mineurs de la tâche 2 traités (8d96897) : safari.test.ts en LF et échappements, NOEUDS_MAX documenté, test de références partagées imbriquées (minor deferred : le test hostile construit ~45 Mo en mémoire).
