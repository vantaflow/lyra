/**
 * Moteurs de recherche importés : correspondance des moteurs intégrés aux navigateurs avec ceux de Lyra, et arbitrage
 * des mots-clés des moteurs personnalisés (pur, sans Electron). Les mots-clés de Lyra ne sont jamais écrasés.
 */
import type { MoteurPerso } from '../../shared/types'
import { MOTEURS } from '../palette/engines'
import { normaliser } from '../palette/suggest'
import type { Moteur, NavigateurSource } from './types'

const MAX_MOT_CLE = 24
const ADRESSE_VALIDE = /^https?:\/\/\S*%s\S*$/i

/** Identifiants Firefox / mots-clés Chromium / noms (normalisés) → moteur de Lyra ; ce qui n'est pas ici n'existe pas dans Lyra. */
const PAR_NOM: Record<string, string> = {
  google: 'google',
  'google.com': 'google',
  ddg: 'duckduckgo',
  duckduckgo: 'duckduckgo',
  'duckduckgo.com': 'duckduckgo',
  wikipedia: 'wikipedia',
  'wikipedia-fr': 'wikipedia',
  wikipédia: 'wikipedia',
  qwant: 'qwant',
  brave: 'brave',
  'brave search': 'brave',
  startpage: 'startpage',
  kagi: 'kagi',
  youtube: 'youtube',
  'youtube.com': 'youtube'
}

const PAR_HOTE: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)wikipedia\.org$/, 'wikipedia'],
  [/(^|\.)qwant\.com$/, 'qwant'],
  [/^search\.brave\.com$/, 'brave'],
  [/(^|\.)startpage\.com$/, 'startpage'],
  [/(^|\.)kagi\.com$/, 'kagi'],
  [/(^|\.)youtube\.com$/, 'youtube']
]

/**
 * Moteur de Lyra correspondant à un identifiant Firefox (`ddg@search.mozilla.org`, `wikipedia-fr`, `google-b-d`), à un
 * mot-clé ou un nom, ou à une adresse de recherche ; `null` si Lyra ne l'a pas (Bing, Ecosia, Yahoo…).
 */
export function idLyraDuMoteur(cle: string): string | null {
  const brut = cle.trim().toLowerCase()
  if (/^https?:\/\//.test(brut)) {
    try {
      const hote = new URL(brut.replace('%s', 'x')).hostname
      return PAR_HOTE.find(([re]) => re.test(hote))?.[1] ?? null
    } catch {
      return null
    }
  }
  const id = brut.split('@')[0].replace(/-b(-[a-z0-9]+)*$/, '')
  return PAR_NOM[id] ?? PAR_NOM[brut] ?? null
}

/** Adresse normalisée pour le dédoublonnage : hôte sans `www.`, chemin sans `/` final, requête, `%s` conservé. */
export function cleAdresse(url: string): string {
  try {
    const u = new URL(url.replace('%s', 'LYRA_S'))
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`.replace('LYRA_S', '%s').toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

export interface EntreeMoteurs {
  moteurs: Moteur[]
  source: NavigateurSource
  /** Moteurs perso déjà dans Lyra. */
  existants: readonly MoteurPerso[]
  /** Moteur par défaut déclaré par Firefox (`lireMoteurParDefautFirefox`). */
  defautFirefox?: { id: string; nom?: string; integre: boolean }
}

export interface ResultatMoteurs {
  /** Moteurs perso à ajouter (mots-clés déjà arbitrés). */
  aAjouter: MoteurPerso[]
  presents: number
  ignores: number
  notes: string[]
  /** Moteur par défaut du navigateur source, tel qu'il existera dans Lyra. */
  parDefaut?: { id: string; nom: string }
  /** Nom du moteur par défaut du navigateur source quand Lyra ne l'a pas. */
  defautAbsent?: string
}

const suffixe = (source: NavigateurSource): string => (source === 'firefox' ? 'ff' : source)

function deriverDuNom(nom: string): string {
  const d = normaliser(nom).replace(/[^a-z0-9]/g, '').slice(0, MAX_MOT_CLE)
  return d || 'moteur'
}

export function arbitrerMoteurs(e: EntreeMoteurs): ResultatMoteurs {
  const r: ResultatMoteurs = { aAjouter: [], presents: 0, ignores: 0, notes: [] }
  const pris = new Map<string, string>() // mot-clé normalisé → nom de son détenteur
  for (const m of MOTEURS) pris.set(normaliser(m.motCle), m.nom)
  for (const m of e.existants) pris.set(normaliser(m.motCle), m.nom)
  const adresses = new Map<string, string>() // adresse normalisée → id
  for (const m of e.existants) adresses.set(cleAdresse(m.url), m.id)
  const ids = new Set(e.existants.map((m) => m.id))
  const absents: string[] = []

  const libre = (motCle: string): string => {
    if (!pris.has(normaliser(motCle))) return motCle
    const tete = (n: string, queue: string): string => `${n.slice(0, MAX_MOT_CLE - queue.length)}${queue}`
    const queue = `-${suffixe(e.source)}`
    let candidat = tete(motCle, queue)
    for (let n = 2; pris.has(normaliser(candidat)); n++) candidat = tete(motCle, `${queue}${n}`)
    return candidat
  }

  for (const m of e.moteurs) {
    if (!m.perso) {
      const id = idLyraDuMoteur(m.url) ?? idLyraDuMoteur(m.motCle) ?? idLyraDuMoteur(m.nom)
      if (id) r.presents++
      else {
        r.ignores++
        absents.push(m.nom)
      }
      if (m.parDefaut) {
        if (id) r.parDefaut = { id, nom: m.nom }
        else r.defautAbsent = m.nom
      }
      continue
    }
    if (!ADRESSE_VALIDE.test(m.url) || m.url.length > 2000) {
      r.ignores++
      r.notes.push(`Moteur « ${m.nom} » ignoré : son adresse n’est pas une recherche web (https avec %s).`)
      continue
    }
    const deja = adresses.get(cleAdresse(m.url))
    if (deja) {
      r.presents++
      if (m.parDefaut) r.parDefaut = { id: deja, nom: m.nom }
      continue
    }
    const origine = m.motCle.trim()
    const valide = origine !== '' && origine.length <= MAX_MOT_CLE && /^\S+$/.test(origine)
    const base = valide ? origine : deriverDuNom(m.nom)
    const motCle = libre(base)
    if (!valide) r.notes.push(`Mot-clé de « ${m.nom} » vide, trop long ou avec espace : devient \`${motCle}\`.`)
    if (motCle !== base) r.notes.push(`Mot-clé \`${base}\` déjà pris par ${pris.get(normaliser(base))} : devient \`${motCle}\`.`)
    pris.set(normaliser(motCle), m.nom)
    let id = `import-${normaliser(motCle)}`
    for (let n = 2; ids.has(id); n++) id = `import-${normaliser(motCle)}-${n}`
    ids.add(id)
    adresses.set(cleAdresse(m.url), id)
    r.aAjouter.push({ id, nom: m.nom.trim().slice(0, 100) || motCle, motCle, url: m.url })
    if (m.parDefaut) r.parDefaut = { id, nom: m.nom }
  }
  if (absents.length) r.notes.push(`Moteurs intégrés au navigateur absents de Lyra, ignorés : ${absents.join(', ')}.`)

  if (e.defautFirefox?.integre) {
    const nom = e.defautFirefox.nom ?? e.defautFirefox.id
    const id = idLyraDuMoteur(e.defautFirefox.id)
    if (id) r.parDefaut = { id, nom }
    else r.defautAbsent = nom
  }
  return r
}
