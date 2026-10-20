/** Ajout d'un moteur de recherche personnalisé : validation et identifiant (module pur, partagé par les réglages). */
import type { MoteurPerso } from './types'

/** Ce qu'il faut savoir d'un moteur déjà présent (intégré ou personnalisé) pour éviter les doublons. */
export interface MoteurExistant {
  id: string
  nom: string
  motCle: string
}

export interface SaisieMoteur {
  nom: string
  motCle: string
  url: string
}

export type ResultatMoteur = { ok: true; moteur: MoteurPerso } | { ok: false; champ: keyof SaisieMoteur; message: string }

export const LONGUEUR_MAX_MOT_CLE = 24
const LONGUEUR_MAX_NOM = 100
const LONGUEUR_MAX_URL = 2000

/** Minuscules sans accents, pour comparer des noms. */
const normaliser = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** `https://hôte` suivi de ce qui contient le `%s` : le `%s` ne peut pas être dans le nom d'hôte. */
const ADRESSE = /^https:\/\/([^\s/?#%]+)([/?#]\S*)$/i

function identifiant(nom: string, pris: Set<string>): string {
  const base = `perso-${normaliser(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'moteur'}`
  if (!pris.has(base)) return base
  for (let n = 2; ; n++) if (!pris.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * Valide la saisie du formulaire « Ajouter un moteur ».
 * Nom unique ; mot-clé sans espace, unique (casse ignorée) et sans conflit avec les moteurs intégrés ni les préfixes de la palette (`>`, `?`, `#`) ;
 * adresse https avec un seul `%s` (remplacé par la requête).
 */
export function creerMoteurPerso(saisie: SaisieMoteur, existants: readonly MoteurExistant[]): ResultatMoteur {
  const nom = saisie.nom.trim()
  const motCle = saisie.motCle.trim().toLowerCase()
  const url = saisie.url.trim()
  const refus = (champ: keyof SaisieMoteur, message: string): ResultatMoteur => ({ ok: false, champ, message })

  if (!nom) return refus('nom', 'Donnez un nom au moteur.')
  if (nom.length > LONGUEUR_MAX_NOM) return refus('nom', `Le nom est trop long (${LONGUEUR_MAX_NOM} caractères au plus).`)
  if (existants.some((m) => normaliser(m.nom) === normaliser(nom))) return refus('nom', 'Un moteur porte déjà ce nom.')

  if (!motCle) return refus('motCle', 'Choisissez un mot-clé.')
  if (/\s/.test(motCle)) return refus('motCle', 'Le mot-clé ne peut pas contenir d’espace.')
  if (motCle.length > LONGUEUR_MAX_MOT_CLE) return refus('motCle', `Le mot-clé est trop long (${LONGUEUR_MAX_MOT_CLE} caractères au plus).`)
  if (/^[>?#]/.test(motCle)) return refus('motCle', 'Le mot-clé ne peut pas commencer par >, ? ou # (réservés à la palette).')
  const pris = existants.find((m) => m.motCle.toLowerCase() === motCle)
  if (pris) return refus('motCle', `Le mot-clé « ${motCle} » est déjà utilisé par ${pris.nom}.`)

  const decoupe = ADRESSE.exec(url)
  const marques = url.split('%s').length - 1
  if (url.length > LONGUEUR_MAX_URL || !decoupe || marques !== 1 || !decoupe[2].includes('%s'))
    return refus('url', 'Saisissez une adresse https contenant %s à l’endroit de la requête (ex. https://exemple.fr/?q=%s).')
  try {
    new URL(url.replace('%s', 'test'))
  } catch {
    return refus('url', 'Cette adresse n’est pas valable.')
  }

  return { ok: true, moteur: { id: identifiant(nom, new Set(existants.map((m) => m.id))), nom, motCle, url } }
}
