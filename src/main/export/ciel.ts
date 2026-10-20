/**
 * Le ciel (constellations, étoiles, épingles) en JSON, réimportable. Pur (sans Electron).
 * Format `lyra-ciel` v1 ; à la lecture rien n'est cru sur parole : types, tailles et références sont vérifiés.
 * Les pages internes (lyra://) ne sont pas exportées ; la hiérarchie parent/enfant n'est pas conservée (l'import
 * crée des étoiles à plat, voir `appliquerOnglets`).
 */
import type { SkyState } from '../../shared/types'
import type { FenetreImportee, OngletsImportes } from '../import/types'

export interface CielFichier {
  format: 'lyra-ciel'
  version: 1
  date: string
  constellations: Array<{ id: string; nom: string; couleur?: string }>
  etoiles: Array<{ url: string; titre: string; constellation?: string; epingle: boolean }>
}

const MAX_ETOILES = 20_000
const MAX_CONSTELLATIONS = 500
const HEX = /^#[0-9a-f]{6}$/i
const ouvrable = (url: string): boolean => !/^(lyra|about|chrome|devtools|data|javascript):/i.test(url)

export function cielVersFichier(ciel: SkyState, date: Date = new Date()): CielFichier {
  const connues = new Set(ciel.constellations.map((c) => c.id))
  return {
    format: 'lyra-ciel',
    version: 1,
    date: date.toISOString(),
    constellations: ciel.constellations.map((c) => ({ id: c.id, nom: c.name, couleur: c.color })),
    etoiles: [...ciel.stars]
      .filter((s) => ouvrable(s.url))
      .sort((a, b) => a.index - b.index)
      .map((s) => ({ url: s.url, titre: s.title, ...(s.constellationId && connues.has(s.constellationId) ? { constellation: s.constellationId } : {}), epingle: s.pinned === true }))
  }
}

export const cielVersJson = (ciel: SkyState, date?: Date): string => JSON.stringify(cielVersFichier(ciel, date), null, 2)

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

export function cielDepuisJson(json: string): CielFichier {
  const brut: unknown = JSON.parse(json)
  if (!estObjet(brut) || brut.format !== 'lyra-ciel') throw new Error('Ce fichier n’est pas un ciel exporté par Lyra.')
  if (brut.version !== 1) throw new Error('Ce ciel vient d’une version plus récente de Lyra (version de fichier non prise en charge).')
  const constellations: CielFichier['constellations'] = []
  const ids = new Set<string>()
  for (const c of Array.isArray(brut.constellations) ? brut.constellations.slice(0, MAX_CONSTELLATIONS) : []) {
    if (!estObjet(c) || typeof c.id !== 'string' || !c.id || ids.has(c.id)) continue
    ids.add(c.id)
    constellations.push({ id: c.id.slice(0, 200), nom: texte(c.nom, 200), ...(typeof c.couleur === 'string' && HEX.test(c.couleur) ? { couleur: c.couleur } : {}) })
  }
  const etoiles: CielFichier['etoiles'] = []
  for (const e of Array.isArray(brut.etoiles) ? brut.etoiles.slice(0, MAX_ETOILES) : []) {
    if (!estObjet(e) || typeof e.url !== 'string' || !e.url) continue
    etoiles.push({
      url: e.url.slice(0, 8192),
      titre: texte(e.titre, 500),
      ...(typeof e.constellation === 'string' && ids.has(e.constellation) ? { constellation: e.constellation } : {}),
      epingle: e.epingle === true
    })
  }
  return { format: 'lyra-ciel', version: 1, date: texte(brut.date, 40), constellations, etoiles }
}

/** Le ciel lu devient une « fenêtre importée » pour `appliquer` (même déduplication et mêmes garde-fous que l'import d'un navigateur). */
export function cielVersOnglets(c: CielFichier): OngletsImportes {
  const fenetre: FenetreImportee = {
    groupes: c.constellations.map((k) => ({ id: k.id, nom: k.nom, couleur: 'gris', ...(k.couleur ? { couleurHex: k.couleur } : {}) })),
    onglets: c.etoiles.map((e) => ({ url: e.url, titre: e.titre, groupe: e.constellation, epingle: e.epingle }))
  }
  return { fenetres: [fenetre] }
}
