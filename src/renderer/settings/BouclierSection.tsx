import { useEffect, useState } from 'preact/hooks'
import type { StatsBoucliers } from '../../shared/ipc'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'
import { useReglages } from './reglages'

const HEURES = [1, 6, 12, 24].map((h) => ({ id: String(h), libelle: h === 1 ? '1 heure' : `${h} heures` }))
function dateDeMaj(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}

export function BouclierSection() {
  const [s, regler] = useReglages()
  const [stats, setStats] = useState<StatsBoucliers | null>(null)
  const [maj, setMaj] = useState(false)
  useEffect(() => {
    void window.lyra.invoke('shields:stats').then(setStats)
  }, [])
  if (!s) return null

  const mettreAJour = async (): Promise<void> => {
    setMaj(true)
    try {
      const r = await window.lyra.invoke('shields:update')
      if (!('ignore' in r)) setStats(r)
    } finally {
      setMaj(false)
    }
  }
  const date = stats ? dateDeMaj(stats.date) : ''

  return (
    <>
      <Titre>Boucliers</Titre>
      <div class="card">
        <Ligne reglage="boucliers.niveau" titre="Niveau de protection" aide="Bloque les publicités et les traqueurs connus">
          <Segments valeur="standard" options={[{ id: 'standard', libelle: 'Standard' }]} />
        </Ligne>
        <Ligne reglage="boucliers.genes" titre="Masquer aussi les gênes" aide="Bientôt : bandeaux de cookies et fenêtres d'invitation">
          <Interrupteur actif={false} libelle="Masquer les gênes" inerte />
        </Ligne>
        <Ligne reglage="boucliers.frequence" titre="Mettre à jour les listes toutes les" aide="Les listes de blocage sont relues à cette fréquence">
          <Selecteur
            libelle="Fréquence de mise à jour"
            valeur={String(s.boucliers.majHeures)}
            options={HEURES}
            surChange={(h) => regler({ boucliers: { majHeures: Number(h) } })}
          />
        </Ligne>
        <Ligne reglage="boucliers.listes" titre="Listes de blocage" aide={date ? `Dernière mise à jour : ${date}` : undefined}>
          <button class="btn" type="button" id="maj-boucliers" disabled={maj} onClick={() => void mettreAJour()}>
            {maj ? 'Mise à jour…' : 'Mettre à jour maintenant'}
          </button>
        </Ligne>
      </div>
    </>
  )
}
