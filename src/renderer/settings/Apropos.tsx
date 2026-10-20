import { Ligne } from './controles'

/** « À propos » : version et licences. */
export function Apropos() {
  return (
    <div class="card">
      <div class="row">
        <img src="/favicon.png" alt="" width="40" height="40" style={{ borderRadius: '9px', flex: 'none' }} />
        <div class="lbl">
          <span>Lyra</span>
          <span class="hint">Version {__LYRA_VERSION__} · Navigateur sous licence GPL-3.0</span>
        </div>
      </div>
      <Ligne
        titre="Extensions"
        aide="La prise en charge des extensions Chrome et Firefox repose sur electron-chrome-extensions, sous licence GPL-3.0 (comme Lyra)."
      />
      <Ligne titre="Fontes" aide="Manrope et Instrument Serif, sous licence OFL" />
      <Ligne
        titre="Listes de filtrage"
        aide="Boucliers et gênes : filtres uBlock Origin (GPL-3.0, Raymond Hill et contributeurs) ; EasyList et EasyPrivacy (GPL-3.0 ou CC BY-SA 3.0, The EasyList authors) ; Easylist Cookie List (CC BY 3.0, Fanboy) ; liste de Peter Lowe. Moteur @ghostery/adblocker (MPL-2.0)."
      />
    </div>
  )
}
