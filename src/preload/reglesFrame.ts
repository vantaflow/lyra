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
  var vus = new WeakSet()
  var protos = new WeakSet()
  // Une fenêtre déjà alignée l'est une fois pour toutes ; l'enfant d'une autre origine refuse l'accès (ignoré : son preload s'est exécuté).
  function appliquer(w) {
    if (!w || vus.has(w)) return
    vus.add(w)
    for (var i = 0; i < fns.length; i++) { try { fns[i](w) } catch (e) {} }
    relayer(w)
  }
  function enfant(w) { try { appliquer(w) } catch (e) {} }
  // Relais récursif : les getters de contentWindow / contentDocument de CHAQUE realm touché (donc l'iframe créée dans le document d'un
  // enfant, ou le getter natif emprunté au prototype d'un enfant) alignent la fenêtre qu'ils renvoient.
  function relayer(w) {
    ;['HTMLIFrameElement', 'HTMLFrameElement', 'HTMLObjectElement'].forEach(function (nom) {
      try {
        var C = w[nom]
        var proto = C && C.prototype
        if (!proto || protos.has(proto)) return
        protos.add(proto)
        ;[['contentWindow', false], ['contentDocument', true]].forEach(function (c) {
          var d = Object.getOwnPropertyDescriptor(proto, c[0])
          if (!d || !d.get) return
          var lire = d.get
          Object.defineProperty(proto, c[0], { configurable: true, enumerable: d.enumerable, get: function () { var v = lire.call(this); try { enfant(c[1] ? v && v.defaultView : v) } catch (e) {} return v } })
        })
      } catch (e) {}
    })
  }
  appliquer(window)
})()`
}
