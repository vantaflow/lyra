import { Ligne } from './controles'

/** « À propos » : version et licences. */
export function Apropos() {
  return (
    <div class="card">
      <Ligne titre="Lyra" aide="Navigateur sous licence GPL-3.0" />
      <Ligne
        titre="Extensions"
        aide="La prise en charge des extensions Chrome et Firefox repose sur electron-chrome-extensions, sous licence GPL-3.0 (comme Lyra), et electron-chrome-web-store."
      />
      <Ligne titre="Fontes" aide="Manrope et Instrument Serif, sous licence OFL" />
    </div>
  )
}
