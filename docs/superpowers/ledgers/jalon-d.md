# SDD ledger — plan: docs/superpowers/plans/2026-10-19-lyra-jalon-d.md
Contrôleur : session ORION HELP (c72a5410, Mac). Jalon D confié par la session ORION CLONE (2026-10-20). Plan relu et réécrit avant exécution (plan-review.md, 22 tâches) ; décisions A, B, C rendues (C corrigée par l'utilisateur : correction automatique du contraste). Branche jalon-d à jour avec origin/main (15555fa : C et E fusionnés), typecheck OK, vitest 893/893.
Ruling: briefs extraits par un script maison (les titres du plan sont « ### Tâche N », que task-brief ne reconnaît pas) — coût si faux : aucun.
Ruling: E est déjà fusionné (le plan supposait l'inverse) — la Tâche 21 (intégration d'E) s'exécute quand elle vient, sans fusion supplémentaire ; les tâches qui touchent des zones d'E (moteurs, couleurs, TabTree) utilisent directement les API d'E présentes sur la branche — coût si faux : aucun.
Ruling: B n'est pas encore fusionné ; la Tâche 20 attend la fusion de B dans main par ORION CLONE (fusion de origin/main au début de la Tâche 20) — coût si faux : Tâche 20 retardée.
Ruling: les commits portent la ligne Claude-Session de cette session (…01QuTzj…), imposée par le harness, au lieu de celle des Global Constraints — coût si faux : aucune incidence fonctionnelle.
Ruling: Review Focus 2 parle d'« une paire sous 4,5:1 identifiée » ; avec la décision C, la correction est appliquée automatiquement aux variables diffusées (Tâche 9b) — coût si faux : aucun.

## Pré-vol
Plan relu ligne à ligne par une relecture dédiée avant exécution (plan-review.md, 37 corrections intégrées dans la réécriture 40750a3) ; contrôle ici des seuls changements survenus depuis : fusion d'E (Tâche 21 allégée), décisions A/B/C rendues (8b, 9b, 14b exécutables, 9b selon la correction automatique). Aucun autre conflit entre tâches relevé.

## Journal
- 08:28 Tâche 1 : implémenteur dispatché (sonnet), BASE 15555fa
- Tâche 1 : DONE_WITH_CONCERNS (9e2dc62, 0e8723c ; vitest 923, typecheck, build, settings/reglages e2e verts) ; défauts D choisis par l'implémenteur (à vérifier contre les .dc.html).
- Tâche 1 : relecture 15555fa..0e8723c → Needs fixes. Important : couleurParConstellation false contre le design ; avertissement « fichier corrompu » jamais produit ; test « > 1 Mo refusé » absent et export v2 légitime > limite d'import (plan-mandated).
Ruling: limite d'import des réglages JSON portée à 16 Mo (constante nommée partagée par settings:import et import:fichier réglages) et export refusé avec un message clair au-delà — les bornes v2 (styles et scripts perso) rendent 1 Mo trop petit — coût si faux : un import plus gros accepté (borné, validé champ par champ).
Ruling: « Couleur de l'étoile active » et « Couleur du ciel » d'Apparence (Parametres.dc.html) sont des raccourcis vers couleurs.personnalisees (clés de l'étoile active et du ciel — fond), pas de nouveaux champs — à porter dans le brief de la Tâche 10 — coût si faux : aucun nouveau champ, cohérence garantie avec Couleurs et thèmes.
Ruling: les mineurs 4 (test qui laisse croire que les clés inconnues d'une règle de site sont gardées) et 7 (« Mes couleurs » complétées au lieu d'être perdues si une clé manque) entrent dans la ronde — peu coûteux, évitent une perte de données — coût si faux : ronde un peu plus longue.
- Tâche 1: minor (deferred → Tâche 21): paquet.ts:96 d'E n'utilise pas reglagesExportables (embarquerait extensions.installees et les clés inconnues).
- Tâche 1: minor (deferred → Tâches 4/11): Shields.ts:96 (boucliers !== false) et shields/installer.ts:138 (écrit un booléen) à faire passer par resoudre() / forme tri-état.
- Tâche 1: minor (deferred → Tâche 18): demarrage.pageAccueil sans vérification du schéma d'URL (javascript:/file:).
- Tâche 1: minor (deferred): fixture v1 sans script de production versionné ; copie settings.json.corrompu avant réécriture (traitée si gratuite dans la ronde).
- Tâche 1: fix round 1 dispatché, FIX_BASE 0e8723c
- Tâche 1: fix round 1/5 (5 addressed, 0 open; commits 0e8723c..674f36f)
- Tâche 1: minor (deferred → Tâche 22): copie .corrompu écrasée par un incident suivant (nom horodaté) ; erreur de lecture (EACCES) → défauts sans journal puis fichier écrasé à la première écriture (perte possible) ; ErreurReglagesVolumineux sans name.
- Tâche 1: complete (commits 15555fa..674f36f, review clean)
- 08:40 Tâche 2 : implémenteur dispatché (sonnet), BASE 674f36f
- Tâche 2 : DONE_WITH_CONCERNS (5f84095, 08dd958 ; vitest 979, typecheck OK).
Ruling: erreur du contrôleur corrigée — la paire « Boucliers / Ciel — fond » de la décision C était fausse : en clair, Boucliers #1E7F6C s'affiche sur les pages de Lyra (#F7F7FB), et sur le ciel le design utilise #5FD3B3 (spec, Identité visuelle). Paire retenue : Boucliers / Pages de Lyra — fond — coût si faux : aucune correction à tort du thème par défaut.
- Tâche 2 : paire Boucliers corrigée (9f2a859) ; aucun thème sous 4,5:1.
- Tâche 2 : relecture 674f36f..9f2a859 → Needs fixes. Important : (1) tableau des palettes du README périmé (colonne Boucliers) ; (2) deriver() sur Indigo nuit s'écarte du design et de theme.css (--bouclier-ciel #398E7E au lieu de #5FD3B3, --texte-secondaire, --trait, --pilule), masqué par des tests tolérants.
Ruling: les mineurs 3 (texte secondaire de Sable sous 4,5:1, à corriger par la même dérivation), 4 (variable pour les libellés de groupe #7F7FB0) et 7 (COULEURS_INDIGO_NUIT gelée, mes-couleurs copiée) entrent dans la ronde — ils conditionnent la tokenisation de la Tâche 7 — coût si faux : ronde un peu plus longue.
- Tâche 2: minor (deferred): versRgb non gardé (hex invalide → NaN) ; corrigerPalette peut enregistrer une couleur sous le seuil en repli (impossible à 4,5) sans le signaler.
- Tâche 2: fix round 1 dispatché, FIX_BASE 9f2a859
- Tâche 2: fix round 1/5 (5 addressed, 0 open; commits 9f2a859..1d5c8d0)
- Tâche 2: minor (deferred → Tâche 7): le test strict d'Indigo compare des valeurs copiées, pas theme.css ; après la tokenisation, faire lire theme.css par le test (ou générer theme.css depuis deriver).
- Tâche 2: minor (deferred): UPDATE_README ne doit jamais être défini en CI (il masquerait la comparaison).
- Tâche 2: complete (commits 674f36f..1d5c8d0, review clean)
- 08:53 Tâche 3 : implémenteur dispatché (sonnet), BASE 61374d7
- Tâche 3 : DONE (3de385f ; vitest 1006, Playwright complet vert après correction de export.spec version 2) ; garde http des passerelles = garde des Boucliers, déjà dans le hub.
- Tâche 3: minor (deferred → Tâche 11/12, à porter dans leurs briefs): try/finally pour garantir cb si suite/arret lèvent ; ré-exempter chrome-extension:// et rester après la garde (priorité > 50) dans les écouteurs de D ; cancel absent de onHeadersReceived.
- Tâche 3: minor (deferred): tri recalculé à chaque requête (garder un tableau trié) ; tests statusLine et exceptions onHeadersReceived/onBeforeSendHeaders ; ordre après remplacement d'un id non documenté.
- Tâche 3: complete (commits 61374d7..3de385f, review clean)
- 09:04 Tâche 4 : implémenteur dispatché (sonnet), BASE 3de385f
- B fusionné dans main (cff63b8, par ORION CLONE ; CI 39398782578 en cours) : fusionner origin/main dans jalon-d après la Tâche 4. Format B : sites[*].extensions: Record<id, boolean> (false = bloquée) ; paquet .lyra extensions.json { enAttente, installees } ; EntreeImport de B renommé EntreeFileExtensions.
- Tâche 4 : DONE (852a5db ; vitest 1019, Playwright 101/101) ; réserves : sites:ecrire ne peut pas retirer un champ ; réactiver les Boucliers écrase 'strict' ; settings:changed n'a plus sites.
- Tâche 4 : relecture 3de385f..852a5db → Needs fixes. Important : aucune primitive pour retirer un champ d'une règle ⇒ toggleSite rétrograde un Strict (exact ou du motif) ; bloque 11 et 14b.
Ruling: retrait d'un champ = `sites:ecrire` avec la valeur `null` pour ce champ (retire le champ ; règle vide supprimée), via Reglages.retirerChampsSite(cle, champs) ; toggleSite, à la réactivation, retire `boucliers` de la règle exacte si la résolution sans lui n'est pas 'desactives', sinon écrit 'standard' — coût si faux : un `null` explicite ne peut plus être stocké comme valeur (aucun champ n'en a besoin).
Ruling: clés canonisées à l'écriture (minuscules, new URL(e).origin pour les origines, port par défaut retiré) et sites:changed envoyé seulement aux vues lyra:// et UI (pas aux onglets web) — entrent dans la ronde, ils évitent des règles fantômes et une fuite de styles/scripts perso vers les pages — coût si faux : ronde un peu plus longue.
- Tâche 4: minor (deferred → Tâche 20): page extensions de B (src/renderer/extensions/main.tsx:204/430) lit reglages.sites sur settings:changed → passer à sites:lister + sites:changed ; décider la fusion de sites[*].extensions par id (comme permissions).
- Tâche 4: minor (deferred → Tâche 14a): IDN → punycode (domainToASCII) dans la saisie d'une nouvelle règle ; point final.
- Tâche 4: minor (deferred): test « même règle partout » en partie tautologique ; objet résolu non gelé ; `in` au lieu de Object.hasOwn ; tests manquants (refus en privée, émission de sites:changed, retour au défaut).
- Tâche 4: fix round 1 dispatché, FIX_BASE 852a5db
- CI de main cff63b8 rouge (2 e2e d'extensions, ORION CLONE corrige) : attendre son signal avant de fusionner origin/main dans jalon-d ; les tâches 5 et suivantes continuent sans B.
- Tâche 4: minor (deferred → Tâche 22): passerelles:changed (index.ts ~558) envoyé à toute page dont l'URL contient ui.html, y compris une page web — aligner sur estVueInterne.
- Tâche 4: fix round 1/5 (4 addressed, 0 open; commits 852a5db..01a3e59)
- Tâche 4: minor (deferred → Tâche 22): estVueInterne trop large (comparer le pathname exact ; préfixe dev) ; ecrire avec null + valeurs = deux diffusions ; bouclierAvant obsolète si boucliers réécrit hors toggleSite ; settings:changed envoyé aussi aux onglets web.
- Tâche 4: complete (commits 3de385f..01a3e59, review clean)
- 09:23 Tâche 5 : implémenteur dispatché (sonnet), BASE 01a3e59
- Tâche 5 : DONE (80dc716 ; vitest 1038, Playwright 102/102).
- Tâche 5: minor (deferred → Tâche 20, avec Apropos.tsx de B): « À propos » sans la version.
- Tâche 5: minor (deferred → Tâche 18): texte de l'emplacement Confidentialité trompeur tant que « Effacer l'historique » est sur Général.
- Tâche 5: minor (deferred): PaletteSection importe moteursDisponibles depuis le module main (pur) au lieu d'un IPC/module partagé ; Titre « Téléchargements » répète le h1 ; .sr-only incomplet.
- Tâche 5: complete (commits 01a3e59..80dc716, review clean)
- 09:31 Tâche 6 : implémenteur dispatché (sonnet), BASE 80dc716
- Tâche 6 : DONE (f4edfea ; vitest 1045, Playwright 103/103).
- Tâche 6 : relecture 80dc716..f4edfea → Needs fixes. Important : focus non déplacé vers la ligne cible ; test de garde d'un seul sens (ligne non indexée non détectée, liste de fichiers en dur).
Ruling: flèches haut/bas dans la liste des résultats et rôle listbox entrent dans la ronde (accessibilité clavier, même zone) ; couleurs .trouves/.trouve en variables du thème — coût si faux : ronde un peu plus longue.
- Tâche 6: minor (deferred): classe trouve posée par classList sur un nœud géré par Preact ; Échap sur champ vide sans blur.
- Tâche 6: fix round 1 dispatché, FIX_BASE f4edfea
- Tâche 6: fix round 1/5 (4 addressed, 0 open; commits f4edfea..ffab861)
- Tâche 6: minor (deferred): ArrowUp depuis actif=-1 tombe sur l'avant-dernière option ; attribut list superflu ; regex du test de garde ignore les ids avec chiffres/tirets.
- Tâche 6: complete (commits 80dc716..ffab861, review clean) — e2e complet lancé par le contrôleur
- e2e complet sur ffab861 : 103 passed (contrôleur). 09:45 Tâche 7 : implémenteur dispatché (sonnet), BASE ffab861
- Tâche 7 : DONE_WITH_CONCERNS (80d6063 référence, b333071, bb71bcc tokenisation ; vitest 1054, theme-tokens 2/2, Playwright 105) ; teintes résiduelles statiques en clair ; hex inline des TSX (SVG capsule, panneau Boucliers) non tokenisés.
- Tâche 7: minor (deferred → Tâche 8a, à porter dans son brief): lisibilité en sombre — danger = attention (theme.css:101-104), bordures de champs/boutons #232326 sur #17172A (≈1,1:1), hex en ligne des TSX (Capsule.tsx:108/114/121, ShieldsPanel.tsx:54, MenuPanel.tsx:67) restés clairs ; teintes résiduelles statiques en clair (theme.css:41-62) ; --libelles-ciel et --ligne-selection réutilisés hors du ciel ; privée en sombre = Aurore clair.
- Tâche 7: minor (deferred): la référence ne couvre pas les états interactifs (menu, recherche, invite, listes peuplées, :hover/:focus).
- Tâche 7: complete (commits ffab861..bb71bcc, review clean)
- 10:01 Tâche 8a : implémenteur dispatché (sonnet), BASE bb71bcc
- Tâche 8a : DONE (164a49e, d5da48e ; vitest 1120, Playwright 110) ; flash possible d'Indigo au chargement avec un autre thème ; teinte du site et couleurs de constellation testées en unitaire seulement.
- Tâche 8a : relecture bb71bcc..d5da48e → Needs fixes. Important : teinte du site rend les textes du ciel illisibles (theme-color #FFFFFF : --etoiles 3,3:1, --libelles-groupe 2,0–2,8:1, même sur Indigo).
Ruling: la ronde inclut aussi les mineurs 2 (filtre estVueLyra par expediteurAutorise), 3 (pas de flash : thème injecté avant le premier rendu par les preloads), 4 (table du soleil en heure standard + décalage d'été courant via Intl), 5 (recalcul au retour de veille), 7 (couleur de constellation corrigée à ≥ 3:1 sur le ciel), 8 (pas de teinte du site en fenêtre privée) et 9 (lecture des variables hors du rendu d'App) — chacun coûte quelques lignes et touche la lisibilité ou la confidentialité — coût si faux : ronde plus longue.
Ruling: --pilule-discrete en clair reste à 2,8:1 (valeur d'origine du design, élément décoratif non textuel « discret ») — coût si faux : une pilule discrète peu contrastée, comme dans le design.
- Tâche 8a: minor (deferred): thème système figé avec prefersColorScheme désactivé (macOS/Linux) ; e2e « Programmé » faible ; session.fetch only-if-cached d'un autre site non vérifié.
- Tâche 8a: fix round 1 dispatché, FIX_BASE d5da48e
- Tâche 8a: fix round 1/5 (8 addressed, 0 open; commits d5da48e..7881be3)
- Tâche 8a: minor (deferred): variable retirée par un nouveau thème retombe sur le bloc insertCSS initial ; teinte calculée contre l'ancien thème jusqu'à 1 s après un changement de thème ; Casablanca pendant le Ramadan ; pas de teinte ni de correction de constellation avant le premier theme:variables.
- Tâche 8a: complete (commits bb71bcc..7881be3, review clean)
- 10:39 Tâche 8b : implémenteur dispatché (sonnet), BASE 7881be3
- Tâche 8b : DONE (a649aa1 ; vitest 1182, Playwright 112) ; PlageSombre.tsx livré non monté (Tâche 9).
- Tâche 8b: minor (deferred → Tâche 9): monter PlageSombre sous le segment « À une heure fixe » avec un e2e des champs time ; la recherche « couleurs.heure » doit marcher même quand la ligne est masquée.
- Tâche 8b: minor (deferred): échéance en minutes murales un jour de changement d'heure (bornée par le plafond de 1 h) ; Intl.DateTimeFormat recréé à chaque appel.
- Tâche 8b: complete (commits 7881be3..a649aa1, review clean)
- 10:45 Tâche 9 : implémenteur dispatché (sonnet), BASE a649aa1
- Tâche 9 : DONE (6c021e4 ; vitest 1198, Playwright 118) ; « modifié » calculé contre Indigo nuit ; Fenêtres privées en Selecteur au lieu du .btn du design.
- Tâche 9 : relecture a649aa1..6c021e4 → Needs fixes. Important : Échap dans le champ hex applique la couleur (blur au démontage) au lieu d'annuler ; Entrée appelle surChange deux fois.
Ruling: « modifié » se compare au thème de départ mémorisé (`couleurs.depart: NomTheme`, Indigo nuit par défaut, mis à jour quand on choisit un thème prêt puis qu'on édite) — le brief dit « thème de départ » — coût si faux : un champ de plus dans le schéma.
Ruling: éditer une couleur alors que « Mes couleurs » contient déjà une personnalisation différente du thème affiché demande confirmation (« Remplacer Mes couleurs par une copie de <thème> ? ») au lieu d'écraser en silence — coût si faux : une boîte de confirmation de plus.
Ruling: dans la même ronde, l'en-tête suit l'espacement du design (h1 et sous-titre dans un bloc, 4 px, boutons à droite), l'aperçu d'Indigo/Mes couleurs prend #FFFFFF comme le design, l'export gère l'erreur d'écriture avec un message, l'aria-label du bouton hex inclut la valeur — coût si faux : ronde plus longue.
- Tâche 9: minor (deferred): import lu en entier avant le contrôle de taille (stat préalable) ; message d'état jamais effacé ; `as never` dans Segments.
- Tâche 9: fix round 1 dispatché, FIX_BASE 6c021e4
- Tâche 9: fix round 1/5 (4 addressed, 0 open; commits 6c021e4..4f667a4)
- Tâche 9: minor (deferred → Tâche 9b, même écran): focus sur « Remplacer » et Échap = Annuler dans la confirmation ; themes:importer doit fixer depart ; test de validation/migration/import de couleurs.depart.
- Tâche 9: complete (commits a649aa1..4f667a4, review clean)
- 11:07 Tâche 9b : implémenteur dispatché (sonnet), BASE 4f667a4
- Tâche 9b : DONE (6067aba ; vitest 1215, Playwright 122) ; ajout couleurs.reference (thème importé = référence) ; sous-titre ajusté à la correction automatique.
- Tâche 9b: correction mineure 5ef304b (libellé « Vérifier le contraste » du design, import unique, commentaire de depart).
- Tâche 9b: minor (deferred): depart et reference portent ensemble la notion de référence (fusion possible) ; étiquettes calculées sur le thème affiché, pas le privé ; écouteur Échap sur window sans stopPropagation ; disposition des étiquettes non capturée.
- Tâche 9b: complete (commits 4f667a4..5ef304b, review clean)
- 11:27 Tâche 10 : implémenteur dispatché (sonnet), BASE 5ef304b
- Tâche 10 : DONE_WITH_CONCERNS (4d36989 ; vitest 1232, Playwright 129) ; fixture de référence +32 lignes (à vérifier) ; capsule auto ne voit pas la souris sur la page web.
- Tâche 10 : relecture 5ef304b..4d36989 → Needs fixes. Important : capsule auto ne revient pas au mouvement sur la page (écouteur sur la vue UI seulement ; zones drag ; seuil du haut en position haut) ; « Police de l'interface » écrasée par les raccourcis font: 'Manrope' (pilule, palette, boutons, .hs…) ; taille/densité/icônes sans effet en positions haut/bas.
Ruling: les réglages de la Tâche 19 (archiver, nouvelle étoile, regrouper) restent affichés actifs sans « bientôt » — la Tâche 19 est dans ce jalon, avant toute fusion dans main — coût si faux : réglages sans effet si le jalon était fusionné avant la Tâche 19.
Ruling: « Taille du texte de l'interface » s'applique aux étoiles (colonne et bande), à l'adresse de la pilule et aux libellés du ciel, pas aux panneaux ni aux pages de réglages — compromis lisible avec le défaut 13 px du design — coût si faux : taille partielle de l'interface.
Ruling: dans la même ronde : curseur de taille en onInput avec aperçu, pastilles 28 px comme le design, exemption exacte de la classe sw dans theme-tokens — coût si faux : ronde plus longue.
- Tâche 10: minor (deferred): « Autre… » (input color invisible + click) non testé en e2e ; valeurs locales des pastilles périmées si une autre fenêtre modifie ; chemin positif des icônes de site non testé ; pile de secours de .star légèrement différente.
- Tâche 10: fix round 1 dispatché, FIX_BASE 4d36989
- Tâche 10: fix round 1/5 (4 addressed, 0 open; commits 4d36989..02973ac)
- Tâche 10: minor (deferred → Tâche 22): écouteur input-event permanent même option coupée (tester capsuleAuto dans le handler) ; CAPSULE_PX dupliqué de layout.ts ; flash de police dans l'overlay à l'ouverture ; minuteur attenteTaille non annulé au démontage.
- Tâche 10: complete (commits 5ef304b..02973ac, review clean)
- 12:01 Tâche 11 : implémenteur dispatché (sonnet), BASE 02973ac ; main toujours rouge (cff63b8), fusion de main reportée.
- Tâche 11 : DONE (2c2d024 ; vitest 1251, Playwright 135, youtube @reseau sans et avec Strict) ; priorités du hub : boucliers 50, boucliers-strict 99, défaut 100 ; tout écouteur de D passe par apresBoucliers.
- Tâche 11 : relecture 02973ac..2c2d024 → Needs fixes. Important : 1re partie calculée sans la section privée de la PSL (a.github.io ≡ b.github.io, *.netlify.app…).
Ruling: CDN_CONNUS complété par les domaines d'actifs des grands sites (githubassets.com, gstatic.com, ytimg.com, ggpht.com) pour que Strict ne casse pas GitHub et YouTube ; les iframes tierces restent soumises à la règle de la page principale (spec : « frame principale »), documenté dans le code — coût si faux : quelques scripts de ces domaines autorisés en Strict.
Ruling: repli du service worker (ni webContents ni referrer) → page inconnue '' (autorisé par décision explicite) dans la même ronde — coût si faux : aucun.
- Tâche 11: minor (deferred): test « trie une seule fois » espionne Array.prototype.sort globalement ; enRetour avec rappel asynchrone = laisser passer (à commenter) ; exemption gvt1/clients2 aussi en Standard (voulue).
- Tâche 11: fix round 1 dispatché, FIX_BASE 2c2d024
- main vert (37cd2a2, B complet) : fusionner origin/main dans jalon-d après la Tâche 11. ORION CLONE prend les restes avant release sur une branche release-prep (téléchargements privés, chien de garde du lecteur, source uBO, marche à suivre de l'import réel).
- Tâche 11: fix round 1/5 (4 addressed, 0 open; commits 2c2d024..35eed77)
- Tâche 11: minor (deferred): le test « frame inconnue » ne distingue pas l'ancien repli du nouveau (règle propre à l'URL du script pour le rendre discriminant) ; gstatic.com entier autorisé (reCAPTCHA).
- Tâche 11: complete (commits 02973ac..35eed77, review clean)
- Fusion d'origin/main (37cd2a2, B complet) dans jalon-d : 11 fichiers en conflit, résolution confiée à un agent (opus) avec règles : garder les deux côtés, RegleSite.extensions validé et résolu par id dans sites.ts, page extensions de B passée à sites:lister/sites:changed, estExempte commun.
Ruling: accélération demandée par l'utilisateur — ORION CLONE prend les Tâches 16 (raccourcis) et 18 (sections restantes, « Styles et scripts » après la Tâche 13) sur une branche jalon-d-oc tirée de jalon-d après la fusion, avec relecture par tâche ; je fusionne ses tâches dans jalon-d. Je garde 12, 13, 14a, 14b, 15, 17, 19, 20, 21, 22 — coût si faux : conflits de fusion dans recherche.ts et TabManager.ts, résolus à la fusion.
- main avance à 24ecd61 (source « ubo », types.ts SourceExtension) : à refusionner après la fusion en cours. ORION CLONE a démarré la Tâche 16 sur jalon-d-oc depuis 02973ac ; il fusionnera jalon-d dans jalon-d-oc à mon signal.
- Fusion de main faite : b41c483 (B, avec RegleSite.extensions validé et résolu par id, page extensions sur sites:changed, estExempte commun avec crx://) puis 1b113bf (main 24ecd61, sans conflit). vitest 1530/1530, typecheck OK ; Playwright 148/149 sur b41c483.
- Constat : tests/e2e/theme-tokens.spec.ts ouvre la page d'import sans LYRA_IMPORT_RACINE → la détection lit les vrais profils de la machine (interdit, et instable : échec « Prêt » sur la vue settings-importer). À corriger dans la Tâche 12 (racine de fixtures, référence recapturée seulement pour cette vue).
- Fusion : 3 tests unitaires de D adaptés au comportement fusionné (plus stricts) ; 6 couleurs en dur de .pn-ext (B) tokenisées à valeurs claires identiques.
- 12:37 Tâche 12 : implémenteur dispatché (sonnet), BASE 1b113bf
- main avance à ffde306 (release-prep : téléchargements privés en mémoire, chien de garde du lecteur, marche à suivre de l'import réel) : à refusionner après la Tâche 12.
- Tâche 16 (ORION CLONE, relue et corrigée) : origin/jalon-d-oc 18d1b23, vitest 1624, e2e raccourcis 5/5 — à fusionner dans jalon-d après la Tâche 12. Recouvrement accepté : petites retouches de Sky.tsx (10 l.) et Bande.tsx (6 l.) pour afficher les raccourcis effectifs. Décisions de sa relecture : Historique = Ctrl+H sous Windows/Linux (⌘Y macOS, spec §4 mise à jour), Ctrl+Y et Ctrl+Maj+Z refusés comme rôles natifs.
- Tâche 16: minor (deferred): suggest.ts garde des chaînes aide en dur (remplacées à l'affichage) ; Ctrl+K attribuable alors que la palette l'utilise en local.
- Tâche 18 (ORION CLONE, relue et corrigée) : origin/jalon-d-oc18 dcb0db7, vitest 1565, e2e 54/54 — à fusionner dans jalon-d avec jalon-d-oc (conflits additifs attendus). Styles et scripts inerte jusqu'à la Tâche 13 ; palette.suggestionsEnPrivee (défaut false) ; effacement à la fermeture dans src/main/confidentialite/.
Ruling: `demarrage.nouvelleFenetre` = « Nouvel onglet » (défaut, comportement actuel) ou « Page d'accueil » (demarrage.pageAccueil, repli sur le nouvel onglet si vide) ; pas de troisième choix — coût si faux : une option de moins qu'un navigateur classique (« restaurer la session » existe déjà au démarrage).
- Tâche 18: minor (deferred → Tâche 22): history:frequent sans garde fenêtre privée côté main.
- demarrage.nouvelleFenetre fait par ORION CLONE (jalon-d-oc18 28bb3cd : 'vide' | 'accueil'). ORION CLONE prend ensuite les Tâches 19 et 21 sur jalon-d-oc19 (tirée de jalon-d-oc18).
- Tâche 12 : DONE_WITH_CONCERNS (76771ca theme-tokens sur profils fabriqués, 59b7d6f cookies/scripts/UA ; vitest 1593, Playwright 155, youtube @reseau 2/2) ; UA aligné par le preload (pas de setUserAgent) ; seuls les cookies HTTP filtrés (pas document.cookie).
- Tâche 12 relecture opus : Needs fixes (I1 document.cookie iframes tierces sous 1re partie ; I2 Bloqués cookies JS + existants ; I3 service worker contourne CSP ; I4 Session seulement purge des domaines tiers). Ronde 1 lancée. v1.0.0 taguée sur main f05b2e8 (B+C+E) à la demande « version avant 14:00 » ; D → v1.1.
- Tâche 12 ronde 1 : b1a7f02 (10 constats ; canal page:regles-site ; relais contentWindow ; vitest 1633, sites-reseau 7/7, youtube 2/2 ×2, suite e2e verte). Re-relecture lancée ; Tâche 13 lancée en parallèle.
- Tâches 14a+14b : DONE_WITH_CONCERNS (jalon-d-fusion 8e3e424, 38b31b5 ; vitest 1845, sites 5/5, reglages 6/6). theme-tokens échoue sur settings-general : référence non recapturée après fc07322 (Tâche 18 d'OC, General.tsx) → à recapturer (entrée settings-general seule) à la fusion. scriptletsYoutube écrit mais non lu par le main → relecture.
- Tâche 12 re-relecture r1 : Needs fixes — I-1 cookies.ts:157 suppression des cookies de domaine parent (déconnecte les sous-domaines voisins) ; I-2 reglesFrame.ts relais non récursif (iframe imbriquée, getter emprunté) ; m2 délai max + catch sur nettoyageDemarrage ; m3 e2e srcdoc/blob sans relais ; m4 blob: top-level à documenter. Ronde 2 après la Tâche 13 (même worktree).
- Tâches 14 relecture opus : Needs fixes (Scriptlets interrupteur sans effet ; Nouvelle règle écrit boucliers standard → rétrograde un motif Strict ; e2e effet page manquant ; mineurs). Ruling : « Script » seul dans la colonne Style accepté. Scriptlets : Shields.scriptlets lit scriptletsYoutube===false (vrai réglage), interrupteur désactivé et éteint si Boucliers Désactivés. Ronde 1 lancée (jalon-d-fusion).
- Tâche 13 : DONE_WITH_CONCERNS bfc3b19 (vitest 1666 ; sites-page 5/5, sites-reseau 7/7, page 9/9, shields 4/4, fenetre-privee 12/12, youtube 2/2). Ruling : style perso via la réponse sync page:regles-site (garantit avant premier rendu) au lieu de shields:styles — accepté. Relecture 13 + ronde 2 de la 12 lancées.
- Tâches 14 ronde 1 : b39e431 (12 points ; vitest 1859, sites 9/9…) → acceptée, couverture par la relecture finale. Fusion dans jalon-d-fusion : oc15 b64d4d2, oc17 ef78635, main 6b94850 (icône) → b3ea238 poussé ; vitest 1935, build OK. Tâche 20 lancée sur jalon-d-fusion.
- Tâche 13 relecture opus : Needs fixes (I1 Sans le son : muted réécrit par la page ; I2 décision par appel casse YouTube → WeakSet des éléments lancés avec activation ; mineurs 3 capture DOMContentLoaded, 4 fenced frames, 9 enveloppe IIFE, 8 tests). Ajoutés à l'agent de la ronde 2 de la 12 (même worktree).
- À fusionner dans jalon-d-fusion après la Tâche 20 : main 9b45b13 (fix-epingler : theme.css, Rail.tsx, retrait.ts, layout.ts ; package 1.0.1). Numéro final de la livraison : 1.1.0.
- Tâche 20 : DONE_WITH_CONCERNS 378bef9, fdd55b9 (vitest 1939 ; sites 9, sites-extensions 2, extensions*, reglages 6, theme-tokens 2, youtube ×2). Constat : la règle par site extensions:{id:false} n'est PAS appliquée (limite de B, LIMITES de texte.ts) → bouton mensonger, contraire à « tous les boutons fonctionnent ». Tâche 20b lancée : application via exclude_matches dans la copie convertie + rechargement de l'extension.
- Tâche 12 r2 620e383 + Tâche 13 r1 b8ce2bc → acceptées (vitest 1674 ; sites-reseau 8, sites-page 7, page 19, fenetre-privee 12, youtube 2). jalon-d poussé. À fusionner dans jalon-d-fusion après la 20b. Documenter : scripts perso actifs même sous Scripts Bloqués.
- 20b d115464 acceptée. Fusion jalon-d → jalon-d-fusion 3b0fded (vitest 2030, build OK), poussé. main 9b45b13 rouge Windows : pas fusionné. Lancés : Tâche 22 + relecture finale opus.
