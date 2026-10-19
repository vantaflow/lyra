// Spike jetable : @ghostery/adblocker-electron sur YouTube, Electron 44, BaseWindow + WebContentsView.
// Lancement : Electron --js-flags=--expose-gc .
// Env : PHASES=bloque,libre,fix (défaut bloque,libre) ; KEEP_CACHE=1 (ne pas vider le cache) ; DOH=1 (DNS-over-HTTPS,
//       contourne le DNS filtrant du poste) ; RELOADS=n ; DOUBLE=1 (piège 2e session) ; SEQ=id,id (vidéos enchaînées).
const { app, BaseWindow, WebContentsView, session, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('tldts-experimental');
const { ElectronBlocker, fromElectronDetails } = require('@ghostery/adblocker-electron');

const OUT = __dirname;
// Tout reste dans le dossier du spike (sinon ~/Library/Application Support/<nom>).
for (const k of ['userData', 'sessionData', 'crashDumps']) app.setPath(k, path.join(OUT, 'userdata', k));
const CACHE_DIR = path.join(OUT, 'cache');
const CACHE = path.join(CACHE_DIR, 'engine.bin');
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const WAIT_MS = 20000;
const AD_URLS = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://www.youtube.com/api/stats/ads?x=1',
  'https://static.doubleclick.net/instream/ad_status.js',
];
const ENV = process.env;
const PHASES = (ENV.PHASES ?? 'bloque,libre').split(',').filter(Boolean);
const SEQ = (ENV.SEQ ?? 'JGwWNGJdvx8,kJQP7kiw5Fk').split(',').filter(Boolean);
const RUN = ENV.RUN || 'run';

const t = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (n / 1048576).toFixed(1) + ' Mo';
const results = { versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, mem: [], timings: {} };
const mem = (label) => {
  if (global.gc) global.gc();
  const m = process.memoryUsage();
  const o = { label, rss: mb(m.rss), heapUsed: mb(m.heapUsed), external: mb(m.external), arrayBuffers: mb(m.arrayBuffers) };
  console.log('[MEM]', JSON.stringify(o));
  results.mem.push(o);
};

// Filet de sécurité : l'app quitte toute seule quoi qu'il arrive.
setTimeout(() => { console.log('[SAFETY] 150 s atteints, app.exit(3)'); app.exit(3); }, 150000).unref();
process.on('unhandledRejection', (e) => console.log('[UNHANDLED REJECTION]', e && e.message));

// UA sans "Electron/x" ni nom d'app (comme le ferait un vrai navigateur).
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ spike-adblock\/\S+/, '');

// Compteurs par phase.
let phase = 'init';
const S = {};
const st = () => (S[phase] ??= { allowed: 0, blocked: [], redirected: [], whitelisted: [], csp: [], scripts: [], styles: [], filterMatched: 0, netErrors: [], console: [], scriptletFails: [] });
const scriptletName = (code) => { const n = [...code.matchAll(/\(function\s+([\w$]+)\s*\(/g)].map((m) => m[1]); return n[n.length - 1]; };

function hookEvents(blocker) {
  blocker.on('request-allowed', () => { st().allowed++; });
  blocker.on('request-blocked', (req, res) => st().blocked.push({ url: req.url, type: req.type, filter: res.filter && res.filter.toString() }));
  blocker.on('request-redirected', (req, res) => st().redirected.push({ url: req.url, to: res.redirect && res.redirect.filename, filter: res.filter && res.filter.toString() }));
  blocker.on('request-whitelisted', (req, res) => st().whitelisted.push({ url: req.url, exception: res.exception && res.exception.toString() }));
  blocker.on('csp-injected', (req, csps) => st().csp.push({ url: req.url, csps }));
  blocker.on('html-filtered', (sel, url) => console.log('[html-filtered]', url, JSON.stringify(sel).slice(0, 200)));
  blocker.on('style-injected', (style, url) => st().styles.push({ url, len: style.length }));
  blocker.on('script-injected', (script, url) => {
    const argsM = script.match(/\}\)\(\.\.\.\[(.*?)\]\.filter\(/s);
    st().scripts.push({
      url, len: script.length, scriptlet: scriptletName(script),
      args: argsM ? decodeURIComponent(argsM[1].replace(/,?`\{\{\d+\}\}`/g, '')).slice(0, 200) : '?',
      has: { 'json-prune': /jsonPrune/.test(script), adPlacements: script.includes('adPlacements'), playerAds: script.includes('playerAds'), adSlots: script.includes('adSlots'), 'set-constant': /setConstant/.test(script) },
    });
  });
  blocker.on('filter-matched', () => { st().filterMatched++; });
}

// Le bloqueur fait event.sender.executeJavaScript(script, true) sans .catch : on enveloppe pour (1) savoir quel
// scriptlet échoue, (2) noter l'état du document au moment où le 1er scriptlet s'exécute réellement.
app.on('web-contents-created', (_e, wc) => {
  const orig = wc.executeJavaScript.bind(wc);
  wc.executeJavaScript = (code, ug) => {
    const name = scriptletName(String(code));
    if (!name) return orig(code, ug);
    const marked = `window.__ghosteryRanAt ??= document.readyState + '@' + Math.round(performance.now()) + 'ms';\n` + code;
    return orig(marked, ug).catch(() => { st().scriptletFails.push(name); });
  };
});

const PROBE = `JSON.stringify({t: typeof window.ytInitialPlayerResponse, keys: Object.keys(window.ytInitialPlayerResponse||{}), adPlacements: typeof (window.ytInitialPlayerResponse||{}).adPlacements, playerAds: typeof (window.ytInitialPlayerResponse||{}).playerAds, adSlots: typeof (window.ytInitialPlayerResponse||{}).adSlots, adModules: document.querySelectorAll('.ytp-ad-module, .video-ads, .ytp-ad-player-overlay').length})`;
const PROBE_EXTRA = `(() => {
  const r = window.ytInitialPlayerResponse || {};
  const d = (o, k) => { const x = Object.getOwnPropertyDescriptor(o, k); return x ? (x.get ? 'accessor(get)' : 'data:' + (Array.isArray(x.value) ? 'array[' + x.value.length + ']' : typeof x.value)) : 'absent'; };
  let kinds; try { kinds = (r.adPlacements || []).map((p) => p.adPlacementRenderer?.config?.adPlacementConfig?.kind); } catch (e) { kinds = 'ERR ' + e.message; }
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return JSON.stringify({ href: location.href,
    windowYtInitialPlayerResponse: d(window, 'ytInitialPlayerResponse'),
    desc: { adPlacements: d(r, 'adPlacements'), playerAds: d(r, 'playerAds'), adSlots: d(r, 'adSlots') }, adPlacementKinds: kinds,
    ghosteryRanAt: window.__ghosteryRanAt, spikeEarly: window.__spikeEarly,
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0) + 'ms', loadEventEnd: Math.round(nav.loadEventEnd || 0) + 'ms' });
})()`;
const SAMPLE = `(() => { const p = document.querySelector('#movie_player'); const v = document.querySelector('video');
  return (p && p.classList.contains('ad-showing') ? 'AD' : 'no-ad') + ' ' + (v ? v.currentTime.toFixed(0) + '/' + Math.round(v.duration) : '-'); })()`;
const fetchProbe = (u, mode) => `fetch(${JSON.stringify(u)}${mode ? `, {mode:'${mode}'}` : ''}).then(r=>'OK '+r.status).catch(e=>'ERR '+e.message)`;
const sampleFor = async (wc, n) => { const s = []; for (let i = 0; i < n; i++) { await sleep(1000); s.push(await wc.executeJavaScript(SAMPLE).catch(() => 'ERR')); } return s.join(' | '); };

function makeView(partition) {
  const win = new BaseWindow({ show: false, width: 1280, height: 800 });
  const view = new WebContentsView({ webPreferences: { partition, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  view.webContents.setAudioMuted(true);
  view.webContents.on('console-message', (e) => { if (e.level === 'error' && !/Access to fetch|CORS|Failed to load resource/.test(e.message)) st().console.push(`[${e.level}] ${e.message.slice(0, 160)}`); });
  return { win, view, wc: view.webContents };
}

async function runPhase(name, ses, partition) {
  phase = name;
  st();
  ses.webRequest.onErrorOccurred((d) => {
    if (/doubleclick|googlesyndication|stats\/ads|pagead|adservice|ptracking|get_midroll/.test(d.url)) st().netErrors.push(d.error + ' ' + d.url.slice(0, 100));
  });
  const { win, wc } = makeView(partition);
  console.log(`\n[${name}] preloads de la session:`, JSON.stringify(ses.getPreloadScripts().map((p) => ({ type: p.type, file: path.relative(OUT, p.filePath) }))));
  const t0 = t();
  try { await wc.loadURL(VIDEO); } catch (e) { console.log(`[${name}] loadURL error`, e.message); }
  console.log(`[${name}] loadURL résolu en ${(t() - t0).toFixed(0)} ms, échantillonnage 1/s pendant ${WAIT_MS} ms`);
  const out = {};
  out.samples = await sampleFor(wc, WAIT_MS / 1000);
  out.probe = await wc.executeJavaScript(PROBE).catch((e) => 'EXEC ERR ' + e.message);
  out.extra = await wc.executeJavaScript(PROBE_EXTRA).catch((e) => 'EXEC ERR ' + e.message);
  out.fetch = {};
  for (const u of AD_URLS) out.fetch[u] = { cors: await wc.executeJavaScript(fetchProbe(u)), noCors: await wc.executeJavaScript(fetchProbe(u, 'no-cors')) };
  out.fetch['https://www.youtube.com/favicon.ico (témoin)'] = { cors: await wc.executeJavaScript(fetchProbe('https://www.youtube.com/favicon.ico')) };
  await sleep(500);
  const s = st();
  out.counts = { blocked: s.blocked.length, redirected: s.redirected.length, whitelisted: s.whitelisted.length, allowed: s.allowed, filterMatched: s.filterMatched, scripts: s.scripts.length, styles: s.styles.length, csp: s.csp.length, scriptletFails: s.scriptletFails.length };
  console.log(`===== PHASE ${name} =====`);
  console.log('SAMPLES', out.samples);
  console.log('PROBE', out.probe);
  console.log('EXTRA', out.extra);
  console.log('FETCH', JSON.stringify(out.fetch));
  console.log('COUNTS', JSON.stringify(out.counts));
  console.log('BLOCKED (20 premiers)', JSON.stringify(s.blocked.slice(0, 20).map((b) => `${b.type} ${b.url.slice(0, 90)}  <= ${b.filter}`), null, 1));
  console.log('REDIRECTED', JSON.stringify(s.redirected.slice(0, 10).map((b) => `${b.url.slice(0, 90)} -> ${b.to}`), null, 1));
  console.log('WHITELISTED', JSON.stringify(s.whitelisted.slice(0, 10)));
  console.log('SCRIPTS injectés (youtube)', JSON.stringify(s.scripts.filter((x) => /youtube/.test(x.url)).map((x) => `${x.scriptlet}(${x.args}) ${JSON.stringify(Object.keys(x.has).filter((k) => x.has[k]))}`), null, 1));
  console.log('SCRIPTLETS en échec', JSON.stringify(s.scriptletFails));
  console.log('STYLES injectés', JSON.stringify(s.styles));
  console.log('NET ERRORS', JSON.stringify(s.netErrors.slice(0, 20), null, 1));
  console.log('CONSOLE (erreurs page)', JSON.stringify([...new Set(s.console)].slice(0, 10), null, 1));
  // Vidéos enchaînées (YouTube sert souvent la 1re vidéo d'une session sans pub) : pub visible ou non ?
  out.seq = {};
  for (const id of SEQ) {
    await wc.loadURL('https://www.youtube.com/watch?v=' + id).catch(() => {});
    out.seq[id] = await sampleFor(wc, 9);
    console.log(`SEQ ${id}:`, out.seq[id], '| early:', await wc.executeJavaScript(`(window.__spikeEarly||window.__ghosteryRanAt||'-') + ' window.ytIPR=' + ((d => d ? (d.get ? 'accessor' : 'data') : 'absent'))(Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse'))`).catch(() => '?'));
  }
  for (let i = 0; i < +(ENV.RELOADS || 0); i++) {
    await wc.loadURL(VIDEO).catch(() => {});
    await sleep(3000);
    console.log(`[RELOAD ${i + 1}]`, await wc.executeJavaScript(`(() => { const x = Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse'); const r = window.ytInitialPlayerResponse || {}; const y = Object.getOwnPropertyDescriptor(r, 'adPlacements');
      return 'window.ytIPR=' + (x ? (x.get ? 'accessor' : 'data') : 'absent') + ' adPlacements=' + (y ? (y.get ? 'accessor' : 'data') : 'absent') + ' typeof=' + typeof r.adPlacements + ' scriptlets@' + (window.__spikeEarly || window.__ghosteryRanAt); })()`));
  }
  console.log('SCRIPTLETS en échec (total phase)', s.scriptletFails.length);
  results[name] = out;
  wc.close(); win.destroy();
}

// Correctif testé en phase "fix" : scriptlets servis en synchrone au préload (sendSync) et exécutés tôt ;
// le handler IPC du bloqueur ne fait plus que le CSS.
function installEarlyScriptlets(blocker, ses) {
  ipcMain.on('spike:scriptlets', (e, url) => {
    const { hostname = '', domain = '' } = parse(url);
    const r = blocker.getCosmeticsFilters({ url, hostname, domain, getBaseRules: false, getInjectionRules: true, getExtendedRules: false, getRulesFromHostname: true, getRulesFromDOM: false, callerContext: { frameId: e.frameId, processId: e.processId } });
    e.returnValue = r.active ? r.scripts : [];
  });
  ipcMain.on('spike:scriptlet-error', (_e, m) => st().scriptletFails.push(m));
  blocker.onInjectCosmeticFilters = async (event, url, msg) => {
    const { hostname = '', domain = '' } = parse(url);
    const first = msg === undefined;
    const { active, styles } = blocker.getCosmeticsFilters({ url, hostname, domain, classes: msg?.classes, hrefs: msg?.hrefs, ids: msg?.ids,
      getBaseRules: first, getInjectionRules: false, getExtendedRules: false, getRulesFromHostname: first, getRulesFromDOM: !first,
      callerContext: { frameId: event.frameId, processId: event.processId, lifecycle: msg?.lifecycle } });
    if (active && styles.length > 0) event.sender.insertCSS(styles, { cssOrigin: 'user' });
  };
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(OUT, 'preload-scriptlets.js') });
}

app.whenReady().then(async () => {
  try {
    console.log('[VERSIONS]', JSON.stringify(results.versions), 'UA:', app.userAgentFallback, JSON.stringify({ RUN, PHASES, SEQ, KEEP_CACHE: !!ENV.KEEP_CACHE, DOH: !!ENV.DOH }));
    if (ENV.DOH) app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://dns.google/dns-query'] });
    fs.mkdirSync(CACHE_DIR, { recursive: true }); // sans ça, write() échoue et fromPrebuiltFull rejette
    if (!ENV.KEEP_CACHE) fs.rmSync(CACHE, { force: true });
    mem('avant moteur');
    const caching = { path: CACHE, read: fs.promises.readFile, write: fs.promises.writeFile };
    const fetched = [];
    const loggingFetch = async (url) => { const r = await fetch(url); fetched.push(`${r.status} ${url.replace('https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/', '…/')}`); return r; };

    let t0 = t();
    let blocker = await ElectronBlocker.fromPrebuiltFull(loggingFetch, caching);
    results.timings.firstCallMs = Math.round(t() - t0);
    results.cacheBytes = fs.statSync(CACHE).size;
    console.log('[FETCH listes]', fetched.length, 'requêtes', JSON.stringify(fetched));
    console.log(`[TIMING] fromPrebuiltFull #1 (${ENV.KEEP_CACHE ? 'cache, process neuf' : 'réseau + parsing + write'}) ${results.timings.firstCallMs} ms ; cache ${results.cacheBytes} octets (${mb(results.cacheBytes)})`);
    mem('après #1');
    if (!ENV.KEEP_CACHE) {
      t0 = t();
      blocker = await ElectronBlocker.fromPrebuiltFull(loggingFetch, caching);
      results.timings.secondCallMs = Math.round(t() - t0);
      console.log(`[TIMING] fromPrebuiltFull #2 (cache, même process) ${results.timings.secondCallMs} ms`);
      mem('après #2 (#1 libéré)');
    }
    const f = blocker.getFilters();
    console.log('[ENGINE] filtres réseau', f.networkFilters.length, 'cosmétiques', f.cosmeticFilters.length, 'config', JSON.stringify(blocker.config));
    hookEvents(blocker);

    for (const ph of PHASES) {
      const partition = 'persist:' + ph;
      const ses = session.fromPartition(partition);
      await ses.clearStorageData(); await ses.clearCache();
      if (ph === 'bloque' || ph === 'fix') {
        blocker.enableBlockingInSession(ses);
        if (ph === 'fix') installEarlyScriptlets(blocker, ses);
        console.log(`[ENABLE ${ph}] isBlockingEnabled =`, blocker.isBlockingEnabled(ses));
        await runPhase(ph, ses, partition);
      } else {
        // Dry-run : le moteur est interrogé sans jamais annuler -> "aurait bloqué" (aucun effet sur la page).
        ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => { const r = fromElectronDetails(details); if (!r.isMainFrame()) blocker.match(r); cb({}); });
        console.log(`[${ph}] preloads:`, JSON.stringify(ses.getPreloadScripts()), 'isBlockingEnabled =', blocker.isBlockingEnabled(ses));
        await runPhase(ph, ses, partition);
        ses.webRequest.onBeforeRequest(null);
      }
    }

    if (ENV.DOUBLE) {
      // Piège : activer le même bloqueur sur une 2e session -> ipcMain.handle déjà enregistré.
      phase = 'double';
      const sesD = session.fromPartition('double-test');
      try { blocker.enableBlockingInSession(sesD); console.log('[DOUBLE] enable 2e session OK'); }
      catch (e) { console.log('[DOUBLE] enable 2e session a levé :', e.message); }
      console.log('[DOUBLE] isBlockingEnabled =', blocker.isBlockingEnabled(sesD), 'preloads =', sesD.getPreloadScripts().length);
      const probeDouble = async (label) => {
        const { win, wc } = makeView('double-test');
        await wc.loadURL('https://example.com/').catch((e) => console.log('load err', e.message));
        console.log(`[DOUBLE] ${label} : fetch youtube.com/api/stats/ads no-cors depuis example.com ->`, await wc.executeJavaScript(fetchProbe('https://www.youtube.com/api/stats/ads?x=1', 'no-cors')));
        wc.close(); win.destroy();
      };
      await probeDouble('après enable en échec');
      try { blocker.disableBlockingInSession(sesD); blocker.enableBlockingInSession(sesD); console.log('[DOUBLE] contournement disable()+enable() OK'); }
      catch (e) { console.log('[DOUBLE] contournement a levé :', e.message); }
      await probeDouble('après contournement');
    }
    fs.writeFileSync(path.join(OUT, `results-${RUN}.json`), JSON.stringify(results, null, 2));
    console.log('[DONE] app.quit()');
  } catch (e) {
    console.log('[FATAL]', e && e.stack);
  }
  app.quit();
});

app.on('window-all-closed', () => {}); // sortie pilotée par le script
