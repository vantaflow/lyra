# Lyra — conception

Date : 2026-10-19. Statut : brouillon en cours (sections techniques à compléter après la recherche et les spikes).

## 1. Intention

Lyra est un navigateur web de bureau, pour **Windows et macOS**, dans l'esprit d'**Orion** (Kagi) : sobre, rapide, sans télémétrie, avec un bloqueur de publicités et de traqueurs intégré, et qui fait tourner **à la fois les extensions Chrome et les extensions Firefox**.

Pourquoi un clone plutôt qu'Orion lui-même : Orion n'existe que sur macOS et iOS (WebKit). Lyra vise les deux plateformes de bureau avec un seul moteur (Chromium via Electron), et doit offrir, dès la première version, ce que l'utilisateur a nommé comme indispensable :

1. **extensions Chrome et Firefox** installables et fonctionnelles ;
2. **blocage des publicités YouTube** équivalent à Brave, **intégré** au navigateur (pas seulement via une extension installée par l'utilisateur) ;
3. **Windows et macOS**.

Ces trois points sont les exigences de l'utilisateur. Tout le reste de ce document est un choix de Claude (l'utilisateur a dit « vas-y avec tes propres choix »), consigné en Rulings dans `.autopilot/LEDGER.md`.

## 2. Objectifs, non-objectifs, anti-objectifs

### Objectifs (v1)

- Un navigateur à onglets utilisable au quotidien : barre d'adresse omnibox, onglets, historique, favoris, téléchargements, recherche dans la page, zoom, plein écran, impression, visionneuse PDF, navigation privée, restauration de session, raccourcis clavier standards, menu contextuel.
- **Shields** intégrés (nom repris de Brave pour la fonction, pas pour la marque) : blocage réseau + cosmétique + scriptlets, listes EasyList / EasyPrivacy / uBlock Origin (dont les règles YouTube), mises à jour automatiques des listes, bouton par site (activer/désactiver, compteur), aucune configuration nécessaire pour que YouTube soit sans publicité.
- **Extensions** : page `lyra://extensions` ; installation depuis le Chrome Web Store (ID ou URL), depuis addons.mozilla.org (slug ou URL) et depuis un fichier local (`.crx`, `.zip`, `.xpi`) ; activation / désactivation / suppression ; icônes d'action dans la barre d'outils avec leur popup ; page d'options ; journal des API non supportées pour expliquer honnêtement ce qui ne marche pas.
- **Zéro télémétrie** : aucune requête réseau qui ne soit pas la navigation de l'utilisateur, la mise à jour des listes de filtres, ou l'installation / la mise à jour des extensions demandées. Aucun compte, aucune synchronisation.
- Paquets installables : `.dmg` (macOS Apple Silicon, Intel si le coût est nul) et installateur `.exe` NSIS (Windows x64), produits par GitHub Actions ; build local macOS possible depuis le Mac de l'utilisateur.
- Interface en **français et anglais**, langue suivant celle du système.

### Non-objectifs (v1, explicitement remis à plus tard ou jamais)

- Onglets verticaux / arborescents, Focus mode, aperçu de lien, mode lecture, profils multiples : **v2**.
- Gestionnaire de mots de passe intégré : **jamais** (une extension Bitwarden / 1Password fait mieux).
- Synchronisation cloud, compte utilisateur, versions iOS/Android, boutique d'extensions propre : **jamais**.
- Fork de Chromium ou moteur WebKit : **jamais** (hors de portée d'un projet personnel).
- Signature / notarisation des paquets : **hors v1** (pas de certificat) ; la documentation explique comment ouvrir une app non vérifiée.

### Anti-objectifs (ce qui ferait de Lyra un échec même si « ça marche »)

- Une télémétrie, une publicité ou un « service » du navigateur lui-même.
- Un navigateur qui casse les sites : un faux positif du bloqueur doit se corriger en un clic (bouclier par site).
- Une compatibilité d'extensions « sur le papier » : une extension qui s'installe mais ne fait rien, sans explication, est pire qu'un refus clair.
- Une interface lourde ou lente : Lyra doit démarrer vite et rester légère (une seule fenêtre, pas de framework UI massif).

## 3. Contraintes

- **Pile** : Electron (même Chromium sur Windows et macOS), TypeScript, Node.js 24, construit sur un Mac Apple Silicon sans certificat de signature.
- **Licence** : GPL-3.0 si la bibliothèque d'extensions retenue l'impose (à confirmer en section 5) ; sinon MIT.
- **Dépôt** : `/Users/lilou/Projects/lyra`, branche `main`, local ; aucun push ni publication sans demande explicite de l'utilisateur.
- **Qualité** : chaque fonctionnalité a ses tests (vitest pour la logique, Playwright-Electron pour le navigateur réel) ; le blocage YouTube est prouvé par un test automatisé, pas par une impression.
- **Modèles IA pour les agents** : Sonnet par défaut, Opus pour les spikes à risque et la revue finale, Haiku pour le mécanique (préférence de l'utilisateur).

## 4. Ce que l'utilisateur verra (produit)

### Fenêtre

Une fenêtre par défaut, composée de haut en bas :

1. **Barre d'onglets** horizontale (favicon, titre, bouton fermer, bouton « + »), glisser-déposer pour réordonner, onglet épinglé en v2.
2. **Barre d'outils** : précédent, suivant, recharger/arrêter, barre d'adresse omnibox (URL ou recherche ; suggestions depuis l'historique et les favoris ; affichage du domaine en évidence, cadenas HTTPS), bouton **bouclier** (Shields du site), icônes des **extensions** (actions avec popup), bouton **téléchargements** (quand il y en a), menu **⋯** (nouvelle fenêtre, fenêtre privée, historique, favoris, extensions, téléchargements, zoom, imprimer, rechercher, paramètres, à propos, quitter).
3. **Barre de favoris** (masquable).
4. **La page** (un `WebContentsView` par onglet ; seul l'onglet actif est visible).
5. **Barre de recherche dans la page** (flottante, Ctrl/Cmd+F).

### Pages internes (`lyra://`)

- `lyra://newtab` : champ de recherche, raccourcis vers les sites fréquents (calculés localement), rien d'autre.
- `lyra://settings` : moteur de recherche (DuckDuckGo par défaut ; Kagi, Google, Brave Search, Startpage, Qwant), page d'accueil, Shields (niveau global, listes, mise à jour), téléchargements (dossier, demander où enregistrer), apparence (clair/sombre/système, barre de favoris), langue, confidentialité (effacer historique/cookies/cache, « ne pas garder l'historique »), raccourcis.
- `lyra://extensions` : liste installées (icône, nom, version, origine Chrome/Firefox, état, bouton options, journal des API non supportées), installation (ID/URL Chrome Web Store, slug/URL addons.mozilla.org, fichier local), mise à jour manuelle.
- `lyra://history`, `lyra://bookmarks`, `lyra://downloads` : listes simples avec recherche et suppression.
- `lyra://shields` : statistiques globales (bloqués depuis l'installation), listes actives et date de mise à jour, bouton « mettre à jour maintenant ».

### Comportements

- Une fenêtre privée utilise une session non persistante (cookies, historique, cache jetés à la fermeture), Shields actifs, extensions actives seulement si l'utilisateur l'a autorisé.
- `window.open` / `target=_blank` ouvrent un nouvel onglet ; les popups de connexion (OAuth) ouvrent une petite fenêtre.
- Vidéo plein écran : l'interface disparaît ; Échap revient.
- Permissions (caméra, micro, notifications, géolocalisation, presse-papiers) : question à l'utilisateur, mémorisée par site.
- Erreur de certificat : page d'erreur Lyra, possibilité de continuer en connaissance de cause.
- Fermeture : la session (onglets, fenêtres) est restaurée au prochain démarrage, sauf en privé.
- User-agent : celui de Chrome correspondant, sans mention d'Electron ni de Lyra, pour ne pas être bloqué par les sites.

### Raccourcis (Cmd sur macOS, Ctrl sur Windows)

Nouvel onglet T, fermer W, rouvrir Shift+T, nouvelle fenêtre N, privée Shift+N, adresse L, recharger R, recherche F, onglet suivant/précédent Ctrl+Tab / Ctrl+Shift+Tab, onglet n°N 1-8 et dernier 9, zoom +/-/0, historique Y, favoris Shift+B, téléchargements Shift+J, ajouter aux favoris D, plein écran F11 / Ctrl+Cmd+F, DevTools F12 / Alt+Cmd+I, quitter Q.

## 5. Architecture technique

_À compléter avec les résultats de la recherche et des spikes (extensions, bloqueur, packaging)._

## 6. Blocage des publicités et YouTube

Vérifié par un spike jetable le 2026-10-19 (Electron 44.9.0, `@ghostery/adblocker-electron` 2.20.1) : huit lancements réels sur youtube.com, avec et sans bloqueur, vidéos enchaînées, mesures collées dans le ledger. Code du spike conservé pour référence dans `docs/superpowers/spikes/adblock/`.

### Moteur retenu : Ghostery (`@ghostery/adblocker` 2.20.1), pas adblock-rs

- **Ghostery** : JS pur (aucun binaire, aucun WASM, aucun script d'installation), même code sur Windows et macOS, 122 738 filtres réseau + 67 947 filtres cosmétiques avec les scriptlets uBO (`json-prune`, `set-constant`, `trusted-replace-fetch-response`, `json-prune-xhr-response`…). Chargement depuis le cache en 30-60 ms pour ~13 Mo de RSS ; cache de 8,5 Mio ; première construction depuis le réseau ~1 s (18 listes brutes téléchargées depuis `raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/…` : easylist, easyprivacy, uBO filters 2020-2024 / privacy / unbreak / badware / quick-fixes / resource-abuse, Peter Lowe, `resources.json` ; les listes « annoyances » et cookies s'ajoutent dans le préréglage `fullLists`).
- **adblock-rs (Brave) écarté** : aucun binaire précompilé (compilation Rust à l'installation, `rust-toolchain` 1.97 imposé, `.node` propre à chaque plateforme — exactement la chaîne native qu'on refuse), aucune intégration Electron, aucun scriptlet fourni (`injected_script` vide). Moteur plus rapide (3 µs/requête) mais sans intérêt ici.

### Intégration : Lyra pilote le moteur elle-même

`ElectronBlocker.enableBlockingInSession` a trois défauts mesurés : (1) les scriptlets sont injectés par `WebContents.executeJavaScript`, qui **attend la fin du chargement** — sur YouTube ils arrivent à `complete@2200 ms`, après le script inline `ytInitialPlayerResponse`, et **la pub vidéo passe quand même (5 vidéos sur 5)** ; (2) chaque scriptlet est exécuté dans le même monde sans isolation (`Identifier 'JSONPath' has already been declared`, 3 scriptlets `trusted-json-edit-xhr-request` en échec par page) ; (3) deux `ipcMain.handle` globaux font échouer l'activation d'une seconde session (navigation privée) avec `isBlockingEnabled` qui ment. Lyra n'appelle donc **pas** `enableBlockingInSession` ; elle réutilise le moteur et `@ghostery/adblocker-content` :

- `ShieldsService` (main) : construit le moteur avec `ElectronBlocker.fromLists(fetch, adsAndTrackingLists [+ annoyances si option], config, { path: <userData>/shields/engine.bin, read, write })` — `fromPrebuilt*` force `config = {}` et n'est qu'un alias de `fromLists`. `mkdir` du dossier avant (sinon `write` rejette). Rotation du cache par âge (rebuild en tâche de fond si > 24 h, et bouton « mettre à jour » dans `lyra://shields`) : le cache Ghostery **n'expire jamais seul**.
- Par session (normale et privée) : `webRequest.onBeforeRequest` → `blocker.match(fromElectronDetails(details))` → `cancel` ou `redirectURL` (data:), sauf si le bouclier du site de premier niveau est désactivé ; `onHeadersReceived` → `blocker.getCSPDirectives(request)` ; compteur de requêtes bloquées par onglet (pour le bouton bouclier) ; `session.registerPreloadScript({ type: 'frame', filePath: shieldsPreload })` (API Electron ≥ 35 ; `setPreloads` est déprécié).
- **Preload Shields** (document-start, top frame et iframes http(s)) : `ipcRenderer.sendSync('shields:scriptlets', location.href)` puis, pour chaque scriptlet, `webFrame.executeJavaScript('{\n' + script + '\n}')` — exécution **synchrone avant le premier script de la page** (mesuré : `loading@103-162 ms`, `window.ytInitialPlayerResponse` devient un accesseur, 0 échec, **0 pub sur 5 vidéos**, contre 5/5 avec l'injection standard et 3/8 sans bloqueur). Ensuite, styles : `ipcRenderer.invoke('shields:styles', …)` → main répond avec `blocker.getCosmeticsFilters({ url, hostname, domain, getBaseRules, getInjectionRules: false, getRulesFromHostname, getRulesFromDOM, classes, ids, hrefs })` et fait `insertCSS(styles, { cssOrigin: 'user' })` ; le preload réutilise `injectCosmetics` / `DOMMonitor` de `@ghostery/adblocker-content` pour les règles génériques dépendantes du DOM (MutationObserver), avec notre canal IPC à la place de celui de Ghostery.
- Handlers IPC enregistrés **une seule fois** au démarrage, indépendants des sessions.
- Effet de bord connu du correctif : 4 à 8 s d'attente avant le démarrage des vidéos YouTube enchaînées (le lecteur attend une réponse pub qui ne vient pas). Acceptable ; à surveiller.

### Listes et réglages

- Par défaut : préréglage `adsAndTrackingLists` (équivalent du choix Brave : pubs + traqueurs). Option « bloquer aussi les bannières de cookies et autres gênes » (`fullLists`) désactivée par défaut, car ces listes cliquent automatiquement « Accepter les cookies » sur YouTube (`trusted-click-element`) — un choix que l'utilisateur doit faire lui-même.
- Bouclier par site : activé/désactivé (mémorisé dans les réglages, par domaine), compteur de la page, lien vers `lyra://shields`.
- Les listes personnalisées (URL) : v2.

### Preuve automatisée du blocage YouTube

1. **Unitaire (vitest, sans réseau)** : moteur construit depuis des listes figées en fixture ; `match` vrai pour `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js`, `youtube.com/api/stats/ads?`, `static.doubleclick.net/instream/ad_status.js` (redirection), faux pour `youtube.com/s/player/…/base.js` et `i.ytimg.com/vi/…/hqdefault.jpg` ; `getCosmeticsFilters` pour `www.youtube.com` renvoie un scriptlet contenant `jsonPrune` et `adPlacements`.
2. **Bout en bout (Playwright, réseau)** : ouvrir `https://www.youtube.com/watch?v=…` dans Lyra, vérifier `Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse').get` défini (accesseur posé par `set-constant`), `ytInitialPlayerResponse.adPlacements === undefined`, et `window.__lyraShields.scriptletsAt` commençant par `loading@` ; test « séquence » optionnel (3 vidéos enchaînées, `#movie_player.ad-showing` jamais vrai), marqué lent, exécuté à la demande car dépendant de YouTube.
3. Ne jamais conclure sur `adModules` (vaut 1 avec ou sans pub) ni sur la première vidéo d'une session neuve (YouTube ne lui sert jamais de pub) ; ne pas dépendre de la résolution DNS des domaines de pub (le DNS de ce Mac les renvoie vers 0.0.0.0).

### Limites honnêtes

- Les règles YouTube changent chaque semaine : sans mise à jour des listes, le blocage se dégrade. D'où la rotation automatique du cache et le bouton de mise à jour.
- Une insertion de publicité côté serveur (SSAI), si YouTube la généralise, ne se bloque pas par filtrage de requêtes ; Brave et uBlock Origin sont logés à la même enseigne.
- Le préréglage dépend de GitHub (`raw.githubusercontent.com`) au premier lancement et à chaque mise à jour ; une copie des listes du jour est embarquée dans le paquet (`resources/shields/`) pour un premier lancement hors ligne.

## 7. Extensions Chrome et Firefox

_À compléter._

## 8. Build, tests, packaging

Vérifié par un spike jetable le 2026-10-19 sur ce Mac (macOS 27.0.1, Apple Silicon, Node 24.3.0, npm 11.12.0) — chaque point ci-dessous a été exécuté, pas supposé.

### Versions

| Paquet | Version (npm, 2026-10-19) | Rôle |
|---|---|---|
| electron | 44.9.0 (Chromium 152.0.7977, Node 24.22) | moteur |
| electron-vite | 6.0.0 (vite 8.3.4, Rolldown) | build main / preload / renderer |
| electron-builder | 26.15.3 | paquets dmg / zip / nsis |
| typescript | 5.9.x (celle du scaffold officiel ; 7.0.2 existe mais n'apporte rien ici) | typage |
| vitest | 5.0.5 | tests unitaires |
| @playwright/test | 1.64.1 (`_electron`) | tests bout en bout sur le vrai navigateur |

### Structure et scripts

- Scaffold de référence : `npm create @quick-start/electron@latest -- --template vanilla-ts --skip` (non interactif), puis adaptation. Sortie CJS pour main et preload (pas de `"type": "module"` dans `package.json`, sinon electron-vite change le format de sortie).
- `package.json` : `"name": "lyra"` et `"productName": "Lyra"` (le nom du dossier `userData` vient de `name`) ; `"main": "./out/main/index.js"`.
- Scripts : `dev` (electron-vite dev), `build` (electron-vite build), `typecheck` (tsc --noEmit), `test` (vitest run), `e2e` (playwright test), `dist:mac` (`npm run build && electron-builder --mac --arm64`), `dist:win` (`npm run build && electron-builder --win --x64`). electron-builder ne lance pas le build lui-même.
- Electron 44 ne télécharge plus son binaire au `npm install` : il arrive au premier `require('electron')`. En CI, lancer `npx install-electron` avant les tests et les builds.

### electron-builder.yml

```yaml
appId: com.vantaflow.lyra
productName: Lyra
directories: { output: release, buildResources: build }
files: [out/**, package.json]
asar: true
asarUnpack: [resources/**]          # listes de filtres et polyfill embarqués
mac:
  target: [{ target: dmg, arch: arm64 }, { target: zip, arch: arm64 }]
  identity: "-"                      # signature ad hoc explicite : bundle scellé, codesign --verify OK
  hardenedRuntime: false             # obligatoire avec ad hoc, sinon l'app peut ne pas démarrer
win:
  target: [{ target: nsis, arch: x64 }]
nsis: { oneClick: false, allowToChangeInstallationDirectory: true }
```

- **Signature macOS** : ce Mac possède une identité « Apple Development » dans le trousseau ; sans `identity` explicite, electron-builder signe avec (et contacte le serveur d'horodatage Apple). `identity: "-"` force l'ad hoc. Pour une vraie signature plus tard : variables `CSC_LINK` / `CSC_KEY_PASSWORD` en CI, sans toucher au fichier.
- **Gatekeeper** : une app ad hoc téléchargée est refusée (`spctl: rejected`). Le README explique : clic droit → Ouvrir, ou `xattr -cr /Applications/Lyra.app`. En local (sans quarantaine), elle se lance directement.
- **Windows depuis macOS** : l'installateur NSIS x64 se construit sur ce Mac **sans Wine** (prouvé : aucun Wine installé, piège sur le PATH jamais appelé, lecture du code d'app-builder-lib : `UninstallerReader` en JS pur sur macOS ≥ 10.15 ; les ressources du `.exe` sont éditées par `resedit` en JS). Seule dépendance : Rosetta 2 pour `makensis` (x86_64) — présent ici ; alternative sans Rosetta : `toolsets: { nsis: "1.2.1" }` (makensis arm64 natif, testé OK). Le MSI, lui, exige Wine : on ne le produit pas.
- Tailles mesurées sur une app vide : dmg 122 Mio, exe NSIS 106 Mio ; durées : mac 35-80 s, win 40-55 s.
- Icône : `build/icon.png` (1024×1024) convertie par electron-builder en `.icns` et `.ico` (à vérifier au scaffold ; sinon fournir les deux fichiers).

### Tests

- **vitest** : `vitest.config.mts` (extension `.mts` obligatoire sans `"type": "module"`), `include: ['src/**/*.test.ts']`, `environment: node` — sans ce `include`, vitest ramasse les specs Playwright et échoue.
- **Playwright** : `playwright.config.ts` avec `testDir: './tests/e2e'`, `workers: 1`, `timeout: 30_000` ; chaque test fait `_electron.launch({ args: ['.'], cwd: racine, env })` où `env` est `process.env` **sans** `ELECTRON_RUN_AS_NODE` (hérité d'un parent Electron, il fait échouer le lancement en 0,3 s avec « Process failed to launch! »). Le `build` doit précéder (`main` pointe sur `out/`). `npx playwright install` n'est pas nécessaire. Les tests e2e peuvent aussi viser l'app empaquetée via `executablePath`.
- Les tests Playwright pilotent les onglets par les IPC de test exposés en mode test uniquement (`LYRA_TEST=1`) : navigation, lecture d'état, exécution de JS dans un onglet.

### CI (GitHub Actions, fichier fourni mais non exécuté tant que le dépôt n'est pas poussé)

`.github/workflows/build.yml` : déclencheur `push` sur tag `v*` et manuel ; matrice `macos-latest` (dmg/zip arm64) et `windows-latest` (nsis x64) ; étapes : checkout, Node 24 avec cache npm, `npm ci`, `npx install-electron`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` (macOS seulement en v1), `electron-builder` avec `--publish never`, upload des artefacts. Un second job optionnel crée la release GitHub à partir des artefacts sur tag.

## 9. Ce qui est laissé au constructeur

_À compléter._

## 10. Risques et parades

_À compléter._
