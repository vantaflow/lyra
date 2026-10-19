import type { Candidat } from './liste'

const MAX_CHAINE = 3
/** Repli sans DIRECT quand aucune passerelle n'est prête : port local fermé, la connexion échoue au lieu de fuiter en direct. */
const BLOQUE = 'PROXY 127.0.0.1:9'

export const regleProxy = (c: Candidat): string => `${c.type === 'socks5' ? 'SOCKS5' : 'PROXY'} ${c.hote}:${c.port}`

/** Règle du proxy système pour les sites non contournés : une pour tous, ou par schéma (https/wss, http/ws). */
export type RepliPac = string | { https: string; http: string }

/** Règle PAC sûre (lettres, chiffres, espace, « .:;_-[] »), 500 caractères au plus ; DIRECT sinon. */
const regleSure = (r: unknown): string =>
  typeof r === 'string' && r.trim() !== '' && r.length <= 500 && /^[A-Za-z0-9 .:;_\-[\]]+$/.test(r) ? r.trim() : 'DIRECT'

/**
 * Script PAC autonome (n'utilise aucune fonction PAC de Chromium). Un hôte de `sites` (ou sous-domaine)
 * reçoit la chaîne de passerelles (3 au plus, jamais DIRECT) en https/wss (http/ws seulement si
 * `autoriserHttp`, passerelle personnelle). Schémas non web, localhost et adresses privées : DIRECT.
 * Le reste suit `repli` (proxy système approximé, DIRECT par défaut).
 */
export function genererPac(sites: readonly string[], chaine: readonly Candidat[], autoriserHttp = false, repli: RepliPac = 'DIRECT'): string {
  const donnees = sites.map((s) => s.toLowerCase().replace(/\.+$/, '')).filter((s) => s !== '')
  const regle = chaine.slice(0, MAX_CHAINE).map(regleProxy).join('; ') || BLOQUE
  const repliHttps = regleSure(typeof repli === 'string' ? repli : repli.https)
  const repliHttp = regleSure(typeof repli === 'string' ? repli : repli.http)
  return `function FindProxyForURL(url, host) {
  var SITES = ${JSON.stringify(donnees)};
  var CHAINE = ${JSON.stringify(regle)};
  var REPLI_HTTPS = ${JSON.stringify(repliHttps)};
  var REPLI_HTTP = ${JSON.stringify(repliHttp)};
  var HTTP = ${autoriserHttp ? 'true' : 'false'};
  var i = url.indexOf(':');
  if (i < 1) return 'DIRECT';
  var s = url.substring(0, i).toLowerCase();
  var chiffre = s === 'https' || s === 'wss';
  if (!chiffre && s !== 'http' && s !== 'ws') return 'DIRECT';
  var h = String(host).toLowerCase();
  if (h.charAt(0) === '[') h = h.substring(1, h.length - 1);
  h = h.replace(/\\.+$/, '');
  if (h === '' || h === 'localhost' || /\\.localhost$/.test(h)) return 'DIRECT';
  if (h.indexOf(':') >= 0) {
    if (h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^::ffff:/.test(h)) return 'DIRECT';
  }
  var m = /^(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(h);
  if (m) {
    var a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return 'DIRECT';
    if (a === 100 && b >= 64 && b <= 127) return 'DIRECT';
    if (a === 169 && b === 254) return 'DIRECT';
    if (a === 172 && b >= 16 && b <= 31) return 'DIRECT';
    if (a === 192 && b === 168) return 'DIRECT';
  }
  if (chiffre || HTTP) {
    for (var k = 0; k < SITES.length; k++) {
      var d = SITES[k];
      if (h === d || (h.length > d.length && h.substring(h.length - d.length - 1) === '.' + d)) return CHAINE;
    }
  }
  return chiffre ? REPLI_HTTPS : REPLI_HTTP;
}
`
}

export const pacDataUrl = (pac: string): string => `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac, 'utf8').toString('base64')}`
