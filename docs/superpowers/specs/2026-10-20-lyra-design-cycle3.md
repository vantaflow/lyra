# Lyra — cycle 3 : ce qui manquait face aux navigateurs courants

Date : 2026-10-20. Demande de l'utilisateur : « Ajoute ce qui manque sauf la signature & boutique et version mobile ». Cette demande **lève trois « jamais » de la spec principale** (`2026-10-19-lyra-design.md` §2) : le gestionnaire de mots de passe intégré, la synchronisation et le compte utilisateur. Les autres « jamais » restent (fork de Chromium, boutique d'extensions, mobile), ainsi que la signature (hors v1, pas de certificat). Les choix ci-dessous ont été faits par la session d'aide, l'utilisateur lui ayant délégué les décisions ; ils sont tous réversibles et listés dans le plan.

Principe inchangé : **« Aucune donnée ne quitte cet ordinateur »**, sauf les usages réseau listés et désactivables dans « Réseau et identité ». Ce cycle en ajoute trois, chacun désactivable : la vérification des mises à jour, le téléchargement des modèles de traduction et la synchronisation (qui n'écrit que dans un dossier choisi par l'utilisateur, chiffré de bout en bout).

## 1. Mises à jour automatiques

- `electron-updater`, source : les releases GitHub du dépôt `vantaflow/lyra` (provider `github`, `latest.yml` / `latest-mac.yml` publiés par la CI).
- **Windows (NSIS)** : vérification au démarrage puis toutes les 6 h ; téléchargement en arrière-plan ; « Redémarrer pour mettre à jour » dans le menu ⋯ et une pastille sur le bouton ⋯ ; installation à la fermeture sinon.
- **macOS** : sans signature, Squirrel.Mac refuse d'installer. Lyra vérifie, puis propose « Télécharger la version X » (ouvre la page de la release dans une étoile) ; jamais d'installation silencieuse.
- Réglage dans « Réseau et identité » : « Vérifier les mises à jour de Lyra » (activé par défaut, toutes les 6 h). « À propos » affiche la version et l'état.
- CI : sur un tag `v*`, un job publie les paquets non signés et les fichiers `latest*.yml` dans une release GitHub **brouillon** (publication manuelle par l'utilisateur).

## 2. Coffre chiffré (base des mots de passe, adresses, cartes)

- Un seul fichier `userData/coffre.lyra-coffre` : contenu JSON chiffré AES-256-GCM (Web Crypto), IV neuf à chaque écriture, écriture atomique.
- Clé de 256 bits tirée au hasard à la création, **protégée par `safeStorage`** (Trousseau macOS, DPAPI Windows). Si `safeStorage` n'offre qu'un stockage en clair (`basic_text`/`unknown`), le coffre exige une phrase de passe (PBKDF2-SHA-256 600 000) à chaque démarrage.
- **Code de déverrouillage** (facultatif pour les mots de passe, obligatoire pour les cartes) : 6 caractères minimum, dérivé par PBKDF2, demandé pour afficher un mot de passe en clair, exporter, et pour toute utilisation d'une carte. Sur macOS, Touch ID (`systemPreferences.promptTouchID`) remplace le code quand il est disponible. Verrouillage après 5 min d'inactivité.
- Jamais en fenêtre privée : remplissage permis, enregistrement jamais proposé.

## 3. Mots de passe

- Détection par le preload `page` : formulaire contenant un champ `password` ; à l'envoi (submit, ou navigation après un clic sur un bouton du formulaire), proposition « Enregistrer le mot de passe pour <site> ? » dans l'overlay (Enregistrer · Jamais pour ce site · Plus tard). Mise à jour proposée si l'identifiant existe avec un autre mot de passe.
- Remplissage : au focus d'un champ identifiant ou mot de passe d'une origine connue, une liste déroulante discrète (dans l'overlay, ancrée au champ) propose les comptes ; un clic remplit. Correspondance par **origine exacte** (schéma + hôte + port), plus les sous-domaines enregistrés explicitement ; jamais de remplissage dans une iframe d'une autre origine, jamais sur `http:` sans avertissement.
- Générateur : 20 caractères, lettres, chiffres, symboles, proposé sur un champ `autocomplete="new-password"`.
- Page `lyra://motsdepasse` (route des réglages) : recherche, liste, afficher (code), copier, modifier, supprimer, « Jamais pour ce site », **import CSV** (formats Chrome, Firefox, Bitwarden, 1Password : en-têtes `name,url,username,password[,note]` reconnus), **export CSV** (avertissement « fichier non chiffré », code exigé).
- Import depuis les autres navigateurs : par leurs exports CSV (la page explique comment les obtenir). La ligne « Mots de passe » de « Importer et exporter » renvoie vers cet import.

## 4. Remplissage automatique : adresses et cartes

- Adresses : nom, organisation, adresse (lignes, ville, code postal, pays), téléphone, e-mail ; enregistrées à l'envoi d'un formulaire qui en contient (proposition comme pour les mots de passe) ; remplies via les attributs `autocomplete` standard (`name`, `given-name`, `address-line1`, `postal-code`, `country`, `tel`, `email`…) et, à défaut, par une heuristique sur `name`/`id`/libellé en français et en anglais.
- Cartes : titulaire, numéro (vérification de Luhn), mois et année d'expiration ; **le cryptogramme (CVC) n'est jamais enregistré**. Remplissage seulement après déverrouillage (code ou Touch ID) et seulement sur `https:`. Affichage masqué « •••• 4242 ».
- Page « Remplissage automatique » dans les réglages (section Confidentialité) : listes, ajout, modification, suppression ; interrupteurs « Proposer d'enregistrer les adresses » et « … les cartes » (activés).

## 5. Mode lecture

- `@mozilla/readability` exécuté dans un monde isolé de la page ; si un article est détecté, une icône « Mode lecture » apparaît dans la pilule de la capsule ; ⌘ ⇧ R (Ctrl+Maj+R) bascule.
- La lecture s'affiche dans `lyra://lecture` (même étoile, retour par Échap ou l'icône) : titre, auteur, temps de lecture, texte nettoyé (sanitisé : aucun script, aucun style de la page), réglages en tête (taille, police Instrument Serif / Manrope, largeur, thème clair / sépia / sombre), mémorisés.

## 6. Aperçu de lien

- Alt+clic (⌥+clic) sur un lien, ou appui long de 500 ms : panneau flottant (overlay) de 70 % × 80 % de la page, avec la page chargée dans une vue dédiée (même session que l'étoile), barre « Ouvrir en étoile » · « Ouvrir à côté » · « Fermer ». Échap, clic hors du panneau ou ⌘ W ferment. Jamais d'historique pour un aperçu fermé sans ouverture.

## 7. Profils multiples

- Un profil = un dossier `userData/profils/<id>/` (réglages, historique, favoris, session, coffre, extensions) et une partition `persist:profil-<id>` ; le profil existant devient « Principal » (`persist:lyra` et la racine de `userData` restent les siens : aucune migration de données).
- Chaque fenêtre appartient à un profil ; « Nouvelle fenêtre » ouvre le profil de la fenêtre courante ; menu ⋯ « Profils » : changer, nouveau profil (nom, couleur parmi `PALETTE_CONSTELLATIONS`), et section « Sauvegarde et profils » des réglages (liste, renommer, couleur, supprimer avec confirmation). Couleur du profil : pastille dans le pied du ciel.
- Les Boucliers, les passerelles, les extensions (si elles sont activées pour le profil) et les permissions s'attachent à chaque partition de profil comme à `persist:lyra`.

## 8. Listes de filtres personnalisées

- Section Boucliers : « Listes personnelles » : ajouter une liste par adresse `https:` (format Adblock/uBO), activer, retirer, date de mise à jour ; « Mes règles » : zone de texte (règles réseau et cosmétiques, 1 Mo max) ; validation par le moteur Ghostery avant d'enregistrer (règles invalides comptées et listées) ; mises à jour avec les autres listes (même cache, même rotation).

## 9. Gestes à la souris

- Glisser avec le bouton droit enfoncé dans la page (au moins 30 px) : ← précédent, → suivant, ↑ haut de la page, ↓ nouvelle étoile, ↓→ fermer l'étoile, ↑↓ recharger ; trace dessinée pendant le geste ; un clic droit sans glisser ouvre le menu contextuel comme avant. Réglage « Gestes à la souris » dans « Gestes et souris » (désactivé par défaut) ; jamais sur macOS avec un trackpad en clic secondaire à deux doigts (le geste exige un déplacement avec le bouton maintenu).

## 10. Traduction de pages

- Locale, **sans service en ligne** : Bergamot (moteur de Firefox Translations, `@browsermt/bergamot-translator` en WASM) dans un `utilityProcess`. Modèles téléchargés à la demande depuis le dépôt public de Mozilla (une paire ≈ 15-40 Mo, vérifiée par empreinte SHA-256, mise en cache dans `userData/traduction/`), langues FR, EN, ES, DE, IT, PT, NL, PL, CS, ET, UK, RU via l'anglais en pivot.
- Détection de la langue de la page (`<html lang>` puis détecteur JS local) ; si elle diffère de la langue de l'interface, icône « Traduire » dans la pilule ; panneau : langue source, cible, « Toujours traduire <langue> », « Jamais pour ce site » ; texte traduit nœud par nœud dans un monde isolé, « Afficher l'original » rétablit la page.
- Réglage dans « Réseau et identité » : « Télécharger les modèles de traduction quand j'en ai besoin » (activé ; désactivé = traduction indisponible, le dit).

## 11. Synchronisation et compte

- **Pas de serveur Lyra** : la synchronisation passe par un **dossier choisi** (iCloud Drive, OneDrive, Dropbox, disque réseau…) que les appareils partagent. Le « compte » est l'**identité de synchronisation** : un nom d'appareil et une **phrase de synchronisation** (PBKDF2-SHA-256 600 000 → clé AES-256-GCM), saisie une fois par appareil et gardée par `safeStorage`.
- Contenu : chaque appareil écrit son propre journal chiffré `lyra-sync/<appareil>/<n>.lyrasync` (lots de changements horodatés par une horloge hybride, dernier écrit gagnant par élément, suppressions marquées) ; il lit ceux des autres. Rien en clair dans le dossier (noms de fichiers compris, sauf l'identifiant d'appareil aléatoire).
- Éléments, cochables : favoris, historique (90 derniers jours), réglages et règles par site, moteurs personnels, thèmes, liste des extensions, **onglets ouverts des autres appareils** (affichés dans la palette et la page Nouvel onglet : « Sur <appareil> »), mots de passe et remplissage automatique (**décochés par défaut**, exigent le code du coffre).
- Section « Synchronisation » (dans « Sauvegarde et profils ») : choisir le dossier, phrase, nom de l'appareil, éléments, appareils connus (oublier un appareil), dernière synchronisation, « Synchroniser maintenant ». Mauvaise phrase sur un dossier déjà utilisé → refus clair, rien d'écrit.
- Par profil : chaque profil a sa propre synchronisation (ou aucune).

## 12. Limites honnêtes (dites dans l'interface)

Mises à jour silencieuses impossibles sur macOS sans signature ; Touch ID seulement sur macOS (Windows Hello indisponible dans Electron : code du coffre) ; traduction moins bonne qu'un service en ligne et limitée aux paires disponibles ; synchronisation dépendante du dossier partagé (délais du service de fichiers, conflits résolus par « dernier écrit gagne ») ; aucune récupération possible si la phrase de synchronisation ou le code du coffre est perdu.
