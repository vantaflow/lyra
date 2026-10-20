# SDD ledger — plan: docs/superpowers/plans/2026-10-19-lyra-jalon-c.md
Contrôleur : session c72a5410 (Mac), reprise du jalon C à la tâche 4 ; tâches 1-3 faites et approuvées par la session Windows (voir docs/superpowers/ETAT.md, commits 60487c0..093e543).
Ruling: le travail se fait sur `main` (pas de worktree) — le plan et RELAIS.md placent le jalon C sur main et la session principale (projects-3c) l'a demandé explicitement ; coût si faux : un main instable, atténué par la CI à chaque push et des commits par tâche relus.
Ruling: tâches 1-3 non re-dispatchées — ETAT.md les déclare approuvées après relectures ; coût si faux : un défaut hérité, que la relecture finale de branche doit attraper.

## Pré-vol (tâches 4 et 5)
| Paire / tâche | Produit vs consommé | Constat |
|---|---|---|
| 4 ↔ 5 | 4 crée la fenêtre privée (partition `privee-<id>`, crochets `privee`) ; 5 refuse les IPC `passerelles:ajouter/basculerSite` depuis une fenêtre privée | cohérent : 5 s'appuie sur `privees` (index.ts) que 4 étend ; pas de contradiction |
| 4 ↔ contraintes | « computeLayout seule source des bounds » ; une fenêtre privée réutilise WindowManager/computeLayout | cohérent |
| 4 seule | tests e2e : cookie privé absent de la fenêtre normale et de la privée suivante ; historique non écrit ; session non restaurée | cohérent avec `privees` exclues de `sauverSession` (déjà en place) ; `clearStorageData` à la fermeture à ajouter |
| 5 seule | mélange de restes (cycle 2, Dnd, tests instables) : tous indépendants | cohérent, batchable en un dispatch |
Ruling: Review Focus 4 exige « partition non persistante distincte par fenêtre privée » ; le plan dit `privee-<id>` : chaque fenêtre privée a sa propre partition mémoire (pas `persist:`), détruite (`clearStorageData`) à la fermeture — coût si faux : deux fenêtres privées qui ne partagent pas leurs cookies, comportement voulu par la spec.

## Journal
- 20:43 Task 4: implémenteur dispatché (sonnet), BASE 61e5c1d
- CI 61e5c1d : Windows vert, macOS rouge sur ne-pas-deranger.spec.ts:81 (Échap par fenetre.keyboard.press dans la vue chrome cachée, non reçu ; instable). Correction prévue après la tâche 4 : émettre le keydown Escape sur window de la vue chrome via evaluate.
- Task 4: implémenteur DONE_WITH_CONCERNS (4d6bab8, typecheck OK, vitest 404, e2e fenetre-privee 7/7). Concern retenu avant relecture : shields:toggleSite écrivait sites[] depuis une fenêtre privée → implémenteur repris. Autres concerns (overlay sans Aurore, lecture seule des réglages par le preload Dnd) laissés à la relecture.
- CI: correction Échap (useLayoutEffect dans Rappel.tsx + test) commitée sur main, non poussée tant que la tâche 4 n'est pas approuvée (sinon du code non relu partirait sur main). Spec ne-pas-deranger 8/8 deux fois sur trois ; le passage restant a expiré au lancement (machine chargée), pas sur ce test.
- Task 4: relecture 61e5c1d..698ffa0 → Needs fixes. Important : (1) téléchargements privés écrits dans telechargements.json avec leur URL ; (2) repli silencieux sur persist:lyra si ⌘⇧N arrive avant equiperSessionPrivee (index.ts:164/576/598/608) ; (3) recherche dans la page désactivée en privé (Capsule.tsx:51/146).
Ruling: Focus 4 « aucun réglage écrit » s'entend des traces de navigation et des règles par site ; les réglages globaux changés explicitement depuis une fenêtre privée (moteur, ciel, lyra://settings) restent permis, comme dans Chrome et Firefox — coût si faux : une fenêtre privée peut modifier une préférence globale, sans fuite de navigation.
- Task 4: minor (deferred): « souvenir » de l'invite de permission proposé en privé mais ignoré (PermissionPrompt.tsx:83-86).
- Task 4: minor (deferred): void equipement.then(...) sans catch (index.ts:204).
- Task 4: minor (deferred): nouvel onglet retombe sur setPrivee(false) si l'IPC échoue (newtab/main.tsx:188), repli ouvert.
- Task 4: minor (deferred): LyraWindow.privee jamais lu, doublon de privees (WindowManager.ts:16/164).
- Task 4: minor (deferred): exceptions de certificat globales, survivent à la fenêtre privée (index.ts:232).
- Task 4: minor (deferred): test « après fermeture » ne prouve pas clearStorageData ; pas d'e2e Boucliers ni UA en session privée.
- Task 4: minor (deferred): texte du bandeau « Historique, cookies et session sont effacés à la fermeture. » inexact (newtab/main.tsx:87) ; .pn-sous imbriqué (ShieldsPanel.tsx:61).
- Task 4: fix round 1 dispatché (reprise de l'implémenteur), FIX_BASE 698ffa0
- Task 4: fix round 1 livré 6bf2b4f (téléchargements privés hors disque, partition privée sans condition + équipement attendu, recherche active en privé) ; pas de test du chemin ⌘⇧N précoce (non reproductible sans fenêtre visible).
Ruling: un téléchargement privé n'apparaît dans aucun panneau, même pas celui de sa fenêtre privée — accepté en v1, le fichier reste dans le dossier de téléchargements — coût si faux : « Ouvrir »/« Afficher » indisponibles pour un téléchargement privé (à améliorer par une liste en mémoire propre à la fenêtre).
- Task 4: fix round 1/5 (3 addressed, 0 open; commits 698ffa0..6bf2b4f)
- Task 4: minor (deferred): equipementPret.then(equiper) sans catch (index.ts:165/208), fenêtre vide sans message si l'équipement échoue.
- Task 4: minor (deferred): équipement séquentiel non atomique ; appliqué même si la fenêtre est fermée pendant l'attente (index.ts:612-621).
- Task 4: minor (deferred): Downloads.enCours() compte les téléchargements privés (avertissement de fermeture seulement, Downloads.ts:113).
- Task 4: minor (deferred): un tabs:open très précoce pourrait atteindre la session privée avant son équipement (fenêtre de quelques ms, hors diff).
- Task 4: complete (commits 61e5c1d..6bf2b4f, review clean)
- 03:10 Task 5: brief complété par la liste de ETAT.md ; BASE 2b71e5d
- CI 2b71e5d : Windows vert, macOS rouge sur fenetre-privee.spec.ts:179 (zoom avant validation de la page) → test corrigé 78beb7e, non poussé (tâche 5 en cours).
- Task 5: implémenteur DONE_WITH_CONCERNS (11c1e5c..fdf0b89, 9 commits ; vitest 413, e2e 85/85). Concerns : cause passerelles :88/131 identifiée par lecture (PAC appliqué interrompt la navigation), about:blank initiale non couverte, rappel 720 px fixe.
- Task 5: relecture 2b71e5d..fdf0b89 → Needs fixes. Important : ombre du rappel changée (theme.css:873, 0 4px 12px) au lieu de 0 10px 30px rgba(10,10,40,.25) du design (NePasDeranger.dc.html:22).
Ruling: la largeur fixe de 720 px du rappel (Minor 2 du relecteur) entre dans la ronde — la puce « zone de la vue chrome qui bloque les clics » n'est pas tenue tant qu'une bande de ~250 px bloque encore — coût si faux : une ronde un peu plus longue.
Ruling: `passerelles:retirer` depuis une fenêtre privée entre aussi dans la ronde (règle par site, couverte par la décision « aucune règle par site écrite en privé ») ; `personnelle` et `warp` restent permis (réglages globaux, ruling de la tâche 4) — coût si faux : refus d'une action de menu en privé.
- Task 5: minor (deferred): pacApplique() sans délai maximal (Passerelles.ts:488-490).
- Task 5: minor (deferred): assertion faible veilles().length === 2 (Passerelles.test.ts:455-456).
- Task 5: minor (deferred): surReprise ne recalcule pas minuterieRappel (Dnd.ts:200-212).
- Task 5: minor (deferred): iframe about:blank initiale sans preload ni preuve e2e ; historique.spec.ts:33 et passerelles :88/131 corrigés sans reproduction locale (à surveiller en CI).
- Task 5: fix round 1 dispatché, FIX_BASE fdf0b89
- Task 5: fix round 1/5 (3 addressed, 0 open; commits fdf0b89..e59f27b) ; vitest 414/414 (contrôleur)
- Task 5: complete (commits 2b71e5d..e59f27b, review clean)
- Relecture finale 60487c0..e59f27b : With fixes. 1 Important (permissions normales lues par Ne pas déranger en fenêtre privée) + README + mineurs 3, 4, 5 + reports « à corriger avant de clore » (case souvenir, catch de l'équipement, délai maximal de pacApplique, repli newtab fermé). e2e complet 85/85 sur e59f27b (contrôleur).
Ruling: mineur n°6 de la relecture finale (palette privée qui propose l'historique et les favoris du profil normal) reporté au jalon D — lecture seule, rien n'est écrit, comportement défendable — coût si faux : une fenêtre privée affiche des suggestions du profil normal.
Ruling: mineur n°7 (attribution) acté — les commits de la session d'aide portent sa propre ligne Claude-Session (…01QuTzj…), imposée par son harness, au lieu de celle des Global Constraints (…014rF1…) — coût si faux : aucune incidence fonctionnelle.
Ruling: téléchargement privé absent de tout panneau maintenu pour la fusion ; une liste en mémoire propre à la fenêtre privée est à faire avant une release (noté dans ETAT.md) — coût si faux : aucun retour visuel pour un téléchargement privé.
- Vague de corrections finale dispatchée (brief final-fix-brief.md), FIX_BASE e59f27b
- Vague finale : 9/9 addressed (12fa69e), re-relecture propre ; vitest 416, e2e complet 89/89 (implémenteur).
- Final: minor (deferred): commentaire de validerSettings déplacé au-dessus de largeurRamenee (validate.ts:272) ; ciel déjà révélé au survol au moment d'entrer en Ne pas déranger non couvert par le correctif ⌘\ (WindowManager.setDnd).
- Jalon C : complet (60487c0..12fa69e)
