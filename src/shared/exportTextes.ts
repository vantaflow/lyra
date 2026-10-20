/** Textes de l'export / de l'import de fichiers, partagés entre le processus principal et la page de réglages. */

/** Phrase de passe fausse, fichier tronqué ou modifié : on ne les distingue pas (et rien n'est écrit). */
export const ERREUR_PHRASE = 'Phrase de passe incorrecte ou fichier endommagé'

/** Mots de passe : rangée « Mots de passe » de la page d'import (indisponible en v1). */
export const MESSAGE_MOTS_DE_PASSE = 'Lyra ne stocke pas de mots de passe. Exportez-les depuis le navigateur d’origine vers votre gestionnaire.'

/** Pourquoi les mots de passe ne sont pas importables d'un navigateur (Chromium les chiffre avec le système). */
export const DETAIL_MOTS_DE_PASSE = 'Les mots de passe de Chrome, Edge, Brave et Vivaldi sont chiffrés par le système : Lyra ne les lit pas.'

/** Longueur minimale d'une phrase de passe de paquet. */
export const PHRASE_MIN = 8
