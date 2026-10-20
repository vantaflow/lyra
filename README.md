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

## Extensions (jalon B)

La page `lyra://extensions` (menu ⋯, palette ou « Gérer » dans le panneau du pied du ciel) installe et gère les extensions.

- **Sources** : Chrome Web Store (identifiant ou adresse), addons.mozilla.org (nom, slug, identifiant ou adresse ; l'extension Firefox est convertie en extension Chromium, avec un rapport de conversion), fichiers `.crx`, `.zip`, `.xpi` ou dossier d'extension en développement. uBlock Origin vient de ses releases GitHub. Ce sont les seules destinations réseau ; la somme sha256 d'AMO est vérifiée avant extraction, les archives sont extraites sans traversée de chemin et avec une taille bornée.
- **Mises à jour** : au démarrage puis toutes les 6 h (réglage « Mettre à jour les extensions automatiquement » dans Réglages → Réseau et identité), ou à la demande avec « Tout mettre à jour ».
- **Import** : les extensions repérées dans un autre navigateur se réinstallent en série (Chrome Web Store, AMO) ; celles d'Edge ou d'origine inconnue sont listées « à installer à la main », et une extension imposée par une règle d'entreprise n'est installée que sur confirmation. La file est `settings.import.extensionsEnAttente` (alimentée par l'import d'E et par la restauration d'un paquet `.lyra`) ; `lyra://extensions` l'affiche avec « Tout réinstaller », et personne d'autre que le processus principal ne peut l'écrire (ni une page, ni un fichier de réglages importé).
- **Les Boucliers restent prioritaires** : Lyra garde son propre filtrage réseau. Une extension bloqueuse (uBlock Origin…) s'ajoute aux Boucliers sans les remplacer ; son blocage réseau est inopérant et son journal de compatibilité le dit.
- **Limites** : pas de `declarativeNetRequest` (uBlock Origin Lite inopérant), de `commands`, de `sidePanel`/`sidebar_action`, de messagerie native ; les extensions ne s'exécutent pas en fenêtre privée ; la règle par site est enregistrée mais n'est pas appliquée aux scripts déjà déclarés par le manifest ; les permissions optionnelles demandées par une extension sont refusées ; le Manifest V2 est déprécié par Electron (Lyra reste sur Electron 44 tant que les extensions clés en dépendent). La page `lyra://extensions` détaille ces limites.
- **Licence** : la prise en charge des extensions repose sur `electron-chrome-extensions`, sous licence GPL-3.0, comme Lyra.

## Ce que fait le jalon E

- Importation depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari et Orion : favoris (dossier « Importés de … », sans doublon), historique fusionné, onglets et groupes en constellations (étoiles endormies), moteurs et mots-clés, réglages transposables, extensions mises en file pour le jalon B. Les cookies ne sont pas importés (chiffrés par le système).
- La lecture des profils se fait dans un processus à part (`utilityProcess`), sur des copies temporaires : les dossiers des autres navigateurs ne sont jamais modifiés, et le navigateur source peut rester ouvert pour les favoris et l'historique.
- Contrat IPC `import:detecter`, `import:apercu`, `import:lancer`, `import:annuler` et évènements `import:progression` / `import:termine`, réservé à la page `lyra://settings` d'une fenêtre normale ; un seul import à la fois, abandon possible.
- Réglages › « Importer et exporter » : les sept navigateurs et « Un fichier » (favoris HTML au format Netscape, historique CSV, ciel JSON, réglages JSON, paquet `.lyra`), avec aperçu et résumé par élément.
- Exports : favoris (HTML), historique (CSV), ciel (JSON), réglages (JSON) et paquet `.lyra` complet (réglages, règles par site, thème, extensions en attente et extensions installées (liste seulement : identifiant, nom, magasin, version ; celles du catalogue repartent dans la file d'import à la restauration, les locales sont signalées non réinstallables), favoris, ciels de toutes les fenêtres normales, historique), chiffré par une phrase de passe (8 caractères au moins, à confirmer) ; les cookies n'y entrent que sur demande explicite, jamais les mots de passe.
- Sauvegarde automatique nocturne du paquet dans un dossier au choix ; la phrase de passe est gardée dans le coffre du système, jamais sur le disque en clair.
- Limites de la v1 : les mots de passe enregistrés des navigateurs ne sont pas importés, ni leurs cookies (chiffrés par le système) ; les cookies de Lyra ne voyagent que dans un paquet qui les inclut volontairement.

Prévus ensuite : réglages complets et règles par site (D).

## Versions

- **1.0.1** : ciel masqué, « Épingler le ciel » s'atteint sans que le ciel révélé se retire (plus aucune zone de déplacement de la fenêtre sous lui, retrait seulement quand la souris part vers la page, délai de 500 ms) ; Windows, le rappel Ne pas déranger se tient à l'écart des boutons de la fenêtre.

## Développement

```sh
npm install          # télécharge aussi le binaire d'Electron
npm run dev          # lance Lyra en mode développement
npm run typecheck && npm test && npm run e2e
npm run dist:mac     # paquet macOS dans release/
npm run dist:win     # installateur Windows (depuis macOS, sans Wine)
node scripts/icone.mjs   # régénère build/icon.png, build/icon.ico (16 à 256 px) et le favicon des pages lyra:// depuis build/icon.svg et build/icon-small.svg
LYRA_E2E_PAQUET=1 npx playwright test --grep @paquet   # teste l'app empaquetée (après dist)
```

Les tests e2e tournent en arrière-plan (fenêtres cachées, sans voler le focus) ; `LYRA_E2E_VISIBLE=1` rétablit l'affichage pour déboguer.

Variables utiles : `LYRA_E2E_RESEAU=1` active les tests réseau (`@reseau`), `LYRA_E2E_PAQUET=1` ceux de l'app empaquetée (`@paquet`).

## Licence

GPL-3.0 — voir `LICENSE`. `electron-chrome-extensions` (GPL-3.0) est une dépendance. Les fontes Manrope et Instrument Serif sont sous licence OFL (voir `src/renderer/fonts/`).

Listes de filtrage embarquées par les Boucliers (`resources/shields/`, chaque fichier garde l'en-tête de licence de ses auteurs) :

- uBlock Origin — filtres uAssets (dont « Cookie Notices » et « Other Annoyances » pour l'option « Masquer aussi les gênes ») et scriptlets : GPL-3.0, © Raymond Hill et contributeurs (https://github.com/uBlockOrigin/uAssets) ;
- EasyList et EasyPrivacy : GPL-3.0 ou CC BY-SA 3.0, au choix, © The EasyList authors (https://easylist.to/) ;
- Easylist Cookie List : CC BY 3.0, © Fanboy et The EasyList authors (https://secure.fanboy.co.nz/) ;
- liste de serveurs publicitaires de Peter Lowe (https://pgl.yoyo.org/adservers/), selon ses conditions d'utilisation.

Le moteur de filtrage `@ghostery/adblocker` est sous licence MPL-2.0.
