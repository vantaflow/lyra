# Vague jalon-d-vague-main : état (pause)

## Fait
- Reprise à bca1161. Local : typecheck OK, vitest 2066/2066. Aucun e2e local.
- CI : les specs ajoutés par la vague n'avaient jamais tourné en CI. Correctifs de tests (e2e seulement, aucun code produit) :
  apparence (icône du nouvel onglet, sondages), sites (contre-épreuve scripts par IPC), raccourcis (clic direct, délai), théma-tokens (référence macOS seulement, ignorée ailleurs), fenetre-privee (délai témoin), extensions-regle-site (poignée de page reprise après rechargement), theme (attente couleur du site 20 s).
- Dernier run 39507650007 : macOS vert ; Windows 219 passés, 1 échec.

## Reste
- Windows : theme.spec.ts:113 « Le ciel prend la teinte du site actif » : `etats[].couleur` n'apparaît pas même avec 20 s (la teinte vient du favicon/theme-color, lu via le cache, à vérifier sous Windows : probablement un vrai écart de comportement, pas un délai).
- Puis relancer la CI pour obtenir macOS + Windows verts.
- « La liste » de la vague : introuvable dans mon contexte (pas de fichier dans le dépôt) ; non traitée au-delà des correctifs CI.
