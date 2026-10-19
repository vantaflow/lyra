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

## Reste à faire

- **Jalon C** (en premier : **« Replier le ciel »**) : positions du ciel (haut, droite, bas), ciel masqué, Ne pas déranger, fenêtre privée avec son interface.
- **Jalon B** : extensions Chrome et Firefox (uBlock Origin en cible), spike interrompu.
- **Jalon D** : réglages complets, règles par site, couleurs.
- **Jalon E** : import/export depuis 7 navigateurs.
- Signature (certificat payant) et release automatique sur tag.

## Reprendre

Dans Claude Code, depuis ce dossier : « reprends Lyra ». Sans `.autopilot/`, repartir de ce fichier et de la spec.
