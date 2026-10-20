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

## Première ouverture

Au premier lancement, Lyra demande de choisir le moteur de recherche par défaut (Kagi, DuckDuckGo, Google, Brave Search, Startpage ou Qwant). Ce choix se change ensuite dans les réglages ; la barre de la palette (⌘ L / Ctrl L) l'utilise pour toute saisie qui n'est pas une adresse.

## Ce que fait le jalon A

- Ciel des onglets : chaque onglet est une étoile, reliées en constellations ; capsule d'adresse et palette de commandes.
- Boucliers : bloqueur de publicités et de traqueurs intégré (listes embarquées, mises à jour réseau avec repli), blocage des publicités vidéo YouTube, réglage par site.
- Nouvel onglet, historique, favoris, téléchargements et réglages généraux (thème, moteur).
- Sessions restaurées, onglets endormis (dormance), permissions, menu contextuel, recherche dans la page, zoom, plein écran, pages d'erreur.
- Paquets macOS (Apple Silicon) et Windows (x64), CI sur les deux systèmes.

## Ce que fait le jalon C

- Ciel repliable (rail de 14 px, révélé au survol) et placé à gauche, à droite, en haut ou en bas, déplaçable par glisser.
- Ne pas déranger (⌘ ⇧ D) : page plein cadre, notifications et popups retenues puis livrées à la sortie (Échap), exceptions par site (réglage par site au jalon D) ; la minuterie suit l'horloge après une mise en veille. Un Maj+clic sur un lien ouvre une étoile ordinaire.
- Fenêtre privée (⌘ ⇧ N) : session en mémoire, aucune trace (historique, favoris, réglages par site, passerelles).

## Ce que fait le jalon E

- Importation depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari et Orion : favoris (dossier « Importés de … », sans doublon), historique fusionné, onglets et groupes en constellations (étoiles endormies), moteurs et mots-clés, réglages transposables, extensions mises en file pour le jalon B. Les cookies ne sont pas importés (chiffrés par le système).
- La lecture des profils se fait dans un processus à part (`utilityProcess`), sur des copies temporaires : les dossiers des autres navigateurs ne sont jamais modifiés, et le navigateur source peut rester ouvert pour les favoris et l'historique.
- Contrat IPC `import:detecter`, `import:apercu`, `import:lancer`, `import:annuler` et évènements `import:progression` / `import:termine`, réservé à la page `lyra://settings` d'une fenêtre normale ; un seul import à la fois, abandon possible.
- Réglages › « Importer et exporter » : les sept navigateurs et « Un fichier » (favoris HTML au format Netscape, historique CSV, ciel JSON, réglages JSON, paquet `.lyra`), avec aperçu et résumé par élément.
- Exports : favoris (HTML), historique (CSV), ciel (JSON), réglages (JSON) et paquet `.lyra` complet (réglages, règles par site, thème, extensions en attente, favoris, ciels de toutes les fenêtres normales, historique), chiffré par une phrase de passe (8 caractères au moins, à confirmer) ; les cookies n'y entrent que sur demande explicite, jamais les mots de passe.
- Sauvegarde automatique nocturne du paquet dans un dossier au choix ; la phrase de passe est gardée dans le coffre du système, jamais sur le disque en clair.
- Limites de la v1 : les mots de passe enregistrés des navigateurs ne sont pas importés, ni leurs cookies (chiffrés par le système) ; les cookies de Lyra ne voyagent que dans un paquet qui les inclut volontairement.

Prévus ensuite : extensions Chrome et Firefox (jalon B), réglages complets et règles par site (D).

## Développement

```sh
npm install          # télécharge aussi le binaire d'Electron
npm run dev          # lance Lyra en mode développement
npm run typecheck && npm test && npm run e2e
npm run dist:mac     # paquet macOS dans release/
npm run dist:win     # installateur Windows (depuis macOS, sans Wine)
node scripts/icone.mjs   # régénère build/icon.png depuis build/icon.svg
LYRA_E2E_PAQUET=1 npx playwright test --grep @paquet   # teste l'app empaquetée (après dist)
```

Les tests e2e tournent en arrière-plan (fenêtres cachées, sans voler le focus) ; `LYRA_E2E_VISIBLE=1` rétablit l'affichage pour déboguer.

Variables utiles : `LYRA_E2E_RESEAU=1` active les tests réseau (`@reseau`), `LYRA_E2E_PAQUET=1` ceux de l'app empaquetée (`@paquet`).

## Licence

GPL-3.0 — voir `LICENSE`. Les fontes Manrope et Instrument Serif sont sous licence OFL (voir `src/renderer/fonts/`).
