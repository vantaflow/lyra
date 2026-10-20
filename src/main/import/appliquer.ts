/**
 * Application d'un import dans Lyra (jalon E, Task 3.3) : écrit ce que les lecteurs ont produit (`DonneesImportees`)
 * dans les magasins de Lyra, élément par élément, par lots, avec un résultat par élément. N'importe jamais Electron :
 * les magasins sont injectés (`CiblesImport`, implémentées en 3.5 à partir de `Bookmarks`, `History`, `TabManager`,
 * `Reglages`). Ordre : favoris → moteurs → réglages → extensions → onglets → historique (le plus long en dernier).
 * Aucune exception ne remonte : une cible qui échoue rend son élément `indisponible`, les autres continuent.
 */
import { PALETTE_CONSTELLATIONS } from '../../shared/couleurs'
import type { ExtensionEnAttente, MoteurPerso, Settings } from '../../shared/types'
import { MOTEURS } from '../palette/engines'
import { normaliser } from '../palette/suggest'
import { patchImporte } from '../settings/import'
import { PALIERS_ZOOM } from '../tabs/zoom'
import { arbitrerMoteurs, type ResultatMoteurs } from './moteurs'
import {
  COULEURS_GROUPE,
  ELEMENTS_IMPORT,
  NOMS_NAVIGATEURS,
  estIndisponible,
  type CodeErreurImport,
  type DonneesImportees,
  type ElementImport,
  type ElementResultat,
  type ExtensionImportee,
  type FavorisImportes,
  type Indisponible,
  type NavigateurSource,
  type NoeudFavori,
  type OptionsApplication,
  type OngletsImportes,
  type ReglagesImportes,
  type ResultatImport,
  type Visite
} from './types'

// ---------------------------------------------------------------------------------------------------------------------
// Interfaces des magasins (signatures de `Bookmarks`, `History`, `TabManager`, `Reglages` : 3.5 les leur passe)

export interface CibleFavoris {
  ajouterLot(items: Array<{ url: string; title: string; dossier?: string; date?: number }>): { ajoutes: number; presents: number }
}

export interface CibleHistorique {
  importer(lot: Array<{ url: string; title: string; date: number }>): { ajoutees: number; presentes: number }
  attendre(): Promise<void>
  compacterSiNecessaire(): boolean
}

/** Le ciel d'une fenêtre Lyra normale (jamais une fenêtre privée). */
export interface CibleCiel {
  constellations(): Array<{ id: string; name: string; color: string }>
  creerConstellation(o: { name: string; color: string }): { id: string; name: string; color: string }
  ouvrirEndormie(url: string, o?: { constellationId?: string; titre?: string; epingle?: boolean }): string
  /** Charge l'étoile maintenant (option « ouvrir maintenant »). Absent : tout reste endormi. */
  reveiller?(id: string): void
  /** Persiste la session (`sauverSession()`), appelé une fois par ciel utilisé. */
  sauver(): void | Promise<void>
}

export type ReglagesLus = Pick<Settings, 'langue' | 'moteurParDefaut' | 'moteurChoisi' | 'sites' | 'moteursPerso' | 'import' | 'telechargements'>

export interface CibleReglages {
  get(): ReglagesLus
  /** `Reglages.setSettings` : fusion profonde, mais les tableaux sont REMPLACÉS (on envoie donc les listes complètes). */
  set(patch: Partial<Settings>): unknown
}

export interface CiblesImport {
  favoris: CibleFavoris
  historique: CibleHistorique
  ciel: CibleCiel
  /** Ouvre une fenêtre Lyra normale (option `nouvelle-par-fenetre`) ; absent : tout va dans `ciel`. */
  nouvelleFenetre?(): CibleCiel
  reglages: CibleReglages
}

export interface EntreeImport {
  source: NavigateurSource
  /** Nom du profil, repris dans le résultat. */
  profil: string
  /** Éléments lus ; un élément absent n'est pas demandé. L'historique peut arriver en flux de lots (jamais tout en mémoire). */
  donnees: Omit<DonneesImportees, 'historique'> & { historique?: Visite[] | AsyncIterable<Visite[]> | Indisponible }
  /** Moteur par défaut déclaré par Firefox (`lireMoteurParDefautFirefox`), s'il a été lu. */
  moteurParDefautFirefox?: { id: string; nom?: string; integre: boolean }
}

export interface Progression {
  element: ElementImport
  fait: number
  total?: number
  phase: 'ecriture'
}

// ---------------------------------------------------------------------------------------------------------------------
// Utilitaires

const TAILLE_LOT_HISTORIQUE = 2000
const TRANCHE_ETOILES = 50
const ETOILES_OUVERTES_MAINTENANT = 10
const MAX_EXTENSIONS = 200
const ORDRE: readonly ElementImport[] = ['favoris', 'moteurs', 'reglages', 'extensions', 'onglets', 'historique']

const pause = (): Promise<void> => new Promise((r) => setImmediate(r))

const vide = (etat: ElementResultat['etat']): ElementResultat => ({ etat, ajoutes: 0, presents: 0, ignores: 0, notes: [] })

/** Schémas qu'un favori peut garder : http(s) et ftp ; jamais lyra:, file:, javascript:, data:, about:. */
const FAVORI_OUVRABLE = /^(https?|ftp):/i
/** Étoiles : comme `SCHEMAS_OUVRABLES` / `interditAuxSites` de TabManager (file: seulement sous LYRA_TEST). */
const etoileOuvrable = (url: string): boolean => /^https?:/i.test(url) || (process.env.LYRA_TEST === '1' && /^file:/i.test(url))

const raisonDe = (e: unknown): string => (e as { raison?: unknown })?.raison?.toString() ?? (e instanceof Error ? e.message : String(e))

/**
 * Sérialisation WHATWG (celle des favoris natifs de Lyra : `https://a.fr` -> `https://a.fr/`), après retrait d'un
 * fragment vide ; le `/` final n'est jamais retiré. `null` si l'adresse n'est pas analysable.
 */
export function normaliserUrlFavori(url: string): string | null {
  try {
    return new URL(url.trim().replace(/#$/, '')).href
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Couleur de constellation : teinte de la palette la plus proche, en distance euclidienne dans OKLab (perceptuel).

function oklab(hex: string): [number, number, number] {
  const lin = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin(1), lin(3), lin(5)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/**
 * La palette de Lyra est faite de teintes claires pour un ciel sombre, alors que les couleurs de groupe des navigateurs
 * sont plus foncées : la clarté pèse peu dans la distance (sinon un cyan foncé deviendrait gris), la teinte décide.
 */
const POIDS_CLARTE = 0.2

export function couleurConstellation(hex: string): string {
  const a = oklab(hex)
  let meilleure = PALETTE_CONSTELLATIONS[0]
  let distance = Infinity
  for (const c of PALETTE_CONSTELLATIONS) {
    const b = oklab(c)
    const d = POIDS_CLARTE * (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    if (d < distance) {
      distance = d
      meilleure = c
    }
  }
  return meilleure
}

// ---------------------------------------------------------------------------------------------------------------------
// Application

export async function appliquer(
  entree: EntreeImport,
  cibles: CiblesImport,
  options: OptionsApplication,
  surProgression?: (p: Progression) => void,
  signal?: AbortSignal
): Promise<ResultatImport> {
  const debut = Date.now()
  const { donnees } = entree
  const resultat = {} as Record<ElementImport, ElementResultat>
  for (const el of ELEMENTS_IMPORT) resultat[el] = vide('ignore')

  // Un rapport de progression qui échoue (page fermée en cours d'import) ne doit jamais faire échouer l'import.
  const avance = (element: ElementImport, fait: number, total?: number): void => {
    try {
      surProgression?.({ element, fait, ...(total === undefined ? {} : { total }), phase: 'ecriture' })
    } catch {
      /* ignoré */
    }
  }
  const annule = (): boolean => signal?.aborted === true

  // Arbitrage des moteurs : calculé une fois (le moteur par défaut sert aussi à l'étape réglages).
  let plan: ResultatMoteurs | undefined
  try {
    const m = donnees.moteurs
    if (donnees.moteurs !== undefined || entree.moteurParDefautFirefox)
      plan = arbitrerMoteurs({ moteurs: m && !estIndisponible(m) ? m : [], source: entree.source, existants: cibles.reglages.get().moteursPerso, defautFirefox: entree.moteurParDefautFirefox })
  } catch {
    plan = undefined
  }

  const etapes: Record<ElementImport, (() => ElementResultat | Promise<ElementResultat>) | undefined> = {
    favoris: () => appliquerFavoris(donnees.favoris as FavorisImportes, entree.source, cibles.favoris),
    moteurs: () => appliquerMoteurs(plan, cibles.reglages),
    reglages: () => appliquerReglages(donnees.reglages as ReglagesImportes, plan, cibles.reglages, options),
    extensions: () => appliquerExtensions(donnees.extensions as ExtensionImportee[], entree.source, cibles.reglages, options),
    onglets: () => appliquerOnglets(donnees.onglets as OngletsImportes, cibles, options, avance, signal),
    historique: () => appliquerHistorique(donnees.historique as Visite[] | AsyncIterable<Visite[]>, cibles.historique, avance, signal)
  }

  for (const el of ORDRE) {
    const v = donnees[el]
    if (v === undefined) continue
    if (annule()) {
      resultat[el] = vide('annule')
      continue
    }
    if (estIndisponible(v)) {
      resultat[el] = { ...vide('indisponible'), raison: v.raison, ...(v.code ? { code: v.code } : {}) }
      continue
    }
    avance(el, 0)
    try {
      resultat[el] = await etapes[el]!()
    } catch (e) {
      resultat[el] = { ...vide('indisponible'), raison: `Écriture impossible dans Lyra : ${raisonDe(e)}` }
    }
    if (resultat[el].etat !== 'annule' && resultat[el].etat !== 'indisponible') avance(el, resultat[el].ajoutes + resultat[el].presents, resultat[el].ajoutes + resultat[el].presents + resultat[el].ignores)
  }

  return { ...resultat, duree: Date.now() - debut, source: entree.source, profil: entree.profil }
}

const termine = (r: ElementResultat): ElementResultat => ({ ...r, etat: r.etat === 'ok' && r.ignores > 0 ? 'partiel' : r.etat })

// --- Favoris ---------------------------------------------------------------------------------------------------------

function appliquerFavoris(f: FavorisImportes, source: NavigateurSource, cible: CibleFavoris): ElementResultat {
  const racine = `Importés de ${NOMS_NAVIGATEURS[source]}`
  const items: Array<{ url: string; title: string; dossier: string; date: number }> = []
  let ignores = 0
  const parcourir = (noeuds: NoeudFavori[], dossier: string): void => {
    for (const n of noeuds) {
      if (n.type === 'dossier') {
        const titre = n.titre.replace(/\//g, '∕').trim() || 'Sans titre'
        parcourir(n.enfants, `${dossier} / ${titre}`)
      } else if (FAVORI_OUVRABLE.test(n.url)) {
        const url = normaliserUrlFavori(n.url)
        if (url === null) ignores++
        else items.push({ url, title: n.titre.trim() || url, dossier, date: n.date })
      } else ignores++
    }
  }
  parcourir(f.barre, racine)
  parcourir(f.autres, racine)
  const { ajoutes, presents } = items.length ? cible.ajouterLot(items) : { ajoutes: 0, presents: 0 }
  const notes = ignores ? [`${ignores} favori(s) d’un type non ouvrable (javascript:, data:, fichier local…) ignoré(s).`] : []
  return termine({ etat: 'ok', ajoutes, presents, ignores, notes })
}

// --- Moteurs ---------------------------------------------------------------------------------------------------------

function appliquerMoteurs(plan: ResultatMoteurs | undefined, reglages: CibleReglages): ElementResultat {
  if (!plan) return vide('ok')
  if (plan.aAjouter.length) {
    const actuels: MoteurPerso[] = reglages.get().moteursPerso
    reglages.set({ moteursPerso: [...actuels, ...plan.aAjouter] })
  }
  return termine({ etat: 'ok', ajoutes: plan.aAjouter.length, presents: plan.presents, ignores: plan.ignores, notes: plan.notes })
}

// --- Réglages --------------------------------------------------------------------------------------------------------

const palierZoom = (z: number): number => PALIERS_ZOOM.reduce((p, c) => (Math.abs(c - z) < Math.abs(p - z) ? c : p), PALIERS_ZOOM[0])

/** Hôte → origines de Lyra : `https://hote`, et `https://www.hote` pour un domaine sans sous-domaine (et inversement). */
function hoteVersOrigines(hote: string): string[] {
  const h = hote.trim().toLowerCase()
  if (h.startsWith('www.')) return [`https://${h}`, `https://${h.slice(4)}`]
  return h.split('.').length === 2 ? [`https://${h}`, `https://www.${h}`] : [`https://${h}`]
}

function appliquerReglages(r: ReglagesImportes, plan: ResultatMoteurs | undefined, cible: CibleReglages, options: OptionsApplication): ElementResultat {
  const res = vide('ok')
  const actuel = cible.get()
  const patch: Partial<Settings> = {}

  if (r.pageAccueil !== undefined) {
    if (/^https?:\/\//i.test(r.pageAccueil)) {
      if (actuel.import.reglagesEnAttente.pageAccueil === r.pageAccueil) res.presents++
      else {
        patch.import = { extensionsEnAttente: actuel.import.extensionsEnAttente, reglagesEnAttente: { ...actuel.import.reglagesEnAttente, pageAccueil: r.pageAccueil } }
        res.ajoutes++
      }
      res.notes.push('Page d’accueil conservée : elle sera disponible avec Démarrage et sessions.')
    } else {
      res.ignores++
      res.notes.push('Page d’accueil ignorée : ce n’est pas une adresse web.')
    }
  }

  if (r.dossierTelechargement !== undefined) {
    const dossier = patchImporte({ telechargements: { dossier: r.dossierTelechargement } }).telechargements?.dossier
    if (dossier === undefined) {
      res.ignores++
      res.notes.push('Dossier de téléchargement introuvable sur cet ordinateur : ignoré.')
    } else if (dossier === actuel.telechargements.dossier) res.presents++
    else {
      patch.telechargements = { ...actuel.telechargements, dossier }
      res.ajoutes++
    }
  }

  if (r.langue !== undefined) {
    const lang = /^fr([-_]|$)/i.test(r.langue) ? 'fr' : /^en([-_]|$)/i.test(r.langue) ? 'en' : undefined
    if (!lang) {
      res.ignores++
      res.notes.push(`Langue « ${r.langue} » non disponible dans Lyra (français et anglais) : ignorée.`)
    } else if (lang === actuel.langue) res.presents++
    else {
      patch.langue = lang
      res.ajoutes++
    }
  }

  if (r.zoomParSite) {
    const sites: Settings['sites'] = {}
    for (const [hote, facteur] of Object.entries(r.zoomParSite)) {
      if (!Number.isFinite(facteur) || facteur <= 0) {
        res.ignores++
        continue
      }
      const zoom = palierZoom(facteur)
      const origines = hoteVersOrigines(hote)
      const conserve = origines.filter((o) => actuel.sites[o]?.zoom !== undefined)
      const aEcrire = zoom === 1 ? [] : origines.filter((o) => !conserve.includes(o))
      for (const o of aEcrire) sites[o] = { zoom }
      if (aEcrire.length) res.ajoutes++
      else res.presents++
      if (conserve.length) res.notes.push(`Zoom de ${hote} conservé : déjà réglé dans Lyra.`)
    }
    if (Object.keys(sites).length) patch.sites = sites
  }

  if (plan?.parDefaut) {
    const { id, nom } = plan.parDefaut
    const connu = MOTEURS.some((m) => m.id === id) || (patch.moteursPerso ?? actuel.moteursPerso).some((m) => m.id === id)
    if (!connu) res.notes.push(`Moteur par défaut « ${nom} » non appliqué : il n’a pas été importé.`)
    else if (id === actuel.moteurParDefaut) res.presents++
    else if (!actuel.moteurChoisi || options.moteurParDefaut) {
      patch.moteurParDefaut = id
      res.ajoutes++
      res.notes.push(`Moteur par défaut : ${nom}.`)
    } else res.notes.push(`Moteur par défaut « ${nom} » non appliqué : votre choix dans Lyra est conservé.`)
  } else if (plan?.defautAbsent) res.notes.push(`Le moteur par défaut « ${plan.defautAbsent} » n’existe pas dans Lyra : inchangé.`)

  if (Object.keys(patch).length) cible.set(patch)
  return termine(res)
}

// --- Extensions ------------------------------------------------------------------------------------------------------

function appliquerExtensions(liste: ExtensionImportee[], source: NavigateurSource, cible: CibleReglages, options: OptionsApplication): ElementResultat {
  const res = vide('ok')
  const actuel = cible.get()
  const maintenant = Date.now()
  let file: ExtensionEnAttente[] = [...actuel.import.extensionsEnAttente]
  const cle = (id: string, magasin: string): string => `${magasin}\u0000${id}`
  const vues = new Set<string>()
  let manuelles = 0
  let imposees = 0
  for (const e of liste) {
    if (e.imposee && !options.extensionsChoisies.includes(e.id)) {
      imposees++
      res.ignores++
      continue
    }
    const k = cle(e.id, e.magasin)
    if (vues.has(k)) continue
    vues.add(k)
    if (file.some((x) => cle(x.id, x.magasin) === k)) {
      res.presents++
      file = file.filter((x) => cle(x.id, x.magasin) !== k)
    } else res.ajoutes++
    if (e.magasin === 'edge' || e.magasin === 'inconnu') manuelles++
    file.push({ id: e.id, nom: e.nom, magasin: e.magasin, actif: e.actif, source, date: maintenant, ...(e.imposee ? { imposee: true } : {}) })
  }
  if (imposees) res.notes.push(`${imposees} extension(s) imposée(s) par une stratégie d’entreprise non mises en file (à cocher explicitement).`)
  if (manuelles) res.notes.push(`${manuelles} extension(s) d’Edge ou hors magasin : à installer à la main.`)
  if (vues.size) cible.set({ import: { extensionsEnAttente: file.slice(-MAX_EXTENSIONS), reglagesEnAttente: actuel.import.reglagesEnAttente } })
  return termine(res)
}

// --- Onglets ---------------------------------------------------------------------------------------------------------

async function appliquerOnglets(o: OngletsImportes, cibles: CiblesImport, options: OptionsApplication, avance: (e: ElementImport, fait: number, total?: number) => void, signal?: AbortSignal): Promise<ElementResultat> {
  const res = vide('ok')
  const utilises = new Set<CibleCiel>()
  const parCiel = new Map<CibleCiel, Map<string, string>>() // nom normalisé → id de constellation
  let creees = 0
  let reutilisees = 0
  let cree = 0
  const total = o.fenetres.reduce((s, f) => s + f.onglets.length, 0)

  const boucle = async (): Promise<ElementResultat | undefined> => {
    for (const fenetre of o.fenetres) {
      const aCreer = []
      const urls = new Set<string>()
      for (const t of fenetre.onglets) {
        if (!etoileOuvrable(t.url)) res.ignores++
        else if (urls.has(t.url)) res.ignores++
        else {
          urls.add(t.url)
          aCreer.push(t)
        }
      }
      if (!aCreer.length) continue
      const ciel = options.fenetre === 'nouvelle-par-fenetre' && cibles.nouvelleFenetre ? cibles.nouvelleFenetre() : cibles.ciel
      utilises.add(ciel)
      let noms = parCiel.get(ciel)
      if (!noms) {
        noms = new Map(ciel.constellations().map((c) => [normaliser(c.name), c.id]))
        parCiel.set(ciel, noms)
      }
      const constellationDe = new Map<string, string>() // id de groupe → id de constellation
      for (const g of fenetre.groupes) {
        const nom = g.nom.trim() || `Groupe ${g.couleur}`
        const existante = noms.get(normaliser(nom))
        if (existante) {
          constellationDe.set(g.id, existante)
          reutilisees++
        } else {
          const c = ciel.creerConstellation({ name: nom, color: couleurConstellation(COULEURS_GROUPE[g.couleur]) })
          noms.set(normaliser(nom), c.id)
          constellationDe.set(g.id, c.id)
          creees++
        }
      }
      for (let i = 0; i < aCreer.length; i++) {
        if (i % TRANCHE_ETOILES === 0) {
          if (signal?.aborted) return { ...res, etat: 'annule', notes: notesOnglets(res.notes, creees, reutilisees) }
          if (i > 0) await pause()
        }
        const t = aCreer[i]
        const id = ciel.ouvrirEndormie(t.url, { constellationId: t.groupe ? constellationDe.get(t.groupe) : undefined, titre: t.titre, epingle: t.epingle === true })
        res.ajoutes++
        if (options.ouvrirMaintenant && cree++ < ETOILES_OUVERTES_MAINTENANT) ciel.reveiller?.(id)
        if ((i + 1) % TRANCHE_ETOILES === 0) avance('onglets', res.ajoutes, total)
      }
    }
    return undefined
  }

  // Ce qui est écrit reste compté même si la boucle ou la sauvegarde de la session échoue.
  let erreur: unknown
  let interrompu: ElementResultat | undefined
  try {
    interrompu = await boucle()
  } catch (e) {
    erreur = e
  }
  for (const c of utilises) {
    try {
      await c.sauver()
    } catch (e) {
      erreur ??= e
    }
  }
  const sortie = interrompu ?? { ...res, notes: notesOnglets(res.notes, creees, reutilisees) }
  if (erreur !== undefined) return { ...sortie, etat: sortie.ajoutes > 0 ? 'partiel' : 'indisponible', raison: raisonDe(erreur) }
  return interrompu ?? termine(sortie)
}

function notesOnglets(notes: string[], creees: number, reutilisees: number): string[] {
  const n = [...notes]
  if (creees || reutilisees) n.push(`${creees} constellation(s) créée(s), ${reutilisees} réutilisée(s) (même nom).`)
  n.push('Les étoiles sont ajoutées sans tenir compte de celles qui existent déjà ; les adresses répétées dans une même fenêtre ne sont créées qu’une fois.')
  return n
}

// --- Historique ------------------------------------------------------------------------------------------------------

async function appliquerHistorique(source: Visite[] | AsyncIterable<Visite[]>, cible: CibleHistorique, avance: (e: ElementImport, fait: number, total?: number) => void, signal?: AbortSignal): Promise<ElementResultat> {
  const res = vide('ok')
  let vues = 0
  let visites = 0
  const total = Array.isArray(source) ? source.length : undefined

  const ecrire = async (lot: Visite[]): Promise<void> => {
    const r = cible.importer(lot.map((v) => ({ url: v.url, title: v.titre, date: v.date })))
    res.ajoutes += r.ajoutees
    res.presents += r.presentes
    visites += lot.reduce((n, v) => n + (Number.isFinite(v.visites) ? v.visites : 1), 0)
    res.ignores += lot.length - r.ajoutees - r.presentes // écartées par Lyra (schéma non retenu, date invalide)
    vues += lot.length
    avance('historique', vues, total)
    await pause()
  }

  async function* lots(): AsyncGenerator<Visite[]> {
    if (Array.isArray(source)) for (let i = 0; i < source.length; i += TAILLE_LOT_HISTORIQUE) yield source.slice(i, i + TAILLE_LOT_HISTORIQUE)
    else yield* source
  }

  try {
    for await (const lot of lots()) {
      if (signal?.aborted) {
        res.etat = 'annule'
        break
      }
      await ecrire(lot)
    }
  } catch (e) {
    if (signal?.aborted) res.etat = 'annule'
    else {
      res.etat = res.ajoutes + res.presents > 0 ? 'partiel' : 'indisponible'
      res.raison = raisonDe(e)
      const code = (e as { code?: CodeErreurImport }).code
      if (code) res.code = code
    }
  }
  try {
    await cible.attendre()
    if (res.ajoutes > 0) cible.compacterSiNecessaire()
  } catch (e) {
    // Les lignes déjà écrites restent comptées.
    if (res.etat === 'ok') res.etat = 'partiel'
    res.raison ??= raisonDe(e)
  }
  res.visites = visites
  res.notes.push(`${visites} visite(s), ${res.ajoutes} page(s) ajoutée(s) ; seule la dernière visite de chaque page est écrite.`)
  return res.etat === 'ok' ? termine(res) : res
}
