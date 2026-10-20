/**
 * Script du monde principal qui aligne `navigator` sur le profil de user-agent d'un site : `userAgent`, `appVersion`, `platform`, `vendor` et `userAgentData`
 * (absent chez Firefox et Safari ; plateforme et `mobile` alignés chez les profils Chromium). Exécuté par le preload des pages avant
 * tout script de la page. Ne couvre ni les workers ni les autres traces d'empreinte (écran, polices…).
 */
import type { ProfilUa } from '../ua'

export function scriptNavigateur(p: ProfilUa): string {
  const dans = JSON.stringify
  return `(function () {
  function def(o, k, v) { try { Object.defineProperty(o, k, { get: function () { return v }, configurable: true }) } catch (e) {} }
  if (typeof Navigator === 'undefined') return
  def(Navigator.prototype, 'userAgent', ${dans(p.ua)})
  def(Navigator.prototype, 'appVersion', ${dans(p.appVersion)})
  def(Navigator.prototype, 'platform', ${dans(p.plateformeNav)})
  def(Navigator.prototype, 'vendor', ${dans(p.vendeur)})
  ${
    p.chromium
      ? `if (typeof NavigatorUAData !== 'undefined') { def(NavigatorUAData.prototype, 'platform', ${dans(p.plateforme)}); def(NavigatorUAData.prototype, 'mobile', ${dans(p.mobile === true)}) }`
      : `def(Navigator.prototype, 'userAgentData', undefined)`
  }
})()`
}
