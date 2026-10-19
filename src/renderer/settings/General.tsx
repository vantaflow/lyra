import { useEffect, useState } from 'preact/hooks'
import { MOTEURS } from '../../main/palette/engines'
import type { StatsBoucliers } from '../../shared/ipc'
import type { Settings } from '../../shared/types'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'

const HEURES = [1, 6, 12, 24].map((h) => ({ id: String(h), libelle: h === 1 ? '1 heure' : `${h} heures` }))
const LANGUES = [
  { id: 'fr', libelle: 'Français' },
  { id: 'en', libelle: 'English' }
]

function dateDeMaj(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}

export function General() {
  const [s, setS] = useState<Settings | null>(null)
  const [stats, setStats] = useState<StatsBoucliers | null>(null)
  const [maj, setMaj] = useState(false)

  useEffect(() => {
    void window.lyra.invoke('settings:get').then(setS)
    void window.lyra.invoke('shields:stats').then(setStats)
    return window.lyra.on('settings:changed', setS)
  }, [])
  if (!s) return null

  const regler = (patch: Record<string, unknown>): void => void window.lyra.invoke('settings:set', patch as Partial<Settings>)
  const mettreAJour = async (): Promise<void> => {
    setMaj(true)
    try {
      setStats(await window.lyra.invoke('shields:update'))
    } finally {
      setMaj(false)
    }
  }
  const choisirDossier = async (): Promise<void> => {
    const d = await window.lyra.invoke('settings:choisirDossier')
    if (d) regler({ telechargements: { dossier: d } })
  }
  const date = stats ? dateDeMaj(stats.date) : ''

  return (
    <>
      <Titre>Moteur de recherche</Titre>
      <div class="card">
        <Ligne titre="Moteur par défaut" aide="Utilisé par le nouvel onglet et la palette">
          <Selecteur
            libelle="Moteur par défaut"
            valeur={s.moteurParDefaut}
            options={MOTEURS.map((m) => ({ id: m.id, libelle: m.nom }))}
            surChange={(id) => regler({ moteurParDefaut: id, moteurChoisi: true })}
          />
        </Ligne>
      </div>

      <Titre>Apparence</Titre>
      <div class="card">
        <Ligne titre="Thème">
          <Segments
            valeur={s.theme}
            options={[
              { id: 'systeme', libelle: 'Système' },
              { id: 'clair', libelle: 'Clair' },
              { id: 'sombre', libelle: 'Sombre' }
            ]}
            surChange={(theme) => regler({ theme })}
          />
        </Ligne>
      </div>

      <Titre>Boucliers</Titre>
      <div class="card">
        <Ligne titre="Niveau de protection" aide="Bloque les publicités et les traqueurs connus">
          <Segments valeur="standard" options={[{ id: 'standard', libelle: 'Standard' }]} />
        </Ligne>
        <Ligne titre="Masquer aussi les gênes" aide="Bientôt : bandeaux de cookies et fenêtres d'invitation">
          <Interrupteur actif={false} libelle="Masquer les gênes" inerte />
        </Ligne>
        <Ligne titre="Mettre à jour les listes toutes les" aide="Les listes de blocage sont relues à cette fréquence">
          <Selecteur
            libelle="Fréquence de mise à jour"
            valeur={String(s.boucliers.majHeures)}
            options={HEURES}
            surChange={(h) => regler({ boucliers: { majHeures: Number(h) } })}
          />
        </Ligne>
        <Ligne titre="Listes de blocage" aide={date ? `Dernière mise à jour : ${date}` : undefined}>
          <button class="btn" type="button" id="maj-boucliers" disabled={maj} onClick={() => void mettreAJour()}>
            {maj ? 'Mise à jour…' : 'Mettre à jour maintenant'}
          </button>
        </Ligne>
      </div>

      <Titre>Téléchargements</Titre>
      <div class="card">
        <Ligne titre="Dossier de téléchargement" aide={s.telechargements.dossier}>
          <button class="btn" type="button" onClick={() => void choisirDossier()}>
            Choisir…
          </button>
        </Ligne>
        <Ligne titre="Demander où enregistrer chaque fichier">
          <Interrupteur
            actif={s.telechargements.demander}
            libelle="Demander où enregistrer"
            surChange={(demander) => regler({ telechargements: { demander } })}
          />
        </Ligne>
      </div>

      <Titre>Langue</Titre>
      <div class="card">
        <Ligne titre="Langue de l'interface">
          <Selecteur libelle="Langue" valeur={s.langue} options={LANGUES} surChange={(langue) => regler({ langue })} />
        </Ligne>
      </div>

      <Titre>Confidentialité</Titre>
      <div class="card">
        <Ligne titre="Historique de navigation" aide="Supprime toutes les pages visitées">
          <button class="btn" type="button" onClick={() => void window.lyra.invoke('history:clear')}>
            Effacer l'historique
          </button>
        </Ligne>
      </div>
    </>
  )
}
