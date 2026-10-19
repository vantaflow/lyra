# Lyra — état d'avancement

Dernière mise à jour : 2026-10-19 18:00 (arrêt du PC Windows à 18:30). **Jalon A et cycle 2 terminés** ; jalons C et E en cours en parallèle ; plans de B et D prêts.

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
3. 🟡 **Ne pas déranger** (6ffaddb, 966e128) : implémenté, unit 396, e2e 69. Relecture lancée à 17:56. Son verdict est dans `.superpowers/sdd/jalon-c/task-3-review.md` sur le PC Windows ; si elle n'est pas finie, la relancer.
4. ⬜ **Fenêtre privée** : partition propre `privee-<id>`, thème Aurore, nouvel onglet privé.
5. ⬜ **Restes et finition** :
   - cycle 2 : veille du proxy système après échec, `ajouter()` qui lève le délai de grâce, IPC passerelles refusés depuis une fenêtre privée, `historique.spec.ts:33` ;
   - Échap pendant le glisser depuis le ciel révélé ;
   - e2e de l'invite plus strict, et `ciel:apercu` testé hors bornes ;
   - `viser()` avec le rail de 14 px ;
   - tests réseau instables `passerelles.spec.ts:88/131`.

## Jalon E — branche `jalon-e` (worktree `../lyra.worktrees/jalon-e`, plan `plans/2026-10-19-lyra-jalon-e.md`)

1. ✅ **Détection et lecteurs Chromium** (875efc6..f71f28f) : Chrome, Edge, Brave et Vivaldi, avec `sql.js` (WASM) et une copie sécurisée. Approuvé après 2 relectures.
2. 🟡 **Lecteurs Firefox, Safari et Orion** (fe0e482..a633fb7), faits par une autre session. La relecture a demandé 3 corrections :
   - historique Safari et Orion plafonné à 64 Mo au lieu de 1 Gio ;
   - `bplist` : mémoire à mémoïser ;
   - `mozlz4` : vecteurs de test.

   Ronde de corrections lancée à 17:54, commit attendu sur `jalon-e`. À relire à la reprise.
3. ⬜ **Application dans Lyra**. Lecture dans un `utilityProcess` ; brancher `detecterProfilsFirefox/Safari/Orion` et `racineFirefoxParDefaut` dans `detection.ts` ; ajouter `firefox` aux compteurs d'extensions. Correspondance entre les moteurs intégrés de Firefox et ceux de Lyra (`lireMoteurParDefautFirefox`). Les mineurs reportés sont dans le ledger.
4. ⬜ **Exporter** et paquet `.lyra`.
5. ⬜ **Interface et e2e**. Ne pas promettre « Chrome peut rester ouvert » pour les onglets : le fichier de session est verrouillé sous Windows.

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
