# État du jalon B — extensions Chrome et Firefox

Plan : `docs/superpowers/plans/2026-10-19-lyra-jalon-b.md` (6 tâches). Branche `jalon-b`.

## Fait
- **Tâche 1 — noyau de chargement et registre** : `src/main/extensions/{Extensions,registre,chargeur,ipc,fixturesTest}.ts`.
  - Registre `settings.extensions = { installees, majAuto, derniereVerification? }`, validation stricte (`validate.ts`), défauts (`defaults.ts`).
  - Chargement au démarrage avant la première fenêtre (`loadExtension(dossier, { allowFileAccess: false })`), activation à chaud, désinstallation.
  - `electron-chrome-extensions@4.9.0` branché sur `TabManager` (`addTab` / `removeTab` / `selectTab`, étoiles web des fenêtres normales seulement) et `WindowManager` (`createWindow`).
  - Boucliers : `chrome-extension://` et `crx://` ignorés. IPC `extensions:lister/activer/desinstaller`.
  - Tests : `registre.test.ts`, `chargeur.test.ts`, `Extensions.test.ts`, e2e `tests/e2e/extensions.spec.ts` (page servie en http local : sans accès aux fichiers, une extension n'agit pas sur `file://`).

- **Tâche 2 — installation Chrome et mises à jour** : `src/main/extensions/{archives,chrome,miseAJour,file}.ts`.
  - `archives.ts` (pur, `fflate`) : lecture CRX3 (clé publique de l'en-tête), extraction sûre (refus de `..`, chemins absolus, liens symboliques, > 10 000 entrées, > 128 Mio annoncés ou réels ; écriture sous un dossier temporaire puis `rename`), copie de dossier.
  - `chrome.ts` : `analyserSourceChrome` (id, URL Web Store, .crx, .zip, dossier, `ubo`), `creerInstallateurChrome` → `installerChrome(source)`, `installerUbo`, `derniereVersionUbo`. Toutes les sources passent par l'extraction sûre puis registre + chargeur (retour arrière si le chargement échoue). Sans clé dans le manifest : clé RSA générée et réécrite (stable pour une réinstallation du même nom).
  - `miseAJour.ts` : `verifier()` (endpoint updatecheck de Google puis réinstallation pour `cws`, version de la release pour uBO), au démarrage (+15 s) puis toutes les 6 h si `majAuto`, jamais sous `LYRA_TEST` ; `derniereVerification` dans les réglages.
  - `file.ts` : `installerParId({ id, nom, magasin })` (chrome → Web Store, firefox → `installerFirefox` (à brancher avec la file d'import, tâche 6), edge/inconnu → `manuel`) et `installerFile(liste, surProgression, installer)` en série.
  - IPC `extensions:installer { source | choisir }` (un chemin local n'est accepté que sous `LYRA_TEST` ; sinon sélecteur natif côté main ; refus en fenêtre privée) et `extensions:majTout`.
  - Tests : `archives.test.ts`, `chrome.test.ts`, `chrome.installation.test.ts`, `file.test.ts`, `miseAJour.test.ts` ; e2e `extensions-installer.spec.ts` (zip de la fixture, hors réseau) et `extensions-reseau.spec.ts` (`@reseau`, Dark Reader du Chrome Web Store).

- **Tâche 3 — Firefox (AMO + convertisseur)** : `src/main/extensions/{reseau,amo,convertisseur,firefox,icones}.ts`.
  - `reseau.ts` : GET borné avec redirections manuelles (factorisé depuis `chrome.ts`, qui expose maintenant `creerBaseInstallation` : `finaliser`, `enAttente`, `depuisZip`…). Hôtes AMO : `addons.mozilla.org`, `addons.cdn.mozilla.net`.
  - `amo.ts` : nom / slug / identifiant gecko / adresse `addons.mozilla.org/<langue>/firefox/addon/<slug>` → API v5 `addons/addon/<…>/` → `current_version.file.url` + `hash` (sha256 obligatoire, vérifié avant extraction) ; cache `userData/extensions/cache/<slug>/<version>_<sha>.xpi` (une version gardée, sha256 revérifié à chaque lecture). Un nom libre passe par la recherche AMO et n'est accepté que si le nom du résultat correspond.
  - `convertisseur.ts` (pur) : règles de la spec §7 + rapport `{ cles_retirees, permissions_retirees, transformations, avertissements, refus? }`. Liste blanche des permissions Chromium (tout le reste est retiré et journalisé). **MV2 conservé** (`background.scripts`/`page`, `persistent: true`) ; la réécriture MV3 (`background.sw.js`, CSP objet — ou retirée si Chromium la refuse —, `web_accessible_resources` en objets, hôtes → `host_permissions`) ne s'applique qu'aux manifests MV3 (les xpi réels de Dark Reader, RYD, uBO, Bitwarden sont MV2). Polyfill (`enTete`, extensible pour les stubs de la tâche 4) en tête de l'arrière-plan, des content scripts (pas ceux en monde MAIN) et des pages HTML. Refus motivés : `sidebar_action` seul moyen d'interaction (aucune action, content script, devtools, override…), `experiment_apis`, thème. Rapport écrit dans `<dossier de la version>/lyra-conversion.json` (pour le journal de la tâche 4).
  - `firefox.ts` : `installerFirefox(source)` (AMO ou chemin `.xpi` absolu), `versionDistanteAmo`, `mettreAJourAmo` ; identité = clé RSA publique **déterministe** dérivée de l'identifiant gecko (ou du nom à défaut) : même id Chrome à chaque installation ; suggestion « version Chrome disponible » (uBO, Dark Reader, Bitwarden, RYD, SponsorBlock, Privacy Badger) renvoyée dans `ResultatInstallation.suggestionChrome`.
  - `icones.ts` : SVG → PNG par une `BrowserWindow` cachée hors écran (vérifié sous `LYRA_TEST`), sinon icône retirée avec avertissement.
  - Registre : champ optionnel `slugAmo` (mises à jour AMO dans `miseAJour.ts`, mêmes garde-fous). IPC `extensions:installer` : `.xpi` testé avant Chrome (un chemin absolu serait pris pour un dossier), puis Chrome, puis AMO ; `.xpi` local seulement via sélecteur natif ou `LYRA_TEST`.
  - Correctif reporté de la tâche 2 : un `.crx` dont le `manifest.key` n'est pas la clé signataire est refusé.
  - `webextension-polyfill@0.12.0` épinglé (devDependency), copié dans `resources/extensions/browser-polyfill.js` (livré par `extraResources`, même convention que `resources/shields` : `app.getAppPath()` en dev et test, `process.resourcesPath` empaqueté) ; un test vérifie que la copie est identique au paquet.
  - Tests : `convertisseur.test.ts` (fixtures `fixtures/manifests/{ubo-ff,dark-reader-ff,bitwarden,tree-style-tab,ryd-mv2,ryd-mv3}.json`), `amo.test.ts`, `firefox.installation.test.ts` ; e2e `extensions-firefox.spec.ts` (xpi de fixture, `browser.storage.local` + icône SVG) et `@reseau` Dark Reader depuis AMO (`extensions-reseau.spec.ts`).

## Suite
- Tâches 4 à 6 : compatibilité MV2 et journal, page `lyra://extensions`, file d'import (brancher `installerFirefox` sur `installerParId`) et finition.

## Points à connaître
- Tâche 2 : le CRX du Web Store est téléchargé par Lyra (`clients2.google.com`, redirections Google acceptées, 30 s, 128 Mio) au lieu d'`installExtension` de la bibliothèque, pour que tout passe par l'extraction sûre et le registre. Redirections suivies à la main (https, hôtes listés, 5 max) ; signature CRX3 vérifiée ; mises à jour par l'endpoint updatecheck de Google puis `installerCws`.
- `requestPermissions` (permissions optionnelles) refuse tout tant que la page `lyra://extensions` n'existe pas (tâche 5).
- Popups d'action et pages d'options : tâche 5 (fenêtres cachées sous `LYRA_TEST`).
- Test `ne-pas-deranger.spec.ts` « noopener … about:blank » : échoue aussi sur la base `0c9abee` (non lié à ce jalon).
