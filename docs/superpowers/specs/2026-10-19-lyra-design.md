# Lyra — conception

Date : 2026-10-19. Statut : complète, en relecture (builder-check) avant le plan.

## 1. Intention

Lyra est un navigateur web de bureau, pour **Windows et macOS**, dans l'esprit d'**Orion** (Kagi) : sobre, rapide, sans télémétrie, avec un bloqueur de publicités et de traqueurs intégré, et qui fait tourner **à la fois les extensions Chrome et les extensions Firefox**.

Pourquoi un clone plutôt qu'Orion lui-même : Orion n'existe que sur macOS et iOS (WebKit). Lyra vise les deux plateformes de bureau avec un seul moteur (Chromium via Electron), et doit offrir, dès la première version, ce que l'utilisateur a nommé comme indispensable :

1. **extensions Chrome et Firefox** installables et fonctionnelles ;
2. **blocage des publicités YouTube** équivalent à Brave, **intégré** au navigateur (pas seulement via une extension installée par l'utilisateur) ;
3. **Windows et macOS**.

Ces trois points sont les exigences de l'utilisateur. Tout le reste de ce document est un choix de Claude (l'utilisateur a dit « vas-y avec tes propres choix »), consigné en Rulings dans `.autopilot/LEDGER.md`.

## 2. Objectifs, non-objectifs, anti-objectifs

### Objectifs (v1)

- Un navigateur utilisable au quotidien, avec l'interface décrite en §4 : le **ciel** des onglets en constellations (colonne déplaçable gauche/droite/haut/bas, masquable), la **palette ⌘ L** (adresse, recherche, commandes), la **capsule** de navigation, le mode **Ne pas déranger**, historique, favoris, téléchargements, recherche dans la page, zoom, plein écran, impression, visionneuse PDF, navigation privée, restauration de session, raccourcis clavier redéfinissables, menu contextuel.
- Des **réglages complets et personnalisables** (19 sections, règles par site, couleurs et thèmes, export/import JSON) et l'**import depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari et Orion** / export (favoris, historique, ciel, réglages, paquet `.lyra`).
- **Shields** intégrés (nom repris de Brave pour la fonction, pas pour la marque) : blocage réseau + cosmétique + scriptlets, listes EasyList / EasyPrivacy / uBlock Origin (dont les règles YouTube), mises à jour automatiques des listes, bouton par site (activer/désactiver, compteur), aucune configuration nécessaire pour que YouTube soit sans publicité.
- **Extensions** : page `lyra://extensions` ; installation depuis le Chrome Web Store (ID ou URL), depuis addons.mozilla.org (slug ou URL) et depuis un fichier local (`.crx`, `.zip`, `.xpi`) ; activation / désactivation / suppression ; icônes d'action dans la barre d'outils avec leur popup ; page d'options ; journal des API non supportées pour expliquer honnêtement ce qui ne marche pas.
- **Zéro télémétrie** : aucune requête réseau qui ne soit pas la navigation de l'utilisateur, la mise à jour des listes de filtres, ou l'installation / la mise à jour des extensions demandées. Aucun compte, aucune synchronisation.
- Paquets installables : `.dmg` (macOS Apple Silicon, Intel si le coût est nul) et installateur `.exe` NSIS (Windows x64), produits par GitHub Actions ; build local macOS possible depuis le Mac de l'utilisateur.
- Interface en **français et anglais**, langue suivant celle du système.

### Non-objectifs (v1, explicitement remis à plus tard ou jamais)

- Aperçu de lien, mode lecture, profils multiples, listes de filtres personnalisées, gestes à la souris : **v2** (les réglages en réservent la place).
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

Le design a été dessiné avec Claude Design le 2026-10-19 et validé écran par écran avec l'utilisateur (une première version « comme tous les navigateurs » a été rejetée). Canevas : https://claude.ai/artifact/US6xYeYjRNejcSueqTdanQ ; source de chaque écran dans `docs/design/project/` (un `.dc.html` par écran, `canvas.json` en index, `docs/design/README.md` pour la lecture). **Les écrans font foi** pour les proportions, couleurs et libellés ; ce qui suit en est la description.

### Le ciel (les onglets)

- Pas de barre d'onglets ni de barre d'adresse. Les onglets vivent dans **le ciel**, une colonne de 272 px (réglable 200-420) : chaque onglet est une **étoile** (point + titre). Un onglet ouvert depuis un autre reste **relié** à lui par une ligne : une **constellation** (arbre d'onglets). Les constellations portent un nom (« Astronomie », « Travail ») ; une étoile peut être hors constellation.
- États d'une étoile : active (point or de Véga avec lueur, fond `#262650`), ouverte, survolée, **endormie** (ternie : onglet déchargé après N minutes, rechargé au clic), attention (son / notification). Fermeture au survol (×). Glisser-déposer pour réordonner, rattacher ou détacher.
- En tête du ciel : les trois pastilles macOS (espace réservé sur Windows), le mot « Lyra » (Instrument Serif italique), le bouton de **palette** « Aller à, rechercher, commander… ⌘ L », les **étoiles épinglées** (icônes rondes). En pied : **bouclier** avec le compteur du site, extensions, téléchargements, **Ne pas déranger** (croissant), réglages.
- **Position** : gauche (défaut), droite, haut, bas (le ciel devient une bande de 56 px : mêmes étoiles en ligne, enfants représentés par de petits points reliés), ou **masqué** (rail de 14 px avec une poignée or ; au survol du rail, ou ⌘ \, le ciel glisse par-dessus la page, collé au bord, et se retire quand la souris le quitte). Changement par les réglages ou en glissant l'en-tête du ciel vers un bord.
- La page occupe tout le reste, **sans espace** autour ; seuls les coins côté ciel sont arrondis (12 px) sur le fond indigo du ciel.

### La capsule et la palette

- **Capsule** : une ligne de 46 px au-dessus de la page : précédent, suivant, recharger ; au centre une **pilule** avec cadenas et domaine en gras, chemin en gris (clic ou ⌘ L → palette) ; à droite favoris, recherche dans la page, menu ⋯ (nouvelle étoile, fenêtre, fenêtre privée, favoris, rechercher, zoom, imprimer, mode lecture v2, règles du site, style perso du site, outils de développement, historique, réglages). Option : la capsule se masque quand la souris ne bouge plus.
- **Palette ⌘ L** : overlay centré sur fond ciel : un champ ; résultats groupés : onglets ouverts (aller à l'étoile), historique et favoris, recherche (moteur par défaut + mots-clés « k », « w »…), **commandes** (Ne pas déranger 1 h, déplacer le ciel, nouvelle constellation, tout réglage par son nom). Préfixes : `?` recherche, `>` commande, `#` constellation ; ⌘ ↩ ouvre dans une nouvelle étoile ; ⌘ K = commandes seulement.

### Ne pas déranger (⌘ ⇧ D)

Plus de ciel, plus de capsule : seulement la page, plein cadre. Notifications web et fenêtres surgissantes **retenues** et comptées (sauf sites en exception). Un rappel discret en haut à droite (croissant or, « Ne pas déranger · 3 notifications retenues · encore 42 min », Échap) qui s'efface en quelques secondes pour ne laisser que le croissant. Durées : 30 min, 1 h, jusqu'à l'arrêt ; sortie par Échap, le croissant ou ⌘ ⇧ D. Les notifications retenues sont livrées à la sortie.

### Pages internes (`lyra://`)

- `lyra://newtab` (« Nouvelle étoile ») : carte ciel nocturne (étoiles, tracé de la Lyre), « Bonsoir. », grand champ de recherche avec le moteur en chip, **vos constellations** (chips avec compteur, dormantes comprises), **sites fréquents** (calculés localement), pied : compteur des Boucliers de la semaine et « Aucune donnée ne quitte cet ordinateur. »
- `lyra://settings` : sommaire de **19 sections** avec recherche par mot-clé : Général · Le ciel et l'apparence (position, révélation au survol, largeur, étoiles et constellations : relier, icônes, ternir après, endormir après, archiver, placement d'une nouvelle étoile, regroupement par site ; thème, police, taille, densité, coins, capsule automatique) · **Couleurs et thèmes** (thèmes prêts : Indigo nuit, Encre, Forêt, Sable, Aurore, Clair total, Nuit complète, Mes couleurs ; **chaque couleur** modifiable en clair et en sombre avec vérification de contraste ; ciel teinté par le site ; couleur par constellation ; passage en sombre : système / coucher du soleil / heure fixe ; thème à part pour les fenêtres privées ; `prefers-color-scheme` pour les sites) · Palette et recherche · Boucliers · **Règles par site** (tableau : boucliers désactivés/standard/strict, cookies tous/1re partie/bloqués/session, scripts, extensions autorisées, zoom, exception Ne pas déranger, style et script perso ; détail par site avec lecture auto, notifications, user-agent) · Extensions · Confidentialité · Téléchargements · Raccourcis clavier (tous redéfinissables) · Gestes et souris · Ne pas déranger · Démarrage et sessions · Styles et scripts · Réseau et identité · **Importer et exporter** · Sauvegarde et profils · Labo · À propos. Boutons « Exporter les réglages » / « Importer » (JSON) en tête.
- **Importer et exporter** : sources détectées **Chrome, Edge, Brave, Vivaldi, Firefox, Safari, Orion** (+ fichier : favoris HTML, CSV, JSON, paquet `.lyra`) ; choix par élément : favoris, historique, onglets ouverts et groupes (→ constellations), extensions (retrouvées sur le Chrome Web Store ou addons.mozilla.org), moteurs de recherche et mots-clés, mots de passe (Lyra n'en stocke pas : fichier chiffré pour le gestionnaire de l'utilisateur), cookies et sessions, réglages transposables (bloqueur Brave → Boucliers, Focus mode Orion → Ne pas déranger). Export : favoris HTML, historique CSV, le ciel en JSON, réglages JSON, **paquet Lyra complet** (`.lyra`, chiffré par phrase de passe) avec sauvegarde automatique nocturne dans un dossier choisi.
- `lyra://extensions` : installation par ID/URL du Chrome Web Store, par nom/URL addons.mozilla.org, ou fichier `.crx` / `.zip` / `.xpi` / dossier ; liste installées avec origine (Chrome / Firefox · convertie / Fichier), activation, Options, Sites (règles par site), **Journal de compatibilité** (API prises en charge ✓, ignorées –, infos ℹ), incompatibles expliquées (ex. Tree Style Tab : `sidebar_action`) ; mise à jour de toutes.
- `lyra://history`, `lyra://bookmarks`, `lyra://downloads` : listes simples avec recherche et suppression ; `lyra://shields` : statistiques, listes et date de mise à jour, bouton « mettre à jour ».

### Panneaux

Boucliers (depuis le pied du ciel : site, interrupteur, compteurs pubs / traqueurs / scripts, niveau, gênes, liste des éléments bloqués, règles du site, signaler un site cassé) ; téléchargements (progression, pause, afficher) ; extensions (rangée d'icônes + la fenêtre de l'extension telle quelle) ; menu ⋯.

### Identité visuelle

Thème « Indigo nuit » par défaut : ciel `#15152E`, étoile active or de Véga `#F4C56A`, étoiles `#A8A8D8`, endormies `#4E4E7A`, lignes `#3B3B70`, accent `#5452C8`, Boucliers `#1E7F6C` (sur ciel `#5FD3B3`), page blanche, pages Lyra `#F7F7FB`, texte `#1C1C2E` / `#6B6B80`. Polices : Manrope (interface), Instrument Serif italique (mot « Lyra », accroches), monospace système (adresses, code). Icônes en trait, jamais d'emoji. Tout est redéfinissable dans Couleurs et thèmes.

### Comportements

- Une fenêtre privée utilise une session non persistante (cookies, historique, cache jetés à la fermeture), Shields actifs, extensions actives seulement si l'utilisateur l'a autorisé.
- `window.open` / `target=_blank` ouvrent un nouvel onglet ; les popups de connexion (OAuth) ouvrent une petite fenêtre.
- Vidéo plein écran : l'interface disparaît ; Échap revient.
- Permissions (caméra, micro, notifications, géolocalisation, presse-papiers) : question à l'utilisateur, mémorisée par site.
- Erreur de certificat : page d'erreur Lyra, possibilité de continuer en connaissance de cause.
- Fermeture : la session (onglets, fenêtres) est restaurée au prochain démarrage, sauf en privé.
- User-agent : celui de Chrome correspondant, sans mention d'Electron ni de Lyra, pour ne pas être bloqué par les sites.

### Raccourcis (Cmd sur macOS, Ctrl sur Windows)

Nouvel onglet T, fermer W, rouvrir Shift+T, nouvelle fenêtre N, privée Shift+N, adresse L, recharger R, recherche F, onglet suivant/précédent Ctrl+Tab / Ctrl+Shift+Tab, onglet n°N 1-8 et dernier 9, zoom +/-/0, historique Y (Ctrl+H hors macOS : Ctrl+Y reste « Rétablir »), favoris Shift+B, téléchargements Shift+J, ajouter aux favoris D, plein écran F11 / Ctrl+Cmd+F, DevTools F12 / Alt+Cmd+I, quitter Q. Tous redéfinissables dans Réglages ; sont refusés les raccourcis réservés au système, les rôles natifs (copier, coller, annuler, rétablir…) et ceux qui gêneraient la saisie de texte (touches d'édition, Ctrl+Alt = AltGr, Ctrl+lettre sous macOS).

## 5. Architecture technique

Sources : recherche du 2026-10-19 (`docs/superpowers/research/2026-10-19-architecture-electron.md`), code de Min et d'electron-browser-shell, spikes.

### Processus et vues

```
BaseWindow (une par fenêtre Lyra, titleBarStyle hidden)
 └─ contentView
     ├─ chromeView   WebContentsView — renderer « ui » : le ciel + la capsule (une seule page HTML, mise en page selon la position du ciel)
     ├─ tabView[n]   WebContentsView — un par onglet ; seul l'onglet actif est attaché et visible
     └─ overlayView  WebContentsView transparent (#00000000) — renderer « ui » route overlay : palette ⌘ L, popups d'extension, boîtes de permission ; toujours ajouté en dernier (sommet), masqué hors usage
```

- Pas d'auto-resize : `WindowManager` recalcule les bounds à chaque `resize`, changement de position du ciel (gauche/droite/haut/bas/masqué, largeur) et plein écran HTML (`enter/leave-html-full-screen` → onglet plein cadre, chrome et overlay masqués). Ne pas déranger : chrome masqué, onglet plein cadre, overlay réservé au rappel.
- Ordre z : `addChildView` sur l'overlay pour le remonter ; l'overlay en plein cadre capte les clics quand il est visible → fermeture au clic extérieur, retour du focus à l'onglet.
- Dormance d'une étoile : `webContents.close()` après le délai réglé, état sérialisé (`navigationHistory.getAllEntries()` + index, titre, favicon, défilement) ; réveil = nouveau `WebContentsView` + `navigationHistory.restore()` avant tout `loadURL`. Même mécanisme pour la restauration de session. Perte assumée de l'état non sérialisé (vidéo en cours, formulaire non envoyé) : une étoile avec audio ou formulaire modifié n'est pas endormie.
- Popups : `setWindowOpenHandler` — sans `features` : `deny` + nouvelle étoile **reliée** à son parent ; avec `features` (OAuth) : `allow` + `createWindow` → petite fenêtre `BrowserWindow` reliée à l'opener (`window.opener` fonctionnel).

### Modules du processus principal (TypeScript, un dossier par module, testés par vitest)

| Module | Rôle |
|---|---|
| `WindowManager` | fenêtres, vues chrome/overlay, bounds, position du ciel, plein écran, Ne pas déranger, fenêtre privée (partition non persistante + thème Aurore) |
| `TabManager` | arbre d'étoiles (parent, enfants, constellation, ordre, épinglées), création/activation/fermeture, dormance et réveil, popups reliées, relais des événements (`did-start/stop-loading`, `did-navigate`, `did-navigate-in-page`, `page-title-updated`, `page-favicon-updated`, `did-fail-load`, `did-change-theme-color`, `render-process-gone`) vers l'UI, raccourcis `before-input-event` |
| `Shields` | moteur Ghostery piloté par Lyra (§6) : webRequest + CSP par session, scriptlets tôt par preload, compteurs par onglet, règles par site, mise à jour des listes (cache, rotation 4-8 h) |
| `Extensions` | Chrome natif + electron-chrome-extensions, import Firefox (§7), journal de compatibilité |
| `Settings` | réglages (JSON dans `userData/settings.json`, écriture atomique), thèmes et couleurs, export/import ; `SiteRules` (par origine : boucliers, cookies, scripts, extensions autorisées, zoom, notifications, lecture auto, UA, style/script perso, exception DND) |
| `History`, `Bookmarks` | SQLite (`better-sqlite3` si binaire précompilé disponible pour Electron 44, sinon JSON append + index en mémoire — Ruling au scaffold), favicons en cache |
| `Downloads` | `will-download` sur chaque session, file, progression, panneau |
| `Dnd` | mode Ne pas déranger : minuterie, permission `notifications` refusée temporairement + surcharge de `window.Notification` par le preload page (file rejouée à la sortie), popups retenus, compteur, exceptions par site |
| `Permissions` | `setPermissionRequestHandler` + `setPermissionCheckHandler` sur chaque session, décision par origine mémorisée dans `SiteRules`, boîte dans l'overlay |
| `Protocol` | `lyra://` (`registerSchemesAsPrivileged` avant `ready` ; `protocol.handle` par session, garde anti-traversée) servant `out/renderer` |
| `Importer` | lecteurs Chrome/Edge/Brave/Vivaldi (profils Chromium : Bookmarks JSON, History SQLite, Preferences), Firefox (places.sqlite, extensions.json), Safari (Bookmarks.plist, History.db — accès disque à autoriser), Orion (même format Safari/WebKit, dossiers `~/Library/Application Support/Orion`), fichiers HTML/CSV/JSON/.lyra ; `Exporter` (favoris HTML Netscape, CSV, JSON, paquet `.lyra` = zip chiffré par phrase de passe via `age`-like ou AES-GCM Web Crypto) |
| `Session` | sauvegarde périodique de l'état du ciel (fenêtres, constellations, étoiles, dormantes) et restauration |
| `Updater` | listes de filtres, extensions ; pas d'auto-update de l'app en v1 |

Preloads sandbox (CJS, `isolatedEntries`) : `ui` (API typée pour le ciel, la capsule, l'overlay), `internal` (pages `lyra://`), `page` (sites web : scriptlets Shields tôt, surcharge Notification, lecture auto, style/script perso), `ext` (popups d'extension). Chaque handler `ipcMain.handle` vérifie `event.senderFrame.url` (vue UI ou `lyra://`). Canaux typés dans `src/shared/ipc.ts`.

### Renderer

Preact 11 + `@preact/preset-vite`, trois entrées : `ui.html` (ciel, capsule, overlay), `newtab.html`, `settings.html` (réglages, extensions, historique, favoris, téléchargements, boucliers = routes internes). Thèmes = variables CSS (`--ciel`, `--etoile-active`, …) poussées par IPC, dérivées du thème actif (clair/sombre). Fonts Manrope et Instrument Serif **embarquées** (pas de requête réseau). Icônes SVG inline.

### Sessions

`persist:lyra` (défaut), `persist:profil-<id>` (v2), privée = `fromPartition('privee-<id>')` sans persist ; chaque session reçoit : Shields, Permissions, Downloads, `lyra://`, preload page, UA Chrome sans « Electron » (`ses.setUserAgent`), extensions (session persistante seulement — limite d'electron-chrome-extensions).

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

Vérifié par un spike jetable le 2026-10-19 (Electron 44.9.0, electron-chrome-extensions 4.9.0, electron-chrome-web-store 0.13.0, webextension-polyfill 0.12.0 ; code et logs dans `docs/superpowers/spikes/extensions/` ; recherche dans `docs/superpowers/research/2026-10-19-electron-et-firefox-extensions.md`).

### Ce qui marche, mesuré

- **MV2** se charge dans Electron 44 (avertissement « Manifest version 2 is deprecated ») ; **MV3** avec service worker fonctionne (Dark Reader 4.9.133 installé depuis le Chrome Web Store, service worker démarré, styles injectés).
- Chargement par `session.extensions.loadExtension(dossier, { allowFileAccess })` sur une session persistante, à chaque démarrage (Electron ne mémorise rien) ; `getAllExtensions()` les liste ; dossiers décompressés seulement.
- `electron-chrome-extensions` (constructeur `new ElectronChromeExtensions({ license: 'GPL-3.0', session, createTab, selectTab, removeTab, createWindow, removeWindow, requestPermissions, assignTabDetails })`, `addTab(webContents, window)` par étoile, preload enregistré automatiquement, `ElectronChromeExtensions.handleCRXProtocol(session)` et `injectBrowserAction()` pour les icônes d'action) ajoute `action` (MV3), `contextMenus`, `cookies`, `notifications`, `storage.sync`→local, `windows`, `webNavigation` partiel ; `commands` non supporté.
- `electron-chrome-web-store` : `installExtension(id, { session, extensionsPath })` télécharge le CRX, injecte `manifest.key`, charge ; `installChromeWebStore({ … minimumManifestVersion, beforeInstall })`, `updateExtensions`, `loadAllExtensions`. uBlock Origin MV2 n'est **plus servi** par le Chrome Web Store (HTTP 204) : on le charge depuis sa release GitHub (`uBlock0_<v>.chromium.zip`) ou un fichier.
- **uBlock Origin** (Chrome MV2 et Firefox MV2 converti) plante au démarrage (`chrome.browserAction` undefined : electron-chrome-extensions n'implémente `action` qu'en MV3) ; avec des **stubs** (`browserAction`, `contextMenus`, `webNavigation`, `privacy`, `windows`, `commands`, `dns` : proxys inertes injectés avant le polyfill et recopiés dans `browser.*` après) il démarre et **bloque via webRequest** (4 requêtes pub sur 6, redirections de ressources).
- **Dark Reader Firefox** (xpi MV2) converti par le convertisseur fonctionne (8 `style.darkreader`, fond sombre).

### Règle fondatrice : les Boucliers priment

Un listener `session.webRequest` côté application **neutralise les listeners webRequest des extensions** (README electron-chrome-extensions, confirmé). Lyra garde ses Boucliers sur `session.webRequest` ; en conséquence, une extension bloqueuse (uBO, Privacy Badger…) s'installe mais son blocage réseau est inopérant — le journal de compatibilité le dit en clair (« blocage réseau assuré par les Boucliers »), ses filtres cosmétiques et scriptlets restent actifs. Une extension qui n'a de sens que par webRequest est signalée « redondante avec les Boucliers ».

### Chrome (`Extensions.installChrome`)

1. Sources : ID ou URL du Chrome Web Store (`installExtension`), fichier `.crx` (en-tête CRX3 retiré → zip), `.zip`, dossier.
2. Chargement sur `persist:lyra` au démarrage, dans l'ordre d'installation, avant la création des vues ; état activé/désactivé dans `settings.json` ; mise à jour via `updateExtensions` (bouton + toutes les 6 h).
3. **Couche de compatibilité MV2** : stubs inertes (ceux du spike, généralisés) injectés en tête des scripts d'arrière-plan et des pages de l'extension, uniquement quand le manifest est MV2 et que l'API manque ; journalisés (« API ignorée : browserAction.setBadgeText »). MV3 : rien d'ajouté.
4. Icônes d'action dans le pied du ciel (`<browser-action-list>` via `injectBrowserAction()` dans le preload `ui`) ; popup rendu dans l'overlay ; pages d'options en nouvelle étoile.
5. Journal de compatibilité par extension : avertissements de chargement (permissions inconnues), API stubées, API manquantes appelées (comptées), conflits de raccourcis.

### Firefox (`Extensions.installFirefox`, convertisseur `xpi → dossier`)

1. Sources : nom/URL addons.mozilla.org (API v5 : `current_version.file.url`, hash sha256 vérifié avant extraction, cache local par version), fichier `.xpi`.
2. Conversion réglée et auditable (rapport JSON) : extraction, suppression de `META-INF/` ; `browser_specific_settings`/`applications` retirés ; `menus`→`contextMenus` ; permissions Firefox-only retirées et journalisées (`dns`, `theme`, `contextualIdentities`, `find`, `pkcs11`, `captivePortal`, `browserSettings`, `tabHide`…) ; `sidebar_action`, `theme_experiment`, `experiment_apis`, `protocol_handlers`, `user_scripts`, `developer` retirés ; `browser_style` retiré ; `_execute_browser_action`→`_execute_action` (MV3) ; MV2 : `background.scripts` et `background.page` conservés, `persistent: true` ; MV3 : `background.scripts` → `background.sw.js` (`importScripts`), CSP chaîne → `{ extension_pages }`, `web_accessible_resources` → `[{ resources, matches }]`, `permissions` hôtes → `host_permissions` ; polyfill `browser-polyfill.js` (et les stubs MV2) ajoutés en tête des scripts d'arrière-plan, des content scripts et des pages HTML (popup, options, overrides) ; icônes SVG converties en PNG si nécessaire.
3. Refus motivé (pas de chargement) si le manifest exige ce que Chromium n'a pas : `sidebar_action` seul moyen d'interaction (Tree Style Tab), API `experiment_apis`.
4. Quand l'auteur publie aussi une version Chrome (même nom sur le Chrome Web Store, proposé dans l'interface), l'installation Chrome est recommandée (Bitwarden, Dark Reader).
5. Journal : clés retirées, permissions retirées, API Firefox appelées à l'exécution (détectées par les stubs), avertissements Electron.

### Tests

- Unitaires (vitest) : convertisseur sur des manifests de fixture (uBO FF, Dark Reader FF, Bitwarden, Tree Style Tab → refus, Return YouTube Dislike MV2→MV3), lecture CRX3, parsing des réponses AMO, couche de stubs.
- Bout en bout (Playwright, réseau) : installer Dark Reader depuis le Chrome Web Store et depuis AMO (converti), vérifier `style.darkreader` sur une page ; charger uBO depuis la release GitHub, vérifier que le background démarre sans erreur et que le journal signale la redondance webRequest.

### Limites honnêtes (affichées dans `lyra://extensions`)

Pas de `declarativeNetRequest` (uBO Lite inopérant), pas de `commands` (raccourcis d'extension), `contextMenus.update`, `tabs.move/duplicate/captureVisibleTab/discard`, `sidePanel`/`sidebar_action`, messagerie native (`nativeMessaging`), `fontSettings`, `theme`, `contextualIdentities` ; pas d'extensions en fenêtre privée (limite d'electron-chrome-extensions) ; MV2 déprécié par Electron (risque de retrait dans une version future : Lyra reste sur Electron 44 tant que le MV2 des extensions clés en dépend, et pousse les auteurs vers MV3).

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

- Le découpage exact des fichiers, les noms des composants Preact, le schéma de `settings.json` et de l'état du ciel (versionnés, migrables), le format du paquet `.lyra`.
- Le choix SQLite vs JSON pour l'historique (Ruling au scaffold selon la disponibilité d'un binaire précompilé de `better-sqlite3` pour Electron 44 ; JSON append-only + index en mémoire sinon).
- L'implémentation de la file des notifications retenues (surcharge de `window.Notification` par le preload page ; les notifications de service worker sont hors v1 et simplement refusées en Ne pas déranger).
- Les lecteurs d'import : commencer par Chromium (Chrome, Edge, Brave, Vivaldi partagent `Bookmarks` JSON, `History` SQLite, `Preferences`), puis Firefox (`places.sqlite`), puis Safari/Orion (`Bookmarks.plist`, `History.db`) ; les mots de passe Chromium chiffrés par le trousseau sont hors v1 (export impossible sans la clé) — l'interface le dit.
- Les animations (glissement du ciel, palette), tant qu'elles restent sobres et désactivables (`prefers-reduced-motion`).
- Les textes anglais (i18n FR/EN par fichiers JSON, FR source).
- Les icônes de l'application (`build/icon.png` 1024 : lyre stylisée en constellation sur fond indigo).

### Réponses à la relecture « constructeur » (2026-10-19, tranchées par Claude)

1. **Jalons et priorités.** Jalon A — *noyau livrable* : fenêtre, ciel à gauche (constellations, étoiles, épinglées, dormance), capsule, palette ⌘ L, Boucliers avec blocage YouTube prouvé, `lyra://newtab`, réglages minimaux (moteur, thème, Boucliers), historique/favoris/téléchargements simples, paquets `.dmg` et `.exe`. Jalon B — extensions Chrome puis Firefox. Jalon C — positions du ciel, masqué, Ne pas déranger. Jalon D — réglages complets, règles par site, couleurs et thèmes. Jalon E — import/export. Les trois exigences de l'utilisateur (extensions, YouTube, Windows + macOS) sont les seules obligatoires pour une première version ; D et E peuvent glisser.
2. **Windows.** La CI exécute typecheck, tests unitaires, build, **e2e Playwright et packaging sur `windows-latest` comme sur `macos-latest`** dès le jalon A ; abstraction des chemins et raccourcis (Ctrl/⌘) dès le scaffold ; test manuel sur le PC Windows de l'utilisateur avant une release.
3. **Écrans de design.** Les `.dc.html` sont du HTML statique (styles inline + un bloc CSS) : porter fidèlement en Preact (couleurs, dimensions, libellés), sans exigence au pixel ni tests visuels en v1.
4. **Popups d'extension.** v1 : mécanisme natif d'electron-chrome-extensions (popup dans une `BrowserWindow` ancrée au bouton) ; l'overlay ne sert qu'à la palette et aux boîtes de Lyra. Rendu dans l'overlay = v2, après un spike.
5. **Périmètre Firefox.** Critère d'acceptation v1 : Dark Reader (xpi) fonctionnel, uBO (xpi) démarre et journalise la redondance, Return YouTube Dislike converti MV2→MV3 ; fixtures de refus : Tree Style Tab. Politique : installer avec avertissement quand des API manquent, refuser seulement quand le manifest exige l'inconvertible (§7.3).
6. **Boucliers et extensions.** Le filtrage ne s'applique qu'aux requêtes émises par des pages web : les requêtes dont l'initiateur ou l'URL est `chrome-extension://` (et le protocole CRX) sont ignorées par `onBeforeRequest`.
7. **Listes.** Téléchargement à l'exécution depuis les URL publiées (`ublockorigin.github.io/uAssets/filters/*.txt`, `easylist.to`), jamais une branche `master` ; listes embarquées rafraîchies par `scripts/update-shields-lists.mjs` (lancé à la main avant un `dist`, datées, commitées) ; le téléchargement au premier lancement est l'un des trois usages réseau autorisés par §2 et il est dit dans « Réseau et identité ».
8. **Mises à jour.** Aucune vérification de version de Lyra en v1 ; « À propos » affiche la version et un lien vers les releases. Les mises à jour d'extensions (6 h) et de listes sont désactivables dans « Réseau et identité ».
9. **Recherche.** Comme Orion : choix au premier lancement (DuckDuckGo présélectionné ; Kagi, Google, Brave Search, Startpage, Qwant) ; mots-clés d'origine `d`, `k`, `g`, `b`, `s`, `q`, `w` (Wikipédia fr), `yt`.
10. **Paquet `.lyra`.** Contient réglages, règles par site, ciel, favoris, historique, liste des extensions (sources et IDs, pas les binaires), thèmes ; cookies et sessions seulement si la case est cochée (décochée par défaut) ; **jamais de mots de passe** ; toujours chiffré (AES-256-GCM, clé dérivée par PBKDF2-SHA-256 ≥ 600 000 itérations, Web Crypto).
11. **Fenêtre privée.** `lyra://` est enregistré sur chaque session, privée comprise ; `lyra://newtab` en privé = variante sans constellations, sans sites fréquents, sans compteurs, bandeau « Fenêtre privée », thème Aurore.

## 10. Risques et parades

| Risque | Gravité | Parade |
|---|---|---|
| YouTube change ses défenses chaque semaine ; le blocage se dégrade sans listes fraîches | haute | rotation 4-8 h de `quick-fixes`, mise à jour au démarrage, bouton manuel, date visible ; test « 5 vidéos » rejouable ; listes embarquées pour le premier lancement |
| Scriptlets `trusted-*` ou nouveaux (`json-edit`, `trusted-edit-inbound-object`) non exécutés ou cassant les autres (bug Brave #679) | haute | exécuter chaque scriptlet dans son propre bloc avec `try/catch`, journaliser les échecs, test unitaire sur les scriptlets YouTube de la liste du jour |
| Notifications web : aucune API d'interception ; surcharge contournable ; push non couvert | moyenne | surcharge + permission refusée pendant DND ; documenter la limite ; v2 : CDP `Page.addScriptToEvaluateOnNewDocument` |
| MV2 déprécié dans Electron ; uBO dépend de stubs | moyenne | Boucliers intégrés rendent uBO facultatif ; stubs génériques testés ; suivre Electron 45+ avant de migrer |
| `session.webRequest` neutralise le webRequest des extensions | moyenne (assumé) | journal de compatibilité explicite, Boucliers comme bloqueur officiel |
| Dormance des étoiles : perte d'état (vidéo, formulaires) | moyenne | jamais endormir une étoile avec audio, formulaire modifié ou téléchargement ; délai réglable ; réveil par `navigationHistory.restore` |
| Overlay plein cadre : clics et focus | moyenne | overlay dimensionné au contenu quand c'est possible, fermeture au clic extérieur, Échap, retour du focus |
| Licence GPL-3.0 imposée par electron-chrome-extensions | basse (projet personnel) | Lyra en GPL-3.0 ; licence Patron si distribution fermée un jour |
| Paquets non signés : Gatekeeper, SmartScreen, pas de notifications macOS (Electron ≥ 42) | moyenne | README d'installation ; signature ad hoc valide ; vraie signature plus tard via CI (`CSC_LINK`) |
| `electron-context-menu` ESM + `electron-dl` en conflit avec Downloads | basse | menu contextuel maison sur l'événement `context-menu` (params fournis par Electron) |
| API expérimentales (`executeInMainWorld`, `isolatedEntries`) | basse | épinglage des versions, tests e2e qui cassent tôt |
| Import Safari/Orion : accès disque complet requis sur macOS | basse | message clair, import par fichier en repli |
