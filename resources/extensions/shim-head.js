/*
 * Lyra : couche de compatibilité MV2 (partie 1, AVANT browser-polyfill.js).
 * Ajoute à `chrome.*` des proxys inertes pour les API que electron-chrome-extensions ne fournit pas en MV2 : un appel
 * rend la main aux callbacks / promesses sans effet. Chaque appel est compté dans `globalThis.__lyraStubs`
 * (« browserAction.setBadgeText » → n) ; le processus principal lit ce compteur (executeJavaScript) pour le journal.
 * Les API déjà présentes ne sont jamais remplacées. Idempotent.
 */
(function () {
  var g = globalThis
  if (g.__lyraShimHead || typeof g.chrome !== 'object' || g.chrome === null) return
  g.__lyraShimHead = true
  var compteurs = g.__lyraStubs || (g.__lyraStubs = {})
  var installes = (g.__lyraStubsInstalles = [])
  var APIS = ['browserAction', 'pageAction', 'action', 'contextMenus', 'menus', 'webNavigation', 'privacy', 'windows', 'commands', 'dns', 'notifications', 'declarativeNetRequest']
  var EVENEMENTS = { addListener: 1, removeListener: 1, hasListener: 1, hasListeners: 1 }
  var CONSTANTES = { WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2 }

  function noter(chemin) {
    compteurs[chemin] = (compteurs[chemin] || 0) + 1
  }
  function membre(chemin, k) {
    if (/^[A-Z][A-Z0-9_]*$/.test(k)) return Object.prototype.hasOwnProperty.call(CONSTANTES, k) ? CONSTANTES[k] : k.toLowerCase()
    return noeud(chemin + '.' + k)
  }
  function noeud(chemin) {
    return new Proxy(function () {}, {
      get: function (_t, k) {
        if (typeof k === 'symbol' || k === 'then') return undefined
        if (EVENEMENTS[k] === 1) return k === 'hasListener' || k === 'hasListeners' ? function () { return false } : function () {}
        return membre(chemin, k)
      },
      apply: function (_t, _this, args) {
        noter(chemin)
        var cb = args[args.length - 1]
        if (typeof cb === 'function') {
          try { cb() } catch (e) { console.error(e) }
          return undefined
        }
        return Promise.resolve()
      }
    })
  }
  function racine(api) {
    return new Proxy({}, {
      get: function (t, k) {
        if (typeof k === 'symbol' || k === 'then') return t[k]
        if (Object.prototype.hasOwnProperty.call(t, k)) return t[k]
        if (EVENEMENTS[k] === 1) return function () {}
        return membre(api, k)
      }
    })
  }
  var manquantes = []
  for (var i = 0; i < APIS.length; i++) if (!g.chrome[APIS[i]]) manquantes.push(APIS[i])
  if (manquantes.length === 0) return
  var posees = {}
  for (var j = 0; j < manquantes.length; j++) posees[manquantes[j]] = racine(manquantes[j])

  // 1. `chrome` modifiable : on y pose les stubs.
  for (var m in posees) {
    try { g.chrome[m] = posees[m] } catch (e) { /* objet figé */ }
  }
  var restantes = manquantes.filter(function (a) { return !g.chrome[a] })
  // 2. `chrome` figé (Electron : electron-chrome-extensions gèle l'objet) : `chrome` devient un accesseur qui rend un proxy.
  //    Le proxy délègue tout à l'objet courant et ne fournit un stub que pour une API qui lui manque ; si le moteur
  //    réaffecte `chrome` plus tard, l'objet courant change, le proxy reste.
  var courant = g.chrome
  var proxy
  if (restantes.length > 0) {
    proxy = new Proxy({}, {
      get: function (_t, k) { var v = courant[k]; return !v && Object.prototype.hasOwnProperty.call(posees, k) ? posees[k] : v },
      has: function (_t, k) { return k in courant || Object.prototype.hasOwnProperty.call(posees, k) },
      ownKeys: function () {
        var cles = Reflect.ownKeys(courant)
        for (var q = 0; q < manquantes.length; q++) if (cles.indexOf(manquantes[q]) < 0) cles.push(manquantes[q])
        return cles
      },
      getOwnPropertyDescriptor: function (_t, k) {
        var d = Reflect.getOwnPropertyDescriptor(courant, k)
        if (!d && Object.prototype.hasOwnProperty.call(posees, k)) d = { value: posees[k], writable: true, enumerable: true }
        if (d) d.configurable = true
        return d
      },
      set: function (_t, k, v) { try { courant[k] = v } catch (e) { return false } return true }
    })
    try {
      Object.defineProperty(g, 'chrome', { get: function () { return proxy }, set: function (v) { courant = v }, configurable: true, enumerable: true })
    } catch (e) { /* remplacement impossible : les stubs ne sont pas installés */ }
    if (g.chrome !== proxy) restantes = []
  }
  for (var n = 0; n < manquantes.length; n++) {
    var a = manquantes[n]
    if (g.chrome[a] === posees[a]) installes.push(a)
  }
})()
