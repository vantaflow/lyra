/**
 * Orchestration des passerelles (sans import electron : toutes les dépendances sont injectées).
 * - Rien n'est chargé ni testé tant qu'aucun site n'est contourné (sauf détection ou action explicite).
 * - Pool : la passerelle personnelle si elle est définie (seule à pouvoir porter du http), sinon les
 *   publiques trouvées ; re-test toutes les 10 min tant que des sites sont contournés.
 * - Le PAC est appliqué à chaque session à chaque changement (puis closeAllConnections) ; sans site
 *   contourné, retour au proxy système (jamais de PAC appliqué si aucun site ne l'a été).
 * - Échec de navigation : rotation (2 essais au plus) sur un site contourné, détection automatique sinon.
 */
import type { PasserellePerso, Settings, SiteContourne } from '../../shared/types'
import type { EtatPasserelles } from '../../shared/ipc'
import { estCodeBlocage, estEchecPasserelle } from './blocage'
import { hoteCouvert, hoteValide, type Candidat } from './liste'
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
  private persoConnue: PasserellePerso | undefined
  private taches = new Set<Promise<unknown>>()

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

  arreter(): void {
    this.annulerRetest?.()
    this.annulerRetest = undefined
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

  /** Page d'erreur ordinaire, avec ses options : jamais « Continuer » sur un site contourné ; « Passer par une passerelle » en https. */
  urlErreurPour(code: number, url: string): string {
    const extra: Record<string, string> = {}
    const d = decouper(url)
    if (this.contourne(url)) extra.contourne = '1'
    else if (d?.schema === 'https' && this.deps.reseau().passerelles && hoteValide(d.hote)) extra.passerelle = '1'
    return urlErreur(typeErreur(code), url, extra)
  }

  private urlAucune(url: string): string {
    return urlErreur('passerelles', url, { contourne: '1' })
  }

  /** Crochets d'une fenêtre ; `detection: false` (fenêtre privée) : rien n'est jamais écrit dans les réglages. */
  crochets(o: { detection: boolean }): CrochetsPasserelles {
    return {
      surDebut: (c, u) => this.surDebut(c, u),
      refusHttp: (u) => this.refusHttp(u),
      surEchec: (c, u, code) => this.surEchec(c, u, code, o),
      surSucces: (c, u, code) => this.surSucces(c, u, code),
      oublier: (c) => this.oublier(c),
      viaPasserelle: (u) => this.viaPasserelle(u)
    }
  }

  /** Début d'une navigation principale : une autre adresse met fin à l'essai ou à la rotation suivis. */
  surDebut(cle: number, url: string): string | null {
    const nav = this.navs.get(cle)
    if (nav && nav.url !== url) {
      this.terminer(cle)
      if (nav.phase === 'detection') this.suivre(this.appliquer())
    }
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
  async surEchec(cle: number, url: string, code: number, o: { detection: boolean } = { detection: true }): Promise<DecisionEchec> {
    const normale = (): DecisionEchec => ({ action: 'erreur', url: this.urlErreurPour(code, url) })
    let nav = this.navs.get(cle)
    if (nav && nav.url !== url) {
      this.terminer(cle)
      nav = undefined
    }
    const d = decouper(url)
    // Certificat : jamais de rotation ni de détection (interception TLS possible).
    if (!d || typeErreur(code) === 'certificat') {
      const decision = normale()
      this.terminer(cle)
      return decision
    }
    // L'essai de détection a échoué : rien n'est ajouté, pas de seconde tentative.
    if (nav?.phase === 'detection') {
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
      await this.assurerPool()
      if (this.pool.length === 0) {
        this.terminer(cle)
        return { action: 'erreur', url: this.urlAucune(url) }
      }
      this.navs.set(cle, { url, phase: 'rotation', essais: essais + 1 })
      await this.appliquer()
      return { action: 'recharger' }
    }
    if (o.detection && r.passerelles && r.auto && !nav && d.schema === 'https' && estCodeBlocage(code) && hoteValide(d.hote) && !this.contourne(url)) {
      if (!(await this.deps.testerDirect().catch(() => false))) return normale()
      await this.assurerPool()
      if (this.pool.length === 0 || this.navs.has(cle)) return normale()
      const hote = sansWww(d.hote)
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
        this.suivre(this.appliquer())
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
    if (this.navs.has(cle)) {
      this.terminer(cle)
      this.suivre(this.appliquer())
    }
  }

  private terminer(cle: number): void {
    const nav = this.navs.get(cle)
    this.navs.delete(cle)
    if (nav?.phase === 'detection' && nav.hote) {
      const n = (this.essais.get(nav.hote) ?? 1) - 1
      if (n > 0) this.essais.set(nav.hote, n)
      else this.essais.delete(nav.hote)
    }
  }

  // — Liste des sites —

  ajouter(saisie: string, origine: SiteContourne['origine'] = 'manuel'): EtatPasserelles {
    const hote = this.normaliser(saisie)
    const r = this.deps.reseau()
    if (!r.sites.some((s) => s.hote === hote)) {
      if (r.sites.length >= MAX_SITES) throw new Error('Liste pleine (500 sites)')
      this.deps.ecrireSites([...r.sites, { hote, origine, date: this.deps.maintenant() }])
    }
    return this.etat()
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
    await this.rechercher(true)
    await this.attendre()
    return this.etat()
  }

  // — Pool —

  /** Lance (ou rejoint) une recherche : personnelle testée, sinon publiques re-mélangées et testées. */
  rechercher(nouvelle = false): Promise<void> {
    if (this.recherche && this.recherche.gen === this.gen) {
      if (!nouvelle) return this.recherche.p
      const enCours = this.recherche.p
      return enCours.then(() => this.rechercher(false))
    }
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
    await this.appliquer()
  }

  private async assurerPool(): Promise<void> {
    if (this.pool.length === 0) await this.rechercher()
  }

  /** Passerelle en échec : retirée du pool (rotation) ; le PAC est régénéré par l'appelant. */
  private signalerEchec(c: Candidat): void {
    this.pool = ecarter(this.pool, c)
    if (this.pool.length === 0 && !this.poolPerso) this.erreur = 'aucune'
    this.notifier()
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

  private async pacVoulu(): Promise<string | null> {
    const r = this.deps.reseau()
    if (!r.passerelles) return null
    const hotes = [...r.sites.map((s) => s.hote), ...this.essais.keys()]
    if (hotes.length === 0) return null
    // Proxy système relu avant chaque application (une seule règle par schéma : approximation d'un PAC système).
    const systeme = this.deps.proxySysteme ? await this.deps.proxySysteme().catch(() => undefined) : undefined
    return genererPac(hotes, this.pool, this.poolPerso && this.pool.length > 0, systeme ?? 'DIRECT')
  }

  /** Applique le PAC voulu (en série) à chaque session puis ferme les connexions ouvertes. */
  private appliquer(): Promise<void> {
    this.file = this.file
      .then(async () => {
        const voulu = await this.pacVoulu()
        if (voulu === this.applique) return
        // Retenu seulement après succès : un échec laisse l'état « inconnu », réappliqué au prochain appel.
        this.applique = undefined
        for (const s of this.deps.sessions()) {
          await s.setProxy(voulu === null ? { mode: 'system' } : { mode: 'pac_script', pacScript: pacDataUrl(voulu) })
          await s.closeAllConnections()
        }
        this.applique = voulu
        this.notifier()
      })
      .catch(() => undefined)
    return this.file
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
