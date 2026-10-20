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
    </div>
  )
}
