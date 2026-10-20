# Lyra — travail à plusieurs sessions

Mis à jour : 2026-10-20 (Mac). Deux sessions seulement : la session d'aide c72a5410 (« orion_help ») et la session Mac projects-3c. Plusieurs sessions Claude Code avancent en même temps, chacune sur **sa** branche. Lire d'abord `docs/superpowers/ETAT.md`, la spec `docs/superpowers/specs/2026-10-19-lyra-design.md` et `docs/design/README.md`.

## Qui fait quoi

| Jalon | Branche | Session | État |
|---|---|---|---|
| C — ciel déplaçable, Ne pas déranger, fenêtre privée | `main` | session d'aide c72a5410 (Mac) | **terminé** (12fa69e), relecture finale passée ; B et D peuvent repartir de `main` |
| E — import/export | `jalon-e` (worktree `lyra.worktrees/jalon-e`) | session d'aide c72a5410, en cours | tâches 1-2 faites et approuvées, plan détaillé de la 3 prêt, 3-5 à faire |
| E tâche 2 — lecteurs Firefox, Safari, Orion | `jalon-e-t2` → fusionnée dans `jalon-e` | session downloads-60 | faite et approuvée (branche `jalon-e-t2` close) |
| **B — extensions Chrome + Firefox** | **`jalon-b`** (worktree `lyra.worktrees/jalon-b`) | **session Mac projects-3c** | en cours |
| D — réglages complets, règles par site, couleurs | `jalon-d` (plan 94be3a2) | session Mac projects-3c, après B et la fusion de C | plan prêt |

## Consignes pour la session d'appoint (jalon B)

1. Partir de la branche existante : `git fetch && git switch jalon-b` (ou un worktree `lyra.worktrees/jalon-b`), puis `git merge origin/main` pour récupérer le dernier état. Ne jamais committer sur `main` ni sur `jalon-e` ; la session principale fusionne `jalon-b` dans `main` à la fin (relecture finale incluse).
2. Méthode : skills superpowers — le plan `docs/superpowers/plans/2026-10-19-lyra-jalon-b.md` (6 tâches) existe sur `jalon-b` ; le relire contre la spec **§7 Extensions** et §9, le spike `docs/superpowers/spikes/extensions/` et la recherche `docs/superpowers/research/`, puis subagent-driven-development (implémenteur Sonnet, relecture par tâche, rondes de corrections).
3. Périmètre (spec §7) : `electron-chrome-extensions` (GPL-3.0, déjà retenu), installation depuis le Chrome Web Store, stubs MV2 nécessaires, convertisseur `.xpi` → extension Chromium avec le polyfill `browser.*`, journal de compatibilité, page `lyra://extensions` **conforme à `docs/design/project/Extensions.dc.html`**, icônes d'extensions dans la capsule, uBlock Origin en cible de test. Le filtrage des Boucliers ignore `chrome-extension://` (déjà décidé). Le jalon E mettra en file des IDs d'extensions à réinstaller (`import.extensionsEnAttente`, format `{ id, nom, magasin: 'chrome'|'edge'|'firefox'|'inconnu' }`) : prévoir une fonction d'installation par ID réutilisable.
4. **Aucune fenêtre visible** (consigne impérative de l'utilisateur) : tests e2e et captures uniquement via la config Playwright (`LYRA_TEST=1` → fenêtres cachées, `src/main/modeTest.ts`) ; jamais `LYRA_E2E_VISIBLE`, jamais `npm run dev`, jamais l'app empaquetée lancée à l'écran. Toute nouvelle fenêtre ou vue (popup d'extension, page d'options) passe par `optionsFenetreCachee()` / `prefsPageCachee()` sous `LYRA_TEST`.
5. **Respect strict du design** : valeurs, libellés, icônes copiés des `.dc.html`.
6. Commits en français, chaque message se termine par la ligne `Claude-Session:` de la session qui commite ; **pousser `jalon-b` après chaque commit**. Tenir l'avancement dans `docs/superpowers/etat-jalon-b.md` (pas dans `ETAT.md`, tenu par la session principale, pour éviter les conflits).
7. Sur la machine Windows : mémoire basse → vitest avec `--no-file-parallelism`, un seul e2e à la fois, relancer un spec seul s'il plante « out of memory ». Ne jamais lire les vrais profils/navigateurs de l'utilisateur. La machine Windows s'éteint vers 18:30 le 2026-10-19 : committer et pousser avant.
8. Fichiers partagés susceptibles de conflit avec C/E : `src/main/index.ts`, `src/renderer/ui/Capsule.tsx`, `src/shared/ipc.ts`, `src/main/settings/{defaults,validate}.ts`, `package.json`. Y faire des ajouts localisés (nouveaux modules importés), pas de refonte.
