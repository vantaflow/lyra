# Lyra — état d'avancement

Dernière mise à jour : 2026-10-19 (run autopilot **en pause** à la demande de l'utilisateur, phase conception).

## Le projet

Navigateur web type Orion (Kagi) pour Windows et macOS, en Electron/TypeScript. Exigences : extensions Chrome **et** Firefox ; blocage intégré des publicités YouTube comme Brave. Spec : `docs/superpowers/specs/2026-10-19-lyra-design.md`.

## Fait

- Amorçage du dépôt (branche `main`), état autopilot dans `.autopilot/` (local, non versionné).
- Spec brouillon : sections 1-4 (intention, objectifs, contraintes, produit), 6 (bloqueur et YouTube), 8 (build, tests, packaging).
- Spike packaging (vérifié) : Electron 44.9.0, electron-vite 6, electron-builder 26.15.3 ; `.dmg` arm64 et `.exe` NSIS x64 construits depuis le Mac **sans Wine** ; Playwright `_electron` et vitest OK.
- Spike bloqueur (vérifié sur youtube.com) : moteur Ghostery 2.20.1 retenu, adblock-rs écarté ; l'injection standard laisse passer les pubs vidéo (5/5), le correctif « scriptlets tôt » en preload donne 0/5. Code de référence : `docs/superpowers/spikes/adblock/`.
- Recherche technique : 2 sujets sur 8 terminés (`electron-chrome-extensions`, `adblock-engines`) dans `docs/superpowers/research/`.

## Reste à faire (conception)

1. Spike extensions : Chrome (uBlock Origin) + Firefox converties (xpi → manifest + polyfill `browser.*`) — interrompu avant résultat.
2. Recherche : 6 sujets restants (Electron extensions natif, YouTube 2026, extensions Firefox, build, architecture UI, Orion) + synthèse.
3. Spec : sections 5 (architecture), 7 (extensions), 9 (laissé au constructeur), 10 (risques) ; relecture par un constructeur (builder-check).
4. Plan en tâches (`writing-plans`), puis exécution tâche par tâche avec tests.

## Reprendre

Dans Claude Code, depuis ce dossier : « reprends Lyra ». La skill `autopilot` lit `.autopilot/RESUME.md` et le ledger (`.autopilot/LEDGER.md`, dernière ligne `PAUSE`). Sur une autre machine (sans `.autopilot/`), repartir de ce fichier et de la spec.
