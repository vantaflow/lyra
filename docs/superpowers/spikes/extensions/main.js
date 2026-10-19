const { app, BaseWindow, WebContentsView, session } = require('electron')
const path = require('path')
const fs = require('fs')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')

const SCEN = process.argv.find(a => a.startsWith('--scen='))?.slice(7) || 'base'
const HERE = __dirname
app.setPath('userData', path.join(HERE, 'ud', SCEN))
const LOG = path.join(HERE, 'logs', SCEN + '.log')
fs.mkdirSync(path.dirname(LOG), { recursive: true })
fs.writeFileSync(LOG, '')
const log = (...a) => fs.appendFileSync(LOG, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n')
process.on('uncaughtException', e => log('UNCAUGHT', e.stack))
process.on('unhandledRejection', e => log('UNHANDLED', String(e && e.stack || e)))
const sleep = ms => new Promise(r => setTimeout(r, ms))
setTimeout(() => { log('WATCHDOG 120s'); app.exit(2) }, 120000)

const EXT = {
  chromeshim: [path.join(HERE, 'out/ubo-chrome-shim')],
  chrome: [path.join(HERE, 'dl/ubo-chromium/uBlock0.chromium')],
  ffubo: [path.join(HERE, 'out/ubo-ff')],
  ffdr: [path.join(HERE, 'out/dr-ff')],
  ff: [path.join(HERE, 'out/ubo-ff'), path.join(HERE, 'out/dr-ff')],
  ffs: [path.join(HERE, 'out/ubo-ff-shim'), path.join(HERE, 'out/dr-ff-shim')],
}[SCEN] || []

app.whenReady().then(async () => {
  log('electron', process.versions.electron, 'chrome', process.versions.chrome, 'scen', SCEN)
  const ses = session.fromPartition('persist:spike')
  const tabs = []
  const win = new BaseWindow({ show: false, width: 1200, height: 800 })
  const newTab = (url) => {
    const view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true } })
    win.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 1200, height: 800 })
    tabs.push(view)
    extensions.addTab(view.webContents, win)
    if (url) view.webContents.loadURL(url)
    return view.webContents
  }
  const extensions = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab: async (details) => { log('createTab', details); const wc = newTab(details.url); return [wc, win] },
    selectTab: (wc) => log('selectTab', wc.id),
    removeTab: (wc) => log('removeTab', wc.id),
    createWindow: async (d) => { log('createWindow', d); return win },
  })

  // capture console of extension contents
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (ev, ...legacy) => {
      const t = wc.getType()
      if (t === 'webview' || (t === 'window' && !(wc.getURL() || '').startsWith('chrome-extension://'))) {
        // page/tab: only log if from extension url
      }
      const msg = ev && ev.message !== undefined ? ev.message : legacy[1]
      const lvl = ev && ev.level !== undefined ? ev.level : legacy[0]
      const src = ev && ev.sourceId !== undefined ? ev.sourceId : legacy[3]
      if ((wc.getURL() || '').startsWith('chrome-extension://') || t === 'backgroundPage' || String(src).startsWith('chrome-extension://'))
        log('[CONSOLE', t, lvl, ']', String(msg).slice(0, 500), '@', src)
    })
    wc.on('render-process-gone', (_e, d) => log('render-process-gone', wc.getType(), d))
  })
  ses.serviceWorkers.on('console-message', (_e, d) => log('[SW console]', d))

  // load extensions
  const sx = ses.extensions || ses
  log('API used for load:', ses.extensions ? 'session.extensions.loadExtension' : 'session.loadExtension')
  for (const p of EXT) {
    try {
      const ext = await sx.loadExtension(p, { allowFileAccess: true })
      log('LOADED', ext.id, ext.name, 'MV' + ext.manifest.manifest_version, ext.url)
    } catch (e) { log('LOAD_ERROR', p, String(e && e.message || e)) }
  }

  // cws scenario
  if (SCEN === 'cws') {
    const { installExtension } = require('electron-chrome-web-store')
    try {
      const ext = await installExtension(process.env.CWS_ID || 'cjpalhdlnbpafiamejdnhcphjbkeiagm', { session: ses, extensionsPath: path.join(HERE, 'ud', 'cws-ext') })
      log('INSTALL_OK', ext && ext.id, ext && ext.name, ext && ext.path)
    } catch (e) { log('INSTALL_ERROR', String(e && e.stack || e)) }
    log('listing dir', fs.existsSync(path.join(HERE, 'ud/cws-ext')) ? fs.readdirSync(path.join(HERE, 'ud/cws-ext'), { recursive: true }).slice(0, 15) : 'absent')
  }

  const all = sx.getAllExtensions()
  log('getAllExtensions', all.map(e => ({ id: e.id, name: e.name, v: e.version, mv: e.manifest.manifest_version })))
  await sleep(5000)
  const bgs = require('electron').webContents.getAllWebContents().filter(w => w.getType() === 'backgroundPage' || w.getURL().startsWith('chrome-extension://'))
  log('background contents', bgs.map(w => ({ type: w.getType(), url: w.getURL() })))

  for (const w of bgs) log('BG chrome keys', w.getURL(), await w.executeJavaScript(`JSON.stringify(Object.keys(chrome).sort())`).catch(e => 'ERR ' + e.message))
  for (const w of bgs) log('BG sub keys', await w.executeJavaScript(`JSON.stringify({alarms:Object.keys(chrome.alarms||{}),storage:Object.keys(chrome.storage||{}),tabs:Object.keys(chrome.tabs||{}),runtime:Object.keys(chrome.runtime||{}),webRequest:Object.keys(chrome.webRequest||{})})`).catch(e => 'ERR ' + e.message))
  for (const w of bgs) log('BG browser dbg', w.getURL(), await w.executeJavaScript(`JSON.stringify({typeofBrowser: typeof browser, chromeBA: typeof chrome.browserAction, browserKeys: typeof browser==='object'?Object.keys(browser):null, baInBrowser: typeof browser==='object' && ('browserAction' in browser), baType: typeof (typeof browser==='object' && browser.browserAction)})`).catch(e => 'ERR ' + e.message))
  const wc = newTab('about:blank')
  const load = async (u) => { try { await wc.loadURL(u) } catch (e) { log('loadURL err', u, e.message) } }
  const ev = (code) => wc.executeJavaScript(code, true).catch(e => 'EXEC_ERR ' + e.message)

  await load('https://www.example.com/')
  await sleep(3000)
  const FETCH = `fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js').then(r=>'OK '+r.status).catch(e=>'ERR '+e.message)`
  const CANDS = ['https://www.google.com/adsense/search/ads.js','https://www.youtube.com/api/stats/ads','https://www.google.com/pagead/conversion.js','https://www.google.com/pagead/1p-user-list/1','https://www.google.com/ads/ga-audiences','https://www.google.com/doubleclick/test']
  const MULTI = `Promise.all(${JSON.stringify(CANDS)}.map(u=>fetch(u,{mode:'no-cors'}).then(r=>'OK').catch(e=>'ERR'))).then(a=>JSON.stringify(a))`
  log('MULTI#0', await ev(MULTI))
  await sleep(6000)
  log('MULTI#1', await ev(MULTI))
  const NC = `fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',{mode:'no-cors'}).then(r=>'OK type='+r.type+' status='+r.status).catch(e=>'ERR '+e.message)`
  log('FETCH#1', await ev(FETCH), '| no-cors:', await ev(NC))
  await sleep(4000)
  log('FETCH#2', await ev(FETCH), '| no-cors:', await ev(NC))
  log('DARKREADER', await ev(`JSON.stringify({styleDarkreader: document.querySelectorAll('style.darkreader').length, attrs: Array.from(document.documentElement.attributes).map(a=>a.name), meta: !!document.querySelector('meta[name=darkreader]'), bg: getComputedStyle(document.body).backgroundColor})`))

  await load('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await sleep(15000)
  log('YT', await ev(`JSON.stringify({keys:Object.keys(window.ytInitialPlayerResponse||{}), adPlacements: typeof (window.ytInitialPlayerResponse||{}).adPlacements})`))

  log('YT-detail', await ev(`(()=>{const r=window.ytInitialPlayerResponse||{};return JSON.stringify({adPlacementsLen:Array.isArray(r.adPlacements)?r.adPlacements.length:r.adPlacements, playerAds:Array.isArray(r.playerAds)?r.playerAds.length:typeof r.playerAds, adSlots:Array.isArray(r.adSlots)?r.adSlots.length:typeof r.adSlots, status:r.playabilityStatus&&r.playabilityStatus.status, adClassPresent: !!document.querySelector('.video-ads, .ytp-ad-module')})})()`))
  log('DONE')
  app.quit()
})
