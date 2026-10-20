# Lyra — état d'avancement

Dernière mise à jour : 2026-10-19 18:10 (arrêt du PC Windows à 18:30). **Jalon A et cycle 2 terminés** ; jalons C et E en cours en parallèle ; plans de B et D prêts.

## Le projet

Navigateur web type Orion (Kagi) pour Windows et macOS, en Electron/TypeScript. Exigences : extensions Chrome **et** Firefox ; blocage intégré des publicités YouTube. Spec : `docs/superpowers/specs/2026-10-19-lyra-design.md` ; design : `docs/design/`.

## Jalon A — fait

1. Amorçage : Electron 44, electron-vite, vitest, Playwright, packaging.
2. Types et réglages partagés (`Star`, `SkyState`, `Settings`) et IPC.
3. Vues web et protocole `lyra://`.
4. Calcul de la mise en page (`computeLayout`).
5. Ciel et capsule ; vues, sessions, IPC.
6. Palette de couleurs et thèmes.
7. Palette de commandes, moteurs de recherche, mots-clés.
8. Boucliers : moteur Ghostery, listes embarquées, cache, scriptlets tôt, blocage YouTube.
9. Panneau des Boucliers et réglage par site.
10. Historique et favoris.
11. Téléchargements.
12. Restauration de session et dormance.
13. Nouvel onglet, premier lancement, réglages généraux.
14. Permissions, menu contextuel, recherche, zoom, plein écran, pages d'erreur.
15. Icône (`build/icon.svg` → `icon.png`), paquets, test `@paquet`, CI, README.

Vérifié : typecheck OK, vitest 211 tests (30 fichiers), Playwright 44 tests ; `Lyra-0.1.0-arm64.dmg` (+ zip) et `Lyra Setup 0.1.0.exe` produits ; l'app du dmg démarre ; test `@paquet` (listes embarquées, moteur construit au premier lancement, pub bloquée) OK. Reste à confirmer à la main : YouTube sur l'app installée, et le verdict de la CI sur les deux systèmes après le push.

## Cycle 2 — passerelles pour les sites bloqués (fait, 2026-10-19, sur Windows)

Spec docs/superpowers/specs/2026-10-19-lyra-design-cycle2.md, plan docs/superpowers/plans/2026-10-19-lyra-passerelles-cycle2.md, design docs/design/project/Passerelles.dc.html. Les sites de la liste « contournés » passent toujours par une passerelle (proxy) testée, les autres restent en direct (ou par le proxy système). Sources : iplocate, proxifly, monosans (tirage équitable, test 204 strict, 5 meilleures, rotation) ; passerelle personnelle prioritaire (bouton Cloudflare WARP 127.0.0.1:40000) ; détection automatique ; https/wss seulement par les publiques (http/ws bloqués : PAC fermé + garde webRequest) ; jamais « Continuer » sur certificat d'un site contourné ; fenêtre privée sans trace. Interface : icône relais dans la pilule, bascule dans le menu ⋯, bouton sur la page d'erreur, page Réglages → Réseau et identité. Vérifié : typecheck, vitest 333, Playwright 48 (fenêtres cachées en test ; LYRA_E2E_VISIBLE=1 pour les voir), test réseau @reseau du routage réel. Points parqués : voir le ledger de fin de cycle (veille du proxy système après échec, délai de grâce après ajout explicite).

## Décisions de l'utilisateur (2026-10-19)

- **Tout dans la première version** : jalons B, C, D, E.
- **Aucune fenêtre visible pendant le travail** : tests et captures sous `LYRA_TEST=1`, fenêtres cachées. Jamais `LYRA_E2E_VISIBLE` ni `npm run dev`.
- Avancer **plusieurs jalons en parallèle**, chacun sur sa branche, pour finir plus vite. La répartition est dans `docs/superpowers/RELAIS.md`.

## Jalon C — sur `main` (plan `plans/2026-10-19-lyra-jalon-c.md`)

1. ✅ **Replier le ciel** (60487c0..d137f66) : rail de 14 px, révélation au survol, ⌘ \.
2. ✅ **Positions** droite, haut et bas (becc5e6, 6a8f19d), approuvées après 2 relectures :
   - largeur de 200 à 420 px ;
   - glisser l'en-tête vers un bord ;
   - commandes de palette ;
   - vignettes dans les réglages.
3. ✅ **Ne pas déranger** (6ffaddb, 966e128, 093e543), approuvé après 2 relectures (unit 402, e2e 69 et 8/8 Ne pas déranger) :
   - ⌘⇧D, croissant, palette ;
   - page en plein cadre et rappel en haut à droite ;
   - notifications retenues puis livrées, popups retenues ;
   - exception par site, gérée par le modèle, sans interface (celle-ci viendra avec le jalon D).
4. ✅ **Fenêtre privée** (4d6bab8, 698ffa0, 6bf2b4f), approuvée après 1 ronde de corrections, sur le Mac :
   - partition mémoire `privee-<id>` par fenêtre, équipée avant toute navigation (UA, lyra://, permissions sans mémorisation, téléchargements sans trace, Boucliers, passerelles sans écriture), effacée à la fermeture ;
   - jamais écrits : historique, session, favoris (bouton désactivé), zoom, permissions et Boucliers par site ;
   - thème Aurore (ciel `#2A1540`), nouvel onglet privé avec bandeau, ⌘⇧N et menu ⋯ ;
   - e2e `fenetre-privee.spec.ts`. Mineurs reportés : voir le ledger SDD du jalon C (relecture finale).
5. ✅ **Restes et finition** (11c1e5c..e59f27b), approuvés après 1 ronde : veille du proxy réarmée, `ajouter()` lève le délai de grâce, IPC passerelles d'écriture refusés en privé (`ajouter`, `basculerSite`, `retirer`), e2e passerelles et historique rendus déterministes (PAC attendu avant de recharger), Maj+clic = étoile ordinaire, raccourcis sans répétition automatique, iframes srcdoc couvertes, minuterie recalculée après une mise en veille, vue chrome limitée au rappel (largeur mesurée, ombre du design), e2e du ciel (Échap pendant le glisser, aperçu hors bornes, visée avec le rail).

**Jalon C terminé** (60487c0..12fa69e) : relecture finale de toute la branche puis une vague de corrections (12fa69e : Ne pas déranger ne lit plus les permissions du profil normal en privé, ⌘ \ sans état latent, aperçu de largeur libéré à la fermeture, ancienne largeur bornée, case « souvenir » masquée en privé, échec d'équipement privé = fenêtre fermée, PAC attendu 5 s au plus, nouvel onglet privé fermé par défaut). Vérifié : typecheck, vitest 416, Playwright 89/89 ; CI macOS et Windows (voir le dernier run de main).

Reste, à reprendre plus tard :
- téléchargements privés : aucun panneau ne les montre (pas même celui de la fenêtre privée) — liste en mémoire propre à la fenêtre avant une release ;
- palette d'une fenêtre privée : propose l'historique et les favoris du profil normal (lecture seule) — à trancher au jalon D ;
- exceptions de certificat globales (une exception accordée en privé vaut pour la session de l'application) ;
- iframe `about:blank` initiale sans preload (notifications non surchargées) ;
- ciel déjà révélé au survol au moment d'entrer en Ne pas déranger ;
- `historique.spec.ts:33` et `passerelles.spec.ts:88/131` corrigés sans reproduction locale : à surveiller en CI.

## Jalon E — branche `jalon-e` (worktree `../lyra.worktrees/jalon-e`, plan `plans/2026-10-19-lyra-jalon-e.md`)

1. ✅ **Détection et lecteurs Chromium** (875efc6..f71f28f) : Chrome, Edge, Brave et Vivaldi, avec `sql.js` (WASM) et une copie sécurisée. Approuvé après 2 relectures.
2. ✅ **Lecteurs Firefox, Safari et Orion** (fe0e482..4a7e7a2), faits par une autre session puis corrigés. Approuvé après 2 relectures. Ces lecteurs couvrent :
   - l'historique Safari et Orion, limité à 1 Gio ;
   - `bplist` : mémoïsation et budget mémoire ;
   - `mozlz4` : taille bornée et vecteurs LZ4.
3. ✅ **Application dans Lyra** (2428e26..9f62b61), en 5 sous-tâches relues une à une, sur le Mac : branchements de détection (Firefox, Safari, Orion) et mineurs des tâches 1-2 ; ajouts aux magasins (`Bookmarks.ajouterLot`, `History.importer`, `TabTree.creerConstellation`, `TabManager.ouvrirEndormie`, `PALETTE_CONSTELLATIONS`, `Settings.moteursPerso`, `Settings.import`) ; `appliquer.ts` + `moteurs.ts` (dédoublonnage, constellations par couleur OKLab, arbitrage des mots-clés) ; lecteur dans un `utilityProcess` avec contre-pression (2 lots en vol) ; IPC `import:*` (lyra://settings seulement, jamais en privé), historique lu en dernier pour éviter l'interblocage.
4. ✅ **Exporter et paquet `.lyra`** (7514392..7072421) : favoris HTML Netscape, historique CSV (formules neutralisées), ciel et réglages JSON, import de ces fichiers ; paquet chiffré (AES-256-GCM, PBKDF2-SHA-256 600 000) sans mot de passe, cookies seulement de `persist:lyra` et sur demande ; sauvegarde nocturne (clé protégée par `safeStorage`, 7 gardées) ; analyseurs linéaires face aux fichiers hostiles.
5. ✅ **Interface et e2e** (b62f118, 691e52b) : page « Importer et exporter » d'après `Importation.dc.html` (libellés qui promettraient ce que la v1 ne fait pas ajustés : voir le ledger).

**Jalon E terminé** (relecture finale de toute la branche puis une vague de corrections 9ef20c5..63cc955 : filtre des secrets qui retirait `reseau.passerelles`, paquet avec toutes les fenêtres normales, confirmation de la phrase de passe, un seul `enTest()` = `LYRA_TEST` ET application non empaquetée pour toutes les capacités de test, README). Vérifié : typecheck, vitest 891+, Playwright 100/100, `dist:mac` et `@paquet` 2/2 (asar : lecteur, `sql-wasm.wasm`, `fflate`).

Reste, à reprendre :
- avant une release : un import réel dans l'application installée (l'application empaquetée ignore les profils de test) ; chien de garde du lecteur (aucun message pendant N minutes → arrêt) ; case « cookies » du paquet dans l'interface ;
- à la fusion avec le jalon B : `patchPage` doit aussi retirer `import`, le paquet doit lister `extensions.installees` en plus de la file, renommer l'un des deux `EntreeImport`, régénérer `package-lock.json` (B ajoute `fflate` 0.8.3, E 0.8.2 : garder 0.8.3) ;
- options d'import non proposées dans l'interface : une fenêtre par fenêtre importée, « faire de X le moteur par défaut », extensions imposées ;
- mineurs détaillés dans le ledger SDD du jalon E (copie : `docs/superpowers/ledgers/jalon-e.md`).

## Jalons B et D — plans prêts, rédigés par une session d'appoint

- **B — extensions Chrome et Firefox** : branche `jalon-b` (67dde31), `plans/2026-10-19-lyra-jalon-b.md`, 6 tâches. À relire, puis lancer.
- **D — réglages complets, règles par site, couleurs** : branche `jalon-d` (94be3a2), `plans/2026-10-19-lyra-jalon-d.md`, 6 tâches. À relire, puis lancer après C, car il dépend des réglages de C.

## Fin

1. Fusionner `jalon-e`, `jalon-b` et `jalon-d` dans `main`.
2. Faire la relecture finale de la v1 (Opus).
3. Obtenir une CI verte sur macOS et Windows.
4. Produire les paquets `.dmg` et `.exe`.
5. Vérifier YouTube à la main sur l'app installée.

Ensuite viendront la signature (certificat payant) et la release automatique sur tag.

## Reprendre

Dans Claude Code : « reprends Lyra ».

1. `git pull` sur `main`.
2. Lire ce fichier et `docs/superpowers/RELAIS.md`.
3. Pour une branche : `git fetch && git worktree add ../lyra.worktrees/jalon-x jalon-x`.

Les ledgers détaillés (`.superpowers/sdd/<jalon>/`, ignorés par git) n'existent que sur le PC Windows. Sur le Mac, ce fichier suffit.

Méthode : skills superpowers (subagent-driven-development), avec une relecture par tâche. Sonnet par défaut, Opus pour la relecture finale. Sur la machine Windows, la mémoire est basse : lancer vitest avec `--no-file-parallelism` et un seul e2e à la fois.
