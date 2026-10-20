/**
 * addons.mozilla.org (API v5) : analyse de ce que l'utilisateur saisit (nom, slug, identifiant gecko, adresse AMO),
 * résolution vers l'adresse du .xpi et sa somme sha256, téléchargement vérifié avant toute extraction, cache par version.
 * Réseau : addons.mozilla.org et addons.cdn.mozilla.net seulement (https). Sans Electron.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CandidatAmo } from '../../shared/types'
import { MAX_ARCHIVE } from './archives'
import { ErreurIntrouvable, hoteAmo } from './reseau'

export type SourceAmo =
  | { type: 'slug'; slug: string }
  /** Identifiant gecko : `nom@domaine` ou `{uuid}`. */
  | { type: 'guid'; guid: string }
  /** Texte libre (« dark reader ») : recherche AMO, premier résultat. */
  | { type: 'recherche'; texte: string }

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/
const GUID = /^(\{[0-9a-fA-F-]{36}\}|[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9._-]{1,100})$/
const LOCALE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/

/** Reconnaît un nom, un slug, un identifiant gecko ou une adresse `addons.mozilla.org/<langue>/firefox/addon/<slug>/`. */
export function analyserSourceAmo(texte: string): SourceAmo | undefined {
  const t = texte.trim()
  if (t.length === 0 || t.length > 300) return undefined
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    let u: URL
    try {
      u = new URL(t)
    } catch {
      return undefined
    }
    if (u.protocol !== 'https:' || u.hostname !== 'addons.mozilla.org') return undefined
    const seg = u.pathname.split('/').filter(Boolean)
    if (seg[0] && LOCALE.test(seg[0]) && seg[1] !== 'addon') seg.shift()
    if (seg[0] === 'firefox') seg.shift()
    if (seg[0] !== 'addon' || !seg[1]) return undefined
    const id = decodeURIComponent(seg[1])
    if (GUID.test(id)) return { type: 'guid', guid: id }
    return SLUG.test(id) ? { type: 'slug', slug: id } : undefined
  }
  if (/[\\/]|^~|^[A-Za-z]:/.test(t) || /\.(xpi|crx|zip)$/i.test(t)) return undefined
  if (GUID.test(t)) return { type: 'guid', guid: t }
  if (SLUG.test(t)) return { type: 'slug', slug: t }
  return t.length >= 2 && t.length <= 100 && /[\p{L}\p{N}]/u.test(t) ? { type: 'recherche', texte: t } : undefined
}

export interface InfosAmo {
  slug: string
  guid?: string
  nom: string
  version: string
  /** Adresse https du .xpi (hôte AMO ou son CDN). */
  url: string
  /** sha256 hexadécimal minuscule annoncé par AMO. */
  sha256: string
}

type Requete = (url: string, accepte: (hote: string) => boolean, max: number, tolere404?: boolean) => Promise<Uint8Array>

const BASE_API = 'https://addons.mozilla.org/api/v5/addons'
const MAX_REPONSE = 5 * 1024 * 1024

const texte = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const objet = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)

/** Réponse de `addons/addon/<…>/` → infos ; lève avec un message lisible si un champ requis manque ou sort du cadre. */
export function infosDepuisReponse(brut: unknown): InfosAmo {
  const r = objet(brut)
  const version = objet(r?.current_version)
  const fichier = objet(version?.file)
  if (!r || !version || !fichier) throw new Error("réponse AMO inattendue : pas de version courante")
  const slug = texte(r.slug)
  const v = texte(version.version)
  const url = texte(fichier.url)
  const hash = texte(fichier.hash)
  if (!slug || !SLUG.test(slug)) throw new Error('réponse AMO inattendue : slug invalide')
  if (!v || v.length > 64) throw new Error('réponse AMO inattendue : version invalide')
  if (!url) throw new Error("réponse AMO inattendue : pas d'adresse de fichier")
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error("réponse AMO inattendue : adresse de fichier illisible")
  }
  if (u.protocol !== 'https:' || !hoteAmo(u.hostname)) throw new Error(`adresse de fichier refusée (${u.hostname})`)
  const m = hash ? /^sha256:([0-9a-fA-F]{64})$/.exec(hash) : null
  if (!m) throw new Error("AMO n'annonce pas de somme sha256 pour ce fichier : installation refusée")
  const nomBrut = r.name
  const nom = texte(nomBrut) ?? texte(objet(nomBrut)?.['en-US']) ?? Object.values(objet(nomBrut) ?? {}).map(texte).find(Boolean) ?? slug
  const guid = texte(r.guid)
  return { slug, nom: nom.slice(0, 200), version: v, url: u.toString(), sha256: m[1].toLowerCase(), ...(guid ? { guid } : {}) }
}

export interface ChoixAmo {
  choix: CandidatAmo[]
}

export interface ClientAmo {
  /** Résout la saisie : infos de téléchargement, ou `{ choix }` (candidats) si le nom est ambigu ; lève si AMO ne connaît pas l'extension. */
  resoudre(source: SourceAmo): Promise<InfosAmo | ChoixAmo>
  /** Mises à jour : slug exact, aucun repli par recherche (404 : erreur, rien n'est installé). */
  resoudreStrict(slug: string): Promise<InfosAmo>
  /** Télécharge (ou relit le cache), vérifie le sha256 annoncé, rend les octets du .xpi. */
  telecharger(infos: InfosAmo): Promise<Uint8Array>
}

export interface OptionsClientAmo {
  requete: Requete
  /** `userData/extensions/cache`. */
  cache: string
}

const sha256 = (octets: Uint8Array): string => createHash('sha256').update(octets).digest('hex')
const sur = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)

export function creerClientAmo(o: OptionsClientAmo): ClientAmo {
  async function json(url: string, tolere404: boolean): Promise<unknown> {
    const brut = await o.requete(url, hoteAmo, MAX_REPONSE, tolere404)
    try {
      return JSON.parse(Buffer.from(brut).toString('utf8'))
    } catch {
      throw new Error('réponse AMO illisible')
    }
  }
  const detail = (id: string, tolere404: boolean): Promise<unknown> => json(`${BASE_API}/addon/${encodeURIComponent(id)}/?lang=en-US`, tolere404)

  const minuscule = (s: string): string => s.trim().toLowerCase()

  /**
   * Recherche AMO (saisie manuelle seulement) : un résultat de même nom (casse ignorée) ou de même slug est pris ; sinon
   * jusqu'à 5 candidats sont rendus pour que l'utilisateur choisisse. Jamais d'installation d'un « premier résultat ».
   */
  async function chercher(texteLibre: string): Promise<string | CandidatAmo[]> {
    const u = new URL(`${BASE_API}/search/`)
    u.searchParams.set('q', texteLibre)
    u.searchParams.set('app', 'firefox')
    u.searchParams.set('type', 'extension')
    u.searchParams.set('page_size', '10')
    u.searchParams.set('lang', 'en-US')
    const r = objet(await json(u.toString(), false))
    const candidats: CandidatAmo[] = (Array.isArray(r?.results) ? r.results : [])
      .map((x) => objet(x))
      .map((x) => {
        const auteurs = Array.isArray(x?.authors) ? x.authors.map((a) => texte(objet(a)?.name)).filter(Boolean) : []
        return { slug: texte(x?.slug) ?? '', nom: texte(x?.name) ?? texte(objet(x?.name)?.['en-US']) ?? '', auteur: auteurs.join(', ') }
      })
      .filter((x) => SLUG.test(x.slug))
    const q = minuscule(texteLibre)
    const exact = candidats.find((c) => minuscule(c.nom) === q || minuscule(c.slug) === q)
    if (exact) return exact.slug
    if (candidats.length === 0) throw new Error(`aucune extension « ${texteLibre.slice(0, 60)} » sur addons.mozilla.org`)
    return candidats.slice(0, 5).map((c) => ({ ...c, nom: c.nom.slice(0, 100), auteur: c.auteur.slice(0, 100) }))
  }

  const parRecherche = async (texteLibre: string): Promise<InfosAmo | ChoixAmo> => {
    const r = await chercher(texteLibre)
    return typeof r === 'string' ? infosDepuisReponse(await detail(r, false)) : { choix: r }
  }

  return {
    async resoudre(source) {
      try {
        switch (source.type) {
          case 'guid':
            return infosDepuisReponse(await detail(source.guid, true))
          case 'slug':
            try {
              return infosDepuisReponse(await detail(source.slug, true))
            } catch (e) {
              if (!(e instanceof ErreurIntrouvable)) throw e
              return await parRecherche(source.slug)
            }
          case 'recherche':
            return await parRecherche(source.texte)
        }
      } catch (e) {
        if (e instanceof ErreurIntrouvable) throw new Error("addons.mozilla.org ne connaît pas cette extension")
        throw e
      }
    },

    async resoudreStrict(slug) {
      try {
        return infosDepuisReponse(await detail(slug, true))
      } catch (e) {
        if (e instanceof ErreurIntrouvable) throw new Error("cette extension n'est plus disponible sur addons.mozilla.org")
        throw e
      }
    },

    async telecharger(infos) {
      // Un sous-dossier par extension ; une seule version gardée (les autres sont supprimées après un téléchargement réussi).
      const dossier = join(o.cache, sur(infos.slug))
      const nom = `${sur(infos.version)}_${infos.sha256.slice(0, 12)}.xpi`
      const chemin = join(dossier, nom)
      if (existsSync(chemin)) {
        const lu = readFileSync(chemin)
        if (sha256(lu) === infos.sha256) return lu
        rmSync(chemin, { force: true }) // cache corrompu ou trafiqué
      }
      const octets = await o.requete(infos.url, hoteAmo, MAX_ARCHIVE)
      if (sha256(octets) !== infos.sha256) throw new Error('somme sha256 différente de celle annoncée par AMO : fichier refusé')
      try {
        mkdirSync(dossier, { recursive: true })
        const tmp = join(dossier, `.${randomUUID().slice(0, 8)}.tmp`)
        writeFileSync(tmp, octets)
        renameSync(tmp, chemin)
        for (const f of readdirSync(dossier)) if (f !== nom) rmSync(join(dossier, f), { force: true })
      } catch {
        /* le cache est un confort : une écriture impossible n'empêche pas l'installation */
      }
      return octets
    }
  }
}
