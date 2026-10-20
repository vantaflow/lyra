import { useEffect, useRef, useState } from 'preact/hooks'
import { LARGEUR_MAX, LARGEUR_MIN } from '../../main/window/layout'
import { Interrupteur, Ligne, Segments, Titre } from './controles'
import { useReglages } from './reglages'

const POSITIONS: Array<{ id: 'gauche' | 'droite' | 'haut' | 'bas' | 'masque'; libelle: string; style: Record<string, string> }> = [
  { id: 'gauche', libelle: 'Gauche', style: { left: '0', top: '0', bottom: '0', width: '22px' } },
  { id: 'droite', libelle: 'Droite', style: { right: '0', top: '0', bottom: '0', width: '22px' } },
  { id: 'haut', libelle: 'Haut', style: { left: '0', right: '0', top: '0', height: '14px' } },
  { id: 'bas', libelle: 'Bas', style: { left: '0', right: '0', bottom: '0', height: '14px' } },
  { id: 'masque', libelle: 'Masqué', style: { left: '0', top: '18px', bottom: '18px', width: '4px', borderRadius: '2px', background: '#F4C56A' } }
]

export function Apparence() {
  const [s, regler] = useReglages()
  /** Largeur en cours de réglage au curseur : affichée tout de suite, écrite au plus toutes les 60 ms puis au relâchement. */
  const [largeur, setLargeur] = useState<number | null>(null)
  const derniereEcriture = useRef(0)
  const attente = useRef<number | undefined>(undefined)

  // L'affichage local s'efface quand le réglage enregistré l'a rattrapé.
  useEffect(() => {
    if (largeur !== null && s?.ciel.largeur === largeur) setLargeur(null)
  }, [s, largeur])
  if (!s) return null

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
    </>
  )
}
