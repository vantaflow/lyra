// Preload des pages web (étoiles, popups et leurs iframes), en sandbox : ipcRenderer et webFrame seulement.
// Les scriptlets des Boucliers doivent s'exécuter AVANT le premier script de la page (YouTube : avant le
// script inline qui pose ytInitialPlayerResponse) : récupération synchrone, exécution immédiate dans le
// monde principal, chaque scriptlet dans son propre bloc (évite les collisions de const/class entre eux).
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { DOMMonitor } from '@ghostery/adblocker-content'
import { SURCHARGE_NOTIFICATION } from './surchargeNotification'

const WEB = location.protocol === 'http:' || location.protocol === 'https:'

if (WEB) {
  const scripts: string[] = ipcRenderer.sendSync('shields:scriptlets', location.href) ?? []
  const quand = document.readyState + '@' + Math.round(performance.now()) + 'ms'
  for (const s of scripts) {
    webFrame.executeJavaScript('{\n' + s + '\n}').catch(() => {
      const noms = [...s.matchAll(/\(function\s+([\w$]+)\s*\(/g)].map((m) => m[1])
      ipcRenderer.send('shields:scriptlet-error', noms.at(-1) ?? 'inconnu')
    })
  }
  // User-agent alternatif du site : `navigator` (platform, vendor, userAgentData) suit le profil, avant tout script de la page.
  const profilNavigateur: string = ipcRenderer.sendSync('sites:ua-script') ?? ''
  if (profilNavigateur) void webFrame.executeJavaScript(profilNavigateur).catch(() => undefined)
  // Sonde de test seulement (LYRA_TEST=1 → --lyra-test) : jamais visible des sites en usage normal.
  if (window === window.top && process.argv.includes('--lyra-test')) {
    void webFrame
      .executeJavaScript(`window.__lyraShields = Object.freeze({ scriptletsAt: ${JSON.stringify(quand)}, n: ${scripts.length} })`)
      .catch(() => undefined)
  }
}

function insererStyles(msg?: { classes: string[]; ids: string[]; hrefs: string[]; lifecycle: 'start' | 'dom-update' }): void {
  ipcRenderer
    .invoke('shields:styles', { url: location.href, ...msg })
    .then((styles: unknown) => {
      if (typeof styles === 'string' && styles.length > 0) webFrame.insertCSS(styles, { cssOrigin: 'user' })
    })
    .catch(() => undefined)
}

if (WEB) {
  // Premier appel : règles de base et du site, au plus tôt.
  insererStyles()
  // Ensuite, règles génériques dépendantes du DOM (ids, classes, liens), à mesure qu'ils apparaissent.
  window.addEventListener(
    'DOMContentLoaded',
    () => {
      let lifecycle: 'start' | 'dom-update' = 'start'
      const moniteur = new DOMMonitor((maj) => {
        if (maj.type !== 'features') return
        insererStyles({ classes: maj.classes, ids: maj.ids, hrefs: maj.hrefs, lifecycle })
      })
      moniteur.queryAll(window)
      lifecycle = 'dom-update'
      moniteur.start(window)
      window.addEventListener('pagehide', () => moniteur.stop(), { once: true })
    },
    { once: true, passive: true }
  )
}

// Ne pas déranger : les notifications web passent par le main (file par fenêtre, livrées à la sortie du mode).
// Sites web ; file:// seulement en test (les e2e naviguent sur des fixtures locales). Les iframes about:blank et srcdoc
// héritent de l'origine de leur créateur : elles reçoivent la surcharge aussi (sinon elles contourneraient le mode).
const TEST = process.argv.includes('--lyra-test')
const parent = location.ancestorOrigins?.[0] ?? ''
const HERITE = location.protocol === 'about:' && window !== window.top && (/^https?:/i.test(location.origin) || /^https?:/i.test(parent) || (TEST && parent.startsWith('file:')))
if (WEB || HERITE || (location.protocol === 'file:' && TEST)) {
  const clics: Array<(id: number) => void> = []
  ipcRenderer.on('dnd:clic', (_e, id: number) => {
    for (const cb of clics) cb(id)
  })
  // Le pont est passé en argument de la fonction exécutée dans le monde principal : aucune propriété n'est posée sur `window`.
  const pont = {
    // Identifiant de la notification retenue, ou null : elle doit s'afficher normalement.
    creer: (titre: string, corps: string, tag: string, silencieuse: boolean): number | null =>
      ipcRenderer.sendSync('dnd:notification', { titre, corps, tag, silencieuse }) ?? null,
    // « granted » | « denied » | « default » pendant le mode ; null : la vraie valeur.
    permission: (): string | null => ipcRenderer.sendSync('dnd:permission') ?? null,
    fermer: (id: number): void => ipcRenderer.send('dnd:fermer', id),
    surClic: (cb: (id: number) => void): void => void clics.push(cb)
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const func = new Function(`return ${SURCHARGE_NOTIFICATION}`)() as (p: typeof pont) => void
    contextBridge.executeInMainWorld({ func, args: [pont] })
  } catch {
    // sans surcharge, les notifications suivent leur cours normal (mais la vérification de permission les refuse en mode)
  }
}
