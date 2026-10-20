import { Interrupteur, Ligne, Titre } from './controles'
import { useReglages } from './reglages'
import './sections.css'

/** Gestes de souris et de molette (`Settings.gestes`). Section absente du design : lignes de `controles.tsx`, libellés sobres. */
export function Gestes() {
  const [s, regler] = useReglages()
  if (!s) return null
  const g = s.gestes
  return (
    <>
      <Titre>Navigation</Titre>
      <div class="card">
        <Ligne reglage="gestes.defilementHorizontal" titre="Page précédente ou suivante en défilant horizontalement" aide="Balayage horizontal sur le pavé tactile ou la molette inclinée ; sur macOS, balayage à trois doigts">
          <Interrupteur actif={g.defilementHorizontal} libelle="Défilement horizontal : précédent et suivant" surChange={(defilementHorizontal) => regler({ gestes: { defilementHorizontal } })} />
        </Ligne>
        <Ligne reglage="gestes.clicMolette" titre="Ouvrir un lien dans une nouvelle étoile d'un clic molette" aide="L'étoile s'ouvre en arrière-plan, reliée à la page d'origine">
          <Interrupteur actif={g.clicMolette} libelle="Clic molette sur un lien" surChange={(clicMolette) => regler({ gestes: { clicMolette } })} />
        </Ligne>
      </div>

      <Titre>Zoom</Titre>
      <div class="card">
        <Ligne reglage="gestes.molettePlusCmdZoom" titre="Agrandir ou réduire la page avec ⌘ ou Ctrl + molette" aide="Un palier par cran ; le zoom est mémorisé pour le site">
          <Interrupteur actif={g.molettePlusCmdZoom} libelle="⌘ ou Ctrl + molette : zoom" surChange={(molettePlusCmdZoom) => regler({ gestes: { molettePlusCmdZoom } })} />
        </Ligne>
      </div>
      <p class="note">Ces gestes ne s'appliquent qu'aux pages web, jamais aux pages de Lyra.</p>
    </>
  )
}
