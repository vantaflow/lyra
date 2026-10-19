# Design Lyra (Claude Design)

Canevas : https://claude.ai/artifact/US6xYeYjRNejcSueqTdanQ (privé). Source de chaque écran dans `project/` (`canvas.json` = index, un `.dc.html` par écran).

Direction retenue le 2026-10-19 (après rejet d'une première version « comme tous les navigateurs ») :
- **Le ciel** : colonne des onglets, chaque onglet est une étoile, reliée par une ligne à l'onglet qui l'a ouvert (constellation) ; groupes nommés ; étoiles ternies = onglets dormants ; étoiles épinglées. Pas de barre d'onglets ni de barre d'adresse : la **palette ⌘ L** fait les deux ; une **capsule** fine au-dessus de la page (précédent, suivant, adresse, favoris, menu).
- Le ciel se place à **gauche, droite, en haut, en bas** (bande), ou se **masque** (rail + poignée, révélé au survol). Aucun espace autour de la page.
- **Ne pas déranger** (⌘ ⇧ D) : seulement la page ; notifications et popups retenus et comptés ; croissant discret.
- **Réglages** : 19 sections, recherche, export/import ; règles par site (boucliers, cookies, scripts, extensions autorisées, zoom, style/script perso, exceptions) ; **couleurs et thèmes** (chaque couleur, clair/sombre, teinte du site, programmation) ; **importer** depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari, Orion et **exporter** (favoris, historique, ciel, réglages, paquet .lyra).
- **Extensions** : Chrome et Firefox côte à côte, journal de compatibilité honnête par extension.

Écrans : Main, NouvelOnglet, CielDroite, CielHaut, CielBas, CielMasque, NePasDeranger, Parametres, ParametresSites, Importation, Couleurs, Extensions. Restent à dessiner : Panneaux (palette, boucliers, téléchargements, menu), Composants.
