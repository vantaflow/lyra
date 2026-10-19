import type { Settings } from '../../shared/types'
import { langueActive } from '../../shared/i18n'

/** Réglages par défaut ; le dossier de téléchargements est fourni par l'appelant. */
export function reglagesParDefaut(dossierTelechargements: string): Settings {
  return {
    version: 1,
    langue: langueActive(),
    theme: 'systeme',
    moteurParDefaut: 'duckduckgo',
    moteurChoisi: false,
    ciel: { position: 'gauche', largeur: 272, masque: false, revelerAuSurvol: true, deplacerParGlisser: true, ternirApresMin: 30, endormirApresMin: 120 },
    boucliers: { niveau: 'standard', genes: false, majHeures: 6 },
    telechargements: { dossier: dossierTelechargements, demander: false },
    sites: {},
    reseau: { passerelles: true, auto: true, sites: [] }
  }
}
