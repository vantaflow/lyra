import { moteursDisponibles } from '../../main/palette/engines'
import { Interrupteur, Ligne, Selecteur, Titre } from './controles'
import { useReglages } from './reglages'

export function PaletteSection() {
  const [s, regler] = useReglages()
  if (!s) return null
  return (
    <>
      <Titre>Moteur de recherche</Titre>
      <div class="card">
        <Ligne reglage="palette.moteur" titre="Moteur par défaut" aide="Utilisé par le nouvel onglet et la palette">
          <Selecteur
            libelle="Moteur par défaut"
            valeur={s.moteurParDefaut}
            options={moteursDisponibles(s).map((m) => ({ id: m.id, libelle: m.nom }))}
            surChange={(id) => regler({ moteurParDefaut: id, moteurChoisi: true })}
          />
        </Ligne>
      </div>

      <Titre>Fenêtres privées</Titre>
      <div class="card">
        <Ligne reglage="palette.suggestionsEnPrivee" titre="Suggestions en fenêtre privée" aide="Proposer l'historique et les favoris dans la palette d'une fenêtre privée">
          <Interrupteur
            actif={s.palette.suggestionsEnPrivee}
            libelle="Suggestions en fenêtre privée"
            surChange={(suggestionsEnPrivee) => regler({ palette: { suggestionsEnPrivee } })}
          />
        </Ligne>
      </div>
    </>
  )
}
