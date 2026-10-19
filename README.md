# Lyra

Navigateur web de bureau pour **Windows et macOS**, dans l'esprit d'Orion (Kagi) : sobre, sans télémétrie, bloqueur de publicités et de traqueurs intégré (YouTube compris), et compatible avec les **extensions Chrome et Firefox**.

Construit avec Electron et TypeScript. Projet en cours de conception — voir `docs/superpowers/ETAT.md` pour l'avancement et `docs/superpowers/specs/` pour la conception.

## Installation

Les paquets (`.dmg` / `.zip` pour macOS Apple Silicon, installateur `.exe` pour Windows) sont produits par la CI. Ils ne sont pas encore signés avec un certificat payant : le système demande donc une confirmation au premier lancement.

### macOS (Gatekeeper)

1. Ouvrir le `.dmg` et glisser Lyra dans Applications.
2. Au premier lancement, faire **clic droit sur Lyra → Ouvrir**, puis confirmer.
3. Si macOS refuse toujours l'ouverture, retirer l'attribut de quarantaine :

   ```sh
   xattr -cr /Applications/Lyra.app
   ```

### Windows (SmartScreen)

Au lancement de l'installateur, si SmartScreen affiche « Windows a protégé votre ordinateur », cliquer sur **Informations complémentaires** puis **Exécuter quand même**.

## Développement

```sh
npm install          # télécharge aussi le binaire d'Electron
npm run dev          # lance Lyra en mode développement
npm run typecheck && npm test && npm run e2e
npm run dist:mac     # paquet macOS dans release/
```

## Licence

GPL-3.0 — voir `LICENSE`. Les fontes Manrope et Instrument Serif sont sous licence OFL (voir `src/renderer/fonts/`).
