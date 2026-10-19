# Lyra — état d'avancement

Dernière mise à jour : 2026-10-19. **Jalon A terminé** (15 tâches).

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

## Reste à faire

- **Jalon C** (en premier : **« Replier le ciel »**) : positions du ciel (haut, droite, bas), ciel masqué, Ne pas déranger, fenêtre privée avec son interface.
- **Jalon B** : extensions Chrome et Firefox (uBlock Origin en cible), spike interrompu.
- **Jalon D** : réglages complets, règles par site, couleurs.
- **Jalon E** : import/export depuis 7 navigateurs.
- Signature (certificat payant) et release automatique sur tag.

## Reprendre

Dans Claude Code, depuis ce dossier : « reprends Lyra ». Sans `.autopilot/`, repartir de ce fichier et de la spec.
