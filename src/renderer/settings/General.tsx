import { useEffect, useRef, useState } from 'preact/hooks'
import { MOTEURS } from '../../main/palette/engines'
import type { StatsBoucliers } from '../../shared/ipc'
import type { Settings } from '../../shared/types'
import { LARGEUR_MAX, LARGEUR_MIN } from '../../main/window/layout'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'

const POSITIONS: Array<{ id: 'gauche' | 'droite' | 'haut' | 'bas' | 'masque'; libelle: string; style: Record<string, string> }> = [
  { id: 'gauche', libelle: 'Gauche', style: { left: '0', top: '0', bottom: '0', width: '22px' } },
  { id: 'droite', libelle: 'Droite', style: { right: '0', top: '0', bottom: '0', width: '22px' } },
  { id: 'haut', libelle: 'Haut', style: { left: '0', right: '0', top: '0', height: '14px' } },
  { id: 'bas', libelle: 'Bas', style: { left: '0', right: '0', bottom: '0', height: '14px' } },
  { id: 'masque', libelle: 'Masqué', style: { left: '0', top: '18px', bottom: '18px', width: '4px', borderRadius: '2px', background: '#F4C56A' } }
]
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
  /** Largeur en cours de réglage au curseur : affichée tout de suite, écrite au plus toutes les 60 ms puis au relâchement. */
  const [largeur, setLargeur] = useState<number | null>(null)
  const derniereEcriture = useRef(0)
  const attente = useRef<number | undefined>(undefined)

  useEffect(() => {
    void window.lyra.invoke('settings:get').then(setS)
    void window.lyra.invoke('shields:stats').then(setStats)
    return window.lyra.on('settings:changed', setS)
  }, [])
  // L'affichage local s'efface quand le réglage enregistré l'a rattrapé.
  useEffect(() => {
    if (largeur !== null && s?.ciel.largeur === largeur) setLargeur(null)
  }, [s, largeur])
  if (!s) return null

  const regler = (patch: Record<string, unknown>): void => void window.lyra.invoke('settings:set', patch as Partial<Settings>)
  const reglerLargeur = (v: number, final: boolean): void => {
    setLargeur(v)
    window.clearTimeout(attente.current)
    const ecrire = (): void => {
      derniereEcriture.current = Date.now()
      regler({ ciel: { largeur: v } })
    }
    const ecoule = Date.now() - derniereEcriture.current
    if (final || ecoule >= 60) ecrire()
    else attente.current = window.setTimeout(ecrire, 60 - ecoule)
  }
  const mettreAJour = async (): Promise<void> => {
    setMaj(true)
    try {
      const r = await window.lyra.invoke('shields:update')
      if (!('ignore' in r)) setStats(r)
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
      <Titre>Position du ciel</Titre>
      <div class="card">
        <div class="row" style={{ flexWrap: 'wrap' }}>
          <div class="positions">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                class="pos"
                type="button"
                aria-pressed={p.id === 'masque' ? s.ciel.masque : !s.ciel.masque && s.ciel.position === p.id}
                onClick={() => regler(p.id === 'masque' ? { ciel: { masque: true } } : { ciel: { position: p.id, masque: false } })}
              >
                <span class="w">
                  <i style={p.style}></i>
                </span>
                {p.libelle}
              </button>
            ))}
          </div>
        </div>
        <Ligne titre="Révéler le ciel masqué au survol du bord" aide="Sinon seulement avec ⌘ \ ou le bouton de la capsule">
          <Interrupteur
            actif={s.ciel.revelerAuSurvol}
            libelle="Révéler au survol"
            surChange={(revelerAuSurvol) => regler({ ciel: { revelerAuSurvol } })}
          />
        </Ligne>
        <Ligne titre="Largeur du ciel" aide={`${largeur ?? s.ciel.largeur} px — se règle aussi en tirant son bord`}>
          <input
            class="rng"
            type="range"
            min={LARGEUR_MIN}
            max={LARGEUR_MAX}
            value={largeur ?? s.ciel.largeur}
            aria-label="Largeur du ciel"
            onInput={(e) => reglerLargeur(Number((e.currentTarget as HTMLInputElement).value), false)}
            onChange={(e) => reglerLargeur(Number((e.currentTarget as HTMLInputElement).value), true)}
          />
        </Ligne>
        <Ligne titre="Glisser l'en-tête du ciel vers un bord pour le déplacer">
          <Interrupteur
            actif={s.ciel.deplacerParGlisser}
            libelle="Déplacer par glisser"
            surChange={(deplacerParGlisser) => regler({ ciel: { deplacerParGlisser } })}
          />
        </Ligne>
      </div>

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
