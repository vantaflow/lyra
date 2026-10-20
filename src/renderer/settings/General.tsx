import { Ligne, Selecteur, Titre } from './controles'
import { useReglages } from './reglages'

const LANGUES = [
  { id: 'fr', libelle: 'Français' },
  { id: 'en', libelle: 'English' }
]

export function General() {
  const [s, regler] = useReglages()
  if (!s) return null

  return (
    <>
      <Titre>Langue</Titre>
      <div class="card">
        <Ligne reglage="general.langue" titre="Langue de l'interface">
          <Selecteur libelle="Langue" valeur={s.langue} options={LANGUES} surChange={(langue) => regler({ langue })} />
        </Ligne>
      </div>
    </>
  )
}
