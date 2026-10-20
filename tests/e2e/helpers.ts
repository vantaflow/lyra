import { _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const racine = resolve(__dirname, '../..')

/** Lance Lyra avec un userData temporaire et renvoie la première fenêtre. */
export async function lancerLyra(
  extraEnv: Record<string, string> = {},
  options: { premierLancement?: boolean } = {}
): Promise<{ app: ElectronApplication; fenetre: Page }> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    // Hérité d'un parent Electron, il ferait échouer le lancement.
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  env.LYRA_TEST = '1'
  env.LYRA_USER_DATA = mkdtempSync(join(tmpdir(), 'lyra-e2e-'))
  Object.assign(env, extraEnv)

  const app = await _electron.launch({ args: ['.'], cwd: racine, env })
  await app.firstWindow()
  // Plusieurs vues web : la fenêtre d'interface est celle qui charge ui.html.
  const estUI = (p: Page): boolean => p.url().includes('ui.html') && !p.url().includes('#overlay')
  for (let i = 0; i < 100 && !app.windows().some(estUI); i++) await new Promise((r) => setTimeout(r, 100))
  const fenetre = app.windows().find(estUI)!
  await fenetre.waitForLoadState('domcontentloaded')
  // Le nouvel onglet de départ doit avoir fini de charger (sinon il remplace une navigation lancée aussitôt).
  if (!options.premierLancement) for (let i = 0; i < 100 && !app.windows().some((p) => p.url().startsWith('lyra://newtab')); i++) await new Promise((r) => setTimeout(r, 100))
  // Hors test dédié, le choix du moteur (premier lancement) est déjà fait : il n'interfère pas.
  if (!options.premierLancement) await fenetre.evaluate(() => window.lyra.invoke('settings:set', { moteurChoisi: true }))
  return { app, fenetre }
}

/** Erreur relevée pendant un test : console, exception de page, processus principal ou sa sortie d'erreur. */
export interface ErreurCollectee {
  source: 'console' | 'pageerror' | 'main' | 'stderr'
  /** URL de la webContents (ou « main »). */
  page: string
  message: string
}

/**
 * Collecte les erreurs de TOUTES les webContents (vue chrome, overlay, pages lyra://, pages de test, y compris celles
 * créées plus tard) et la sortie d'erreur du processus principal. `filtre` écarte le bruit connu (à commenter par l'appelant).
 */
export function collecterErreurs(
  app: ElectronApplication,
  surErreur: (e: ErreurCollectee) => void,
  filtre: (e: ErreurCollectee) => boolean = () => true
): void {
  const pousser = (e: ErreurCollectee): void => {
    if (filtre(e)) surErreur(e)
  }
  const suivies = new WeakSet<Page>()
  const suivre = (p: Page): void => {
    if (suivies.has(p)) return
    suivies.add(p)
    p.on('console', (m) => {
      if (m.type() === 'error') pousser({ source: 'console', page: p.url(), message: m.text() })
    })
    // Chromium signale aussi ici les rejets de promesse non gérés.
    p.on('pageerror', (e) => pousser({ source: 'pageerror', page: p.url(), message: e.stack ?? e.message }))
  }
  for (const p of app.windows()) suivre(p)
  app.on('window', suivre)
  app.process().stderr?.on('data', (d: Buffer) => {
    for (const ligne of d.toString().split('\n')) if (ligne.trim()) pousser({ source: 'stderr', page: 'main', message: ligne.trim() })
  })
}

/**
 * Crochets de test dans le processus principal, posés depuis Playwright (aucun code ajouté à l'application) :
 * - exceptions et rejets non gérés, `console.error` et `dialog.showErrorBox` → `globalThis.__audit.erreurs` ;
 * - dialogues natifs (ouvrir, enregistrer, message), `shell.*`, impression et outils de développement simulés : rien ne
 *   s'affiche, l'appel est noté dans `globalThis.__audit.appels` (effet observable) ;
 * - réseau coupé : `fetch` du processus principal répond 503, et http(s) de chaque session (y compris celles créées plus
 *   tard : fenêtres privées, passerelles) est servi par une page locale « interceptée ». Aucun accès à Internet.
 */
export async function poserCrochetsMain(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: a, dialog, shell, session, webContents }) => {
    const g = globalThis as unknown as { __audit?: { erreurs: string[]; appels: string[] } }
    if (g.__audit) return
    const audit = { erreurs: [] as string[], appels: [] as string[], chargements: 0 }
    g.__audit = audit
    const noter = (quoi: string): void => void audit.appels.push(quoi.slice(0, 300))
    const texte = (e: unknown): string => (e instanceof Error ? (e.stack ?? e.message) : String(e))
    process.on('uncaughtException', (e) => void audit.erreurs.push(`uncaughtException : ${texte(e)}`))
    process.on('unhandledRejection', (e) => void audit.erreurs.push(`unhandledRejection : ${texte(e)}`))
    // Avertissements de Node (fuite d'écouteurs…), avec leur pile pour en trouver l'origine.
    process.on('warning', (w) => void audit.erreurs.push(`warning : ${texte(w)}`))
    // Chargements (navigation, rechargement) de toutes les webContents : effet observable de « Recharger ».
    const suivreChargements = (wc: Electron.WebContents): void => void wc.on('did-start-loading', () => void audit.chargements++)
    for (const wc of webContents.getAllWebContents()) suivreChargements(wc)
    a.on('web-contents-created', (_e, wc) => suivreChargements(wc))
    const consoleErreur = console.error.bind(console)
    console.error = (...args: unknown[]): void => {
      // Les avertissements de Node passent aussi par ici : déjà relevés (avec leur pile) par l'écouteur « warning ».
      if (!/^\(node:\d+\) \w*Warning/.test(String(args[0]))) audit.erreurs.push(`console.error : ${args.map(texte).join(' ')}`)
      consoleErreur(...args)
    }
    const d = dialog as unknown as Record<string, unknown>
    d.showOpenDialog = async () => (noter('dialogue:ouvrir'), { canceled: true, filePaths: [] })
    d.showOpenDialogSync = () => (noter('dialogue:ouvrir'), undefined)
    d.showSaveDialog = async () => (noter('dialogue:enregistrer'), { canceled: true, filePath: '' })
    d.showSaveDialogSync = () => (noter('dialogue:enregistrer'), undefined)
    d.showMessageBox = async () => (noter('dialogue:message'), { response: 0, checkboxChecked: false })
    d.showMessageBoxSync = () => (noter('dialogue:message'), 0)
    d.showErrorBox = (titre: string, contenu: string) => void audit.erreurs.push(`showErrorBox : ${titre} ${contenu}`)
    const s = shell as unknown as Record<string, unknown>
    s.openExternal = async (u: string) => noter(`shell:openExternal ${u}`)
    s.openPath = async (p: string) => (noter(`shell:openPath ${p}`), '')
    s.showItemInFolder = (p: string) => noter(`shell:showItemInFolder ${p}`)
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as Record<string, unknown>
    proto.print = function (this: Electron.WebContents) {
      noter(`imprimer ${this.getURL()}`)
    }
    proto.openDevTools = function (this: Electron.WebContents) {
      noter(`devtools ${this.getURL()}`)
    }
    ;(globalThis as unknown as { fetch: unknown }).fetch = async (u: unknown) => {
      noter(`fetch ${String(u instanceof Request ? u.url : u)}`)
      return new Response('', { status: 503, statusText: 'Intercepté (test)' })
    }
    const interceptees = new WeakSet<Electron.Session>()
    const intercepter = (ses: Electron.Session): void => {
      if (interceptees.has(ses)) return
      interceptees.add(ses)
      for (const schema of ['http', 'https']) {
        try {
          ses.protocol.handle(schema, (req) => {
            noter(`reseau ${req.url}`)
            return new Response('<!doctype html><meta charset="utf-8"><title>Interceptée</title><p>Requête réseau interceptée par le test.</p>', {
              headers: { 'content-type': 'text/html; charset=utf-8' }
            })
          })
        } catch {
          // déjà géré pour cette session
        }
      }
    }
    intercepter(session.defaultSession)
    intercepter(session.fromPartition('persist:lyra'))
    for (const wc of webContents.getAllWebContents()) intercepter(wc.session)
    a.on('session-created', intercepter)
  })
}
