import { Ligne, Titre } from './controles'
import { useReglages } from './reglages'
import './sections.css'

/** Inerte pour l'instant : sera branchée sur le mécanisme de style et de script personnalisés des règles par site (portée `*`). */
export function Styles() {
  const [s] = useReglages()
  if (!s) return null
  return (
    <>
      <Titre>Pour tous les sites</Titre>
      <div class="card">
        <div class="row wrap">
          <div class="lbl" data-reglage="styles.css" tabIndex={-1}>
            <span>Feuille de style globale</span>
            <span class="hint">Bientôt : appliquée à chaque page que vous ouvrez</span>
          </div>
          <textarea class="zone-code" aria-label="Feuille de style globale" spellcheck={false} disabled value={s.styles.css} />
        </div>
        <Ligne reglage="styles.scripts" titre="Scripts globaux" aide="Bientôt : exécutés dans chaque page que vous ouvrez">
          <button class="btn" type="button" disabled>
            Ajouter un script
          </button>
        </Ligne>
      </div>
    </>
  )
}
