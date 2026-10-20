/*
 * Lyra : couche de compatibilité MV2 (partie 2, APRÈS browser-polyfill.js éventuel).
 * Rend `browser.*` aussi complet que `chrome.*` : Chromium définit un `browser` natif sans les API ajoutées par
 * electron-chrome-extensions (browserAction, contextMenus, windows…) ni nos stubs, et des extensions comme uBlock Origin
 * font `self.chrome = self.browser`. Toute clé de `chrome` absente de `browser` y est donc recopiée. Sans `browser`
 * (extension Chrome sans polyfill ni alias natif), ne fait rien. Idempotent.
 */
(function () {
  var g = globalThis
  var b = g.browser
  var c = g.chrome
  if (g.__lyraShimPost || typeof b !== 'object' || b === null || typeof c !== 'object' || c === null || b === c) return
  g.__lyraShimPost = true
  var manque = Reflect.ownKeys(c).filter(function (k) { return typeof k === 'string' && !(k in b) })
  if (manque.length === 0) return
  var rates = []
  manque.forEach(function (k) {
    try {
      Object.defineProperty(b, k, { value: c[k], configurable: true, enumerable: true, writable: true })
    } catch (e) { /* objet figé */ }
    if (!(k in b)) rates.push(k)
  })
  if (rates.length === 0) return
  // `browser` figé : proxy qui complète avec `chrome` ; `browser` devient un accesseur (le moteur ou l'extension peuvent le réaffecter).
  // Valeurs figées maintenant : si l'extension fait `chrome = browser`, aucune boucle entre les deux proxys.
  var valeurs = {}
  rates.forEach(function (k) { valeurs[k] = c[k] })
  var courant = b
  var proxy = new Proxy({}, {
    get: function (_t, k) { var v = courant[k]; return v === undefined && rates.indexOf(k) >= 0 ? valeurs[k] : v },
    has: function (_t, k) { return k in courant || rates.indexOf(k) >= 0 },
    ownKeys: function () {
      var cles = Reflect.ownKeys(courant)
      for (var i = 0; i < rates.length; i++) if (cles.indexOf(rates[i]) < 0) cles.push(rates[i])
      return cles
    },
    getOwnPropertyDescriptor: function (_t, k) {
      var d = Reflect.getOwnPropertyDescriptor(courant, k)
      if (!d && rates.indexOf(k) >= 0) d = { value: valeurs[k], writable: true, enumerable: true }
      if (d) d.configurable = true
      return d
    },
    set: function (_t, k, v) { try { courant[k] = v } catch (e) { return false } return true }
  })
  try {
    Object.defineProperty(g, 'browser', { get: function () { return proxy }, set: function (v) { courant = v }, configurable: true, enumerable: true })
  } catch (e) {
    console.warn('lyra shim-post : browser non complété (' + String(e) + ')')
  }
})()
