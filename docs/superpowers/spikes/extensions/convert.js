// usage: node convert.js <unpacked-xpi-dir> <out-dir> [--shim]
// Spike: converts an unpacked Firefox WebExtension into a Chrome-loadable extension folder.
const fs = require('fs')
const path = require('path')
const [src, out, ...flags] = process.argv.slice(2)
const SHIM = flags.includes('--shim')
const POLY = path.join(__dirname, 'node_modules/webextension-polyfill/dist/browser-polyfill.js')
const SHIM_SRC = path.join(__dirname, 'out/shim-head.js')
const SHIM_POST = path.join(__dirname, 'out/shim-post.js')

const CHROME_PERMS = new Set(['activeTab', 'alarms', 'background', 'bookmarks', 'browsingData', 'certificateProvider', 'clipboardRead', 'clipboardWrite', 'contentSettings', 'contextMenus', 'cookies', 'debugger', 'declarativeContent', 'declarativeNetRequest', 'declarativeNetRequestFeedback', 'declarativeNetRequestWithHostAccess', 'desktopCapture', 'downloads', 'downloads.open', 'downloads.shelf', 'enterprise.deviceAttributes', 'enterprise.hardwarePlatform', 'enterprise.networkingAttributes', 'enterprise.platformKeys', 'favicon', 'fileBrowserHandler', 'fileSystemProvider', 'fontSettings', 'gcm', 'geolocation', 'history', 'identity', 'identity.email', 'idle', 'loginState', 'management', 'nativeMessaging', 'notifications', 'offscreen', 'pageCapture', 'platformKeys', 'power', 'printerProvider', 'printing', 'printingMetrics', 'privacy', 'processes', 'proxy', 'readingList', 'scripting', 'search', 'sessions', 'sidePanel', 'storage', 'system.cpu', 'system.display', 'system.memory', 'system.storage', 'tabCapture', 'tabGroups', 'tabs', 'topSites', 'tts', 'ttsEngine', 'unlimitedStorage', 'vpnProvider', 'wallpaper', 'webAuthenticationProxy', 'webNavigation', 'webRequest', 'webRequestBlocking', 'webRequestAuthProvider'])
const isHostPattern = p => p === '<all_urls>' || /^(\*|https?|ftp|file|wss?|chrome-extension):\/\//.test(p) || /^\*:\/\//.test(p)
const report = { removedPerms: [], renamed: [], htmlPatched: [], notes: [] }

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(src, out, { recursive: true })
const mpath = path.join(out, 'manifest.json')
// Firefox manifests may contain comments/BOM
const m = JSON.parse(fs.readFileSync(mpath, 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/gm, ''))
const mv = m.manifest_version
fs.copyFileSync(POLY, path.join(out, 'browser-polyfill.js'))
if (SHIM) { fs.copyFileSync(SHIM_SRC, path.join(out, 'chrome-shim.js')); fs.copyFileSync(SHIM_POST, path.join(out, 'chrome-shim-post.js')) }
const PRE = SHIM ? ['chrome-shim.js', 'browser-polyfill.js', 'chrome-shim-post.js'] : ['browser-polyfill.js']

delete m.browser_specific_settings
delete m.applications
for (const k of ['sidebar_action']) if (m[k]) { report.notes.push('removed ' + k); delete m[k] }

// permissions
const fixPerms = key => {
  if (!Array.isArray(m[key])) return
  const keep = []
  for (let p of m[key]) {
    if (p === 'menus') { p = 'contextMenus'; report.renamed.push('menus->contextMenus') }
    if (isHostPattern(p)) { if (mv === 3 && key === 'permissions') (m.host_permissions ||= []).push(p); else keep.push(p); continue }
    if (CHROME_PERMS.has(p)) { if (mv === 3 && p === 'webRequestBlocking') { report.removedPerms.push(p + '(MV3)'); continue } keep.push(p) } else report.removedPerms.push(p)
  }
  m[key] = [...new Set(keep)]
}
fixPerms('permissions'); fixPerms('optional_permissions')
if (mv === 3 && m.host_permissions) m.host_permissions = [...new Set(m.host_permissions)]
if (m.commands) for (const [k, v] of Object.entries(m.commands)) if (k === '_execute_browser_action' && mv === 3) { m.commands._execute_action = v; delete m.commands[k] }
if (m.browser_action) { delete m.browser_action.browser_style; delete m.browser_action.default_area; delete m.browser_action.theme_icons }
if (m.options_ui) delete m.options_ui.browser_style

// background
const bg = m.background
if (bg) {
  if (Array.isArray(bg.scripts)) {
    if (mv === 3) {
      const list = [...PRE, ...bg.scripts]
      fs.writeFileSync(path.join(out, 'background.sw.js'), 'importScripts(' + list.map(s => JSON.stringify(s.replace(/^\//, ''))).join(', ') + ');\n')
      m.background = { service_worker: 'background.sw.js' }
      if (bg.type === 'module') report.notes.push('module bg scripts: importScripts cannot load ES modules')
      report.notes.push('MV3 background.scripts -> service_worker via importScripts')
    } else bg.scripts = [...PRE, ...bg.scripts]
    delete bg.persistent
    if (mv === 2) m.background.persistent = true
  } else if (bg.page) report.notes.push('background.page kept (MV2): ' + bg.page)
  if (m.background) { delete m.background.preferred_environment }
}

// CSP
if (typeof m.content_security_policy === 'string' && mv === 3) m.content_security_policy = { extension_pages: m.content_security_policy }

// web_accessible_resources
if (Array.isArray(m.web_accessible_resources)) {
  const war = m.web_accessible_resources.map(x => (typeof x === 'string' ? x.replace(/^\//, '') : x))
  if (mv === 3) m.web_accessible_resources = war[0] && typeof war[0] === 'object' ? war : [{ resources: war, matches: ['<all_urls>'] }]
  else m.web_accessible_resources = war
}

// content scripts
for (const cs of m.content_scripts || []) if (Array.isArray(cs.js)) cs.js = [...PRE, ...cs.js]

// HTML pages
const pages = new Set()
if (m.background && m.background.page) pages.add(m.background.page)
for (const a of [m.browser_action, m.action, m.page_action]) if (a && a.default_popup) pages.add(a.default_popup)
if (m.options_ui && m.options_ui.page) pages.add(m.options_ui.page)
if (m.options_page) pages.add(m.options_page)
for (const v of Object.values(m.chrome_url_overrides || {})) pages.add(v)
for (const pg of pages) {
  const rel = pg.replace(/^\//, '')
  const f = path.join(out, rel)
  if (!fs.existsSync(f)) { report.notes.push('missing page ' + rel); continue }
  let html = fs.readFileSync(f, 'utf8')
  const dir = path.dirname(rel)
  const tags = PRE.map(s => `<script src="${path.relative(dir, s)}"></script>`).join('')
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, x => x + tags)
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, x => x + tags)
  else html = tags + html
  fs.writeFileSync(f, html)
  report.htmlPatched.push(rel)
}
fs.writeFileSync(mpath, JSON.stringify(m, null, 2))
console.log(JSON.stringify(report))
