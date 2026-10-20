# État du jalon D — réglages complets, règles par site, couleurs et thèmes

Plan : `docs/superpowers/plans/2026-10-19-lyra-jalon-d.md` (22 tâches). Branche `jalon-d`, fusionnée avec `main` (B, C, E) dans `jalon-d-fusion`. Journal d'exécution complet : `docs/superpowers/ledgers/jalon-d.md`. Version prévue de la livraison : 1.1.0.

## Résultat

`lyra://settings` a ses 19 sections, la recherche par mot-clé, « Le ciel et l'apparence » et « Couleurs et thèmes » (7 thèmes prêts, 13 couleurs en clair et en sombre, correction automatique du contraste, teinte du site, passage en sombre programmé). Les règles par site (Boucliers Désactivés / Standard / Strict, cookies, scripts, extensions, zoom, Ne pas déranger, style et script personnalisés, lecture automatique, notifications, user-agent) sont lues et appliquées par le processus principal. `settings.json` est en version 2, migrable depuis la version 1, avec export et import JSON. Les pages Lyra et la capsule sont tokenisées (modes clair et sombre), y compris les pages Extensions et Réglages.

## Avancement par tâche

| Tâche | Contenu | Commits |
|---|---|---|
| 1 | Schéma v2, valideurs, migration idempotente, fixture v1 figée | `9e2dc62`, `0e8723c`, `674f36f` |
| 2 | Modèle pur des thèmes et du contraste (WCAG, `corriger`, `corrigerPalette`) | `5f84095`, `08dd958`, `9f2a859`, `1d5c8d0` |
| 3 | Répartiteur `webRequest` unique par session | `3de385f` |
| 4 | Résolution des règles par site (`sites.ts`) et canal `sites:*` | `852a5db`, `01a3e59` |
| 5 | Découpage de `General.tsx`, sommaire des 19 sections | `80dc716` |
| 6 | « Rechercher un réglage » | `f4edfea`, `ffab861` |
| 7 | Tokenisation du CSS, mode sombre des pages Lyra et de la capsule | `80d6063`, `b333071`, `bb71bcc` |
| 8a | Diffusion des thèmes par IPC, `theme.ts`, passage en sombre (système, soleil, jamais), teinte du site | `164a49e`, `d5da48e`, `7881be3` |
| 8b | Passage en sombre « À une heure fixe » (Décision B) | `a649aa1` |
| 9 | Écran « Couleurs et thèmes » | `6c021e4`, `4f667a4` |
| 9b | Correction automatique du contraste (Décision C) | `6067aba`, `5ef304b` |
| 10 | « Le ciel et l'apparence » complet | `4d36989`, `02973ac` |
| 11 | Boucliers par site : niveau Strict | `2c2d024`, `35eed77` |
| 12 | Cookies, scripts et user-agent par site via le répartiteur | `59b7d6f`, `76771ca`, `b1a7f02`, `620e383` |
| 13 | Zoom suivi, lecture automatique, style et scripts personnalisés | `bfc3b19`, `b8ce2bc` |
| 14a / 14b | Page « Règles par site » (tableau, détail, lignes Scripts et Zoom — Décision A) | `8e3e424`, `38b31b5`, `b39e431` |
| 15 | Entrées contextuelles vers les règles (menu ⋯, panneau des Boucliers, palette) | `25e76aa`, `b64d4d2` |
| 16 | Raccourcis clavier redéfinissables | `d71815f`, `491756b`, `18d1b23` |
| 17 | Gestes et souris | `7419732`, `ef78635` |
| 18 | Sections restantes (Confidentialité, Ne pas déranger, Démarrage, Styles et scripts…) | `d2fd3ae`, `fc07322`, `dcb0db7`, `28bb3cd` |
| 19 | Placement, regroupement par site, archivage des étoiles éteintes | `c935d9a`, `e1a70b2`, `10ec580`, `9bd8af8` |
| 20 / 20b | Intégration de B : colonne et détail « Extensions », règle appliquée aux scripts de contenu, page Extensions tokenisée | `378bef9`, `fdd55b9`, `d115464` |
| 21 | Intégration d'E : Palette et recherche, page d'accueil importée, moteurs perso | `a6f76df`, `7dde05b`, `40b8cd7`, `4460e93` |
| 22 | Documentation, mineurs reportés, vérification finale | voir « Tâche 22 » |

Les tâches 16 et 18 (et la fin des tâches 19 et 21) ont été réalisées sur des branches parallèles puis fusionnées ; les tâches 12 à 14 ont chacune eu deux tours de relecture.

## Décisions rendues (2026-10-20)

- **A — Détail d'une règle : « Scripts » et « Zoom ».** Deux lignes après « Cookies » : Scripts (Autorisés / Bloqués, défaut Autorisés) et Zoom (paliers 50 % à 200 % et « Par défaut »). Faites (14b).
- **B — « À une heure fixe ».** Plage « Sombre de [21:00] à [07:00] », deux `<input type="time">`, `couleurs.heureSombre` / `couleurs.heureClair`. Faite (8b, montée en tâche 9).
- **C — Contraste.** Correction automatique (choix de l'utilisateur) : `couleurs.corrigerContraste`, activée par défaut, six paires à 4,5:1, étiquette « Ajustée : 3,1:1 → 4,5:1 ». Faite (9b). La paire « Boucliers » est comparée au fond des pages de Lyra (et non au ciel) : ruling de la tâche 2.

Les sous-tâches 8b, 9b et 14b sont faites : aucune Décision n'est laissée en reste.

## Choix du plan (valeurs que le design ne donne pas)

À ajuster sans toucher à l'architecture :
- « Ternir une étoile inactive après » : 5 min, 15 min, **30 min** (design), 1 h. « Endormir… après » : 30 min, 1 h, **2 h**, 4 h. « Archiver les étoiles éteintes depuis » : **Jamais**, 1, 7, 30, 90 jours. « Éteinte » = étoile dormante dont `inactifDepuis` dépasse le seuil.
- « Police de l'interface » : Manrope (Lyra) et cinq polices système sûres (`system-ui`, Arial, Georgia, Verdana, monospace), sans énumération des polices installées. « Taille du texte de l'interface » : étoiles, adresse de la pilule et libellés du ciel, pas les panneaux ni les pages de réglages.
- Éditeur de script personnalisé minimal : nom, code monospace, actif, supprimer ; 100 Ko par style ou script, 50 scripts.
- Pastille d'un site : lettre sur une couleur déterministe tirée de l'hôte dans la palette de `Composants.dc.html`.
- Sections sans design (Palette et recherche, Boucliers, Confidentialité, Raccourcis, Gestes, Ne pas déranger, Démarrage, Styles et scripts, Sauvegarde et profils, Labo) : libellés sobres dans le style de `controles.tsx`.
- Strict (Boucliers par site) : moteur Ghostery standard unique, plus une garde « script tiers hors liste » (domaines d'actifs des grands sites tolérés : githubassets.com, gstatic.com, ytimg.com, ggpht.com). « Masquer aussi les gênes » reste inerte (« Bientôt »).
- Valeurs dérivées des six autres thèmes prêts : voir `docs/design/README.md` (seul Indigo nuit est entièrement fixé par le design).

## Rulings notables

- Limite d'import des réglages JSON portée à 16 Mo (les styles et scripts personnalisés rendent 1 Mo trop petit) ; l'export est refusé avec un message au-delà.
- Retirer un champ d'une règle : `sites:ecrire` avec la valeur `null` (`retirerChampsSite`) ; clés de règle canonisées à l'écriture ; `sites:changed` n'est envoyé qu'aux vues internes.
- « Modifié » (écran Couleurs) se compare au thème de départ mémorisé (`couleurs.depart`) ou au thème importé (`couleurs.reference`) ; éditer une couleur alors que « Mes couleurs » contient déjà autre chose demande confirmation.
- Les réglages de la tâche 19 (archiver, nouvelle étoile, regrouper) sont actifs sans « bientôt » : la tâche 19 est dans ce jalon.
- Style personnalisé : livré par la réponse synchrone de `page:regles-site` (avant le premier rendu) et non par `shields:styles` (asynchrone, course contre le parseur).
- Historique : Ctrl+H hors macOS (⌘Y sous macOS) ; Ctrl+Y et Ctrl+Maj+Z refusés comme rôles natifs.
- `demarrage.nouvelleFenetre` : « Nouvel onglet » (défaut) ou « Page d'accueil » (repli sur le nouvel onglet si vide).
- Une règle `extensions: { id: false }` est appliquée (20b) aux scripts de contenu du manifest, par `exclude_matches` dans la copie convertie puis rechargement de l'extension.
- User-agent aligné par le preload de la page (pas de `webContents.setUserAgent` : Chromium recharge la page pendant une navigation).

## Tâche 22 : mineurs reportés

Faits, chacun avec son test :
- Copie du fichier de réglages illisible horodatée (`settings.json.corrompu-<date>`) : un incident suivant n'écrase plus la copie du précédent.
- Lecture des réglages refusée (EACCES, E/S) : message `[reglages] lecture impossible`, défauts en mémoire, fichier laissé intact et jamais réécrit pendant la session (pas de crash).
- `estVueInterne` resserré : même contrôle que l'expéditeur IPC (préfixe exact du renderer ou du serveur de dev), plus de test « contient ui.html ». Les diffusions `downloads:changed` et d'import passent aussi par `estVueLyra`.
- `passerelles:changed` n'est plus envoyé qu'aux pages `lyra://` des fenêtres normales (ni pages web, ni interface, ni fenêtres privées).
- Écouteur `input-event` de la souris : reste branché mais sans effet quand « Masquer la capsule… » est coupé (réglage relu à chaque évènement).
- `CAPSULE_PX` supprimé : `Capsule.tsx` utilise `CAPSULE` de `layout.ts` (test de garde).
- Flash de police dans l'overlay : `theme:initial` porte aussi l'apparence (police, taille, densité, coins), posée par le preload avant le premier rendu.
- `history:frequent` renvoie une liste vide à une fenêtre privée (test e2e `fenetre-privee`).
- Règles par site : le point final était déjà retiré de la clé ; les noms internationaux sont maintenant convertis en punycode (`münchen.de` devient `xn--mnchen-3ya.de`, point final compris), ce qui rend la règle applicable à la page.

Non faits :
- `ErreurReglagesVolumineux` sans `name` : cosmétique, sans effet visible.
- Autres mineurs du journal restés « deferred » sans échéance (tri recalculé à chaque requête du répartiteur, hex inline de quelques TSX, tests d'états interactifs de la référence des couleurs, etc.) : consignés dans le journal, aucun n'affecte le comportement.

## Limites connues (honnêtes)

- **Scripts personnalisés et « Scripts : Bloqués ».** Les scripts personnalisés (globaux et de site) s'exécutent même quand la règle « Scripts » du site est « Bloqués » : la CSP bloque les scripts de la page, pas ceux de l'utilisateur dans le monde isolé. À documenter dans l'interface. Ils ne tournent que dans la frame principale des pages http(s), jamais dans les iframes, jamais sur `lyra://`. Un changement de style ou de script s'applique aux pages suivantes, pas à la page ouverte.
- **Cookies.** Seuls les cookies HTTP passent par `webRequest`. `document.cookie` est neutralisé par frame (relais de `contentWindow`, iframes imbriquées, getters empruntés comprises), sauf `window.open('about:blank')` et les workers, qui peuvent encore lire et écrire des cookies JavaScript. Les cookies déjà présents avant la règle ne sont pas retirés, sauf purge à la pose d'une règle « Bloqués » et au démarrage. « Session seulement » purge à la fermeture de l'application, non à la fermeture de la dernière fenêtre du site. Une règle d'origine avec port vise les cookies de l'hôte pour tous les ports. Un cookie de domaine parent n'est visé que si la règle du parent l'est aussi.
- **User-agent.** `navigator.userAgent` est aligné par le preload ; les workers voient l'UA réel (celui de Lyra), pas l'UA du profil choisi. Un profil alternatif ne change pas les autres traces d'empreinte (écran, polices, `maxTouchPoints`). `Sec-CH-UA*` suit le profil.
- **Scripts « Bloqués ».** `script-src 'none'` bloque aussi l'inline et `javascript:` lancé par la page ; ne sont pas couverts : `javascript:` lancé par l'utilisateur, documents sans réponse réseau (`file://`, `data:`, `blob:`, `about:blank`), injections de Lyra et des extensions. Un `blob:` de premier niveau suit la règle de l'origine incluse dans son URL.
- **Extensions par site.** L'exclusion ne vise que les content scripts déclarés dans le manifest (`exclude_matches`). `scripting.registerContentScripts` et `tabs.executeScript` ne sont pas implémentés côté Lyra ; les permissions d'hôte et `webRequest` ne sont pas restreintes ; pas d'extensions en fenêtre privée. Un site autorisé (`true`) sous un blocage plus large reste bloqué (un motif ne peut pas exprimer d'exception).
- **Lecture automatique.** « Bloquer » et « Sans le son » ne couvrent pas les médias dans un shadow DOM ni Web Audio ; la surcharge de `play` est détectable. Les fenced frames n'ont pas de test automatisé.
- **Strict.** Les iframes tierces suivent la règle de la page principale ; `gstatic.com` est autorisé en entier (reCAPTCHA). Un second moteur de filtrage n'existe pas.
- **Thème.** Avec « Avec le système » et `prefersColorScheme` désactivé, un changement du système n'est vu qu'à la relecture. Le passage « Au coucher du soleil » utilise une table fuseau vers heures, sans réseau ni géolocalisation (Casablanca pendant le Ramadan non traité). La teinte du site dépend du cache HTTP du favicon. `--pilule-discrete` reste à 2,8:1 en clair (valeur d'origine du design, décorative).
- **Styles et scripts globaux : interface inerte.** Le main applique `Settings.styles` (style et scripts globaux, testés en vitest et e2e), mais la section « Styles et scripts › Pour tous les sites » reste affichée désactivée avec la mention « Bientôt ». Seuls les règles par site ont un éditeur. Reste à brancher l'éditeur des règles par site sur la portée globale.
- **Mots de passe et cookies importés** : hors périmètre d'E (voir README).
- **Fixtures.** `tests/e2e/fixtures/couleurs-reference.json` est recapturée vue par vue ; `UPDATE_README` ne doit jamais être défini en CI.

## Hors périmètre (assumé)

- Mode lecture (Labo) et fenêtres d'extension par-dessus la page : annoncés pour la version 2.
- Plusieurs profils (Sauvegarde et profils) : version 2.
- « Masquer aussi les gênes » (bandeaux de cookies, invitations) : inerte, la liste correspondante n'est pas dans le moteur.
- Second moteur de filtrage pour Strict.
- Exceptions de certificat globales ; téléchargements privés persistants (la liste des téléchargements d'une fenêtre privée est en mémoire, livrée par la release-prep de `main`).
- Énumération des polices installées ; zoom par défaut global (le défaut est 100 %).
- Synchronisation des réglages entre appareils.
- Application de la règle d'extension aux permissions d'hôte et à `webRequest`.

## Vérification finale (tâche 22)

<!--VERIF-->
