/**
 * Neutralisation des cookies JavaScript d'une fenêtre `w` : `document.cookie` (lecture '', écriture ignorée) et `cookieStore` (absent).
 * Appliquée par le preload avant tout script de la page, dans chaque frame concernée (iframes tierces sous « 1re partie », toutes les frames
 * sous « Bloqués », frames héritées about:blank / srcdoc / blob: comprises). Ne couvre ni les workers ni `window.open('about:blank')`.
 */
export const FONCTION_COOKIES_NEUTRALISES = `function (w) {
  try { Object.defineProperty(w.Document.prototype, 'cookie', { get: function () { return '' }, set: function () {}, configurable: true, enumerable: true }) } catch (e) {}
  try { delete w.cookieStore } catch (e) {}
  if ('cookieStore' in w) { try { Object.defineProperty(w, 'cookieStore', { get: function () { return undefined }, configurable: true, enumerable: false }) } catch (e) {} }
}`

/** La même fonction, exécutée seule sur la fenêtre courante. */
export const SCRIPT_COOKIES_NEUTRALISES = `(${FONCTION_COOKIES_NEUTRALISES})(window)`
