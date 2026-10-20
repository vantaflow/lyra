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
  - `miseAJour.ts` : `verifier()` (`updateExtensions` pour `cws`, version de la release pour uBO), au démarrage (+15 s) puis toutes les 6 h si `majAuto`, jamais sous `LYRA_TEST` ; `derniereVerification` dans les réglages.
  - `file.ts` : `installerParId({ id, nom, magasin })` (chrome → Web Store, firefox → à brancher à la tâche 3, edge/inconnu → `manuel`) et `installerFile(liste, surProgression, installer)` en série.
  - IPC `extensions:installer { source | choisir }` (un chemin local n'est accepté que sous `LYRA_TEST` ; sinon sélecteur natif côté main ; refus en fenêtre privée) et `extensions:majTout`.
  - Tests : `archives.test.ts`, `chrome.test.ts`, `chrome.installation.test.ts`, `file.test.ts`, `miseAJour.test.ts` ; e2e `extensions-installer.spec.ts` (zip de la fixture, hors réseau) et `extensions-reseau.spec.ts` (`@reseau`, Dark Reader du Chrome Web Store).

## Suite
- Tâches 3 à 6 : Firefox (convertisseur), compatibilité MV2 et journal, page `lyra://extensions`, file d'import et finition.

## Points à connaître
- Tâche 2 : le CRX du Web Store est téléchargé par Lyra (`clients2.google.com`, redirections Google acceptées, 30 s, 128 Mio) au lieu d'`installExtension` de la bibliothèque, pour que tout passe par l'extraction sûre et le registre. Redirections suivies à la main (https, hôtes listés, 5 max) ; signature CRX3 vérifiée ; mises à jour par l'endpoint updatecheck de Google puis `installerCws`.
- `requestPermissions` (permissions optionnelles) refuse tout tant que la page `lyra://extensions` n'existe pas (tâche 5).
- Popups d'action et pages d'options : tâche 5 (fenêtres cachées sous `LYRA_TEST`).
- Test `ne-pas-deranger.spec.ts` « noopener … about:blank » : échoue aussi sur la base `0c9abee` (non lié à ce jalon).
