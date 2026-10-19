# État du jalon B — extensions Chrome et Firefox

Plan : `docs/superpowers/plans/2026-10-19-lyra-jalon-b.md` (6 tâches). Branche `jalon-b`.

## Fait
- **Tâche 1 — noyau de chargement et registre** : `src/main/extensions/{Extensions,registre,chargeur,ipc,fixturesTest}.ts`.
  - Registre `settings.extensions = { installees, majAuto, derniereVerification? }`, validation stricte (`validate.ts`), défauts (`defaults.ts`).
  - Chargement au démarrage avant la première fenêtre (`loadExtension(dossier, { allowFileAccess: false })`), activation à chaud, désinstallation.
  - `electron-chrome-extensions@4.9.0` branché sur `TabManager` (`addTab` / `removeTab` / `selectTab`, étoiles web des fenêtres normales seulement) et `WindowManager` (`createWindow`).
  - Boucliers : `chrome-extension://` et `crx://` ignorés. IPC `extensions:lister/activer/desinstaller`.
  - Tests : `registre.test.ts`, `chargeur.test.ts`, `Extensions.test.ts`, e2e `tests/e2e/extensions.spec.ts` (page servie en http local : sans accès aux fichiers, une extension n'agit pas sur `file://`).

## Suite
- Tâche 2 : installation Chrome (Web Store, `.crx`, `.zip`, dossier) et mises à jour.
- Tâches 3 à 6 : Firefox (convertisseur), compatibilité MV2 et journal, page `lyra://extensions`, file d'import et finition.

## Points à connaître
- `requestPermissions` (permissions optionnelles) refuse tout tant que la page `lyra://extensions` n'existe pas (tâche 5).
- Popups d'action et pages d'options : tâche 5 (fenêtres cachées sous `LYRA_TEST`).
- Test `ne-pas-deranger.spec.ts` « noopener … about:blank » : échoue aussi sur la base `0c9abee` (non lié à ce jalon).
