// Surcharge de `window.Notification` dans le monde principal de la page (injectée par le preload page avant le
// premier script du site). Hors mode Ne pas déranger (ou site en exception, ou notifications non autorisées), le
// constructeur renvoie la vraie Notification : rien ne change pour la page. En mode, la notification est mise en
// file dans le main (par fenêtre), la page reçoit un objet qui se comporte comme une Notification (EventTarget,
// onclick/onclose/onerror/onshow, close(), propriétés en lecture seule) mais rien n'est affiché ; à la sortie du
// mode le main la livre, et un clic sur la notification livrée est rejoué ici (`click`) si la page est toujours là.
//
// Écrit en JavaScript pur dans une chaîne : il s'exécute tel quel dans la page, sans dépendre du bundle.
export const SURCHARGE_NOTIFICATION = `(function (nom) {
  'use strict'
  var pont = window[nom]
  try { delete window[nom] } catch (e) {}
  var Natif = window.Notification
  if (!pont || typeof Natif !== 'function') return
  var vivantes = new Map()
  var TYPES = ['click', 'close', 'error', 'show']

  class Faux extends EventTarget {}
  var gestionnaires = new WeakMap()
  TYPES.forEach(function (type) {
    Object.defineProperty(Faux.prototype, 'on' + type, {
      enumerable: true,
      configurable: true,
      get: function () { var g = gestionnaires.get(this); return (g && g[type] && g[type].f) || null },
      set: function (f) {
        var g = gestionnaires.get(this)
        if (!g) { g = {}; gestionnaires.set(this, g) }
        if (g[type]) this.removeEventListener(type, g[type].w)
        g[type] = null
        if (typeof f === 'function') {
          var w = function (e) { f.call(this, e) }
          g[type] = { f: f, w: w }
          this.addEventListener(type, w)
        }
      }
    })
  })

  function fixer(n, nom, valeur) {
    Object.defineProperty(n, nom, { value: valeur, enumerable: true, configurable: true })
  }

  function Surcharge(titre, options) {
    if (!new.target) throw new TypeError("Failed to construct 'Notification': Please use the 'new' operator, this DOM object constructor cannot be called as a function.")
    if (arguments.length === 0) throw new TypeError("Failed to construct 'Notification': 1 argument required, but only 0 present.")
    var o = options !== null && typeof options === 'object' ? options : {}
    var t = String(titre)
    var id = null
    try {
      id = pont.creer(t, o.body === undefined ? '' : String(o.body), o.tag === undefined ? '' : String(o.tag), o.silent === true)
    } catch (e) {}
    if (id === null || id === undefined) return Reflect.construct(Natif, arguments)
    var n = new Faux()
    fixer(n, 'title', t)
    fixer(n, 'body', o.body === undefined ? '' : String(o.body))
    fixer(n, 'tag', o.tag === undefined ? '' : String(o.tag))
    fixer(n, 'dir', o.dir === 'rtl' || o.dir === 'ltr' ? o.dir : 'auto')
    fixer(n, 'lang', o.lang === undefined ? '' : String(o.lang))
    fixer(n, 'icon', o.icon === undefined ? '' : String(o.icon))
    fixer(n, 'badge', o.badge === undefined ? '' : String(o.badge))
    fixer(n, 'image', o.image === undefined ? '' : String(o.image))
    fixer(n, 'data', o.data === undefined ? null : o.data)
    fixer(n, 'silent', o.silent === undefined ? null : o.silent === true)
    fixer(n, 'requireInteraction', o.requireInteraction === true)
    fixer(n, 'renotify', o.renotify === true)
    fixer(n, 'timestamp', typeof o.timestamp === 'number' ? o.timestamp : Date.now())
    fixer(n, 'vibrate', [])
    fixer(n, 'actions', [])
    n.close = function () {
      vivantes.delete(id)
      try { pont.fermer(id) } catch (e) {}
      setTimeout(function () { n.dispatchEvent(new Event('close')) }, 0)
    }
    if (vivantes.size >= 100) vivantes.delete(vivantes.keys().next().value)
    vivantes.set(id, n)
    return n
  }
  Surcharge.prototype = Faux.prototype
  Object.defineProperty(Faux.prototype, 'constructor', { value: Surcharge, writable: true, configurable: true })
  Object.defineProperty(Surcharge, 'name', { value: 'Notification', configurable: true })
  Object.defineProperty(Surcharge, Symbol.hasInstance, {
    value: function (x) { return x instanceof Faux || Natif[Symbol.hasInstance](x) }
  })
  Object.defineProperty(Surcharge, 'permission', {
    enumerable: true,
    configurable: true,
    get: function () {
      var p = null
      try { p = pont.permission() } catch (e) {}
      return p || Natif.permission
    }
  })
  Object.defineProperty(Surcharge, 'maxActions', { enumerable: true, configurable: true, get: function () { return Natif.maxActions } })
  // La demande est retenue par le main pendant le mode (l'invite s'affiche à la sortie) : la vraie fonction suffit.
  Surcharge.requestPermission = function () { return Natif.requestPermission.apply(Natif, arguments) }

  try {
    pont.surClic(function (id) {
      var n = vivantes.get(id)
      if (n) n.dispatchEvent(new Event('click'))
    })
  } catch (e) {}
  Object.defineProperty(window, 'Notification', { value: Surcharge, writable: true, configurable: true, enumerable: false })
})`
