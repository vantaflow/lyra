# Lyra — plan du jalon C : ciel repliable et déplaçable, Ne pas déranger, fenêtre privée

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** le ciel se replie (rail + révélation au survol, ⌘ \), se place à gauche/droite/haut/bas ; mode Ne pas déranger ; vraie fenêtre privée. Décision de l'utilisateur (2026-10-19) : tout doit être dans la première version.

**Spec:** `docs/superpowers/specs/2026-10-19-lyra-design.md` §4 (Le ciel, Ne pas déranger, comportements), §5 (WindowManager, Dnd, sessions), §9 réponse 11. **Design (fait foi) :** `docs/design/project/{CielMasque,CielDroite,CielHaut,CielBas,NePasDeranger}.dc.html` et `Parametres.dc.html` (section « Le ciel et l'apparence » : position, révélation au survol, largeur).

## Global Constraints
- Respect strict du design validé (valeurs, libellés, icônes copiées des `.dc.html`).
- Pas de régression : toutes les suites restent vertes ; e2e en arrière-plan (fenêtres cachées sous `LYRA_TEST`).
- Chemins portables ; commits en français terminés par `Claude-Session: https://claude.ai/code/session_014rF1oHCSDeDLpfg5ceCFns` ; push par le contrôleur.
- `computeLayout` (src/main/window/layout.ts) est la seule source des bounds.

## Review Focus
1. Ciel masqué : la page occupe tout sauf le rail de 14 px ; le ciel révélé passe **par-dessus** la page (overlay ou vue chrome au sommet) et se retire quand la souris le quitte, sans clignoter.
2. Changement de position à chaud : aucun onglet rechargé, bounds corrects immédiatement.
3. Ne pas déranger : une notification web pendant le mode n'apparaît pas, elle est livrée à la sortie ; une popup est retenue ; Échap / croissant / ⌘⇧D sortent.
4. Fenêtre privée : partition non persistante distincte par fenêtre privée (aucun cookie/historique/session/favori/réglage écrit), thème Aurore, `lyra://newtab` variante privée, passerelles/Boucliers actifs, aucune trace après fermeture.
5. Restauration de session : la position du ciel et l'état replié sont restaurés ; les fenêtres privées ne le sont jamais.

### Task 1 : replier le ciel (priorité de l'utilisateur)
Bouton « Replier le ciel » (Sky.tsx) et ⌘ \ (menu) → `ciel.masque` ; rail 14 px avec poignée or ; survol du rail (ou ⌘ \ en mode masqué) → le ciel glisse par-dessus la page (bord collé, ombre `14px 0 44px rgba(10,10,40,.38)`, coins `0 12px 12px 0`, design `CielMasque.dc.html`) ; se retire à la sortie de la souris (délai 300 ms) ; bouton « Épingler le ciel » dans le ciel révélé (= démasquer) ; réglage « Révéler le ciel masqué au survol du bord ». Tests : computeLayout masqué, e2e (bouton → page.x = 14 ; survol simulé → ciel visible ; ⌘ \ bascule).

### Task 2 : positions droite / haut / bas
`ciel.position` : droite (miroir), haut/bas (bande 56 px : étoiles en ligne, enfants en petits points reliés, groupes en libellés — design `CielHaut/CielBas.dc.html`) ; réglage (`Parametres.dc.html`, vignettes Gauche/Droite/Haut/Bas/Masqué) ; commande de palette « Déplacer le ciel à … » ; glisser l'en-tête du ciel vers un bord ; largeur réglable (200-420, poignée de redimensionnement). Tests unitaires layout + e2e par position.

### Task 3 : Ne pas déranger
⌘⇧D, croissant du pied du ciel, commande de palette (30 min, 1 h, jusqu'à l'arrêt) ; chrome et capsule masqués, page plein cadre ; rappel en haut à droite (design `NePasDeranger.dc.html`) qui s'efface et laisse le croissant ; notifications : surcharge de `window.Notification` par le preload page (file, livrées à la sortie) + permission `notifications` traitée comme « retenue » ; popups (`window.open` avec features) retenues et comptées ; exceptions par site (`settings.sites[o].exceptionDnd`). Tests unitaires de la file + e2e (notification retenue puis livrée, Échap).

### Task 4 : fenêtre privée
`creerFenetre({ privee: true })` : partition `privee-<id>` non persistante par fenêtre (pas `persist:lyra`) avec Boucliers, passerelles (même PAC, sans détection ni écriture), permissions, téléchargements, lyra://, UA ; historique, session, favoris, zoom/permissions par site jamais écrits ; thème Aurore (`#2A1540` pour le ciel) ; `lyra://newtab` variante privée (sans constellations ni sites fréquents ni compteur, bandeau « Fenêtre privée ») ; ⌘⇧N et menu ⋯ « Fenêtre privée » actifs ; à la fermeture, `clearStorageData` de la partition. Tests e2e (cookie posé en privée absent de la fenêtre normale et de la privée suivante ; historique non écrit ; session non restaurée).

### Task 5 : restes du cycle 2 et finition
Réarmer la veille du proxy système après un échec de `setProxy` ; `ajouter()` lève le délai de grâce ; IPC `passerelles:ajouter/basculerSite` refusés depuis une fenêtre privée ; e2e `historique.spec.ts:33` stabilisé. README et ETAT.md à jour.
