# Lyra — plan du cycle 2 : passerelles pour les sites bloqués

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** les sites de la liste « contournés » passent toujours par une passerelle (proxy) testée, les autres en direct ; détection automatique des sites bloqués ; passerelle personnelle (dont Cloudflare WARP) ; interface conforme à `docs/design/project/Passerelles.dc.html`.

**Architecture:** module `src/main/passerelles/` : logique pure (`liste.ts`, `pac.ts`, `selection.ts`, `blocage.ts`) testée en vitest ; `testeur.ts` (sessions mémoire isolées + `ses.fetch`) ; `Passerelles.ts` (orchestration : sources, cache, pool, PAC sur les sessions, rotation, détection) ; IPC `passerelles:*` ; UI : pilule, menu ⋯, page d'erreur, page de réglages « Réseau et identité ».

**Spec:** `docs/superpowers/specs/2026-10-19-lyra-design-cycle2.md` (fait foi) ; design : `docs/design/project/Passerelles.dc.html`.

## Global Constraints
- Passerelle **publique** : uniquement `https:`/`wss:` ; jamais `http:`, `lyra:`, `file:`, localhost, IP privées (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7). Pas de `DIRECT` en repli pour un site contourné.
- Erreur de certificat sur un site contourné : jamais « Continuer quand même ».
- Aucune requête (listes, tests) tant qu'aucun site n'est contourné et qu'aucune détection n'est déclenchée.
- Réglages `Settings.reseau` validés par liste blanche ; import : garde `sites`, ignore `personnelle`.
- Tous les handlers IPC via `handle` (expéditeur vérifié). Tests sur Windows **et** macOS (chemins via `node:path`, pas de `/` en dur).
- Commits en français, un par tâche, push par le contrôleur. Fin de message de commit : `Claude-Session: https://claude.ai/code/session_014rF1oHCSDeDLpfg5ceCFns`.

## Review Focus
1. Un site `http://` ajouté à la liste ne doit jamais passer par une passerelle publique → test tâche 1 (PAC) et e2e tâche 4.
2. Toutes les passerelles mortes → page « Aucune passerelle ne répond », pas de boucle de rechargement → tâche 3.
3. Un site simplement en panne ne doit pas être ajouté automatiquement → tâche 3 (ajout seulement si le chargement via passerelle réussit).
4. Liste source corrompue / vide / hors ligne → pas de crash, état « Aucune passerelle » → tâche 2.
5. Sous-domaines : `old.reddit.com` couvert par `reddit.com` ; `notreddit.com` ne l'est pas → tâche 1.

### Task 1 : logique pure et réglages
**Files:** `src/main/passerelles/{liste,pac,selection,blocage}.ts` + tests ; `src/shared/types.ts` (`Settings.reseau`), `src/main/settings/{defaults,validate,import}.ts` + tests.
- `lireListe(texte, protocole): Candidat[]` (`{ type: 'socks5'|'http', hote, port }`, IPv4 publiques, dédoublonnage) ; `fusionner(...listes)`.
- `hoteCouvert(hote, sites): boolean` (égal ou sous-domaine, insensible à la casse, point final ignoré).
- `genererPac(sites, chaine: Candidat[]): string` (corps PAC) et `pacDataUrl(pac)` ; `regleProxy(c)` → `SOCKS5 h:p` / `PROXY h:p` ; chaîne max 3 ; évaluation testée en exécutant la fonction PAC avec des stubs (`dnsDomainIs` non utilisé : la logique est écrite en JS pur dans le script).
- `estCodeBlocage(code): boolean` (-105, -101, -102, -118, -7, -22, -109) ; `estEchecPasserelle(code)` (-130 PROXY_CONNECTION_FAILED, -111 TUNNEL_CONNECTION_FAILED, -120 SOCKS_CONNECTION_FAILED, -118, -7).
- `meilleures(resultats, n=5)` (succès triés par latence) ; `ecarter(pool, candidat)`.
- Réglages : `reseau: { passerelles: true, auto: true, sites: [], personnelle?: {type, hote, port} }` ; validation (hôte via regex de domaine, max 500 sites, port 1-65535, `personnelle.hote` : domaine, IPv4, ou `127.0.0.1`) ; import ignore `personnelle`.

### Task 2 : testeur, sources et cache
**Files:** `src/main/passerelles/{testeur,sources}.ts` + tests (sources : `fetch` injecté).
- Sources : URL exactes vérifiées dans les README de `iplocate/free-proxy-list`, `proxifly/free-proxy-list`, `monosans/proxy-list` (socks5 + http/https) ; `chargerCandidats({ fetch, cacheFichier, maintenant })` : cache `userData/passerelles.json` 30 min, une source en échec n'empêche pas les autres, tout en échec → cache périmé, sinon `[]`.
- `testerPasserelle(c, { timeoutMs=6000, cible='https://www.gstatic.com/generate_204' })` → `{ ok, ms }` via `session.fromPartition('passerelle-test-<n>')` (mémoire) + `setProxy({ proxyRules })` + `ses.fetch` ; session nettoyée.
- `trouverPasserelles(candidats, { parallele=15, max=60, garder=5 })`.
- Env de test : `LYRA_PASSERELLES_SOURCES` (liste d'URL `file://` ou `http://127.0.0.1`) remplace les sources ; `LYRA_PASSERELLES_CIBLE` remplace la cible de test.

### Task 3 : orchestration, sessions, détection, rotation
**Files:** `src/main/passerelles/Passerelles.ts`, câblage `src/main/index.ts`, `src/main/tabs/comportements.ts` (did-fail-load), `src/main/tabs/erreurs.ts` (types `passerelles` et bouton), certificat (`index.ts`), IPC `passerelles:etat|ajouter|retirer|basculerSite|tester|personnelle|warp`, événement `passerelles:changed`, `etats[id].viaPasserelle` dans `sky:changed`.
- Pool : passerelle personnelle si définie (testée, sinon état « injoignable »), sinon publiques testées ; re-test toutes les 10 min tant que des sites sont contournés.
- PAC appliqué à `persist:lyra` et `session.defaultSession` à chaque changement + `closeAllConnections()`.
- Détection auto (§3 de la spec) et rotation (2 essais max puis page « Aucune passerelle ne répond »).
- Certificat sur site contourné : page de type certificat **sans** « Continuer quand même » ; avec bouton « Passer par une passerelle » quand le site n'est pas encore contourné.
- Tests unitaires de la machine à états (détection, rotation) avec dépendances injectées.

### Task 4 : interface et e2e
**Files:** `src/renderer/ui/Capsule.tsx` (icône relais), `src/renderer/ui/MenuPanel.tsx` (bascule), `src/renderer/erreur/main.tsx` (bouton), `src/renderer/settings/Reseau.tsx` + routage `#/reseau` + entrée du sommaire, CSS ; `tests/e2e/passerelles.spec.ts`.
- Fidélité au design `Passerelles.dc.html` (valeurs, libellés, avertissement mot pour mot).
- E2E (spec §4) : passerelle HTTP CONNECT locale lancée par le test (Node `http.createServer` + `connect`), déclarée personnelle ; `https://example.com` dans la liste → CONNECT compté et icône relais dans la pilule (`@reseau`) ; site hors liste → pas de CONNECT ; `http://example.com` en liste → refus expliqué ; ajout/retrait dans les réglages ; erreur réseau https (`https://bloque.invalid`) → bouton « Passer par une passerelle ».
