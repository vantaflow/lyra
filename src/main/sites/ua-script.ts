/**
 * Script du monde principal qui aligne `navigator` sur le profil de user-agent d'un site : `userAgent`, `appVersion`, `platform`, `vendor` et `userAgentData`
 * (absent chez Firefox et Safari ; plateforme et `mobile` alignés chez les profils Chromium). Exécuté par le preload des pages avant
 * tout script de la page. Ne couvre ni les workers ni les autres traces d'empreinte (écran, polices…).
 */
import type { ProfilUa } from '../ua'

/**
 * Source d'une fonction `function (w) {…}` qui aligne le `navigator` de la fenêtre `w` : elle sert à la frame elle-même (`w = window`)
 * et à ses iframes about:blank créées par le DOM, où le preload ne s'exécute pas (le preload des pages les atteint par `HTMLIFrameElement`).
 */
export function fonctionNavigateur(p: ProfilUa): string {
  const dans = JSON.stringify
  return `function (w) {
  function def(o, k, v) { try { Object.defineProperty(o, k, { get: function () { return v }, configurable: true }) } catch (e) {} }
  var N = w.Navigator, U = w.NavigatorUAData
  if (!N) return
  def(N.prototype, 'userAgent', ${dans(p.ua)})
  def(N.prototype, 'appVersion', ${dans(p.appVersion)})
  def(N.prototype, 'platform', ${dans(p.plateformeNav)})
  def(N.prototype, 'vendor', ${dans(p.vendeur)})
  ${
    p.chromium
      ? `if (U) {
    def(U.prototype, 'platform', ${dans(p.plateforme)}); def(U.prototype, 'mobile', ${dans(p.mobile === true)})
    // getHighEntropyValues : même plate-forme que les en-têtes ; les valeurs de la vraie machine (version, architecture…) sont vidées, comme les Sec-CH-UA-* retirés.
    try {
      var orig = U.prototype.getHighEntropyValues
      if (typeof orig === 'function') {
        Object.defineProperty(U.prototype, 'getHighEntropyValues', { configurable: true, writable: true, value: function (h) {
          return orig.call(this, h).then(function (r) {
            var o = {}
            for (var k in r) o[k] = r[k]
            o.platform = ${dans(p.plateforme)}; o.mobile = ${dans(p.mobile === true)}
            if ('platformVersion' in o) o.platformVersion = ''
            if ('architecture' in o) o.architecture = ''
            if ('bitness' in o) o.bitness = ''
            if ('model' in o) o.model = ''
            if ('wow64' in o) o.wow64 = false
            return o
          })
        } })
      }
    } catch (e) {}
  }`
      : `def(N.prototype, 'userAgentData', undefined)`
  }
}`
}

/** La même fonction, exécutée seule sur la fenêtre courante. */
export const scriptNavigateur = (p: ProfilUa): string => `(${fonctionNavigateur(p)})(window)`
