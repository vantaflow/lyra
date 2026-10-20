import type { Settings } from '../../shared/types'
import { fusion } from './store'
import { hoteValide, octets } from '../passerelles/liste'
import { adresseWebValide } from '../../shared/accueil'
import { adresseMoteurValide, motCleMoteurValide } from '../../shared/moteursPerso'
import { MOTEURS } from '../palette/engines'
import { SCHEMA_D, booleen, champsRegleSiteD, entier, enumeration, estObjet, pixels, propre, texte, type Obj, type Schema } from './validate-d'
import { migrer } from './migrations'
import { cleCanonique } from './sites'
import { validerInstallees } from '../extensions/registre'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

const MAX_SITES = 10_000

const TYPES = ['camera', 'micro', 'notifications', 'geolocalisation', 'presse-papiers']

/** permissions : { type connu: 'autoriser' | 'refuser' } ; le reste est ignoré. */
function permissions(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  for (const t of TYPES) {
    const d = enumeration('autoriser', 'refuser')(propre(v, t))
    if (d) sortie[t] = d
  }
  return Object.keys(sortie).length > 0 ? sortie : undefined
}

const MAX_REGLES_EXTENSIONS = 100
/** Règle par site des extensions : { identifiant (32 lettres a-p) : booléen } ; entrées invalides ignorées. */
function reglesExtensions(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  let n = 0
  for (const [id, actif] of Object.entries(v)) {
    if (n >= MAX_REGLES_EXTENSIONS) break
    if (!/^[a-p]{32}$/.test(id) || typeof actif !== 'boolean') continue
    sortie[id] = actif
    n++
  }
  return Object.keys(sortie).length > 0 ? sortie : undefined
}

/** sites : { clé (origine, hôte nu ou motif `*.hôte`, voir `cleDe`): { boucliers?, permissions?, zoom?, exceptionDnd?, extensions?, + champs de D } } ; champs et entrées invalides ignorés. */
function sites(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  let n = 0
  for (const [origine, regle] of Object.entries(v)) {
    const cle = cleCanonique(origine)
    if (!cle || !estObjet(regle)) continue
    if (n >= MAX_SITES && !(cle in sortie)) continue
    const champs: Obj = {}
    Object.assign(champs, champsRegleSiteD(regle))
    const perms = permissions(propre(regle, 'permissions'))
    if (perms) champs.permissions = perms
    const zoom = entier(0.25, 5)(propre(regle, 'zoom'))
    if (zoom !== undefined) champs.zoom = zoom
    // Absent par défaut ; false annule une exception déjà accordée.
    const exceptionDnd = booleen(propre(regle, 'exceptionDnd'))
    if (exceptionDnd !== undefined) champs.exceptionDnd = exceptionDnd
    const ext = reglesExtensions(propre(regle, 'extensions'))
    if (ext) champs.extensions = ext
    if (Object.keys(champs).length === 0) continue
    // Deux clés qui se confondent (casse, port par défaut, point final) : la dernière écrite gagne.
    if (cle in sortie) delete sortie[cle]
    else n++
    sortie[cle] = champs
  }
  return Object.keys(sortie).length > 0 ? sortie : undefined
}

const MAX_SITES_CONTOURNES = 500
const port = entier(1, 65535)

/** reseau.sites : tableau d'objets { hote (domaine), origine, date } ; entrées invalides et doublons ignorés ; `[]` explicite accepté. */
function sitesContournes(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined
  const sortie: Obj[] = []
  const vus = new Set<string>()
  for (const e of v) {
    if (sortie.length >= MAX_SITES_CONTOURNES) break
    if (!estObjet(e)) continue
    const hote = propre(e, 'hote')
    const origine = enumeration('auto', 'manuel')(propre(e, 'origine'))
    const date = propre(e, 'date')
    if (!hoteValide(hote) || !origine || typeof date !== 'number' || !Number.isFinite(date) || date < 0) continue
    const h = hote.toLowerCase()
    if (vus.has(h)) continue
    vus.add(h)
    sortie.push({ hote: h, origine, date })
  }
  // Entrée non vide mais entièrement invalide : ignorée (n'efface jamais la liste existante).
  return v.length > 0 && sortie.length === 0 ? undefined : sortie
}

/** reseau.personnelle : { type, hote (domaine ou IPv4), port } ; tout ou rien. */
function personnelle(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const type = enumeration('socks5', 'http')(propre(v, 'type'))
  const hote = propre(v, 'hote')
  const p = propre(v, 'port')
  if (!type || !Number.isInteger(p) || port(p) === undefined || typeof hote !== 'string') return undefined
  if (!hoteValide(hote) && !octets(hote)) return undefined
  return { type, hote: hote.toLowerCase(), port: p }
}

const MAX_MOTEURS_PERSO = 100
const MAX_EXTENSIONS_EN_ATTENTE = 200
const MAGASINS = enumeration('chrome', 'edge', 'firefox', 'inconnu')
const SOURCES = enumeration('chrome', 'edge', 'brave', 'vivaldi', 'firefox', 'safari', 'orion', 'lyra')

/**
 * moteursPerso : { id, nom, motCle, url } ; seul chemin d'écriture (page, import de réglages, import d'un navigateur, paquet .lyra, fichier relu).
 * Adresse https avec un seul `%s` hors du nom d'hôte ; mot-clé en minuscules, sans espace, unique et distinct de ceux des moteurs intégrés ;
 * identifiant distinct de ceux des intégrés ; 100 au plus. Invalides et doublons ignorés ; `[]` explicite accepté.
 */
function moteursPerso(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined
  const sortie: Obj[] = []
  const ids = new Set<string>(MOTEURS.map((m) => m.id))
  const motsCles = new Set<string>(MOTEURS.map((m) => m.motCle.toLowerCase()))
  for (const e of v) {
    if (sortie.length >= MAX_MOTEURS_PERSO) break
    if (!estObjet(e)) continue
    const id = texte(64)(propre(e, 'id'))
    const nom = texte(100)(propre(e, 'nom'))
    const brutCle = texte(24)(propre(e, 'motCle'))
    const motCle = brutCle?.toLowerCase()
    const url = texte(2000)(propre(e, 'url'))
    if (!id || !nom || !motCle || !url || ids.has(id) || motsCles.has(motCle)) continue
    if (!motCleMoteurValide(motCle) || !adresseMoteurValide(url)) continue
    ids.add(id)
    motsCles.add(motCle)
    sortie.push({ id, nom, motCle, url })
  }
  return v.length > 0 && sortie.length === 0 ? undefined : sortie
}

/** import.extensionsEnAttente : dédoublonnée sur id + magasin (la première gagne), 200 au plus (les dernières gardées). */
function extensionsEnAttente(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined
  const sortie: Obj[] = []
  const vus = new Set<string>()
  for (const e of v) {
    if (!estObjet(e)) continue
    const id = texte(200)(propre(e, 'id'))
    const nom = texte(300)(propre(e, 'nom'))
    const magasin = MAGASINS(propre(e, 'magasin'))
    const actif = booleen(propre(e, 'actif'))
    const source = SOURCES(propre(e, 'source'))
    const date = propre(e, 'date')
    if (!id || !nom || !magasin || actif === undefined || !source || typeof date !== 'number' || !Number.isFinite(date) || date < 0) continue
    const cle = `${magasin}\u0000${id}`
    if (vus.has(cle)) continue
    vus.add(cle)
    const imposee = booleen(propre(e, 'imposee'))
    sortie.push({ id, nom, magasin, actif, source, date, ...(imposee === true ? { imposee } : {}) })
  }
  const gardees = sortie.slice(-MAX_EXTENSIONS_EN_ATTENTE)
  return v.length > 0 && gardees.length === 0 ? undefined : gardees
}

const SCHEMA: Schema = {
  langue: texte(16, /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)?$/),
  theme: enumeration('systeme', 'clair', 'sombre', 'programme'),
  moteurParDefaut: texte(100),
  moteurChoisi: booleen,
  ciel: {
    position: enumeration('gauche', 'droite', 'haut', 'bas'),
    largeur: pixels(200, 420),
    masque: booleen,
    revelerAuSurvol: booleen,
    deplacerParGlisser: booleen,
    ternirApresMin: entier(1, 10080),
    endormirApresMin: entier(1, 10080)
  },
  boucliers: {
    niveau: enumeration('desactives', 'standard', 'strict'),
    genes: booleen,
    majHeures: entier(1, 168)
  },
  telechargements: {
    dossier: texte(4096),
    demander: booleen
  },
  sites,
  moteursPerso,
  import: {
    extensionsEnAttente,
    reglagesEnAttente: { pageAccueil: (v) => (typeof v === 'string' && v.length <= 2048 && adresseWebValide(v) ? v : undefined) }
  },
  reseau: {
    passerelles: booleen,
    auto: booleen,
    sites: sitesContournes,
    personnelle
  },
  extensions: {
    installees: validerInstallees,
    majAuto: booleen,
    derniereVerification: texte(40, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  },
  ...SCHEMA_D
}

function filtrer(brut: unknown, schema: Schema): Obj {
  const sortie: Obj = {}
  if (!estObjet(brut)) return sortie
  for (const [cle, regle] of Object.entries(schema)) {
    const v = propre(brut, cle)
    if (typeof regle === 'function') {
      const ok = regle(v)
      if (ok !== undefined) sortie[cle] = ok
    } else {
      const sous = filtrer(v, regle)
      if (Object.keys(sous).length > 0) sortie[cle] = sous
    }
  }
  return sortie
}

/** Ne garde que les clés connues, avec types et valeurs valides (liste blanche). */
export function validerPatch(brut: unknown): DeepPartial<Settings> {
  return filtrer(brut, SCHEMA) as DeepPartial<Settings>
}

/** Fichier relu : une ancienne largeur du ciel hors bornes ou décimale est arrondie et bornée, pas rejetée. */
export function largeurRamenee(brut: unknown): unknown {
  if (!estObjet(brut) || !estObjet(brut.ciel)) return brut
  const l = brut.ciel.largeur
  if (typeof l !== 'number' || !Number.isFinite(l)) return brut
  return { ...brut, ciel: { ...brut.ciel, largeur: Math.min(420, Math.max(200, Math.round(l))) } }
}

/** Réglages complets : migration vers le schéma courant (défauts + champs valides + réglages inconnus conservés). */
export function validerSettings(brut: unknown, defauts: Settings): Settings {
  return migrer(brut, defauts).settings
}

/** Réglages inconnus du schéma (clés absentes de `SCHEMA`, y compris dans un bloc connu), à conserver tels quels. */
export function inconnus(brut: unknown, schema: Schema = SCHEMA): Obj {
  const sortie: Obj = {}
  if (!estObjet(brut)) return sortie
  for (const [cle, v] of Object.entries(brut)) {
    const regle = Object.hasOwn(schema, cle) ? schema[cle] : undefined
    if (regle === undefined) {
      if (cle !== 'version' && cle !== '__proto__' && cle !== 'constructor' && cle !== 'prototype') sortie[cle] = v
    } else if (typeof regle !== 'function') {
      const sous = inconnus(v, regle)
      if (Object.keys(sous).length > 0) sortie[cle] = sous
    }
  }
  return sortie
}

/** Clés connues du schéma présentes dans le brut mais rejetées par la validation. */
export function clesRejetees(brut: unknown, valide: Obj, schema: Schema = SCHEMA, prefixe = ''): string[] {
  if (!estObjet(brut)) return []
  const rejetees: string[] = []
  for (const [cle, regle] of Object.entries(schema)) {
    const v = propre(brut, cle)
    if (v === undefined) continue
    const ok = propre(valide, cle)
    if (typeof regle === 'function') {
      if (ok === undefined) rejetees.push(prefixe + cle)
    } else if (!estObjet(v)) {
      rejetees.push(prefixe + cle)
    } else {
      rejetees.push(...clesRejetees(v, estObjet(ok) ? ok : {}, regle, `${prefixe}${cle}.`))
    }
  }
  return rejetees
}
