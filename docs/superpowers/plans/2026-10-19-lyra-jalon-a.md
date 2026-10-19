# Lyra — plan du jalon A (noyau livrable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un navigateur Lyra utilisable : fenêtre avec le ciel des onglets à gauche (constellations, étoiles épinglées, dormance), capsule, palette ⌘ L, Boucliers intégrés qui bloquent les pubs YouTube (prouvé par test), `lyra://newtab`, réglages minimaux, historique/favoris/téléchargements simples, restauration de session, paquets `.dmg` et `.exe` construits par CI sur macOS et Windows.

**Architecture:** Electron 44 avec `BaseWindow` + trois types de `WebContentsView` (chrome = ciel + capsule, un par onglet, overlay transparent pour la palette) ; processus principal en modules TypeScript (`WindowManager`, `TabManager`, `Shields`, `Settings`, `History`, `Bookmarks`, `Downloads`, `Session`, `Protocol`, `Permissions`) ; renderer Preact (`ui.html`, `newtab.html`, `settings.html`) servi par `lyra://` ; preloads sandbox CJS (`ui`, `internal`, `page`) ; IPC typé. Boucliers = moteur Ghostery piloté par Lyra (webRequest + CSP + scriptlets exécutés tôt par le preload page).

**Tech Stack:** electron 44.9.0, electron-vite 6.0.0 (Vite 8), TypeScript 5.9, Preact 11 + `@preact/preset-vite`, `@ghostery/adblocker` 2.20.1 + `@ghostery/adblocker-electron` 2.20.1 + `@ghostery/adblocker-content`, `tldts-experimental`, vitest 5.0.5, `@playwright/test` 1.64.1, electron-builder 26.15.3. Licence GPL-3.0.

**Spec:** `docs/superpowers/specs/2026-10-19-lyra-design.md` (sections 4, 5, 6, 8, 9 ; design dans `docs/design/project/*.dc.html` et `docs/design/README.md`).

## Global Constraints

- **Le navigateur respecte le design validé par l'utilisateur** (`docs/design/project/*.dc.html`, lus comme du HTML statique) : chaque écran, panneau et composant de l'interface reproduit l'écran correspondant — structure, dimensions (ciel 272 px, capsule 46 px, étoiles 32 px, pilule 32 px…), couleurs, polices, libellés, états — sans réinterprétation. Correspondance : tâche 6 → `Main.dc.html` et `Composants.dc.html` ; tâche 7 → `Panneaux.dc.html` (palette) ; tâche 9 → `Panneaux.dc.html` (boucliers) ; tâche 11 → `Panneaux.dc.html` (téléchargements) ; tâche 13 → `NouvelOnglet.dc.html`, `Parametres.dc.html` (sommaire et section Général) ; tâche 14 → `Panneaux.dc.html` (menu ⋯). Le relecteur de chaque tâche d'interface compare au `.dc.html`.

- Node 24, npm ; `package.json` **sans** `"type": "module"` (preloads CJS sandbox) ; `"name": "lyra"`, `"productName": "Lyra"`, `"main": "./out/main/index.js"`, `"license": "GPL-3.0"`.
- Aucune requête réseau hors : navigation de l'utilisateur, listes de filtres, extensions (jalon B). Pas de Google Fonts : Manrope et Instrument Serif embarquées dans `src/renderer/fonts/` (woff2, licences OFL copiées).
- Interface en français (source) avec fichiers i18n `src/shared/i18n/fr.json` et `en.json` ; langue = celle du système, repli fr.
- Thème « Indigo nuit » par défaut : ciel `#15152E`, étoile active `#F4C56A`, étoiles `#A8A8D8`, endormies `#4E4E7A`, lignes `#3B3B70`, accent `#5452C8`, Boucliers `#1E7F6C` (sur ciel `#5FD3B3`), pages Lyra `#F7F7FB`, texte `#1C1C2E` / `#6B6B80`.
- Raccourcis (⌘ sur macOS, Ctrl sur Windows) : T nouvelle étoile, W fermer, ⇧T rouvrir, N fenêtre, ⇧N privée, L palette, R recharger, F rechercher, ⌘\ ciel, ⌘⇧D Ne pas déranger (jalon C), `,` réglages, Ctrl+Tab / Ctrl+⇧Tab, 1-8 / 9.
- UA : celui de Chrome 152 sans « Electron/x » ni « lyra/x » (`app.userAgentFallback` nettoyé).
- Sessions : `persist:lyra` ; privée = `fromPartition('privee-<id>')`.
- Tous les handlers IPC vérifient `event.senderFrame.url` (préfixe `lyra://` ou URL de la vue UI) et rejettent sinon.
- Tests : vitest (`src/**/*.test.ts`, environnement node) ; Playwright (`tests/e2e/*.spec.ts`, `_electron.launch({ args: ['.'], env: sans ELECTRON_RUN_AS_NODE, LYRA_TEST: '1', LYRA_USER_DATA: <dossier temporaire> })`) ; les tests réseau portent le tag `@reseau` et ne tournent qu'avec `LYRA_E2E_RESEAU=1`.
- Commits : un par tâche, message en français au présent (`feat: …`, `test: …`, `chore: …`), push sur `origin/main` après chaque tâche (demande de l'utilisateur).

## Review Focus

1. Une URL saisie sans schéma (`exemple.fr`, `localhost:3000`, `192.168.1.1`) doit naviguer, pas chercher ; un texte avec espace doit chercher → test dans la tâche 7 (`interpreterSaisie`).
2. Fermer la dernière étoile d'une fenêtre doit ouvrir `lyra://newtab`, jamais une fenêtre vide → test tâche 5.
3. Une page qui appelle `window.open` avec `features` (OAuth) doit garder `window.opener` ; un lien `target=_blank` devient une étoile reliée → test tâche 5 (e2e avec page fixture locale).
4. Le cache du moteur Boucliers corrompu ou d'une version d'engine différente doit être reconstruit sans planter → test tâche 8.
5. Redémarrage avec un fichier de session absent, vide ou corrompu → une fenêtre avec `lyra://newtab`, pas de crash → test tâche 12.

---

## Structure des fichiers

```
package.json, electron.vite.config.ts, tsconfig.json, tsconfig.node.json, vitest.config.mts, playwright.config.ts, electron-builder.yml, LICENSE, README.md
.github/workflows/build.yml
build/icon.png                         icône 1024×1024 (lyre en constellation sur fond indigo)
resources/shields/                     listes embarquées (easylist.txt, easyprivacy.txt, ublock-filters.txt, quick-fixes.txt, …, resources.json, LISTES.json = {date, urls})
scripts/update-shields-lists.mjs       rafraîchit resources/shields/ depuis les URL publiées
src/shared/ipc.ts                      table des canaux IPC (types requête/réponse/événements)
src/shared/types.ts                    Star, Constellation, SkyState, Settings, SiteRule, HistoryEntry, Bookmark, DownloadInfo
src/shared/i18n/{fr,en}.json, src/shared/i18n/index.ts
src/main/index.ts                      démarrage : protocole, sessions, managers, fenêtre
src/main/paths.ts                      userData (LYRA_USER_DATA), chemins par plateforme
src/main/protocol/lyra.ts              registerSchemesAsPrivileged + handle par session, resolveLyraPath()
src/main/settings/store.ts             JsonStore<T> atomique ; defaults.ts ; settings.ts (Settings, moteurs, thèmes)
src/main/window/layout.ts              computeLayout() pur
src/main/window/WindowManager.ts
src/main/tabs/TabTree.ts               modèle pur de l'arbre
src/main/tabs/TabManager.ts            WebContentsView, événements, dormance
src/main/palette/suggest.ts            interpreterSaisie(), suggerer()
src/main/palette/engines.ts            moteurs et mots-clés
src/main/shields/engine.ts             construction/cache/mise à jour du moteur Ghostery
src/main/shields/Shields.ts            webRequest/CSP/compteurs/IPC scriptlets et styles
src/main/history/History.ts, src/main/bookmarks/Bookmarks.ts, src/main/downloads/Downloads.ts
src/main/session/SessionStore.ts       sauvegarde/restauration du ciel
src/main/permissions/Permissions.ts, src/main/menu/contextMenu.ts, src/main/menu/appMenu.ts
src/preload/ui.ts, src/preload/internal.ts, src/preload/page.ts
src/renderer/ui.html, src/renderer/ui/{main.tsx, Sky.tsx, Star.tsx, Capsule.tsx, Palette.tsx, Downloads.tsx, theme.css}
src/renderer/newtab.html, src/renderer/newtab/main.tsx
src/renderer/settings.html, src/renderer/settings/{main.tsx, General.tsx, Historique.tsx, Favoris.tsx, Telechargements.tsx}
src/renderer/fonts/
tests/e2e/{smoke,tabs,palette,shields,newtab,session}.spec.ts, tests/e2e/fixtures/*.html, tests/e2e/helpers.ts
```

---

### Task 1 : Échafaudage, tests et CI

**Files:** Create `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.mts`, `playwright.config.ts`, `electron-builder.yml`, `LICENSE` (GPL-3.0), `.gitignore` (ajouter node_modules, out, release, .playwright, test-results), `src/main/index.ts`, `src/main/paths.ts`, `src/preload/ui.ts`, `src/renderer/ui.html`, `src/renderer/ui/main.tsx`, `src/renderer/ui/theme.css`, `src/shared/i18n/{fr,en}.json`, `src/shared/i18n/index.ts`, `tests/e2e/helpers.ts`, `tests/e2e/smoke.spec.ts`, `.github/workflows/build.yml`, `README.md` (installation : Gatekeeper « clic droit → Ouvrir » / `xattr -cr`, SmartScreen).

**Interfaces:**
- Produces : `paths.userData(): string` (respecte `process.env.LYRA_USER_DATA`), `t(key: string, vars?: Record<string,string>): string` (i18n), `tests/e2e/helpers.ts` : `lancerLyra(): Promise<{ app: ElectronApplication, fenetre: Page }>` qui crée un `userData` temporaire, retire `ELECTRON_RUN_AS_NODE`, pose `LYRA_TEST=1`, attend la première fenêtre.
- Config electron-vite : `main` (entrée `src/main/index.ts`), `preload` (`isolatedEntries: true`, `externalizeDeps: false`, entrées `ui`, `internal`, `page`), `renderer` (plugin preact, entrées `ui.html`, `newtab.html`, `settings.html` — les deux dernières créées en tâche 3 ; en attendre des fichiers minimaux).

- [ ] **Step 1 :** `npm init -y` puis installer : `electron@44.9.0 electron-vite@6 vite@8 typescript@5.9 preact@11 @preact/preset-vite vitest@5 @playwright/test@1.64 electron-builder@26.15 @types/node` ; `node node_modules/electron/install.js`. Scripts : `dev`, `build`, `typecheck`, `test` (vitest run), `e2e` (npm run build && playwright test), `dist:mac`, `dist:win`, `postinstall` (`node node_modules/electron/install.js`).
- [ ] **Step 2 :** écrire le test e2e `tests/e2e/smoke.spec.ts` : `lancerLyra()` → `expect(await fenetre.title()).toContain('Lyra')` ; le lancer : FAIL (pas d'app).
- [ ] **Step 3 :** écrire `src/main/index.ts` minimal : `app.setPath('userData', paths.userData())`, `BaseWindow` 1280×800 `titleBarStyle: 'hidden'` (macOS) avec un `WebContentsView` chargeant `ui.html` (`ELECTRON_RENDERER_URL` en dev, `out/renderer/ui.html` sinon), titre « Lyra » ; `ui.html` affiche le mot « Lyra » (Instrument Serif embarquée) sur fond `#15152E`.
- [ ] **Step 4 :** `npm run typecheck && npm test && npm run e2e` → 1 passed.
- [ ] **Step 5 :** `electron-builder.yml` (spec §8 : appId `com.vantaflow.lyra`, `identity: "-"`, `hardenedRuntime: false`, dmg+zip arm64, nsis x64 `oneClick: false`, `asarUnpack: resources/**`, `extraResources: resources/`) ; `npm run dist:mac` produit `release/Lyra-0.1.0-arm64.dmg` (vérifier `ls release`).
- [ ] **Step 6 :** `.github/workflows/build.yml` : matrice `macos-latest` / `windows-latest`, Node 24 cache npm, `npm ci`, `npm run typecheck`, `npm test`, `npm run e2e` (les deux OS), `npx electron-builder --mac --arm64 --publish never` / `--win --x64 --publish never`, upload des artefacts ; déclenchement `push` sur `main` et tags `v*`.
- [ ] **Step 7 :** commit `chore: échafaudage Lyra (electron-vite, Preact, vitest, Playwright, electron-builder, CI)` et push.

### Task 2 : Types partagés, IPC typé et magasin de réglages

**Files:** Create `src/shared/types.ts`, `src/shared/ipc.ts`, `src/main/settings/store.ts`, `src/main/settings/defaults.ts`, `src/main/settings/settings.ts`, `src/main/settings/store.test.ts`, `src/main/settings/settings.test.ts`, `src/preload/ui.ts` (compléter), `src/renderer/ui/api.ts`.

**Interfaces:**
- `types.ts` : `Star { id, url, title, favicon?, parentId?, constellationId?, pinned, dormant, index }`, `Constellation { id, name, color }`, `SkyState { stars, constellations, activeId, pinned: string[] }`, `Settings { version: 1, langue, theme: 'systeme'|'clair'|'sombre', moteurParDefaut: string, moteurChoisi: boolean, ciel: { position: 'gauche'|'droite'|'haut'|'bas', largeur: number, masque: boolean, ternirApresMin: 30, endormirApresMin: 120 }, boucliers: { niveau: 'standard', genes: false, majHeures: 6 }, telechargements: { dossier: string, demander: false } }`.
- `ipc.ts` : `type Requetes = { 'settings:get': [void, Settings], 'settings:set': [Partial<Settings>, Settings], … }` complétée par les tâches suivantes ; `type Evenements = { 'settings:changed': Settings, … }` ; helpers `handle<K>(canal, fn)` (main, vérification de `senderFrame.url`) et `envoyer<K>(wc, canal, data)`.
- `JsonStore<T>` : `constructor(chemin, defauts, migrer?: (brut: unknown) => T)`, `get(): T`, `set(patch: Partial<T>): T`, `onChange(cb)` ; écriture atomique (`.tmp` + `rename`), lecture tolérante (fichier absent/corrompu → défauts).
- `Settings` service : `getSettings()`, `setSettings(patch)`, événement `settings:changed`.
- `preload/ui.ts` expose `window.lyra = { invoke(canal, data), on(canal, cb), plateforme }` via `contextBridge`.

- [ ] **Step 1 :** tests `store.test.ts` : fichier absent → défauts ; `set` puis relecture → fusionné ; fichier corrompu (`{`) → défauts sans exception ; écriture atomique (pas de `.tmp` résiduel). Lancer : FAIL.
- [ ] **Step 2 :** implémenter `JsonStore`, `defaults.ts` (valeurs de la spec), `settings.ts` ; `settings.test.ts` : `setSettings({ theme: 'sombre' })` émet `settings:changed`.
- [ ] **Step 3 :** `npm test` → PASS ; `npm run typecheck` → OK.
- [ ] **Step 4 :** commit `feat: réglages persistants et IPC typé` et push.

### Task 3 : Protocole `lyra://` et pages internes Preact

**Files:** Create `src/main/protocol/lyra.ts`, `src/main/protocol/lyra.test.ts`, `src/renderer/newtab.html`, `src/renderer/newtab/main.tsx`, `src/renderer/settings.html`, `src/renderer/settings/main.tsx`, `src/preload/internal.ts`, `tests/e2e/newtab.spec.ts`. Modify `src/main/index.ts`.

**Interfaces:**
- `resolveLyraPath(url: string, racine: string): string | null` : `lyra://newtab` → `<racine>/newtab.html`, `lyra://settings/historique` → `<racine>/settings.html` (route gérée côté renderer), `lyra://newtab/assets/x.js` → `<racine>/assets/x.js` ; `null` si traversée (`..`) ou hôte inconnu (`newtab`, `settings`, `extensions`, `history`, `bookmarks`, `downloads`, `shields` → tous servis par `settings.html` sauf `newtab`).
- `installerProtocoleLyra(ses: Session)` appelé pour chaque session ; `protocol.registerSchemesAsPrivileged` dans `index.ts` avant `ready` (`standard, secure, supportFetchAPI, codeCache`).
- `preload/internal.ts` expose la même API que `ui.ts` (`window.lyra`).
- En dev, `lyra://` sert aussi depuis `ELECTRON_RENDERER_URL` (fetch de `<url>/newtab.html`).

- [ ] **Step 1 :** tests de `resolveLyraPath` (les cinq cas ci-dessus). FAIL.
- [ ] **Step 2 :** implémenter `lyra.ts` (`net.fetch(pathToFileURL(fichier))`, 404 sinon).
- [ ] **Step 3 :** `newtab/main.tsx` : « Bonsoir. » (Instrument Serif), champ de recherche, pied « Aucune donnée ne quitte cet ordinateur. » sur fond `#0F0F26` ; `settings/main.tsx` : routeur par hash (`#/general`, `#/historique`, `#/favoris`, `#/telechargements`) avec page Général vide.
- [ ] **Step 4 :** e2e `newtab.spec.ts` : ouvrir `lyra://newtab` dans la fenêtre (via IPC de test `test:navigate` exposé seulement si `LYRA_TEST=1`) → texte « Bonsoir. » visible. PASS.
- [ ] **Step 5 :** commit `feat: protocole lyra:// et pages internes` et push.

### Task 4 : Mise en page de la fenêtre (chrome, overlay, bounds)

**Files:** Create `src/main/window/layout.ts`, `src/main/window/layout.test.ts`, `src/main/window/WindowManager.ts`. Modify `src/main/index.ts`.

**Interfaces:**
- `computeLayout(taille: {width,height}, ciel: { position, largeur, masque }, pleinEcran: boolean): { chrome: Rectangle, page: Rectangle, overlay: Rectangle }` — position gauche : chrome `{0,0,largeur,height}`, page `{largeur,0,width-largeur,height}` ; haut/bas : bande de 56 ; masqué : rail 14 ; plein écran : page = fenêtre, chrome `{0,0,0,0}` ; overlay = fenêtre entière.
- `WindowManager` : `creerFenetre(opts: { privee?: boolean }): LyraWindow`, `LyraWindow { id, win: BaseWindow, chrome: WebContentsView, overlay: WebContentsView, setPageView(v: WebContentsView|null), relayout(), setPleinEcran(b), montrerOverlay(route: 'palette'), cacherOverlay() }` ; overlay `setBackgroundColor('#00000000')`, masqué par défaut, toujours au sommet (`addChildView` à chaque `montrerOverlay`).
- Événement `resize` → `relayout()` ; IPC `layout:get` → `{ ciel, bounds }`.

- [ ] **Step 1 :** tests `computeLayout` pour gauche/droite/haut/bas/masqué/plein écran (valeurs exactes). FAIL.
- [ ] **Step 2 :** implémenter `layout.ts` puis `WindowManager.ts` ; `index.ts` crée la fenêtre via le manager.
- [ ] **Step 3 :** `npm test` PASS ; `npm run e2e` smoke toujours PASS.
- [ ] **Step 4 :** commit `feat: mise en page chrome / page / overlay` et push.

### Task 5 : Arbre d'onglets et gestion des vues

**Files:** Create `src/main/tabs/TabTree.ts`, `src/main/tabs/TabTree.test.ts`, `src/main/tabs/TabManager.ts`, `tests/e2e/tabs.spec.ts`, `tests/e2e/fixtures/liens.html` (lien `target=_blank`, bouton `window.open(url, 'oauth', 'width=500,height=600')`). Modify `src/shared/ipc.ts`, `src/main/index.ts`.

**Interfaces:**
- `TabTree` (pur) : `creer({ url, parentId?, constellationId?, position: 'sous-parent'|'fin' }): Star`, `fermer(id): { suivantActif: string|null, fermees: Star[] }` (fermer un parent rattache ses enfants au grand-parent), `activer(id)`, `deplacer(id, { parentId, index })`, `epingler(id, bool)`, `rouvrirDerniere(): Star|null`, `toJSON(): SkyState`, `static fromJSON(s)`.
- `TabManager` : `ouvrir(url, { parentId?, actif = true })`, `fermer(id)`, `activer(id)`, `naviguer(id, url)`, `precedent(id)`, `suivant(id)`, `recharger(id)`, `endormir(id)`, `reveiller(id)` ; chaque étoile active a un `WebContentsView` (session `persist:lyra`, `sandbox: true`, preload `page`), `setWindowOpenHandler` selon la spec §5 ; relais vers l'UI : événement `sky:changed` (SkyState + état de chargement/titre/favicon/couleur par étoile).
- IPC : `tabs:open`, `tabs:close`, `tabs:activate`, `tabs:navigate`, `tabs:back`, `tabs:forward`, `tabs:reload`, `tabs:move`, `tabs:pin`, `tabs:reopen`, `sky:get`.
- Règle : fermer la dernière étoile ouvre `lyra://newtab`.
- Raccourcis via `appMenu.ts` (accélérateurs T, W, ⇧T, R, L, Ctrl+Tab, 1-9) + `before-input-event` pour ⌘L.

- [ ] **Step 1 :** tests `TabTree` : création sous parent, fermeture d'un parent rattache les enfants, `fermer` de la dernière étoile renvoie `suivantActif: null`, `rouvrirDerniere`, sérialisation aller-retour. FAIL.
- [ ] **Step 2 :** implémenter `TabTree`.
- [ ] **Step 3 :** implémenter `TabManager` + menu ; e2e `tabs.spec.ts` : ⌘T crée une étoile `lyra://newtab` ; charger `fixtures/liens.html`, cliquer le lien `_blank` → nouvelle étoile avec `parentId` = l'étoile d'origine (via `sky:get`) ; le bouton OAuth ouvre une fenêtre dont `window.opener` n'est pas null (vérifié depuis la popup) ; fermer toutes les étoiles → une étoile `lyra://newtab`.
- [ ] **Step 4 :** `npm test && npm run e2e` PASS.
- [ ] **Step 5 :** commit `feat: arbre d'onglets, vues et navigation` et push.

### Task 6 : Le ciel et la capsule (renderer)

**Files:** Create `src/renderer/ui/Sky.tsx`, `Star.tsx`, `Capsule.tsx`, `src/renderer/ui/state.ts` (signaux), `tests/e2e/sky.spec.ts`. Modify `src/renderer/ui/main.tsx`, `theme.css`.

**Interfaces:**
- `Sky` rend `SkyState` : en-tête (pastilles macOS si `plateforme === 'darwin'`, « Lyra », bouton palette « Aller à, rechercher, commander… ⌘ L »), étoiles épinglées, constellations avec `.grp` et `.branch` (ligne de constellation), étoiles (états active/ouverte/endormie, bouton ×), « Nouvelle étoile », pied (bouclier + compteur, extensions, téléchargements, croissant, réglages — boutons inertes pour ce jalon sauf téléchargements et réglages).
- `Capsule` : précédent/suivant/recharger (désactivés selon `canGoBack/canGoForward`), pilule (cadenas vert si https, domaine gras + chemin gris, clic → palette), favoris (étoile), recherche dans la page (tâche 14), menu ⋯ (nouvelle étoile, fenêtre privée, favoris, zoom, imprimer, historique, réglages).
- Rendu fidèle à `docs/design/project/Main.dc.html` (classes et couleurs), glisser-déposer des étoiles (HTML5 DnD → `tabs:move`).

- [ ] **Step 1 :** e2e `sky.spec.ts` : après ⌘T ×2 et navigation de la 2e vers `fixtures/liens.html`, le ciel affiche deux étoiles, la seconde active (classe `active`), titre de la page ; clic sur × ferme ; la pilule affiche `localhost` ou `file`. FAIL.
- [ ] **Step 2 :** implémenter les composants et le CSS (variables `--ciel`, `--etoile-active`, …).
- [ ] **Step 3 :** `npm run e2e` PASS.
- [ ] **Step 4 :** commit `feat: le ciel et la capsule` et push.

### Task 7 : Palette ⌘ L, moteurs et mots-clés

**Files:** Create `src/main/palette/engines.ts`, `src/main/palette/suggest.ts`, `src/main/palette/suggest.test.ts`, `src/renderer/ui/Palette.tsx`, `tests/e2e/palette.spec.ts`. Modify `src/shared/ipc.ts`, `WindowManager.ts`.

**Interfaces:**
- `engines.ts` : `MOTEURS: Moteur[]` = DuckDuckGo `d` `https://duckduckgo.com/?q=%s`, Kagi `k` `https://kagi.com/search?q=%s`, Google `g`, Brave Search `b`, Startpage `s`, Qwant `q`, Wikipédia `w` `https://fr.wikipedia.org/w/index.php?search=%s`, YouTube `yt` ; `urlDeRecherche(moteur, texte)`.
- `interpreterSaisie(texte: string, moteurParDefaut: string): { type: 'url', url } | { type: 'recherche', moteur, requete } | { type: 'commande', nom }` : schéma présent → url ; `localhost[:port]`, IP, `mot.tld` sans espace → `https://` ; `lyra://x` → url ; préfixe `?` → recherche, `>` → commande, `mot-clé espace texte` → recherche sur ce moteur ; espaces ou pas de point → recherche.
- `suggerer(texte, ctx: { etoiles: Star[], historique: HistoryEntry[] }): Suggestion[]` groupées (onglets ouverts, historique, recherche, commandes `Nouvelle étoile`, `Nouvelle fenêtre privée`, `Réglages`) ; max 12.
- Overlay route `palette` : champ, groupes, ↑↓ ↩, ⌘↩ (nouvelle étoile), Échap ; fermeture au clic extérieur ; IPC `palette:open`, `palette:suggest`, `palette:go`.

- [ ] **Step 1 :** tests `interpreterSaisie` (Review Focus 1 : `exemple.fr`, `localhost:3000`, `192.168.1.1`, `deux mots`, `?lyre`, `w véga`, `>réglages`, `https://a.b`) et `suggerer` (étoile ouverte en premier). FAIL.
- [ ] **Step 2 :** implémenter `suggest.ts`, `engines.ts`.
- [ ] **Step 3 :** `Palette.tsx` + câblage overlay ; e2e `palette.spec.ts` : ⌘L ouvre l'overlay, saisir `fixtures/liens.html` chemin `file://…` + ↩ navigue l'étoile active ; `w véga` + ↩ charge `fr.wikipedia.org` (vérifier seulement l'URL demandée, sans réseau : intercepter via `will-navigate` de test).
- [ ] **Step 4 :** `npm test && npm run e2e` PASS.
- [ ] **Step 5 :** commit `feat: palette, moteurs et mots-clés` et push.

### Task 8 : Moteur des Boucliers (listes, cache, mise à jour)

**Files:** Create `scripts/update-shields-lists.mjs`, `resources/shields/*.txt`, `resources/shields/resources.json`, `resources/shields/LISTES.json`, `src/main/shields/engine.ts`, `src/main/shields/engine.test.ts`, `src/main/shields/fixtures/mini-liste.txt`.

**Interfaces:**
- `LISTES.json` : `{ date, listes: [{ nom, url, fichier }] }` avec les URL : `https://ublockorigin.github.io/uAssets/filters/{filters,filters-2020,…,filters-2026,privacy,unbreak,badware,quick-fixes,resource-abuse}.txt`, `https://easylist.to/easylist/easylist.txt`, `https://easylist.to/easylist/easyprivacy.txt`, `https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext`, et `resources.json` des scriptlets uBO (URL publiée par Ghostery : `https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resources.json` est tolérée pour ce seul fichier, faute d'URL publiée stable — à réévaluer).
- `construireMoteur(opts: { cacheDir, listes: string[] (textes) | undefined, fetch, maintenant: Date }): Promise<{ moteur: ElectronBlocker, source: 'cache'|'embarque'|'reseau', date }>` ; cache `engine.bin` + `engine.meta.json {date, version}` ; reconstruction si cache absent, corrompu, `ENGINE_VERSION` différent, ou plus vieux que `boucliers.majHeures` ; en cas d'échec réseau, embarqué puis cache.
- `mettreAJour(moteurActuel): Promise<...>` appelée au démarrage (différée de 30 s) et toutes les `majHeures`.
- Scriptlets : `moteur.getCosmeticsFilters(...)` renvoie `scripts` — vérifié présents pour `www.youtube.com`.

- [ ] **Step 1 :** écrire et lancer `scripts/update-shields-lists.mjs` (télécharge, écrit `resources/shields/`, met `date`) ; commiter les listes du jour.
- [ ] **Step 2 :** tests `engine.test.ts` (sans réseau, listes embarquées) : `match` vrai pour `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js` (script), `https://www.youtube.com/api/stats/ads?x=1` (xhr), redirection pour `https://static.doubleclick.net/instream/ad_status.js` ; faux pour `https://www.youtube.com/s/player/abc/base.js` et `https://i.ytimg.com/vi/x/hqdefault.jpg` ; `getCosmeticsFilters` pour `https://www.youtube.com/watch?v=x` renvoie un script contenant `adPlacements` ; cache corrompu (`engine.bin` = `zzz`) → reconstruction sans exception (Review Focus 4) ; cache périmé → `source: 'reseau'` avec un `fetch` factice. FAIL.
- [ ] **Step 3 :** implémenter `engine.ts` (`ElectronBlocker.fromLists(fetch, urls, config, caching)` ou `parse(textes)` pour l'embarqué).
- [ ] **Step 4 :** `npm test` PASS ; commit `feat: moteur des Boucliers, listes embarquées et cache` et push.

### Task 9 : Boucliers dans les sessions et preload page (YouTube)

**Files:** Create `src/main/shields/Shields.ts`, `src/main/shields/Shields.test.ts`, `src/preload/page.ts`, `src/renderer/ui/ShieldsPanel.tsx`, `tests/e2e/shields.spec.ts`, `tests/e2e/fixtures/pub.html` (charge `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js` et affiche le résultat). Modify `TabManager.ts`, `Sky.tsx` (bouclier + compteur), `ipc.ts`.

**Interfaces:**
- `Shields.attacher(ses: Session)` : `webRequest.onBeforeRequest` (`<all_urls>`) → ignorer si `details.initiator`/`url` commence par `chrome-extension://` ; sinon `fromElectronDetails` → `moteur.match` → `cancel` / `redirectURL` ; compteur par `webContentsId` ; `onHeadersReceived` → `getCSPDirectives` ; `registerPreloadScript({ type: 'frame', filePath: preloadPage })`.
- Bouclier par site : `Shields.estActif(origine)` depuis `SiteRules` minimal (`settings.sites[origine].boucliers: boolean`) ; IPC `shields:get` (compteur de l'étoile active, actif), `shields:toggleSite`.
- `ipcMain.on('shields:scriptlets')` **synchrone** (`event.returnValue = scripts`) et `ipcMain.handle('shields:styles')` → `insertCSS(styles, { cssOrigin: 'user' })` — enregistrés une fois.
- `preload/page.ts` : au chargement (document-start), si `location.protocol` http(s) : `scripts = ipcRenderer.sendSync('shields:scriptlets', location.href)` ; pour chaque script `webFrame.executeJavaScript('{\n' + s + '\n}')` avec `.catch` → `ipcRenderer.send('shields:scriptlet-error', nom)` ; expose `window.__lyraShields = { scriptletsAt: document.readyState + '@' + ms, n }` dans le monde principal ; puis `injectCosmetics` de `@ghostery/adblocker-content` avec notre IPC pour les styles.
- `ShieldsPanel` (overlay) : site, interrupteur, compteurs, « Voir ce qui a été bloqué ».

- [ ] **Step 1 :** tests `Shields.test.ts` avec un moteur de fixture et un faux `details` : requête initiée par `chrome-extension://` jamais bloquée ; requête pub annulée ; compteur incrémenté par `webContentsId` ; site désactivé → rien bloqué. FAIL.
- [ ] **Step 2 :** implémenter `Shields.ts`, `page.ts`, panneau, compteur dans le ciel.
- [ ] **Step 3 :** e2e `shields.spec.ts` (hors réseau) : charger `fixtures/pub.html` → le fetch échoue (`ERR_BLOCKED_BY_CLIENT`) et le compteur de l'étoile vaut ≥ 1 ; désactiver pour `file://` → compteur 0 au rechargement. Test `@reseau` : `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → `Object.getOwnPropertyDescriptor(window,'ytInitialPlayerResponse').get` défini, `adPlacements === undefined`, `window.__lyraShields.scriptletsAt` commence par `loading@` ; puis 3 vidéos enchaînées, `#movie_player.ad-showing` jamais vrai pendant 9 s chacune.
- [ ] **Step 4 :** `npm test && npm run e2e` PASS ; `LYRA_E2E_RESEAU=1 npx playwright test --grep @reseau` PASS (coller la sortie dans le ledger).
- [ ] **Step 5 :** commit `feat: Boucliers actifs dans les sessions, scriptlets tôt, blocage YouTube prouvé` et push.

### Task 10 : Historique, favoris et pages internes associées

**Files:** Create `src/main/history/History.ts`, `History.test.ts`, `src/main/bookmarks/Bookmarks.ts`, `Bookmarks.test.ts`, `src/renderer/settings/Historique.tsx`, `Favoris.tsx`. Modify `TabManager.ts` (did-navigate → History), `Capsule.tsx` (étoile favoris), `suggest.ts` (historique et favoris dans la palette), `ipc.ts`.

**Interfaces:**
- `History` : fichier JSON lignes `userData/historique.jsonl` (append) + index en mémoire (par URL : dernier titre, visites, dernière date) ; `ajouter({ url, title, date })`, `rechercher(texte, limite = 50)`, `supprimer(url)`, `effacer()`, `frequents(n)` (sites fréquents du nouvel onglet).
- `Bookmarks` : `userData/favoris.json` ; `ajouter({ url, title, dossier? })`, `retirer(url)`, `existe(url)`, `lister()`, `rechercher`.
- IPC `history:search`, `history:delete`, `history:clear`, `bookmarks:toggle`, `bookmarks:list`, `bookmarks:remove`.

- [ ] **Step 1 :** tests : ajout puis `rechercher('lyre')` ; visites cumulées ; `frequents` trié ; `Bookmarks.toggle` idempotent ; fichiers absents → vides. FAIL.
- [ ] **Step 2 :** implémenter ; pages Historique et Favoris (liste, recherche, suppression) selon le design des pages Lyra.
- [ ] **Step 3 :** `npm test` PASS ; e2e : naviguer puis `lyra://history` affiche l'entrée.
- [ ] **Step 4 :** commit `feat: historique et favoris` et push.

### Task 11 : Téléchargements

**Files:** Create `src/main/downloads/Downloads.ts`, `Downloads.test.ts`, `src/renderer/ui/Downloads.tsx`, `src/renderer/settings/Telechargements.tsx`, `tests/e2e/fixtures/fichier.txt`. Modify `ipc.ts`, `Sky.tsx`.

**Interfaces:**
- `Downloads.attacher(ses)` : `will-download` → `DownloadInfo { id, nom, chemin, url, total, recu, etat: 'en-cours'|'termine'|'annule'|'erreur', date }` ; `setSavePath(dossier/nom unique)` si `telechargements.demander` est faux ; événement `downloads:changed` ; `pause(id)`, `reprendre(id)`, `annuler(id)`, `ouvrir(id)`, `afficherDansDossier(id)`, `effacerListe()`.
- Panneau overlay (bouton téléchargements du ciel) : liste avec progression.

- [ ] **Step 1 :** test unitaire de `nomUnique(dossier, nom)` (`fichier (2).txt`) et de la réduction d'état depuis des événements `updated/done` simulés. FAIL.
- [ ] **Step 2 :** implémenter ; e2e : cliquer un lien `download` vers `fixtures/fichier.txt` → entrée `termine` dans le panneau et fichier présent dans le dossier temporaire.
- [ ] **Step 3 :** PASS ; commit `feat: téléchargements` et push.

### Task 12 : Session (sauvegarde/restauration) et dormance des étoiles

**Files:** Create `src/main/session/SessionStore.ts`, `SessionStore.test.ts`, `tests/e2e/session.spec.ts`. Modify `TabManager.ts`, `index.ts`.

**Interfaces:**
- `SessionStore` : `userData/session.json` `{ version: 1, fenetres: [{ ciel: SkyState, entrees: Record<starId, { entries: NavigationEntry[], index }> }] }` ; `sauvegarder(etat)` (debounce 2 s, atomique), `charger(): Etat | null` (absent/vide/corrompu → `null`).
- Au démarrage : `charger()` → recréer les fenêtres et étoiles **endormies** sauf l'active (réveillée) ; sinon fenêtre + `lyra://newtab`.
- Dormance : minuterie par étoile inactive (`ciel.endormirApresMin`) ; `endormir` = sérialiser `navigationHistory.getAllEntries()` + index, `webContents.close()`, `dormant: true` ; jamais si audio en cours ou `tabs:formulaireModifie` signalé par le preload page (`beforeunload` présent) ; `reveiller` = nouvelle vue + `navigationHistory.restore` avant `loadURL`. Ternir = état `terne` après `ternirApresMin` (UI seulement).

- [ ] **Step 1 :** tests `SessionStore` : fichier absent → null ; corrompu → null (Review Focus 5) ; aller-retour. FAIL.
- [ ] **Step 2 :** implémenter ; e2e `session.spec.ts` : ouvrir 2 étoiles, fermer l'app proprement, relancer avec le même `LYRA_USER_DATA` → 2 étoiles, la seconde active, la première dormante (classe `dim`) ; cliquer la dormante la réveille avec la même URL ; `session.json` corrompu → une étoile `lyra://newtab`.
- [ ] **Step 3 :** PASS ; commit `feat: restauration de session et dormance` et push.

### Task 13 : Nouvel onglet et réglages minimaux

**Files:** Modify `src/renderer/newtab/main.tsx`, `src/renderer/settings/General.tsx` ; Create `src/renderer/newtab/Ciel.tsx` (SVG étoilé + tracé de la Lyre), `src/renderer/settings/PremierLancement.tsx`.

**Interfaces:**
- Nouvel onglet selon `NouvelOnglet.dc.html` : « Bonsoir. » (bonjour avant 18 h), champ (focus auto, même interprétation que la palette via `palette:go`), chip du moteur, « Vos constellations » (depuis `sky:get`), « Sites fréquents » (`history:frequent`), pied (compteur Boucliers de la semaine via `shields:stats`, « Aucune donnée ne quitte cet ordinateur. »).
- Premier lancement (`moteurChoisi === false`) : écran de choix du moteur (DuckDuckGo présélectionné) dans `lyra://newtab`, puis `settings:set({ moteurParDefaut, moteurChoisi: true })`.
- Réglages Général : moteur, thème (système/clair/sombre → `nativeTheme.themeSource` + variables CSS), Boucliers (niveau, gênes, heures de mise à jour, bouton « mettre à jour » + date), dossier de téléchargement, langue, « effacer l'historique », export/import des réglages (JSON).

- [ ] **Step 1 :** e2e : premier lancement affiche le choix du moteur ; choisir Kagi → palette `véga` propose Kagi ; `lyra://settings` thème « sombre » → `prefers-color-scheme: dark` dans une page.
- [ ] **Step 2 :** implémenter ; PASS ; commit `feat: nouvel onglet, premier lancement et réglages généraux` et push.

### Task 14 : Permissions, menu contextuel, recherche dans la page, zoom, plein écran, UA, erreurs

**Files:** Create `src/main/permissions/Permissions.ts`, `Permissions.test.ts`, `src/main/menu/contextMenu.ts`, `src/renderer/ui/FindBar.tsx`, `src/renderer/ui/PermissionPrompt.tsx`, `src/renderer/erreur.html` (page d'erreur Lyra : réseau, certificat avec « continuer »). Modify `TabManager.ts`, `WindowManager.ts`, `ipc.ts`.

**Interfaces:**
- `Permissions.attacher(ses)` : request + check handlers ; décision par origine depuis `settings.sites[origine].permissions[type]` ; inconnue → prompt overlay (`permission:ask` → réponse) ; `webContents` null → origine.
- Menu contextuel maison (`context-menu` → `Menu.buildFromTemplate`) : précédent/suivant/recharger, ouvrir le lien dans une nouvelle étoile, copier le lien/l'adresse de l'image, enregistrer l'image, couper/copier/coller, rechercher « … » avec le moteur, inspecter.
- Recherche dans la page : `find:start/next/prev/stop` → `findInPage`, barre flottante dans le chrome (⌘F, Échap).
- Zoom : ⌘+ ⌘- ⌘0 → `setZoomFactor` par étoile, mémorisé par site dans `settings.sites`.
- Plein écran HTML → `setPleinEcran(true)` ; `certificate-error` → page `erreur.html?type=certificat&url=…` avec bouton « Continuer » (mémorise l'exception pour l'hôte le temps de la session) ; `did-fail-load` → page d'erreur.
- UA nettoyé au démarrage (`app.userAgentFallback`), `ses.setUserAgent`.

- [ ] **Step 1 :** tests `Permissions` : règle mémorisée → pas de prompt ; `webContents` null → décision par origine. FAIL.
- [ ] **Step 2 :** implémenter ; e2e : `navigator.userAgent` ne contient pas « Electron » ; ⌘F trouve un mot de `fixtures/liens.html` (`found-in-page` matches ≥ 1) ; page inexistante → page d'erreur Lyra.
- [ ] **Step 3 :** PASS ; commit `feat: permissions, menu contextuel, recherche, zoom, plein écran, erreurs` et push.

### Task 15 : Icône, paquets et vérification finale

**Files:** Create `build/icon.png`, `docs/superpowers/ETAT.md` (mise à jour). Modify `electron-builder.yml`, `README.md`, `.github/workflows/build.yml` si besoin.

- [ ] **Step 1 :** icône 1024×1024 (SVG → PNG via `sharp` en devDependency ou script) ; `electron-builder.yml` `icon: build/icon.png`.
- [ ] **Step 2 :** `npm run typecheck && npm test && npm run e2e` → coller les sorties ; `npm run dist:mac` et `npm run dist:win` → `release/` contient `.dmg` et `Lyra Setup x.exe` ; lancer l'app du dmg, ouvrir YouTube à la main (vérification humaine notée dans le ledger).
- [ ] **Step 3 :** pousser ; vérifier que le workflow GitHub passe sur les deux OS (`gh run watch`) ; coller le verdict.
- [ ] **Step 4 :** commit `chore: icône, paquets et état du jalon A` et push.

---

## Auto-relecture

- Couverture : §4 ciel/capsule/palette/newtab (5, 6, 7, 13), §4 pages internes historique/favoris/téléchargements (10, 11), §5 vues/sessions/protocole/IPC (2, 3, 4, 5), §6 Boucliers complet avec preuve YouTube (8, 9), §8 build/tests/CI (1, 15), permissions/UA/plein écran/erreurs (14), session/dormance (12). Hors jalon A, volontairement : extensions (B), positions du ciel autres que gauche + masqué + Ne pas déranger (C — `computeLayout` les prépare déjà), réglages complets/règles par site/couleurs (D), import/export (E), fenêtre privée complète (`creerFenetre({privee})` existe, sans UI dédiée : jalon C).
- Types : `Star`, `SkyState`, `Settings` définis en tâche 2 et réutilisés tels quels ; `computeLayout` (4) consommé par `WindowManager` ; `interpreterSaisie` (7) réutilisée par le nouvel onglet (13).
- Review Focus : 1 → tâche 7, 2 et 3 → tâche 5, 4 → tâche 8, 5 → tâche 12.
