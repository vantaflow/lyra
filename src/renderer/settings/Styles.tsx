import { useRef } from 'preact/hooks'
import type { ScriptPerso } from '../../shared/types'
import { EditeurCode, EditeurScript } from './EditeurScript'
import { Titre } from './controles'
import { useReglages } from './reglages'
import { nomScriptLibre } from './sitesCellules'
import './sections.css'
import './sites.css'

const MAX_SCRIPTS = 50

/** Styles et scripts de la portée globale : appliqués à chaque page web (`Settings.styles`, lu par le main). */
export function Styles() {
  const [s, regler] = useReglages()
  const liste = useRef<ScriptPerso[]>([])
  if (!s) return null
  const scripts = s.styles.scripts
  liste.current = scripts
  const ecrireScripts = (l: ScriptPerso[]): void => {
    liste.current = l
    regler({ styles: { scripts: l } })
  }
  return (
    <>
      <Titre>Pour tous les sites</Titre>
      <div class="card">
        <div class="row colonne" data-reglage="styles.css" tabIndex={-1}>
          <div class="lbl">
            <span>Feuille de style globale</span>
            <span class="hint">Appliquée à chaque page que vous ouvrez, avant son premier rendu</span>
          </div>
          <EditeurCode id="style-global" libelle="Feuille de style globale" valeur={s.styles.css} sauver={(css) => regler({ styles: { css } })} />
        </div>
        <div class="row colonne" data-reglage="styles.scripts" tabIndex={-1}>
          <div class="lbl">
            <span>Scripts globaux</span>
            <span class="hint">Exécutés dans chaque page que vous ouvrez, dans un monde isolé</span>
          </div>
          {scripts.map((sc, i) => (
            <EditeurScript
              key={i}
              script={sc}
              surChange={(n) => ecrireScripts(liste.current.map((x, j) => (j === i ? n : x)))}
              surSupprimer={() => ecrireScripts(liste.current.filter((_, j) => j !== i))}
            />
          ))}
          <button
            class="btn ajouter-script"
            type="button"
            id="ajouter-script-global"
            disabled={scripts.length >= MAX_SCRIPTS}
            onClick={() => ecrireScripts([...liste.current, { nom: nomScriptLibre(liste.current.map((x) => x.nom)), code: '', actif: true }])}
          >
            Ajouter un script…
          </button>
        </div>
      </div>
    </>
  )
}
