import { useEffect, useState } from 'preact/hooks'
import type { StatsBoucliers } from '../../shared/ipc'
import { Ligne, Segments, Selecteur, Titre } from './controles'
import { useReglages } from './reglages'
import './sections.css'

const NIVEAUX: { id: 'desactives' | 'standard' | 'strict'; libelle: string }[] = [
  { id: 'desactives', libelle: 'Désactivés' },
  { id: 'standard', libelle: 'Standard' },
  { id: 'strict', libelle: 'Strict' }
]
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
        <Ligne reglage="boucliers.niveau" titre="Niveau de protection" aide="Niveau des sites sans règle : bloque les publicités et les traqueurs connus ; Strict bloque aussi les scripts tiers inconnus">
          <Segments valeur={s.boucliers.niveau} options={NIVEAUX} surChange={(niveau) => regler({ boucliers: { niveau } })} />
        </Ligne>
        <Ligne reglage="boucliers.frequence" titre="Mettre à jour les listes toutes les" aide="Les listes de blocage sont relues à cette fréquence">
          <Selecteur
            libelle="Fréquence de mise à jour"
            valeur={String(s.boucliers.majHeures)}
            options={HEURES}
            surChange={(h) => regler({ boucliers: { majHeures: Number(h) } })}
          />
        </Ligne>
        <Ligne reglage="boucliers.sites" titre="Boucliers site par site" aide="Désactivez la protection ou renforcez-la pour un site précis">
          <a class="btn lien" href="#/sites">
            Règles par site
          </a>
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
