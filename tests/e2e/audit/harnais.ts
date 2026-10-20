/**
 * Audit automatique « tous les boutons fonctionnent, aucune erreur ne s'affiche ».
 *
 * Générique : les contrôles sont DÉCOUVERTS dans le DOM (button, [role=switch|radio|menuitem|option|tab|checkbox],
 * select, input, textarea, a[href]) puis actionnés un à un ; aucune liste figée de boutons. Après chaque action :
 * - aucune erreur (console, exception de page, rejet non géré, processus principal, texte d'erreur visible) ;
 * - un EFFET observable : réglage relu par `settings:get` changé, état du contrôle changé, navigation, ouverture
 *   d'onglet ou de fenêtre, appel système simulé (dialogue, shell, impression…), ou DOM modifié.
 *
 * Tout tourne dans un userData temporaire (lancerLyra), réseau coupé et dialogues natifs simulés (poserCrochetsMain),
 * import limité aux profils fabriqués (LYRA_IMPORT_RACINE) : aucune donnée réelle n'est lue ni touchée.
 */
import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collecterErreurs, lancerLyra, poserCrochetsMain, type ErreurCollectee } from '../helpers'

const RACINE = resolve(__dirname, '../../..')
const DOSSIER_RESULTATS = join(RACINE, 'test-results')
const DOSSIER_FRAGMENTS = join(DOSSIER_RESULTATS, 'audit-fragments')
export const RAPPORT = join(DOSSIER_RESULTATS, 'audit-boutons.json')

export type EtatControle =
  | 'actionne' // actionné, effet observé
  | 'sans-effet' // actionné, aucun effet observable : DÉFAUT
  | 'deja-selectionne' // segment / radio / option déjà choisi : l'absence d'effet est normale
  | 'desactive' // désactivé (disabled / aria-disabled), sans mention « Bientôt »
  | 'bientot' // désactivé ET marqué « Bientôt » (ou « v2 », « à venir ») : compté à part
  | 'bientot-actif' // marqué « Bientôt » mais cliquable : DÉFAUT
  | 'liste-blanche' // volontairement non actionné (voir LISTE_BLANCHE)
  | 'disparu' // n'existait plus au moment d'agir (retiré par une action précédente)

export interface ResultatControle {
  page: string
  zone: string
  controle: string
  type: string
  etat: EtatControle
  effets: string[]
  raison?: string
}

export interface ErreurAudit {
  page: string
  controle: string | null
  source: ErreurCollectee['source'] | 'ecran' | 'contenu' | 'clic'
  message: string
}

/** Contrôle découvert dans le DOM. */
interface Decouvert {
  cle: string
  chemin: string
  libelle: string
  type: string
  desactive: boolean
  bientot: boolean
  selectionne: boolean
  /** Champ de saisie de texte (quel que soit son rôle ARIA). */
  saisie: boolean
  /** Pour select : valeurs des options ; pour range : min/max. */
  options: string[]
  min?: number
  max?: number
  valeur?: string
  href?: string
}

/**
 * Liste blanche explicite : contrôles jamais actionnés, avec la raison. Le reste (« Effacer l'historique », dialogues de
 * fichier, imprimer, outils de développement, liens externes, mises à jour réseau) EST actionné, sans danger : userData
 * temporaire, dialogues et shell simulés, réseau intercepté (poserCrochetsMain).
 */
export const LISTE_BLANCHE: Array<{ motif: RegExp; raison: string }> = [
  // Quitter l'application terminerait l'audit (aucune entrée « Quitter » dans les pages auditées à ce jour).
  { motif: /^Quitter$/i, raison: "quitterait l'application" }
]

/** Bruit connu de la sortie d'erreur ou de la console, qui ne relève pas de Lyra (chaque entrée est justifiée). */
const BRUIT: Array<{ motif: RegExp; raison: string }> = [
  // Chromium sous macOS (bac à sable des processus auxiliaires d'un Electron non signé) : sans rapport avec Lyra.
  { motif: /sandbox_extension_issue_file failed/, raison: 'bac à sable macOS, Electron de développement' },
  // Playwright pilote Electron par l'inspecteur Node : messages de connexion et de fermeture.
  { motif: /^Debugger (listening|ending|attached)|^For help, see: https:\/\/nodejs\.org|^DevTools listening on/, raison: 'Playwright' },
  { motif: /Request Autofill\.(enable|setAddresses) failed/, raison: 'DevTools (Playwright) sans Autofill' },
  // Conséquence voulue de l'interception réseau de l'audit (réponses 503) : l'application la journalise et continue.
  { motif: /HTTP 503|Intercepté \(test\)/, raison: "réseau coupé par l'audit" },
  // Compositeur GPU de Chromium quand une vue cachée est retaillée ou détruite (fenêtres cachées des tests).
  { motif: /non-existent mailbox|Invalid mailbox/, raison: 'Chromium, vues cachées' }
]

/**
 * Sortie d'erreur du processus principal : on ne retient que ce qui ressemble à une erreur (journal Chromium ERROR/FATAL,
 * exception JavaScript). Les `console.warn` de Lyra (journal volontaire) passent par là aussi et ne sont pas des erreurs ;
 * les `console.error` du main sont relevés à part (poserCrochetsMain).
 */
const STDERR_ERREUR = /:ERROR:|:FATAL:|Uncaught|Unhandled|TypeError|ReferenceError|SyntaxError|RangeError/

const estBruit = (e: ErreurCollectee): boolean =>
  BRUIT.some((b) => b.motif.test(e.message)) || (e.source === 'stderr' && !STDERR_ERREUR.test(e.message))

/** Texte d'erreur visible : zones d'alerte/état (large) et tout le texte visible (motifs sans ambiguïté). */
const MOTIF_ALERTE = /\b(Error|error|parse|undefined|null|NaN|Cannot|TypeError|SyntaxError|failed|Failed|invalid|Invalid|Unexpected|unable|Unable)\b|\[object /
const MOTIF_ANGLAIS = /\b(the|is|not|could|must|was|should|of|to)\b/
const MOTIF_PAGE = /\[object \w+\]|\bundefined\b|\bNaN\b|TypeError|SyntaxError|ReferenceError|Error invoking remote method|Cannot read propert|is not valid JSON|Unexpected token|JSON\.parse/

export interface OptionsZone {
  /** Nom lisible de la page (ex. « lyra://settings#/general »). */
  page: string
  /** Nom de la zone (ex. « contenu », « sommaire », « panneau Boucliers »). */
  zone: string
  /** La page qui porte les contrôles (relue après chaque action). */
  cible: () => Promise<Page>
  /** Sélecteur de la racine des contrôles (par défaut : body). */
  racine?: string
  /** Sélecteur des sous-arbres à ignorer (ex. le sommaire quand on audite le contenu). */
  exclure?: string
  /** Remet la page dans l'état attendu avant le contrôle suivant (et rouvre le panneau). */
  restaurer: () => Promise<void>
  /** Pages dont le texte visible est aussi contrôlé (par défaut : la cible). */
  pagesSurveillees?: () => Promise<Page[]>
  /** Nombre maximal d'actions dans la zone (garde-fou contre les contrôles qui se multiplient). */
  max?: number
}

/** Une session d'audit : une instance de Lyra, ses erreurs, ses résultats. Écrit un fragment du rapport à la fin. */
export class Audit {
  app!: ElectronApplication
  fenetre!: Page
  userData = ''
  readonly controles: ResultatControle[] = []
  readonly erreurs: ErreurAudit[] = []
  readonly pages = new Set<string>()
  private courant: { page: string; controle: string | null } | null = null
  private ecransVus = new Set<string>()
  private fenetresInitiales: number[] = []

  constructor(readonly nom: string) {}

  /** Lance Lyra (fenêtres cachées, userData temporaire, réseau coupé, profils d'import fabriqués). */
  async demarrer(env: Record<string, string> = {}): Promise<void> {
    const { app, fenetre } = await lancerLyra({
      LYRA_IMPORT_RACINE: racineImportFabriquee(),
      LYRA_PASSERELLES_SOURCES: listeVide(),
      LYRA_PASSERELLES_CIBLE: 'http://cible.test/generate_204',
      LYRA_FILE_SIMULEE: '1',
      ...env
    })
    this.app = app
    this.fenetre = fenetre
    collecterErreurs(app, (e) => this.noterErreur(e.page, e.source, e.message), (e) => !estBruit(e))
    await poserCrochetsMain(app)
    this.userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    this.fenetresInitiales = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().map((w) => w.id))
    await this.semer()
  }

  /**
   * Données de départ, pour que les listes ne soient pas vides et que leurs boutons aient un effet : une page dans
   * l'historique, un favori, un téléchargement terminé (dans le userData temporaire).
   */
  private async semer(): Promise<void> {
    await this.invoquer('settings:set', { telechargements: { dossier: join(this.userData, 'dl'), demander: false } })
    const liens = fixture('liens.html')
    await this.invoquer('test:navigate', liens)
    await this.invoquer('bookmarks:toggle', { url: liens, title: 'Page de liens (audit)' })
    const dl = fixture('telechargement.html')
    await this.invoquer('test:navigate', dl)
    await expect.poll(() => this.app.windows().some((w) => w.url() === dl)).toBe(true)
    await this.app.windows().find((w) => w.url() === dl)!.locator('#dl').click()
    await expect.poll(() => this.invoquer<Array<{ etat: string }>>('downloads:list').then((l) => l[0]?.etat)).toBe('termine')
    await this.invoquer('test:navigate', 'lyra://newtab')
    await expect.poll(() => this.invoquer<Array<{ etat: string }>>('downloads:list').then((l) => l.length)).toBeGreaterThan(0)
    await expect.poll(() => this.invoquer<unknown[]>('history:search', { texte: '', limite: 10 }).then((l) => l.length)).toBeGreaterThan(0)
  }

  async arreter(): Promise<void> {
    await this.app?.close().catch(() => undefined)
  }

  private noterErreur(page: string, source: ErreurAudit['source'], message: string): void {
    this.erreurs.push({ page: this.courant?.page ?? page, controle: this.courant?.controle ?? null, source, message: `${message}${page && page !== this.courant?.page ? ` [${page}]` : ''}` })
  }

  /** Erreurs du processus principal accumulées depuis le dernier relevé. */
  async releverMain(): Promise<void> {
    const liste = await this.app
      .evaluate(() => {
        const g = globalThis as unknown as { __audit?: { erreurs: string[] } }
        return g.__audit ? g.__audit.erreurs.splice(0) : []
      })
      .catch(() => [] as string[])
    for (const m of liste) this.noterErreur('main', 'main', m)
  }

  /** Textes d'erreur visibles dans ces pages (chaque message n'est signalé qu'une fois par page). */
  async releverEcran(pages: Page[]): Promise<void> {
    for (const p of pages) {
      const textes = await p
        .evaluate(
          ({ alerte, anglais, motifPage }) => {
            const visible = (el: Element): boolean => {
              const r = el.getBoundingClientRect()
              const s = getComputedStyle(el)
              return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
            }
            const out: string[] = []
            const reA = new RegExp(alerte)
            const reE = new RegExp(anglais)
            for (const el of Array.from(document.querySelectorAll('[role=alert],[role=status],[aria-live],.erreur,.alerte,.mi-refus'))) {
              const t = (el as HTMLElement).innerText?.trim()
              if (!t || !visible(el)) continue
              if (reA.test(t)) out.push(`alerte : ${t.slice(0, 200)}`)
              else if (reE.test(t) && !/[àâçéèêëîïôûùüÿœ]/i.test(t)) out.push(`message anglais brut : ${t.slice(0, 200)}`)
            }
            const corps = document.body?.innerText ?? ''
            const m = corps.match(new RegExp(motifPage))
            if (m) {
              const i = Math.max(0, (m.index ?? 0) - 60)
              out.push(`texte visible : …${corps.slice(i, i + 160).replace(/\s+/g, ' ')}…`)
            }
            return out
          },
          { alerte: MOTIF_ALERTE.source, anglais: MOTIF_ANGLAIS.source, motifPage: MOTIF_PAGE.source }
        )
        .catch(() => [] as string[])
      for (const t of textes) {
        const cle = `${p.url()}|${t}`
        if (this.ecransVus.has(cle)) continue
        this.ecransVus.add(cle)
        this.noterErreur(p.url(), 'ecran', t)
      }
    }
  }

  /** Nombre d'entrées d'historique, de favoris et de téléchargements (effet des boutons « Effacer », « Supprimer »…). */
  async compterDonnees(): Promise<string> {
    const [h, b, d] = await Promise.all([
      this.invoquer<unknown[]>('history:search', { texte: '', limite: 1000 }),
      this.invoquer<unknown[]>('bookmarks:list'),
      this.invoquer<unknown[]>('downloads:list')
    ])
    return `${h.length}/${b.length}/${d.length}`
  }

  /**
   * Avant chaque zone : de quoi agir (historique, favori, téléchargement, s'ils ont été effacés par une zone précédente)
   * et des chemins de fichier pour les exports (file `__lyraCheminsTest` lue sous LYRA_TEST par export/ipc.ts).
   */
  async assurerDonnees(): Promise<void> {
    const [h, b, d] = (await this.compterDonnees()).split('/').map(Number)
    if (h === 0 || b === 0 || d === 0) {
      const ref = await this.etatFenetre()
      const actuelle = (await this.invoquer<{ sky: { stars: Array<{ id: string; url: string }> } }>('sky:get')).sky.stars.find((s) => s.id === ref.active)?.url
      await this.semer()
      if (actuelle) await this.ouvrir(actuelle)
    }
    const dossier = join(this.userData, 'exports-audit')
    mkdirSync(dossier, { recursive: true })
    const chemins = Array.from({ length: 40 }, (_, i) => join(dossier, `export-${Date.now()}-${i}.out`))
    await this.app.evaluate((_e, liste) => {
      ;(globalThis as unknown as { __lyraCheminsTest?: string[] }).__lyraCheminsTest = liste
    }, chemins)
  }

  /** Signale un défaut de contenu (ex. section vide). */
  defautContenu(page: string, message: string): void {
    this.erreurs.push({ page, controle: null, source: 'contenu', message })
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pages, onglets, fenêtres

  trouver(debut: string): Page | undefined {
    return this.app.windows().find((w) => normaliser(w.url()).startsWith(debut))
  }

  overlay(): Page | undefined {
    return this.app.windows().find((w) => w.url().includes('ui.html#overlay'))
  }

  async overlayVisible(): Promise<boolean> {
    return this.app.evaluate(({ BaseWindow }) => {
      const w = BaseWindow.getAllWindows()[0]
      const v = w?.contentView.children.at(-1) as { getVisible?: () => boolean } | undefined
      return v?.getVisible?.() ?? false
    })
  }

  invoquer<T = unknown>(canal: string, donnees?: unknown): Promise<T> {
    return this.fenetre.evaluate(({ c, d }) => (window.lyra.invoke as (c: string, d?: unknown) => Promise<unknown>)(c, d), { c: canal, d: donnees }) as Promise<T>
  }

  /** Ouvre `url` dans l'étoile active et rend sa page (même document si seul le hash change). */
  async ouvrir(url: string): Promise<Page> {
    const base = normaliser(url).split('#')[0]
    const actuelle = this.app.windows().find((w) => normaliser(w.url()).split('#')[0] === base)
    const ciel = await this.invoquer<{ sky: { stars: Array<{ id: string; url: string }>; activeId: string | null } }>('sky:get')
    const active = ciel.sky.stars.find((s) => s.id === ciel.sky.activeId)
    if (actuelle && active && normaliser(active.url).split('#')[0] === base) {
      if (normaliser(actuelle.url()) !== normaliser(url)) await actuelle.evaluate((h) => void (location.hash = h), new URL(url).hash || '#')
    } else {
      await this.invoquer('test:navigate', url)
    }
    const attendue = normaliser(url)
    await expect.poll(() => this.app.windows().some((w) => normaliser(w.url()) === attendue), { message: `ouverture de ${url}` }).toBe(true)
    const p = this.app.windows().find((w) => normaliser(w.url()) === attendue)!
    await p.waitForLoadState('domcontentloaded')
    await expect.poll(() => p.evaluate(() => document.readyState).catch(() => 'x')).toBe('complete')
    this.pages.add(url)
    return p
  }

  /**
   * État de référence de la fenêtre : étoiles, fenêtres, Ne pas déranger, overlay. `restaurerFenetre` y revient
   * (onglets ou fenêtres ouverts par un contrôle fermés, étoile d'origine réactivée et renavigée sur `url`).
   */
  async etatFenetre(): Promise<{ etoiles: string[]; active: string | null }> {
    const c = await this.invoquer<{ sky: { stars: Array<{ id: string }>; activeId: string | null } }>('sky:get')
    return { etoiles: c.sky.stars.map((s) => s.id), active: c.sky.activeId }
  }

  async restaurerFenetre(ref: { etoiles: string[]; active: string | null }, url: string | null, options: { garderOverlay?: boolean; reglages?: Record<string, unknown> } = {}): Promise<void> {
    // Fenêtres ouvertes par un contrôle (nouvelle fenêtre, fenêtre privée, fenêtre d'extension) : fermées.
    await this.app.evaluate(({ BaseWindow }, garder) => {
      for (const w of BaseWindow.getAllWindows()) if (!garder.includes(w.id)) w.destroy()
    }, this.fenetresInitiales)
    const dnd = await this.invoquer<{ actif: boolean }>('dnd:get')
    if (dnd.actif) {
      await this.invoquer('dnd:sortir')
      await expect.poll(() => this.invoquer<{ actif: boolean }>('dnd:get').then((d) => d.actif)).toBe(false)
    }
    if (options.reglages) await this.invoquer('settings:set', options.reglages)
    if (!options.garderOverlay && (await this.overlayVisible())) await this.invoquer('overlay:close')
    const c = await this.invoquer<{ sky: { stars: Array<{ id: string; url: string }>; activeId: string | null } }>('sky:get')
    for (const s of c.sky.stars) if (!ref.etoiles.includes(s.id)) await this.invoquer('tabs:close', { id: s.id })
    let active = ref.active
    const restantes = (await this.invoquer<{ sky: { stars: Array<{ id: string }> } }>('sky:get')).sky.stars
    if (!active || !restantes.some((s) => s.id === active)) {
      // L'étoile d'origine a été fermée par le contrôle : on en rouvre une.
      if (restantes.length === 0 || url) {
        await this.invoquer('tabs:open', { url: url ?? 'lyra://newtab' })
      }
      const apres = await this.etatFenetre()
      active = apres.active
      ref.etoiles = apres.etoiles
      ref.active = apres.active
    } else if ((await this.invoquer<{ sky: { activeId: string | null } }>('sky:get')).sky.activeId !== active) {
      await this.invoquer('tabs:activate', { id: active })
    }
    if (url) {
      const c2 = await this.invoquer<{ sky: { stars: Array<{ id: string; url: string }> } }>('sky:get')
      const etoile = c2.sky.stars.find((s) => s.id === active)
      if (!etoile || normaliser(etoile.url) !== normaliser(url)) await this.ouvrir(url)
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Découverte et action

  async decouvrir(p: Page, racine?: string, exclure?: string): Promise<Decouvert[]> {
    return p.evaluate(
      ({ racine, exclure }) => {
        const base = racine ? document.querySelector(racine) : document.body
        if (!base) return []
        const SEL =
          'button, summary, [role=button], [role=switch], [role=radio], [role=menuitem], [role=option], [role=tab], [role=checkbox], [role=combobox], [role=textbox], [role=searchbox], select, input:not([type=hidden]), textarea, a[href]'
        const visible = (el: Element): boolean => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return false
          for (let e: Element | null = el; e; e = e.parentElement) {
            const s = getComputedStyle(e)
            if (s.display === 'none' || s.visibility === 'hidden' || (e as HTMLElement).hidden) return false
          }
          return true
        }
        const chemin = (el: Element): string => {
          const parts: string[] = []
          for (let e: Element | null = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
            const parent = e.parentElement
            const i = parent ? Array.from(parent.children).indexOf(e) + 1 : 1
            parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${i})`)
          }
          return `body > ${parts.join(' > ')}`
        }
        const BIENTOT = /bient[ôo]t|\bv2\b|à venir|prochainement/i
        const vus = new Map<string, number>()
        const out: Array<Record<string, unknown>> = []
        for (const el of Array.from(base.querySelectorAll(SEL))) {
          if (exclure && el.closest(exclure)) continue
          if (!visible(el)) continue
          const h = el as HTMLElement & { disabled?: boolean; value?: string; type?: string }
          const tag = el.tagName.toLowerCase()
          const role = el.getAttribute('role')
          const typeInput = tag === 'input' ? (el.getAttribute('type') ?? 'text').toLowerCase() : ''
          const type = role ? role : tag === 'input' ? `input:${typeInput}` : tag === 'a' ? 'lien' : tag
          const saisie = tag === 'textarea' || (tag === 'input' && ['text', 'search', 'password', 'email', 'url', 'number', 'tel'].includes(typeInput))
          const texte = (h.innerText ?? '').trim().replace(/\s+/g, ' ')
          const libelle =
            el.getAttribute('aria-label') || texte.slice(0, 60) || el.getAttribute('title') || el.getAttribute('placeholder') || el.id || (el.getAttribute('name') ?? '') || `${tag}`
          const desactive = h.disabled === true || el.getAttribute('aria-disabled') === 'true'
          const ligne = el.closest('.row, [role=menuitem], li, .mi, label') ?? el.parentElement
          const bientot = BIENTOT.test(`${texte} ${el.getAttribute('title') ?? ''} ${(ligne as HTMLElement | null)?.innerText ?? ''}`)
          const selectionne =
            el.getAttribute('aria-pressed') === 'true' ||
            (el.getAttribute('aria-current') ?? 'false') !== 'false' ||
            (tag === 'a' && /(^|\s)(on|active|actif|courant)(\s|$)/.test(el.className)) ||
            el.getAttribute('aria-selected') === 'true' ||
            (role === 'radio' && el.getAttribute('aria-checked') === 'true') ||
            (typeInput === 'radio' && (el as HTMLInputElement).checked)
          const n = (vus.get(`${type}|${libelle}`) ?? 0) + 1
          vus.set(`${type}|${libelle}`, n)
          out.push({
            cle: `${type}|${libelle}|${n}`,
            saisie,
            chemin: chemin(el),
            libelle,
            type,
            desactive,
            bientot,
            selectionne,
            options: tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => o.value) : [],
            min: typeInput === 'range' ? Number((el as HTMLInputElement).min || 0) : undefined,
            max: typeInput === 'range' ? Number((el as HTMLInputElement).max || 100) : undefined,
            valeur: h.value,
            href: tag === 'a' ? (el as HTMLAnchorElement).href : undefined
          })
        }
        return out
      },
      { racine, exclure }
    ) as unknown as Promise<Decouvert[]>
  }

  /** Instantané de tout ce qu'un contrôle peut changer. */
  private async instantane(cible: Page, chemin: string, surveillees: Page[]): Promise<Record<string, string>> {
    const r: Record<string, string> = {}
    const [reglages, ciel, fenetres, appels] = await Promise.all([
      this.invoquer('settings:get').then((s) => JSON.stringify(s)).catch(() => '?'),
      this.invoquer<{ sky: { stars: Array<{ id: string; url: string; pinned: boolean; constellationId?: string; parentId?: string }>; activeId: string | null; constellations: unknown; pinned: unknown } }>('sky:get')
        .then((c) => JSON.stringify([c.sky.stars.map((s) => [s.id, s.url, s.pinned, s.constellationId, s.parentId]), c.sky.activeId, c.sky.constellations, c.sky.pinned]))
        .catch(() => '?'),
      this.app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().map((w) => `${w.id}:${w.isVisible()}`).join(',')).catch(() => '?'),
      this.app.evaluate(() => (globalThis as unknown as { __audit?: { appels: string[] } }).__audit?.appels.join('\n') ?? '').catch(() => '')
    ])
    r.reglage = reglages
    r.ciel = ciel
    r.fenetre = fenetres
    r['appel-systeme'] = appels
    r.overlay = String(await this.overlayVisible().catch(() => false))
    r.donnees = await this.compterDonnees().catch(() => '?')
    r.chargement = String(await this.app.evaluate(() => (globalThis as unknown as { __audit?: { chargements: number } }).__audit?.chargements ?? 0).catch(() => 0))
    r.navigation = this.app
      .windows()
      .map((w) => w.url())
      .sort()
      .join('\n')
    r['etat-controle'] = await cible
      .evaluate((c) => {
        const el = document.querySelector(c) as (HTMLElement & { value?: string; checked?: boolean; disabled?: boolean }) | null
        if (!el) return 'absent'
        return JSON.stringify([
          el.getAttribute('aria-checked'),
          el.getAttribute('aria-pressed'),
          el.getAttribute('aria-expanded'),
          el.getAttribute('aria-selected'),
          el.value,
          el.checked,
          el.className,
          el.innerText,
          el.disabled
        ])
      }, chemin)
      .catch(() => 'absent')
    for (const p of surveillees) {
      r[`dom ${nomCourt(p.url())}`] = await p
        .evaluate(() => {
          // Le focus seul n'est pas un effet : seul le contenu et l'adresse comptent.
          const t = `${document.body?.innerHTML ?? ''}|${location.href}`
          let h = 0
          for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0
          return String(h)
        })
        .catch(() => 'detachee')
    }
    return r
  }

  private diff(a: Record<string, string>, b: Record<string, string>, bruit: Set<string>): string[] {
    const effets: string[] = []
    for (const k of Object.keys(b)) {
      if (bruit.has(k) || a[k] === b[k]) continue
      if (k === 'appel-systeme') {
        const nouveaux = b[k].slice(a[k].length).trim().split('\n').filter(Boolean)
        effets.push(`appel-systeme (${nouveaux.map((x) => x.split(' ')[0]).join(', ')})`)
      } else effets.push(k)
    }
    return effets
  }

  /** Attend que la restauration soit terminée : rien ne change pendant 300 ms (3 s au plus). */
  private async attendreStabilite(cible: Page, surveillees: () => Promise<Page[]>): Promise<void> {
    let precedent = await this.instantane(cible, 'body', await surveillees())
    let stableDepuis = Date.now()
    const limite = Date.now() + 3000
    while (Date.now() - stableDepuis < 300 && Date.now() < limite) {
      const suivant = await this.instantane(cible, 'body', await surveillees())
      if (this.diff(precedent, suivant, new Set()).length > 0) stableDepuis = Date.now()
      precedent = suivant
    }
  }

  /** Attend un effet (condition : instantané différent), au plus `delai` ms. */
  private async attendreEffet(cible: Page, chemin: string, surveillees: () => Promise<Page[]>, avant: Record<string, string>, bruit: Set<string>, delai = 2500): Promise<string[]> {
    const fin = Date.now() + delai
    let effets: string[] = []
    while (Date.now() < fin) {
      const pages = await surveillees()
      const apres = await this.instantane(cible, chemin, pages)
      effets = this.diff(avant, apres, bruit)
      if (effets.length > 0) {
        // Laisse l'effet se stabiliser (rien ne change pendant 400 ms, 4 s au plus) avant de relever les erreurs :
        // une navigation peut suivre de peu un premier changement du DOM.
        let precedent = apres
        let stableDepuis = Date.now()
        const limite = Date.now() + 4000
        while (Date.now() - stableDepuis < 400 && Date.now() < limite) {
          const suivant = await this.instantane(cible, chemin, await surveillees())
          if (this.diff(precedent, suivant, bruit).length > 0) stableDepuis = Date.now()
          precedent = suivant
          for (const e of this.diff(avant, suivant, bruit)) if (!effets.includes(e)) effets.push(e)
        }
        return effets
      }
    }
    return effets
  }

  /** Actionne un contrôle découvert. Rend une raison si l'action elle-même a échoué. */
  private async actionner(p: Page, c: Decouvert): Promise<string | undefined> {
    const l: Locator = p.locator(c.chemin)
    try {
      if (c.type === 'select') {
        for (const v of c.options) await l.selectOption(v, { timeout: 3000 })
      } else if (c.type === 'input:range') {
        const min = c.min ?? 0
        const max = c.max ?? 100
        const actuelle = Number(c.valeur)
        const cible = actuelle === max ? min : Math.round((min + max) / 2) === actuelle ? max : Math.round((min + max) / 2)
        await l.evaluate((el, v) => {
          const i = el as HTMLInputElement
          i.value = String(v)
          i.dispatchEvent(new Event('input', { bubbles: true }))
          i.dispatchEvent(new Event('change', { bubbles: true }))
        }, cible)
      } else if (c.saisie) {
        // Une valeur valide, puis une invalide (chacune validée par Entrée), puis de nouveau la valide : le champ reste
        // dans un état utile pour les boutons qui en dépendent (Ajouter, Occurrence suivante…).
        const [valide, invalide] = valeursDeSaisie(c)
        for (const v of [valide, invalide, valide]) {
          if (!(await l.isVisible().catch(() => false))) break
          await l.fill(v, { timeout: 3000 })
          await l.press('Enter').catch(() => undefined)
        }
      } else {
        await l.click({ timeout: 3000 })
      }
      return undefined
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).split('\n').map((x) => x.trim()).filter(Boolean)
      const cause = m.filter((x) => /intercepts|not stable|not visible|not enabled|disabled|outside|detached/.test(x)).pop()
      return `action impossible : ${m[0]}${cause ? ` (${cause.replace(/\u001b\[\d+m/g, '')})` : ''}`.slice(0, 400)
    }
  }

  /**
   * Audite une zone : découvre ses contrôles, les actionne un à un (en restaurant l'état entre chaque), note les effets
   * et les erreurs. Les contrôles apparus après une action (menu déroulant ouvert…) sont découverts au tour suivant.
   */
  async auditerZone(o: OptionsZone): Promise<void> {
    const surveillees = o.pagesSurveillees ?? (async () => [await o.cible()])
    const faits = new Set<string>()
    // Désactivés déjà notés : re-proposés seulement s'ils deviennent actifs (ex. « Effacer la liste » après un ajout).
    const desactives = new Map<string, ResultatControle>()
    const max = o.max ?? 120
    this.pages.add(o.page)
    await this.assurerDonnees()
    this.courant = { page: o.page, controle: '(au chargement)' }
    await this.releverMain()
    await this.releverEcran(await surveillees())
    for (let tour = 0; tour < max; tour++) {
      const cible = await o.cible()
      const liste = await this.decouvrir(cible, o.racine, o.exclure)
      const restants = liste.filter((c) => !faits.has(c.cle) && !(c.desactive && desactives.has(c.cle)))
      if (restants.length === 0) break
      // Les choix déjà sélectionnés passent en dernier : une fois un autre choisi, ils ont un effet.
      const c = restants.find((x) => !x.selectionne) ?? restants[0]
      let res = desactives.get(c.cle)
      if (res) res.etat = 'actionne'
      else {
        res = { page: o.page, zone: o.zone, controle: c.libelle, type: c.type, etat: 'actionne', effets: [] }
        this.controles.push(res)
      }
      if (c.desactive) desactives.set(c.cle, res)
      else faits.add(c.cle)
      this.courant = { page: o.page, controle: `${c.libelle} (${c.type})` }
      const blanche = LISTE_BLANCHE.find((b) => b.motif.test(c.libelle))
      if (blanche) {
        res.etat = 'liste-blanche'
        res.raison = blanche.raison
        continue
      }
      if (c.desactive) {
        res.etat = c.bientot ? 'bientot' : 'desactive'
        continue
      }
      // Bruit : parties de l'instantané qui changent toutes seules (horloge, compteur…), ignorées pour ce contrôle.
      const pages = await surveillees()
      const a1 = await this.instantane(cible, c.chemin, pages)
      const a2 = await this.instantane(cible, c.chemin, pages)
      const bruit = new Set(Object.keys(a2).filter((k) => a1[k] !== a2[k]))
      const echec = await this.actionner(cible, c)
      const effets = await this.attendreEffet(cible, c.chemin, surveillees, a2, bruit)
      res.effets = effets
      if (echec) {
        res.etat = 'sans-effet'
        res.raison = echec
        this.erreurs.push({ page: o.page, controle: res.controle, source: 'clic', message: echec })
      } else if (effets.length === 0) {
        res.etat = c.bientot ? 'bientot-actif' : c.selectionne ? 'deja-selectionne' : 'sans-effet'
      } else if (c.bientot) {
        res.raison = 'marqué « Bientôt » mais actif'
      }
      await this.releverMain()
      const pagesApres = [...(await surveillees()), this.fenetre]
      const ov = this.overlay()
      if (ov && (await this.overlayVisible())) pagesApres.push(ov)
      await this.releverEcran(pagesApres)
      await o.restaurer()
      await this.attendreStabilite(await o.cible(), surveillees)
    }
    this.courant = null
    await this.releverMain()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rapport

  /** Défauts qui font échouer l'audit, en texte lisible (page — contrôle — message). */
  defauts(): string[] {
    const d: string[] = []
    for (const e of this.erreurs) d.push(`[${e.source}] ${e.page} — ${e.controle ?? '(page)'} — ${e.message}`)
    for (const c of this.controles) {
      if (c.etat === 'sans-effet') d.push(`[sans effet] ${c.page} — ${c.controle} (${c.type})${c.raison ? ` — ${c.raison}` : ''}`)
      if (c.etat === 'bientot-actif') d.push(`[« Bientôt » cliquable] ${c.page} — ${c.controle} (${c.type})`)
    }
    return d
  }

  /** Écrit le fragment de ce test puis recompose `test-results/audit-boutons.json` à partir de tous les fragments. */
  ecrireRapport(): void {
    mkdirSync(DOSSIER_FRAGMENTS, { recursive: true })
    const fragment = { nom: this.nom, pages: [...this.pages], controles: this.controles, erreurs: this.erreurs }
    writeFileSync(join(DOSSIER_FRAGMENTS, `${this.nom.replace(/[^a-z0-9-]+/gi, '_')}.json`), JSON.stringify(fragment, null, 2))
    const fragments = readdirSync(DOSSIER_FRAGMENTS)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(DOSSIER_FRAGMENTS, f), 'utf8')) as typeof fragment)
    const controles = fragments.flatMap((f) => f.controles)
    const compte = (e: EtatControle): ResultatControle[] => controles.filter((c) => c.etat === e)
    const rapport = {
      genere: new Date().toISOString(),
      resume: {
        pages: new Set(fragments.flatMap((f) => f.pages)).size,
        controlesTrouves: controles.length,
        actionnes: controles.filter((c) => ['actionne', 'sans-effet', 'deja-selectionne', 'bientot-actif'].includes(c.etat)).length,
        sansEffet: compte('sans-effet').length,
        dejaSelectionnes: compte('deja-selectionne').length,
        desactives: compte('desactive').length,
        bientot: compte('bientot').length,
        bientotCliquables: compte('bientot-actif').length,
        listeBlanche: compte('liste-blanche').length,
        disparus: compte('disparu').length,
        erreurs: fragments.reduce((n, f) => n + f.erreurs.length, 0)
      },
      pages: [...new Set(fragments.flatMap((f) => f.pages))].sort(),
      sansEffet: compte('sans-effet'),
      bientot: compte('bientot').map((c) => ({ page: c.page, controle: c.controle, type: c.type })),
      bientotCliquables: compte('bientot-actif'),
      desactives: compte('desactive').map((c) => ({ page: c.page, controle: c.controle, type: c.type })),
      listeBlanche: compte('liste-blanche'),
      erreurs: fragments.flatMap((f) => f.erreurs),
      controles,
      sessions: fragments.map((f) => f.nom).sort()
    }
    writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2))
  }
}

/** URL comparable : « lyra://settings/#/x » = « lyra://settings#/x », hash vide ignoré. */
export const normaliser = (u: string): string => u.replace(/^(lyra:\/\/[a-z]+)\/(?=[#?]|$)/, '$1').replace(/#$/, '')

const nomCourt = (url: string): string => (url.includes('ui.html#overlay') ? 'overlay' : url.includes('ui.html') ? 'chrome' : url.split('?')[0].slice(0, 80))

/** Valeurs de saisie (valide, puis invalide) déduites du libellé du champ. */
function valeursDeSaisie(c: Decouvert): [string, string] {
  const l = c.libelle.toLowerCase()
  if (/port/.test(l)) return ['8080', 'abc']
  if (/hôte|hote|host|proxy|serveur/.test(l)) return ['127.0.0.1', '::::']
  if (/phrase|mot de passe|password/.test(l)) return ['phrase-audit-2026', '']
  if (/chrome web store|identifiant/.test(l)) return ['abcdefghijklmnopabcdefghijklmnop', '!!!']
  if (/mozilla|firefox/.test(l)) return ['exemple-audit', '!!!']
  if (/site|domaine|adresse/.test(l)) return ['exemple.test', '<<<%%%>>>']
  if (c.type === 'input:number') return ['42', '-1e999']
  // Recherche dans la page : un mot présent dans les pages de test (fixtures/liens.html).
  if (/dans la page/.test(l)) return ['Lien', '<<<%%%>>>']
  if (/recherch|cherch|search/.test(l)) return ['lyra', '<<<%%%>>>']
  return ['exemple.test', '<<<%%%>>>']
}

/** Profils de navigateurs fabriqués (jamais les vrais profils de la machine). */
function racineImportFabriquee(): string {
  const fixtures = resolve(RACINE, 'src/main/import/fixtures')
  const racine = mkdtempSync(join(tmpdir(), 'lyra-audit-import-'))
  for (const [source, cible] of [
    ['chromium/chrome', 'chrome'],
    ['firefox', 'firefox']
  ]) {
    mkdirSync(join(racine, cible), { recursive: true })
    cpSync(join(fixtures, source), join(racine, cible), { recursive: true })
  }
  return racine
}

/** Liste de passerelles publiques vide : aucune source réseau. */
function listeVide(): string {
  const f = join(mkdtempSync(join(tmpdir(), 'lyra-audit-pass-')), 'vide.txt')
  writeFileSync(f, '')
  return pathToFileURL(f).href
}

export const FIXTURES = resolve(__dirname, '../fixtures')
export const fixture = (nom: string): string => pathToFileURL(join(FIXTURES, nom)).href
