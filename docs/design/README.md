# Design Lyra (Claude Design)

Canevas : https://claude.ai/artifact/US6xYeYjRNejcSueqTdanQ (privé). Source de chaque écran dans `project/` (`canvas.json` = index, un `.dc.html` par écran).

Direction retenue le 2026-10-19 (après rejet d'une première version « comme tous les navigateurs ») :
- **Le ciel** : colonne des onglets, chaque onglet est une étoile, reliée par une ligne à l'onglet qui l'a ouvert (constellation) ; groupes nommés ; étoiles ternies = onglets dormants ; étoiles épinglées. Pas de barre d'onglets ni de barre d'adresse : la **palette ⌘ L** fait les deux ; une **capsule** fine au-dessus de la page (précédent, suivant, adresse, favoris, menu).
- Le ciel se place à **gauche, droite, en haut, en bas** (bande), ou se **masque** (rail + poignée, révélé au survol). Aucun espace autour de la page.
- **Ne pas déranger** (⌘ ⇧ D) : seulement la page ; notifications et popups retenus et comptés ; croissant discret.
- **Réglages** : 19 sections, recherche, export/import ; règles par site (boucliers, cookies, scripts, extensions autorisées, zoom, style/script perso, exceptions) ; **couleurs et thèmes** (chaque couleur, clair/sombre, teinte du site, programmation) ; **importer** depuis Chrome, Edge, Brave, Vivaldi, Firefox, Safari, Orion et **exporter** (favoris, historique, ciel, réglages, paquet .lyra).
- **Extensions** : Chrome et Firefox côte à côte, journal de compatibilité honnête par extension.

Écrans : Main, NouvelOnglet, CielDroite, CielHaut, CielBas, CielMasque, NePasDeranger, Parametres, ParametresSites, Importation, Couleurs, Extensions. Restent à dessiner : Panneaux (palette, boucliers, téléchargements, menu), Composants.

## Thèmes : valeurs dérivées (`src/shared/themes.ts`, `src/shared/contraste.ts`)

Le design ne fixe en entier que **Indigo nuit** (13 éléments × clair/sombre, copiés tels quels). Pour les six autres thèmes prêts, les aperçus de `Couleurs.dc.html` donnent le ciel, le fond de page et le texte ; tout le reste est dérivé par mélange (`melanger(a, b, part)`, part de `b`) :

| Élément | Clair | Sombre |
|---|---|---|
| Ciel — fond | aperçu du design | ciel × 0,65 (noir 35 %), ciel clair × 0,2 ; Nuit complète : tel quel |
| Ciel — texte | ciel + 80 % blanc (ciel clair : + 80 % noir) | idem sur le ciel sombre |
| Étoile active | `#F4C56A` (ciel clair : `#8A5A10`, ambre de `Composants.dc.html`) | idem |
| Étoile active — fond | ciel + 15 % texte du ciel | idem |
| Étoiles | ciel + 60 % blanc (ciel clair : noir) | idem |
| Étoiles endormies / Lignes | ciel + 30 % / 20 % texte du ciel | idem |
| Capsule — fond | fond de page de l'aperçu | ciel sombre + 4 % blanc |
| Capsule — texte | texte de l'aperçu (`#1C1C2E`, Sable `#3A2E1E`, Nuit complète `#E6E6EA`) | capsule fond + 90 % blanc (Nuit complète : `#E6E6EA`) |
| Accent / Boucliers | `#5452C8` / `#1E7F6C` | `#8B8AF0` / `#5FD3B3` |
| Pages de Lyra — fond | aperçu du design | `#121214` |
| Nouvel onglet — ciel | ciel × 0,8 | ciel sombre × 0,65 |

Un ciel est **clair** (Sable, Clair total) quand sa luminance relative dépasse 0,4 : texte du ciel, étoiles et lignes passent alors en teintes foncées (le `#C9C9EA` d'Indigo ne tient pas 4,5:1 sur `#E9DEC8`), et le ciel sombre correspondant est le ciel × 0,2. **Nuit complète** n'a qu'un jeu de valeurs (clair = sombre).

Chaque thème dérivé passe ensuite par `corrigerPalette` : tout texte des six paires sous 4,5:1 est éclairci ou assombri (teinte conservée) jusqu'au seuil. Palettes obtenues (clair / sombre, ordre du design) :

| Thème | Ciel fond | Ciel texte | Étoile active | Active fond | Étoiles | Endormies | Lignes | Capsule fond | Capsule texte | Accent | Boucliers | Pages fond | Nouvel onglet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Encre | #0B0B12/#07070C | #CECED0/#CDCDCE | #F4C56A/#F4C56A | #28282F/#252529 | #9D9DA0/#9C9C9E | #46464B/#424246 | #323238/#2F2F33 | #FFFFFF/#111116 | #1C1C2E/#E7E7E8 | #5452C8/#8B8AF0 | #2C8775/#5FD3B3 | #FFFFFF/#121214 | #09090E/#050508 |
| Forêt | #12261F/#0C1914 | #D0D4D2/#CED1D0 | #F4C56A/#F4C56A | #2F403A/#293530 | #A0A8A5/#9EA3A1 | #4B5A55/#46504C | #384943/#333E3A | #FFFFFF/#16221D | #1C1C2E/#E8E9E8 | #5452C8/#8B8AF0 | #479686/#5FD3B3 | #FFFFFF/#121214 | #0E1E19/#08100D |
| Sable | #E9DEC8/#2F2C28 | #2F2C28/#D5D5D4 | #70490D/#F4C56A | #CDC3B0/#484542 | #5D5950/#ACABA9 | #B1A998/#615F5C | #C4BAA8/#504E4A | #FBF7F0/#373431 | #3A2E1E/#EBEBEA | #5452C8/#8B8AF0 | #1A6E5E/#5FD3B3 | #FBF7F0/#121214 | #BAB2A0/#1F1D1A |
| Aurore | #2A1540/#1B0E2A | #D4D0D9/#D1CFD4 | #F4C56A/#F4C56A | #443157/#362B44 | #AAA1B3/#A49FAA | #5D4D6E/#52485D | #4C3A5F/#3F354C | #FFFFFF/#241833 | #1C1C2E/#E9E8EB | #5452C8/#8B8AF0 | #449585/#5FD3B3 | #FFFFFF/#121214 | #221133/#12091B |
| Clair total | #ECECF3/#2F2F31 | #2F2F31/#D5D5D6 | #7B500E/#F4C56A | #D0D0D6/#48484A | #5E5E61/#ACACAD | #B3B3B9/#616163 | #C6C6CC/#505052 | #FFFFFF/#373739 | #1C1C2E/#EBEBEB | #5452C8/#8B8AF0 | #1C7766/#5FD3B3 | #FFFFFF/#121214 | #BDBDC2/#1F1F20 |
| Nuit complète | #0E0E1E | #CFCFD2 | #F4C56A | #2B2B39 | #9F9FA5 | #484854 | #353542 | #181827 | #E6E6EA | #8B8AF0 | #5FD3B3 | #121214 | #090914 |

**Correction automatique du contraste** (décision C, 2026-10-20) : six paires, en clair et en sombre, toutes à **4,5:1** : Ciel — texte / Ciel — fond ; Étoiles / Ciel — fond ; Étoile active / Étoile active — fond ; Capsule — texte / Capsule — fond ; Accent / Pages de Lyra — fond ; Boucliers / Pages de Lyra — fond (étoiles endormies et lignes exclues : discrètes par design). Toutes les valeurs d'Indigo nuit passent (Boucliers `#1E7F6C` sur `#F7F7FB` ≈ 4,7:1) : aucun ajustement. Sur le ciel, le design utilise la valeur sombre `#5FD3B3` (`--bouclier-ciel`, corrigé à 4,5:1 sur le ciel).

**Variables dérivées** (`deriver(couleurs, mode)`), retrouvées à partir de `Composants.dc.html` : `--texte` = Capsule — texte ; `--texte-secondaire` = texte + 38 % du fond de page (≈ `#6B6B80`) ; `--trait` = page + 8 % de texte (≈ `#E6E6EE`) ; `--pilule` = capsule fond + 5 % de texte (≈ `#F3F3F9`) ; `--attention` = `#8A5A10` sur page claire, `#F4C56A` sur page sombre ; `--libelles-ciel` = étoiles + 18 % du ciel (≈ `#8E8EBE`) ; `--bouclier-ciel` = Boucliers corrigé à 4,5:1 sur le ciel ; `--ligne-selection` = Étoile active à 70 % (`rgba(244,197,106,0.7)`).
