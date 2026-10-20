/**
 * Orchestration des passerelles (sans import electron : toutes les dépendances sont injectées).
 * - Rien n'est chargé ni testé tant qu'aucun site n'est contourné (sauf détection ou action explicite).
 * - Pool : la passerelle personnelle si elle est définie (seule à pouvoir porter du http), sinon les
 *   publiques trouvées ; re-test toutes les 10 min tant que des sites sont contournés, et dès qu'un
 *   échec est signalé (une fois par minute au plus).
 * - Sobriété : après une recherche infructueuse, délai de grâce de 10 min (sauf « Tester maintenant »
 *   et « Réessayer ») ; cache négatif de 10 min par hôte pour la détection ; test direct mémorisé 1 min.
 * - Le PAC est appliqué à chaque session à chaque changement ; closeAllConnections seulement quand un
 *   hôte passe du direct au contournement. Sans site contourné, retour au proxy système (jamais de PAC
 *   appliqué si aucun site ne l'a été). Tant qu'un PAC est appliqué, le proxy système est relu toutes
 *   les 60 s (et après un échec de proxy sur un site non contourné) : le PAC suit ses changements.
 * - Échec de navigation : rotation (2 essais au plus) sur un site contourné, détection automatique sinon
 *   (jamais en fenêtre privée ni pour un domaine à usage spécial : .local, .lan, .test…).
 */
import type { PasserellePerso, Settings, SiteContourne } from '../../shared/types'
import type { EtatPasserelles } from '../../shared/ipc'
import { estCodeBlocage, estEchecPasserelle } from './blocage'
import { domaineUsageSpecial, hoteCouvert, hoteValide, type Candidat } from './liste'
import { genererPac, pacDataUrl } from './pac'
import { ecarter } from './selection'
import { melanger, type ResultatCandidats } from './sources'
import { typeErreur, urlErreur } from '../tabs/erreurs'
import { validerPatch } from '../settings/validate'

type Reseau = Settings['reseau']

/** Ce que l'orchestration demande d'une session Electron. */
export interface SessionProxy {
  setProxy(config: { mode: 'pac_script'; pacScript: string } | { mode: 'system' }): Promise<void>
  closeAllConnections(): Promise<void>
}

export type ErreurPasserelles = NonNullable<EtatPasserelles['erreur']>
export type { EtatPasserelles }

export type DecisionEchec = { action: 'recharger' } | { action: 'erreur'; url: string }

/** Ce que les vues d'étoile appellent (did-fail-load, did-navigate, destruction, pilule). */
export interface CrochetsPasserelles {
  /** Début de navigation principale : met fin à l'essai suivi si l'adresse change ; page d'erreur si http refusé. */
  surDebut(cle: number, url: string): string | null
  /** Redirection principale : page d'erreur si http refusé. */
  refusHttp(url: string): string | null
  surEchec(cle: number, url: string, code: number): Promise<DecisionEchec>
  surSucces(cle: number, url: string, codeHttp?: number): void
  oublier(cle: number): void
  viaPasserelle(url: string): boolean
  /** Une recherche de passerelle est en cours pour cette navigation (état « Recherche d'une passerelle… »). */
  enRecherche(cle: number): boolean
}

export interface DepsPasserelles {
  reseau(): Reseau
  /** Écrit la liste complète des sites contournés (les réglages rappellent ensuite `surReglages`). */
  ecrireSites(sites: SiteContourne[]): void
  /** Écrit ou supprime (null) la passerelle personnelle ; une valeur invalide n'est pas écrite. */
  ecrirePersonnelle(p: PasserellePerso | null): void
  sessions(): SessionProxy[]
  charger(): Promise<ResultatCandidats>
  /** Teste les candidats et renvoie les meilleurs, du plus rapide au plus lent. */
  trouver(candidats: Candidat[]): Promise<Candidat[]>
  tester(c: Candidat): Promise<{ ok: boolean; ms: number }>
  /** Le réseau fonctionne-t-il en direct ? (requête bornée dans le temps) */
  testerDirect(): Promise<boolean>
  maintenant(): number
  /** Minuterie ; renvoie la fonction d'annulation. */
  planifier(fn: () => void, ms: number): () => void
  aleatoire?: () => number
  /**
   * Proxy système (règle PAC par schéma), lu sur une session jamais modifiée : il reste le chemin des
   * sites non contournés. Absent : DIRECT.
   */
  proxySysteme?(): Promise<{ https: string; http: string }>
  surChangement?(etat: EtatPasserelles): void
}

export const RETEST_MS = 10 * 60 * 1000
/** Rechargements au plus après un échec sur un site contourné (rotation). */
export const ESSAIS_MAX = 2
export const WARP: PasserellePerso = { type: 'socks5', hote: '127.0.0.1', port: 40000 }
const MAX_SITES = 500
/** Délai de grâce après une recherche infructueuse. */
export const GRACE_MS = 10 * 60 * 1000
/** Cache négatif de la détection automatique, par hôte. */
export const NEGATIF_MS = 10 * 60 * 1000
const MAX_NEGATIFS = 500
/** Durée de mémorisation du test direct. */
export const DIRECT_MS = 60 * 1000
/** Relecture du proxy système tant qu'un PAC est appliqué. */
export const VEILLE_SYSTEME_MS = 60 * 1000
/** Re-test des retenues après un échec signalé : une fois par minute au plus. */
export const RETEST_ECHEC_MS = 60 * 1000
/** Échecs de proxy (connexion, tunnel, SOCKS) : le proxy système a peut-être changé. */
const ECHECS_PROXY = new Set([-130, -111, -120])

/** Options d'une fenêtre : `privee` : rien n'est jamais écrit dans les réglages ni proposé pour l'être. */
export interface OptionsFenetre {
  privee: boolean
}

interface Navigation {
  url: string
  phase: 'rotation' | 'detection'
  essais: number
  /** Hôte essayé (détection). */
  hote?: string
}

function decouper(url: string): { schema: string; hote: string } | undefined {
  try {
    const u = new URL(url)
    return { schema: u.protocol.replace(/:$/, '').toLowerCase(), hote: u.hostname.toLowerCase().replace(/\.+$/, '') }
  } catch {
    return undefined
  }
}

/** « www.exemple.fr » → « exemple.fr » (les sous-domaines restent couverts). */
const sansWww = (h: string): string => {
  const s = h.replace(/^www\./, '')
  return hoteValide(s) ? s : h
}

const memePerso = (a?: PasserellePerso, b?: PasserellePerso): boolean =>
  a === b || (!!a && !!b && a.type === b.type && a.hote === b.hote && a.port === b.port)

export class Passerelles implements CrochetsPasserelles {
  private pool: Candidat[] = []
  private poolPerso = false
  private dateListe: string | null = null
  private erreur: ErreurPasserelles | undefined
  /** Génération du pool : change avec la passerelle personnelle (une recherche périmée est ignorée). */
  private gen = 0
  private recherche: { gen: number; p: Promise<void> } | undefined
  private chercheGen = -1
  /** PAC appliqué aux sessions ; null : proxy système (état initial, aucune requête) ; undefined : inconnu (échec). */
  private applique: string | null | undefined = null
  private file: Promise<void> = Promise.resolve()
  private annulerRetest: (() => void) | undefined
  /** Hôtes en cours d'essai par la détection automatique (pas encore enregistrés). */
  private essais = new Map<string, number>()
  private navs = new Map<number, Navigation>()
  /** Navigations (clé = webContents) qui attendent la détection ou la rotation : affichées dans la pilule. */
  private cherche = new Map<number, number>()
  private persoConnue: PasserellePerso | undefined
  private taches = new Set<Promise<unknown>>()
  /** Dernière recherche infructueuse (délai de grâce), pour la génération courante. */
  private echecRecherche: { gen: number; date: number } | undefined
  /** Cache négatif de la détection : hôte → date de l'échec. */
  private negatifs = new Map<string, number>()
  /** Test direct en cours ou mémorisé (fin = date du résultat). */
  private direct: { p: Promise<boolean>; fin?: number } | undefined
  private annulerVeille: (() => void) | undefined
  /** Hôtes contournés par le PAC appliqué (closeAllConnections seulement pour un nouvel hôte). */
  private hotesAppliques = new Set<string>()
  private dernierRetestEchec = -Infinity

  constructor(private readonly deps: DepsPasserelles) {
    this.persoConnue = deps.reseau().personnelle
  }

  /** Premier état (au démarrage) : rien n'est fait si aucun site n'est contourné. Résolue quand le PAC initial est appliqué. */
  demarrer(): Promise<void> {
    this.surReglages()
    return this.file
  }

  /** À appeler à chaque changement de réglages. */
  surReglages(): void {
    const r = this.deps.reseau()
    if (!memePerso(r.personnelle, this.persoConnue)) {
      this.persoConnue = r.personnelle
      this.gen++
      this.pool = []
      this.poolPerso = false
      this.erreur = undefined
    }
    if (this.sert()) {
      if (this.pool.length === 0 && this.chercheGen !== this.gen) this.suivre(this.rechercher())
      this.armerRetest()
    } else {
      this.annulerRetest?.()
      this.annulerRetest = undefined
    }
    this.suivre(this.appliquer())
    this.notifier()
  }

  /** Attend la fin des tâches lancées (recherches, application du PAC). Pour les tests et l'arrêt. */
  async attendre(): Promise<void> {
    while (this.taches.size > 0) await Promise.allSettled([...this.taches])
    await this.file
  }

  /**
   * Résolue quand le PAC voulu est appliqué à toutes les sessions (connexions ouvertes fermées). Un ajout suivi
   * aussitôt d'un rechargement l'attend : sinon la fermeture des connexions interrompt la navigation (-3, ignoré).
   */
  pacApplique(): Promise<void> {
    return this.file
  }

  arreter(): void {
    this.annulerRetest?.()
    this.annulerRetest = undefined
    this.annulerVeille?.()
    this.annulerVeille = undefined
  }

  etat(): EtatPasserelles {
    const r = this.deps.reseau()
    return {
      actif: r.passerelles,
      auto: r.auto,
      sites: r.sites,
      pret: this.pool.length,
      dateListe: this.dateListe,
      ...(r.personnelle ? { personnelle: r.personnelle } : {}),
      ...(this.erreur ? { erreur: this.erreur } : {}),
      enCours: this.recherche !== undefined
    }
  }

  /** L'adresse est-elle routée par une passerelle (site de la liste ou en essai, fonction activée) ? */
  contourne(url: string): boolean {
    const r = this.deps.reseau()
    const d = decouper(url)
    if (!r.passerelles || !d) return false
    return hoteCouvert(d.hote, [...r.sites.map((s) => s.hote), ...this.essais.keys()])
  }

  /** La page passe-t-elle réellement par une passerelle prête ? (icône de la pilule) */
  viaPasserelle(url: string): boolean {
    const d = decouper(url)
    if (!d || this.pool.length === 0 || !this.contourne(url)) return false
    return d.schema === 'https' || (this.poolPerso && d.schema === 'http')
  }

  /**
   * Page d'erreur ordinaire, avec ses options : jamais « Continuer » sur un site contourné ; « Passer par
   * une passerelle » en https, sauf en fenêtre privée (l'ajout écrirait dans les réglages).
   */
  urlErreurPour(code: number, url: string, o: { privee?: boolean } = {}): string {
    const extra: Record<string, string> = {}
    const d = decouper(url)
    if (this.contourne(url)) extra.contourne = '1'
    else if (!o.privee && d?.schema === 'https' && this.deps.reseau().passerelles && hoteValide(d.hote)) extra.passerelle = '1'
    return urlErreur(typeErreur(code), url, extra)
  }

  /** Menu ⋯ : la bascule « passer / ne plus passer par une passerelle » est-elle proposée ? Jamais en fenêtre privée. */
  basculable(url: string, privee: boolean): boolean {
    const d = decouper(url)
    return !privee && d?.schema === 'https' && hoteValide(d.hote.replace(/^www\./, ''))
  }

  private urlAucune(url: string): string {
    return urlErreur('passerelles', url, { contourne: '1' })
  }

  /** Crochets d'une fenêtre ; fenêtre privée : ni détection ni proposition d'ajout (rien n'est écrit dans les réglages). */
  crochets(o: OptionsFenetre): CrochetsPasserelles {
    return {
      surDebut: (c, u) => this.surDebut(c, u),
      refusHttp: (u) => this.refusHttp(u),
      surEchec: (c, u, code) => this.surEchec(c, u, code, o),
      surSucces: (c, u, code) => this.surSucces(c, u, code),
      oublier: (c) => this.oublier(c),
      viaPasserelle: (u) => this.viaPasserelle(u),
      enRecherche: (c) => this.enRecherche(c)
    }
  }

  enRecherche(cle: number): boolean {
    return (this.cherche.get(cle) ?? 0) > 0
  }

  /** Exécute `fn` en signalant à la pilule qu'une passerelle est cherchée pour cette navigation. */
  private async cherchant<T>(cle: number, fn: () => Promise<T>): Promise<T> {
    this.cherche.set(cle, (this.cherche.get(cle) ?? 0) + 1)
    this.notifier()
    try {
      return await fn()
    } finally {
      const n = (this.cherche.get(cle) ?? 1) - 1
      if (n > 0) this.cherche.set(cle, n)
      else this.cherche.delete(cle)
      this.notifier()
    }
  }

  /** Début d'une navigation principale : une autre adresse met fin à l'essai ou à la rotation suivis. */
  surDebut(cle: number, url: string): string | null {
    const nav = this.navs.get(cle)
    if (nav && nav.url !== url) this.terminer(cle)
    return this.refusHttp(url)
  }

  /**
   * http/ws vers un site contourné : seule une passerelle personnelle prête peut le porter ; sinon page
   * d'erreur « http » (le PAC l'enverrait par le chemin habituel, c'est-à-dire vers le blocage).
   */
  refusHttp(url: string): string | null {
    const d = decouper(url)
    if (!d || (d.schema !== 'http' && d.schema !== 'ws') || !this.contourne(url)) return null
    if (this.poolPerso && this.pool.length > 0) return null
    return urlErreur('http', url, { contourne: '1' })
  }

  /** Échec de chargement du cadre principal (`did-fail-load`) : recharger ou page d'erreur. Ne lève pas. */
  async surEchec(cle: number, url: string, code: number, o: OptionsFenetre = { privee: false }): Promise<DecisionEchec> {
    const normale = (): DecisionEchec => ({ action: 'erreur', url: this.urlErreurPour(code, url, o) })
    let nav = this.navs.get(cle)
    if (nav && nav.url !== url) {
      // Essai de détection abandonné : `terminer` retire l'hôte d'essai du PAC.
      this.terminer(cle)
      nav = undefined
    }
    const d = decouper(url)
    // Échec de proxy hors contournement : le proxy système a peut-être changé, le PAC est recalculé.
    if (d && ECHECS_PROXY.has(code) && typeof this.applique === 'string' && !this.contourne(url)) this.suivre(this.appliquer())
    // Certificat : jamais de rotation ni de détection (interception TLS possible).
    if (!d || typeErreur(code) === 'certificat') {
      const decision = normale()
      this.terminer(cle)
      return decision
    }
    // L'essai de détection a échoué : rien n'est ajouté, pas de seconde tentative.
    if (nav?.phase === 'detection') {
      if (nav.hote) this.marquerNegatif(nav.hote)
      this.terminer(cle)
      await this.appliquer()
      return normale()
    }
    const r = this.deps.reseau()
    const portee = d.schema === 'https' || (this.poolPerso && d.schema === 'http')
    if (this.contourne(url) && portee && (estEchecPasserelle(code) || estCodeBlocage(code))) {
      const essais = nav?.essais ?? 0
      if (essais >= ESSAIS_MAX) {
        this.terminer(cle)
        return { action: 'erreur', url: this.urlAucune(url) }
      }
      if (this.pool.length > 0) this.signalerEchec(this.pool[0])
      await this.cherchant(cle, () => this.assurerPool())
      if (this.pool.length === 0) {
        this.terminer(cle)
        return { action: 'erreur', url: this.urlAucune(url) }
      }
      this.navs.set(cle, { url, phase: 'rotation', essais: essais + 1 })
      await this.appliquer()
      return { action: 'recharger' }
    }
    const detectable =
      !o.privee && r.passerelles && r.auto && !nav && d.schema === 'https' && estCodeBlocage(code) && hoteValide(d.hote) && !domaineUsageSpecial(d.hote)
    if (detectable && !this.contourne(url) && !this.negatif(sansWww(d.hote))) {
      const hote = sansWww(d.hote)
      const pret = await this.cherchant(cle, async () => {
        if (!(await this.testerDirect())) return false
        await this.assurerPool()
        return true
      })
      if (!pret) return normale()
      if (this.pool.length === 0) {
        this.marquerNegatif(hote)
        return normale()
      }
      if (this.navs.has(cle)) return normale()
      this.essais.set(hote, (this.essais.get(hote) ?? 0) + 1)
      this.navs.set(cle, { url, phase: 'detection', essais: 1, hote })
      await this.appliquer()
      return { action: 'recharger' }
    }
    this.terminer(cle)
    return normale()
  }

  /**
   * Chargement du cadre principal (`did-navigate`) : confirme une détection seulement si l'adresse chargée
   * est couverte par l'hôte essayé et que la réponse est < 400 ; remet la rotation à zéro.
   */
  surSucces(cle: number, url: string, codeHttp?: number): void {
    const nav = this.navs.get(cle)
    if (!nav) return
    if (nav.phase === 'detection' && nav.hote) {
      const hote = nav.hote
      this.terminer(cle)
      const d = decouper(url)
      const reussi = !!d && d.schema === 'https' && hoteCouvert(d.hote, [hote]) && (codeHttp === undefined || codeHttp < 400)
      if (!reussi) {
        this.marquerNegatif(hote)
        return
      }
      const r = this.deps.reseau()
      if (!hoteCouvert(hote, r.sites.map((s) => s.hote)) && r.sites.length < MAX_SITES) {
        this.deps.ecrireSites([...r.sites, { hote, origine: 'auto', date: this.deps.maintenant() }])
      }
      return
    }
    this.navs.delete(cle)
  }

  /** La vue a disparu : oublie sa navigation (et retire l'hôte d'essai). */
  oublier(cle: number): void {
    this.cherche.delete(cle)
    this.terminer(cle)
  }

  /** Oublie la navigation suivie ; un essai de détection qui s'arrête retire son hôte du PAC. */
  private terminer(cle: number): void {
    const nav = this.navs.get(cle)
    this.navs.delete(cle)
    if (nav?.phase === 'detection' && nav.hote) {
      const n = (this.essais.get(nav.hote) ?? 1) - 1
      if (n > 0) this.essais.set(nav.hote, n)
      else this.essais.delete(nav.hote)
      this.suivre(this.appliquer())
    }
  }

  /** L'hôte a-t-il échoué à la détection il y a moins de 10 min ? */
  private negatif(hote: string): boolean {
    const date = this.negatifs.get(hote)
    if (date === undefined) return false
    if (this.deps.maintenant() - date < NEGATIF_MS) return true
    this.negatifs.delete(hote)
    return false
  }

  private marquerNegatif(hote: string): void {
    this.negatifs.delete(hote)
    if (this.negatifs.size >= MAX_NEGATIFS) {
      const plusAncien = this.negatifs.keys().next().value
      if (plusAncien !== undefined) this.negatifs.delete(plusAncien)
    }
    this.negatifs.set(hote, this.deps.maintenant())
  }

  /** Test direct mutualisé (appels concurrents) et mémorisé 1 min. */
  private testerDirect(): Promise<boolean> {
    const m = this.direct
    if (m && (m.fin === undefined || this.deps.maintenant() - m.fin < DIRECT_MS)) return m.p
    const memo: { p: Promise<boolean>; fin?: number } = { p: Promise.resolve(false) }
    memo.p = this.deps
      .testerDirect()
      .catch(() => false)
      .then((ok) => {
        memo.fin = this.deps.maintenant()
        return ok
      })
    this.direct = memo
    return memo.p
  }

  // — Liste des sites —

  ajouter(saisie: string, origine: SiteContourne['origine'] = 'manuel'): EtatPasserelles {
    const hote = this.normaliser(saisie)
    const r = this.deps.reseau()
    if (!r.sites.some((s) => s.hote === hote)) {
      if (r.sites.length >= MAX_SITES) throw new Error('Liste pleine (500 sites)')
      // Ajout explicite : lève le délai de grâce (l'échec suivant cherche une passerelle sans attendre).
      this.echecRecherche = undefined
      this.deps.ecrireSites([...r.sites, { hote, origine, date: this.deps.maintenant() }])
    }
    return this.etat()
  }

  /** « Passer par une passerelle » (page d'erreur) : ajoute l'hôte https ; message lisible si l'ajout est refusé. */
  ajouterDepuisErreur(url: string, o: { privee?: boolean } = {}): { ok: boolean; erreur?: string } {
    const d = decouper(url)
    // Fenêtre privée : rien n'est écrit dans les réglages.
    if (o.privee || !d || d.schema !== 'https' || !this.deps.reseau().passerelles || !hoteValide(d.hote)) return { ok: false }
    try {
      this.ajouter(d.hote)
      return { ok: true }
    } catch (e) {
      return { ok: false, erreur: e instanceof Error ? e.message : String(e) }
    }
  }

  retirer(saisie: string): EtatPasserelles {
    const brut = String(saisie ?? '').trim().toLowerCase().replace(/\.+$/, '')
    const h = sansWww(brut)
    const vise = (s: SiteContourne): boolean => s.hote === h || s.hote === brut
    const r = this.deps.reseau()
    if (r.sites.some(vise)) this.deps.ecrireSites(r.sites.filter((s) => !vise(s)))
    return this.etat()
  }

  /** Menu ⋯ : retire les sites qui couvrent l'hôte, sinon l'ajoute. */
  basculerSite(saisie: string): EtatPasserelles {
    const hote = this.normaliser(saisie)
    const r = this.deps.reseau()
    const couvrants = r.sites.filter((s) => hoteCouvert(hote, [s.hote]) || hoteCouvert(sansWww(hote), [s.hote]))
    if (couvrants.length > 0) {
      this.deps.ecrireSites(r.sites.filter((s) => !couvrants.includes(s)))
      return this.etat()
    }
    return this.ajouter(hote)
  }

  /** Saisie (hôte ou adresse) → hôte enregistrable ; http:// refusé sans passerelle personnelle. */
  private normaliser(saisie: string): string {
    let t = String(saisie ?? '').trim().toLowerCase()
    const m = /^([a-z][a-z0-9+.-]*):\/\//.exec(t)
    if (m) {
      const schema = m[1]
      if ((schema === 'http' || schema === 'ws') && !this.deps.reseau().personnelle) {
        throw new Error('Seuls les sites https passent par une passerelle publique (une passerelle personnelle peut porter le http).')
      }
      if (!['https', 'wss', 'http', 'ws'].includes(schema)) throw new Error('Adresse de site invalide')
      const d = decouper(t)
      if (!d) throw new Error('Adresse de site invalide')
      t = d.hote
    } else t = t.split(/[/?#]/)[0].replace(/:\d+$/, '')
    t = sansWww(t.replace(/\.+$/, ''))
    if (!hoteValide(t)) throw new Error('Adresse de site invalide')
    return t
  }

  // — Passerelle personnelle —

  /** Définit (testée aussitôt) ou supprime (null) la passerelle personnelle. */
  async definirPersonnelle(config: PasserellePerso | null): Promise<EtatPasserelles> {
    if (config === null) {
      this.deps.ecrirePersonnelle(null)
    } else {
      // Même liste blanche que les réglages : type, hôte (domaine ou IPv4), port 1-65535.
      const valide = validerPatch({ reseau: { personnelle: config } }).reseau?.personnelle as PasserellePerso | undefined
      if (!valide) throw new Error('Passerelle personnelle invalide')
      this.deps.ecrirePersonnelle(valide)
      await this.rechercher()
    }
    await this.attendre()
    return this.etat()
  }

  /** Cloudflare WARP en mode proxy local (SOCKS5 127.0.0.1:40000). */
  warp(): Promise<EtatPasserelles> {
    return this.definirPersonnelle(WARP)
  }

  /** « Tester maintenant » : recherche explicite, même sans site contourné. */
  async tester(): Promise<EtatPasserelles> {
    this.echecRecherche = undefined
    await this.rechercher(true)
    await this.attendre()
    return this.etat()
  }

  /**
   * « Réessayer » (page d'erreur) : action explicite, lève le délai de grâce et le cache négatif de l'hôte ;
   * `recherche` (page « Aucune passerelle ne répond ») : nouvelle recherche aussitôt.
   */
  reessayer(url: string, recherche: boolean): void {
    this.echecRecherche = undefined
    const d = decouper(url)
    if (d) this.negatifs.delete(sansWww(d.hote))
    if (recherche) this.suivre(this.rechercher(true))
  }

  // — Pool —

  /** Lance (ou rejoint) une recherche : personnelle testée, sinon publiques re-mélangées et testées. */
  rechercher(nouvelle = false): Promise<void> {
    if (this.recherche && this.recherche.gen === this.gen) {
      if (!nouvelle) return this.recherche.p
      const enCours = this.recherche.p
      return enCours.then(() => this.rechercher(false))
    }
    // Délai de grâce après une recherche infructueuse : pas de nouvelle recherche implicite avant 10 min.
    const e = this.echecRecherche
    if (e && e.gen === this.gen && this.deps.maintenant() - e.date < GRACE_MS) return Promise.resolve()
    const gen = this.gen
    const p = this.executer(gen)
      .catch(() => undefined)
      .finally(() => {
        if (this.recherche?.p === p) this.recherche = undefined
        this.notifier()
      })
    this.recherche = { gen, p }
    this.notifier()
    return p
  }

  private async executer(gen: number): Promise<void> {
    const perso = this.deps.reseau().personnelle
    let pool: Candidat[]
    let erreur: ErreurPasserelles | undefined
    let date = this.dateListe
    if (perso) {
      const r = await this.deps.tester(perso).catch(() => ({ ok: false, ms: 0 }))
      pool = r.ok ? [perso] : []
      erreur = r.ok ? undefined : 'injoignable'
    } else {
      const res = await this.deps.charger()
      if (res.candidats.length > 0) date = res.date
      // Re-mélange à chaque recherche : l'ordre du cache (30 min) ne fige pas les candidats testés.
      pool = res.candidats.length > 0 ? await this.deps.trouver(melanger(res.candidats, this.deps.aleatoire)) : []
      erreur = pool.length > 0 ? undefined : res.candidats.length > 0 ? 'aucune' : 'liste'
    }
    if (gen !== this.gen) return
    this.pool = pool
    this.poolPerso = !!perso
    this.erreur = erreur
    this.dateListe = date
    this.chercheGen = gen
    this.echecRecherche = pool.length === 0 ? { gen, date: this.deps.maintenant() } : undefined
    await this.appliquer()
  }

  private async assurerPool(): Promise<void> {
    if (this.pool.length === 0) await this.rechercher()
  }

  /**
   * Passerelle en échec : retirée du pool (rotation) ; le PAC est régénéré par l'appelant. Les autres
   * retenues sont re-testées aussitôt (une fois par minute au plus : pas de boucle).
   */
  private signalerEchec(c: Candidat): void {
    this.pool = ecarter(this.pool, c)
    if (this.pool.length === 0 && !this.poolPerso) this.erreur = 'aucune'
    this.notifier()
    const t = this.deps.maintenant()
    if (!this.poolPerso && this.pool.length > 0 && t - this.dernierRetestEchec >= RETEST_ECHEC_MS) {
      this.dernierRetestEchec = t
      this.suivre(this.retester())
    }
  }

  private async retester(): Promise<void> {
    if (!this.sert() || this.recherche) return
    if (this.poolPerso || this.pool.length === 0) return this.rechercher()
    const gen = this.gen
    const avant = this.pool
    const resultats = await Promise.all(avant.map(async (c) => ({ c, r: await this.deps.tester(c).catch(() => ({ ok: false, ms: 0 })) })))
    if (gen !== this.gen) return
    const garde = resultats.filter((x) => x.r.ok).sort((a, b) => a.r.ms - b.r.ms).map((x) => x.c)
    // Une rotation pendant le re-test a pu écarter des passerelles : on ne les réintroduit pas.
    this.pool = garde.filter((c) => this.pool.includes(c))
    if (this.pool.length === 0) await this.rechercher()
    else await this.appliquer()
    this.notifier()
  }

  private armerRetest(): void {
    if (this.annulerRetest) return
    this.annulerRetest = this.deps.planifier(() => {
      this.annulerRetest = undefined
      this.suivre(this.retester().finally(() => this.sert() && this.armerRetest()))
    }, RETEST_MS)
  }

  /** Au moins un site est contourné et la fonction est activée. */
  private sert(): boolean {
    const r = this.deps.reseau()
    return r.passerelles && r.sites.length > 0
  }

  // — Sessions —

  private async pacVoulu(): Promise<{ pac: string | null; hotes: string[] }> {
    const r = this.deps.reseau()
    if (!r.passerelles) return { pac: null, hotes: [] }
    const hotes = [...r.sites.map((s) => s.hote), ...this.essais.keys()]
    if (hotes.length === 0) return { pac: null, hotes: [] }
    // Proxy système relu avant chaque application. Limite : une seule règle par schéma (celle d'une adresse
    // témoin), approximation d'un PAC système qui distinguerait les hôtes.
    const systeme = this.deps.proxySysteme ? await this.deps.proxySysteme().catch(() => undefined) : undefined
    return { pac: genererPac(hotes, this.pool, this.poolPerso && this.pool.length > 0, systeme ?? 'DIRECT'), hotes }
  }

  /**
   * Applique le PAC voulu (en série) à chaque session. Les connexions ouvertes ne sont fermées que si un
   * hôte passe du direct au contournement (ajout ou essai) : rotation et retrait les laissent vivre.
   */
  private appliquer(): Promise<void> {
    this.file = this.file
      .then(async () => {
        try {
          const voulu = await this.pacVoulu()
          if (voulu.pac === this.applique) return
          const fermer = this.applique === undefined || voulu.hotes.some((h) => !this.hotesAppliques.has(h))
          // Retenu seulement après succès : un échec laisse l'état « inconnu », réappliqué au prochain appel.
          this.applique = undefined
          for (const s of this.deps.sessions()) {
            await s.setProxy(voulu.pac === null ? { mode: 'system' } : { mode: 'pac_script', pacScript: pacDataUrl(voulu.pac) })
            if (fermer) await s.closeAllConnections()
          }
          this.applique = voulu.pac
          this.hotesAppliques = new Set(voulu.hotes)
          this.notifier()
        } finally {
          this.veillerSysteme()
        }
      })
      .catch(() => undefined)
    return this.file
  }

  /**
   * Met une session créée après coup (fenêtre privée) au même état que les autres : le PAC appliqué, ou le proxy
   * système. Rien n'est détecté ni écrit ; la session doit aussi figurer dans `deps.sessions()` pour les mises à jour.
   */
  attacherSession(s: SessionProxy): Promise<void> {
    this.file = this.file
      .then(async () => {
        await s.setProxy(typeof this.applique === 'string' ? { mode: 'pac_script', pacScript: pacDataUrl(this.applique) } : { mode: 'system' })
      })
      .catch(() => undefined)
    return this.file
  }

  /** Tant qu'un PAC est appliqué, relit le proxy système toutes les 60 s (résolution locale, sans requête). */
  private veillerSysteme(): void {
    // État inconnu (échec de setProxy) : la veille est réarmée pour réappliquer sans attendre un autre événement.
    const veiller = this.applique === undefined || (typeof this.applique === 'string' && this.deps.proxySysteme !== undefined)
    if (veiller) {
      if (this.annulerVeille) return
      this.annulerVeille = this.deps.planifier(() => {
        this.annulerVeille = undefined
        this.suivre(this.appliquer())
      }, VEILLE_SYSTEME_MS)
    } else if (this.applique === null) {
      this.annulerVeille?.()
      this.annulerVeille = undefined
    }
  }

  private suivre(p: Promise<unknown>): void {
    const t = p.catch(() => undefined)
    this.taches.add(t)
    void t.finally(() => this.taches.delete(t))
  }

  private notifier(): void {
    this.deps.surChangement?.(this.etat())
  }
}
