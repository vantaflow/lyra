// Preload des pages web (étoiles, popups et leurs iframes), en sandbox : ipcRenderer et webFrame seulement.
// Les scriptlets des Boucliers doivent s'exécuter AVANT le premier script de la page (YouTube : avant le
// script inline qui pose ytInitialPlayerResponse) : récupération synchrone, exécution immédiate dans le
// monde principal, chaque scriptlet dans son propre bloc (évite les collisions de const/class entre eux).
import { ipcRenderer, webFrame } from 'electron'
import { DOMMonitor } from '@ghostery/adblocker-content'

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
