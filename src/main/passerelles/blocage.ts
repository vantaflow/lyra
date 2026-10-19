/** Codes d'erreur Chromium typiques d'un blocage réseau (DNS, reset, refus, délai, politique, injoignable). */
const BLOCAGE = new Set([-105, -101, -102, -118, -7, -22, -109])
/** Échecs imputables à la passerelle (proxy, tunnel, SOCKS) ou au délai. */
const PASSERELLE = new Set([-130, -111, -120, -118, -7])

export const estCodeBlocage = (code: number): boolean => BLOCAGE.has(code)
export const estEchecPasserelle = (code: number): boolean => PASSERELLE.has(code)
