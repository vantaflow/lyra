/**
 * Script que le preload d'une page exécute (monde principal, avant tout script de la page) : applique les fonctions de règles du site
 * (`function (w) {…}`) à la frame, puis à chaque iframe que la page touche par `contentWindow` / `contentDocument`. Le preload ne s'exécute
 * pas dans l'iframe about:blank qu'un script vient de créer (document initial vide) : sans ce relais, elle échapperait à l'identité alternative
 * et à la neutralisation des cookies. Les fonctions sont appelées avec la fenêtre enfant (aucun `eval` : la CSP de la page n'y change rien).
 * Un enfant d'une autre origine refuse l'accès : ignoré (son propre preload s'est exécuté).
 */
export function scriptRegles(fonctions: readonly string[]): string {
  return `(function () {
  var fns = [${fonctions.join(',\n')}]
  function appliquer(w) { for (var i = 0; i < fns.length; i++) { try { fns[i](w) } catch (e) {} } }
  appliquer(window)
  if (typeof HTMLIFrameElement === 'undefined') return
  var vus = new WeakSet()
  function enfant(w) { try { if (w && !vus.has(w)) { vus.add(w); appliquer(w) } } catch (e) {} }
  var proto = HTMLIFrameElement.prototype
  ;[['contentWindow', false], ['contentDocument', true]].forEach(function (c) {
    var d = Object.getOwnPropertyDescriptor(proto, c[0])
    if (!d || !d.get) return
    var lire = d.get
    Object.defineProperty(proto, c[0], { configurable: true, enumerable: d.enumerable, get: function () { var v = lire.call(this); try { enfant(c[1] ? v && v.defaultView : v) } catch (e) {} return v } })
  })
})()`
}
