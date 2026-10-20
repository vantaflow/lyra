/**
 * Lecture automatique des médias par site : « Autoriser » (rien), « Sans le son », « Bloquer ». Script exécuté par le preload des pages
 * dans le monde principal, avant tout script de la page (via `scriptRegles`, qui le rejoue sur les iframes que la page touche).
 * Est « automatique » toute lecture démarrée hors activation utilisateur (`navigator.userActivation.isActive`) :
 *  - `HTMLMediaElement.prototype.play` : « Bloquer » rejette avec `NotAllowedError`, « Sans le son » force `muted` ;
 *  - l'attribut `autoplay` (média dans la page ou inséré plus tard, ou affecté par `autoplay = true`) : retiré en « Bloquer »,
 *    muet en « Sans le son », avant que la ressource ne se charge (observateur de mutations), avec l'évènement `play` en filet.
 * Sans `userActivation` (impossible à décider) la lecture passe. Limites : les médias dans un shadow DOM (l'évènement `play` ne le
 * traverse pas) et l'API Web Audio ne sont pas couverts ; la surcharge est détectable par un script qui lit `play.toString()`.
 */
import type { RegleSite } from '../../shared/types'

export type ModeLectureAuto = 'sans-son' | 'bloquer'

/** Mode à injecter pour la règle d'un site ; `undefined` : rien à faire (« Autoriser », absence de règle, valeur inconnue). */
export function modeLectureAuto(regle: RegleSite['lectureAuto']): ModeLectureAuto | undefined {
  return regle === 'bloquer' || regle === 'sans-son' ? regle : undefined
}

/** Source d'une fonction `function (w) {…}` qui applique le mode à la fenêtre `w` (la frame elle-même ou une iframe about:blank). */
export function fonctionLectureAuto(mode: ModeLectureAuto): string {
  return `function (w) {
  var MODE = ${JSON.stringify(mode)}
  var HME = w.HTMLMediaElement
  if (!HME || !HME.prototype || typeof HME.prototype.play !== 'function') return
  var proto = HME.prototype
  var jouer = proto.play
  function geste() { try { var a = w.navigator.userActivation; return !a || a.isActive === true } catch (e) { return true } }
  function refus() { return w.Promise.reject(new w.DOMException("play() failed because the user didn't interact with the document first.", 'NotAllowedError')) }
  // Média qui démarre ou peut démarrer seul (attribut autoplay).
  function neutraliser(m) {
    try {
      if (geste()) return
      if (MODE === 'bloquer') { m.removeAttribute('autoplay'); if (!m.paused) m.pause() } else m.muted = true
    } catch (e) {}
  }
  function examiner(n) {
    try {
      if (!n) return
      if (n instanceof HME) { if (n.hasAttribute('autoplay')) neutraliser(n); return }
      if (typeof n.querySelectorAll !== 'function') return
      var l = n.querySelectorAll('video,audio')
      for (var i = 0; i < l.length; i++) examiner(l[i])
    } catch (e) {}
  }
  var d = Object.getOwnPropertyDescriptor(proto, 'play')
  try {
    Object.defineProperty(proto, 'play', {
      configurable: true, enumerable: d ? d.enumerable : true, writable: true,
      value: { play: function () {
        if (geste()) return jouer.apply(this, arguments)
        if (MODE === 'bloquer') return refus()
        try { this.muted = true } catch (e) {}
        return jouer.apply(this, arguments)
      } }.play
    })
  } catch (e) { return }
  var auto = Object.getOwnPropertyDescriptor(proto, 'autoplay')
  if (auto && auto.set) {
    try {
      var poser = auto.set
      Object.defineProperty(proto, 'autoplay', { configurable: true, enumerable: auto.enumerable, get: auto.get, set: function (v) {
        if (v && !geste()) { if (MODE === 'bloquer') v = false; else { try { this.muted = true } catch (e) {} } }
        return poser.call(this, v)
      } })
    } catch (e) {}
  }
  try {
    var doc = w.document
    var obs = new w.MutationObserver(function (lot) {
      for (var i = 0; i < lot.length; i++) {
        var m = lot[i]
        if (m.type === 'attributes') examiner(m.target)
        else for (var j = 0; j < m.addedNodes.length; j++) examiner(m.addedNodes[j])
      }
    })
    obs.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ['autoplay'] })
    doc.addEventListener('play', function (e) {
      var t = e && e.target
      if (t instanceof HME && t.autoplay) neutraliser(t)
    }, true)
  } catch (e) {}
}`
}
