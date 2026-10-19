/** Interprétation de la saisie et suggestions de la palette (pur, sans Electron). */
import type { Constellation, HistoryEntry, Star, Suggestion } from '../../shared/types'
import { MOTEURS, moteurParId, moteurParMotCle, urlDeRecherche, type Moteur } from './engines'

export type Saisie =
  | { type: 'url'; url: string }
  | { type: 'recherche'; moteur: string; requete: string }
  | { type: 'commande'; nom: string }

export interface ContexteSuggestion {
  etoiles: Star[]
  historique: HistoryEntry[]
  moteurParDefaut: string
  constellations?: Constellation[]
}

export interface Commande {
  id: string
  titre: string
  aide?: string
}

export const COMMANDES: Commande[] = [
  { id: 'nouvelle-etoile', titre: 'Nouvelle étoile', aide: '⌘ T' },
  { id: 'fenetre-privee', titre: 'Nouvelle fenêtre privée', aide: '⌘ ⇧ N' },
  { id: 'reglages', titre: 'Réglages', aide: '⌘ ,' },
  { id: 'ciel-gauche', titre: 'Déplacer le ciel à gauche' },
  { id: 'ciel-droite', titre: 'Déplacer le ciel à droite' },
  { id: 'ciel-haut', titre: 'Déplacer le ciel en haut' },
  { id: 'ciel-bas', titre: 'Déplacer le ciel en bas' }
]

const MAX = 12
const SCHEMA = /^[a-z][a-z0-9+.-]*:\/\//i
const LOCALHOST = /^localhost(:\d+)?([/?#]\S*)?$/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]\S*)?$/
const DOMAINE = /^[^\s/?#:]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i

/** Minuscules sans accents, pour comparer. */
export const normaliser = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** « w véga » → Wikipédia / « véga » ; null si le premier mot n'est pas un mot-clé. */
export function analyserMotCle(texte: string): { moteur: Moteur; requete: string } | null {
  const m = /^(\S+)\s+(.+)$/.exec(texte.trim())
  const moteur = m && moteurParMotCle(m[1])
  return m && moteur ? { moteur, requete: m[2].trim() } : null
}

export function interpreterSaisie(texte: string, moteurParDefaut: string): Saisie {
  const t = texte.trim()
  if (t.startsWith('>')) return { type: 'commande', nom: t.slice(1).trim() }
  if (t.startsWith('?')) return { type: 'recherche', moteur: moteurParDefaut, requete: t.slice(1).trim() }
  if (SCHEMA.test(t)) return { type: 'url', url: t }
  const kw = analyserMotCle(t)
  if (kw) return { type: 'recherche', moteur: kw.moteur.id, requete: kw.requete }
  if (!/\s/.test(t) && (LOCALHOST.test(t) || IPV4.test(t) || DOMAINE.test(t))) return { type: 'url', url: `https://${t}` }
  return { type: 'recherche', moteur: moteurParDefaut, requete: t }
}

/** Commande correspondant à un nom saisi après « > » (premier titre qui le contient). */
export function trouverCommande(nom: string): Commande | undefined {
  const n = normaliser(nom)
  return COMMANDES.find((c) => normaliser(c.titre).includes(n)) ?? undefined
}

const correspond = (texte: string, ...champs: string[]): boolean => {
  const cible = normaliser(champs.join(' '))
  return normaliser(texte).split(/\s+/).filter(Boolean).every((mot) => cible.includes(mot))
}

function titreEtoile(s: Star): string {
  if (/^lyra:\/\/newtab\/?$/.test(s.url)) return 'Nouvelle étoile'
  if (s.title) return s.title
  try {
    return new URL(s.url).hostname || s.url
  } catch {
    return s.url
  }
}

function ligneRecherche(moteur: Moteur, requete: string, aide?: string): Suggestion {
  return {
    type: 'recherche',
    titre: `« ${requete} » sur ${moteur.nom}`,
    sousTitre: aide,
    url: urlDeRecherche(moteur, requete),
    moteur: moteur.id,
    icone: moteur.lettre
  }
}

function lignesRecherche(requete: string, ctx: ContexteSuggestion, premier?: Moteur): Suggestion[] {
  const defaut = moteurParId(ctx.moteurParDefaut)
  const ordre = premier ? [premier, defaut] : [defaut]
  const autre = MOTEURS.find((m) => !ordre.includes(m))
  if (!premier && autre) ordre.push(autre)
  return [...new Set(ordre)].map((m, i) =>
    ligneRecherche(m, requete, m.id === defaut.id && i === 0 ? '↩ pour rechercher' : `mot-clé  ${m.motCle}`)
  )
}

function ligneEtoile(s: Star, ctx: ContexteSuggestion): Suggestion {
  const constellation = ctx.constellations?.find((c) => c.id === s.constellationId)?.name
  return {
    type: 'etoile',
    id: s.id,
    titre: titreEtoile(s),
    sousTitre: constellation ? `${constellation} · aller à l'étoile` : "aller à l'étoile",
    icone: (titreEtoile(s)[0] ?? '★').toUpperCase()
  }
}

function lignesCommandes(filtre: string): Suggestion[] {
  return COMMANDES.filter((c) => !filtre || correspond(filtre, c.titre)).map((c) => ({
    type: 'commande' as const,
    id: c.id,
    titre: c.titre,
    sousTitre: c.aide,
    icone: '⌘'
  }))
}

/** Étoile active d'abord, puis l'ordre du ciel. */
const actives = (etoiles: Star[], activeId?: string): Star[] =>
  [...etoiles].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId))

export function suggerer(texte: string, ctx: ContexteSuggestion & { activeId?: string }): Suggestion[] {
  const t = texte.trim()
  const etoiles = actives(ctx.etoiles, ctx.activeId)

  if (t === '') return [...etoiles.slice(0, 6).map((s) => ligneEtoile(s, ctx)), ...lignesCommandes('')].slice(0, MAX)
  if (t.startsWith('>')) return lignesCommandes(t.slice(1).trim()).slice(0, MAX)
  if (t.startsWith('#')) {
    const filtre = t.slice(1).trim()
    const ids = new Set((ctx.constellations ?? []).filter((c) => !filtre || correspond(filtre, c.name)).map((c) => c.id))
    return etoiles.filter((s) => s.constellationId && ids.has(s.constellationId)).map((s) => ligneEtoile(s, ctx)).slice(0, MAX)
  }
  if (t.startsWith('?')) {
    const q = t.slice(1).trim()
    return q ? lignesRecherche(q, ctx).slice(0, 1) : []
  }

  const kw = analyserMotCle(t)
  if (kw) return lignesRecherche(kw.requete, ctx, kw.moteur).slice(0, MAX)

  const ouvertes = etoiles.filter((s) => correspond(t, titreEtoile(s), s.url)).slice(0, 5).map((s) => ligneEtoile(s, ctx))
  const dejaOuvertes = new Set(etoiles.map((s) => s.url))
  const histo: Suggestion[] = ctx.historique
    .filter((h) => !dejaOuvertes.has(h.url) && correspond(t, h.title, h.url))
    .slice(0, 4)
    .map((h) => ({
      type: h.favori ? ('favori' as const) : ('historique' as const),
      titre: h.title || h.url,
      sousTitre: h.url,
      url: h.url,
      icone: h.favori ? '★' : (h.title[0] ?? '·').toUpperCase()
    }))

  const saisie = interpreterSaisie(t, ctx.moteurParDefaut)
  const recherche: Suggestion[] = []
  if (saisie.type === 'url') {
    recherche.push({ type: 'recherche', titre: `Aller à ${t}`, sousTitre: 'adresse', url: saisie.url, icone: '→' })
  }
  recherche.push(...lignesRecherche(t, ctx).slice(0, saisie.type === 'url' ? 1 : 2))

  return [...ouvertes, ...histo, ...recherche, ...lignesCommandes(t).slice(0, 3)].slice(0, MAX)
}
