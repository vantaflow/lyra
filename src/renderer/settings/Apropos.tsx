import { useEffect, useState } from 'preact/hooks'
import { Ligne } from './controles'

const URL_RELEASES = 'https://github.com/vantaflow/lyra/releases'

/** « À propos » : version (lue de l'application), licences et lien vers les versions publiées. */
export function Apropos() {
  // La constante de build sert tant que la version de l'application n'est pas arrivée.
  const [version, setVersion] = useState(__LYRA_VERSION__)
  useEffect(() => {
    void window.lyra.invoke('app:version').then((v) => typeof v === 'string' && v !== '' && setVersion(v), () => undefined)
  }, [])
  return (
    <div class="card">
      <div class="row">
        <img src="/favicon.png" alt="" width="40" height="40" style={{ borderRadius: '9px', flex: 'none' }} />
        <div class="lbl">
          <span>Lyra</span>
          <span class="hint">Version {version} · Navigateur sous licence GPL-3.0</span>
        </div>
      </div>
      <Ligne titre="Versions publiées" aide="Notes de version et téléchargements sur GitHub">
        <a class="btn" id="lien-releases" href={URL_RELEASES} target="_blank" rel="noopener noreferrer">
          Voir les versions
        </a>
      </Ligne>
      <Ligne
        titre="Extensions"
        aide="La prise en charge des extensions Chrome et Firefox repose sur electron-chrome-extensions, sous licence GPL-3.0 (comme Lyra)."
      />
      <Ligne titre="Moteur" aide="Electron et Chromium, sous licence MIT et licences libres de Chromium" />
      <Ligne titre="Blocage des publicités" aide="Ghostery adblocker, sous licence MPL-2.0" />
      <Ligne titre="Bibliothèques" aide="Preact, fflate, sql.js et tldts, sous licence MIT" />
      <Ligne titre="Fontes" aide="Manrope et Instrument Serif, sous licence OFL" />
    </div>
  )
}
