# Lyra — cycle 2 : passerelles (proxies) pour les sites bloqués

Date : 2026-10-19. Demande de l'utilisateur : « Ajouter des proxies toujours actifs pour les sites interdits dans un réseau, on peut utiliser https://github.com/iplocate/free-proxy-list ». Le reste de ce document est un choix de Claude (consigne de l'utilisateur : « vas-y avec tes propres choix »), à relire.

## 1. Intention

Sur un réseau filtré (entreprise, école, wifi public, pays), certains sites sont bloqués : DNS qui ne répond pas, connexion refusée ou coupée, page de blocage. Lyra doit pouvoir atteindre ces sites **sans réglage manuel à chaque fois** : une fois qu'un site est connu comme bloqué, il passe **toujours** par une passerelle ; les autres sites restent en direct.

Nom dans l'interface : **passerelle** (un proxy), **sites contournés** (la liste des sites qui passent par une passerelle).

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Liste de sites contournés : ajout manuel (réglages, menu ⋯, page d'erreur) et **détection automatique** (activée par défaut) quand un site https échoue avec une erreur typique de blocage réseau.
- Passerelles publiques tirées de `iplocate/free-proxy-list` (MIT, mise à jour toutes les 30 min), **testées** avant usage, les meilleures gardées, **rotation automatique** quand l'une tombe.
- **Passerelle personnelle** (SOCKS5 ou HTTP, hôte, port) : si elle est renseignée, elle est utilisée à la place des publiques.
- Indication claire : la pilule montre quand le site courant passe par une passerelle.

**Non-objectifs (v1 du cycle)** : VPN système, Tor, choix du pays de sortie, authentification par identifiant sur les passerelles publiques, passerelles pour la fenêtre privée (jalon C : même mécanisme sur sa session).

**Anti-objectifs (échec même si « ça marche »)**
- **Exposer le contenu des pages à un inconnu.** Une passerelle publique est opérée par n'importe qui : elle ne doit jamais voir ni modifier le contenu. Règle : par une passerelle publique, **seulement https/wss** (tunnel CONNECT ou SOCKS5 : le chiffrement TLS reste de bout en bout, la passerelle ne voit que le nom du site). Un site `http://` de la liste est refusé avec une explication ; seule une passerelle personnelle peut le porter.
- **Accepter un certificat douteux via passerelle** : une erreur de certificat sur un site contourné n'offre jamais « Continuer quand même ».
- Faire passer par une passerelle autre chose que les sites de la liste (pas de proxy global), ni `lyra://`, `file://`, `localhost`, les adresses privées.
- Envoyer des requêtes réseau quand la fonction ne sert pas : la liste n'est téléchargée et les passerelles testées **que si au moins un site est contourné** (ou au premier blocage détecté en mode automatique).

Avertissement affiché une fois dans les réglages : « Les passerelles publiques sont gérées par des inconnus. Lyra n'y fait passer que des sites chiffrés (https), mais le nom des sites visités leur est visible. Sur un réseau d'entreprise, contourner le filtrage peut être contraire au règlement : à vous de juger. »

## 3. Fonctionnement

### Routage
- `session.setProxy({ mode: 'pac_script', pacScript: 'data:application/x-ns-proxy-autoconfig;base64,…' })` sur `persist:lyra` (et la session par défaut). Le script PAC renvoie, pour un hôte de la liste (et ses sous-domaines) **et** une URL `https:`/`wss:`, la chaîne des passerelles retenues (`SOCKS5 a:b; PROXY c:d; …`, au plus 3) ; `DIRECT` sinon. Pas de `DIRECT` en dernier recours pour un site contourné (sinon on retombe sur le blocage sans le savoir).
- La résolution DNS est faite côté passerelle (SOCKS5 et CONNECT) : les blocages par DNS sont contournés aussi.
- Régénération du PAC (avec `ses.closeAllConnections()` pour ne pas réutiliser une connexion directe) à chaque changement de liste ou de passerelles retenues.

### Passerelles publiques
- Sources (plusieurs, fusionnées et dédoublonnées, pour ne pas dépendre d'une seule liste ; l'utilisateur a demandé « ou une autre source de bons proxies valides ») : `iplocate/free-proxy-list` (`…/main/protocols/socks5.txt`, `…/protocols/https.txt`, MIT, toutes les 30 min), `proxifly/free-proxy-list` (socks5 et http, mise à jour toutes les ~5 min), `monosans/proxy-list` (socks5 et http, vérifiés toutes les heures). URL exactes à vérifier par le constructeur dans les README (fichiers `raw.githubusercontent.com`). Aucune liste gratuite n'est « valide » par nature : c'est **notre propre test** qui décide (voir plus bas). Lignes `IP:port` (préfixe `socks5://`/`http://` accepté), lignes invalides ignorées, IPv4 publiques seulement.
- **Passerelle conseillée, fiable et gratuite** : Cloudflare WARP en mode proxy local (`warp-cli mode proxy`, SOCKS5 sur `127.0.0.1:40000`) — opérateur identifié, chiffré, stable. Les réglages proposent un bouton « Utiliser Cloudflare WARP (127.0.0.1:40000) » qui remplit la passerelle personnelle et la teste ; l'adresse `127.0.0.1` est autorisée pour la passerelle personnelle uniquement.
- (Suite des sources publiques) Cache disque `userData/passerelles.json` ; rafraîchie au plus toutes les 30 min, et seulement si la fonction sert.
- Test : pour un candidat, session mémoire isolée (`session.fromPartition('passerelle-test-…')`, `setProxy({ proxyRules })`) puis `ses.fetch('https://www.gstatic.com/generate_204')` avec délai de 6 s ; succès = statut 204. Jusqu'à 60 candidats testés en parallèle par lots de 15 ; on garde les 5 plus rapides. Re-test des retenues toutes les 10 min et dès qu'un échec est signalé.
- Rotation : si une navigation vers un site contourné échoue (erreur réseau, `ERR_PROXY_CONNECTION_FAILED`, `ERR_TUNNEL_CONNECTION_FAILED`, `ERR_SOCKS_CONNECTION_FAILED`, délai), la passerelle de tête est écartée, le PAC régénéré, la page rechargée (au plus 2 essais), puis page d'erreur « Aucune passerelle ne répond ».

### Détection automatique (activée par défaut)
- Sur `did-fail-load` du cadre principal en `https:` avec un code typique de blocage (`-105` NAME_NOT_RESOLVED, `-101` CONNECTION_RESET, `-102` CONNECTION_REFUSED, `-118`/`-7` TIMED_OUT, `-22` BLOCKED_BY_ADMINISTRATOR, `-109` ADDRESS_UNREACHABLE) et **si le réseau fonctionne** (un test direct vers `https://www.gstatic.com/generate_204` réussit), Lyra essaie le site via passerelle ; si la page se charge, l'hôte est ajouté à la liste (marqué « détecté »), sinon rien n'est ajouté et la page d'erreur s'affiche.
- Pas de détection automatique sur une erreur de certificat (interception TLS d'un pare-feu) : la page d'erreur propose « Passer par une passerelle » (ajout manuel).

### Interface (respecte le design : écran à ajouter au canevas Claude Design avant l'implémentation)
- **Pilule** : quand le site courant passe par une passerelle, une petite icône relais (deux flèches) à gauche du domaine, couleur `#5452C8`, info-bulle « Via une passerelle » ; rien sinon.
- **Menu ⋯** : « Passer par une passerelle pour <hôte> » / « Ne plus passer par une passerelle » (bascule).
- **Page d'erreur** réseau/certificat sur https : bouton « Passer par une passerelle » (ajoute l'hôte, recharge) ; message « Aucune passerelle ne répond » avec « Réessayer ».
- **Réglages → Réseau et identité** (section existante du sommaire) : interrupteur « Passerelles pour les sites bloqués » (activé), interrupteur « Détecter les sites bloqués automatiquement » (activé), liste des sites contournés (hôte, « détecté »/« ajouté », date, retirer ; champ d'ajout), état (« 5 passerelles prêtes · liste du 19/10 14:30 · Tester maintenant »), passerelle personnelle (type SOCKS5/HTTP, hôte, port, « Tester »), l'avertissement ci-dessus.

### Réglages (`Settings.reseau`)
`reseau: { passerelles: boolean (true), auto: boolean (true), sites: Array<{ hote: string, origine: 'auto' | 'manuel', date: number }> (max 500, hôte valide, sans schéma), personnelle?: { type: 'socks5' | 'http', hote: string, port: number } }` — validés par liste blanche comme le reste ; l'import de réglages garde `sites` mais pas `personnelle` (même raison que le dossier de téléchargement).

## 4. Tests
- Unitaires (purs) : lecture des listes (formats, lignes invalides, IP privées rejetées), génération et évaluation du PAC (hôte, sous-domaine, http refusé, lyra/file/localhost/IP privées en DIRECT, chaîne limitée à 3), correspondance d'hôte, choix des codes de blocage, validation des réglages, sélection des meilleures passerelles et rotation.
- E2E : une passerelle HTTP CONNECT **locale** lancée par le test (Node `http.createServer` + événement `connect`) déclarée comme passerelle personnelle ; un site https de la liste (`https://example.com`, étiqueté `@reseau`) passe par elle (le serveur compte le CONNECT) et la pilule montre l'icône ; un site hors liste ne passe pas par elle ; un site `http://` de la liste est refusé avec le message ; réglages : ajout/retrait d'un site ; page d'erreur : bouton « Passer par une passerelle » présent pour une erreur réseau https (domaine `.invalid`).

## 5. Laissé au constructeur
Noms de fichiers et découpage (proposé : `src/main/passerelles/{liste,pac,testeur,Passerelles}.ts`), parallélisme exact des tests, libellés secondaires, icône relais (trait, 14 px).
