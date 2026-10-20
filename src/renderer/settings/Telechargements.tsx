import { useEffect, useState } from 'preact/hooks'
import type { DownloadInfo } from '../../shared/types'
import { Interrupteur, Ligne, Titre } from './controles'
import { useReglages } from './reglages'
import { couleursVignette, extension, fraction, texteEtat } from '../../shared/telechargements'

type Canal = 'downloads:pause' | 'downloads:resume' | 'downloads:cancel' | 'downloads:open' | 'downloads:reveal'

export function Telechargements() {
  const [liste, setListe] = useState<DownloadInfo[]>([])
  const [s, regler] = useReglages()

  useEffect(() => {
    const charger = (): void => void window.lyra.invoke('downloads:list').then(setListe)
    charger()
    return window.lyra.on('downloads:changed', charger)
  }, [])

  const agir = (canal: Canal, id: string): void => void window.lyra.invoke(canal, { id })
  const effacer = async (): Promise<void> => {
    await window.lyra.invoke('downloads:clear')
    setListe(await window.lyra.invoke('downloads:list'))
  }

  const choisirDossier = async (): Promise<void> => {
    const d = await window.lyra.invoke('settings:choisirDossier')
    if (d) regler({ telechargements: { dossier: d } })
  }

  return (
    <>
      {s && (
        <>
          <Titre>Téléchargements</Titre>
          <div class="card">
            <Ligne reglage="telechargements.dossier" titre="Dossier de téléchargement" aide={s.telechargements.dossier}>
              <button class="btn" type="button" onClick={() => void choisirDossier()}>
                Choisir…
              </button>
            </Ligne>
            <Ligne reglage="telechargements.demander" titre="Demander où enregistrer chaque fichier">
              <Interrupteur
                actif={s.telechargements.demander}
                libelle="Demander où enregistrer"
                surChange={(demander) => regler({ telechargements: { demander } })}
              />
            </Ligne>
          </div>
        </>
      )}
      <div class="barre">
        <span class="souple" style={{ flex: 1 }}></span>
        <button class="btn" type="button" id="effacer-telechargements" onClick={() => void effacer()} disabled={liste.length === 0}>
          Effacer la liste
        </button>
      </div>
      {liste.length === 0 ? (
        <p class="vide">Aucun téléchargement pour l'instant.</p>
      ) : (
        <div class="card">
          {liste.map((d) => {
            const ext = extension(d.nom)
            const c = couleursVignette(ext)
            const f = fraction(d)
            return (
              <div key={d.id} class="row entree dl" data-etat={d.etat}>
                <span class="dl-ext" style={{ background: c.fond, color: c.texte }}>
                  {ext}
                </span>
                <div class="dl-corps">
                  <div class="dl-nom">{d.nom}</div>
                  {(d.etat === 'en-cours' || d.etat === 'pause') && (
                    <div class="dl-barre">
                      <div style={{ width: `${Math.round((f ?? 0) * 100)}%` }}></div>
                    </div>
                  )}
                  <div class="dl-etat">{texteEtat(d)}</div>
                  <div class="url">{d.url}</div>
                </div>
                {d.etat === 'en-cours' && (
                  <button class="btn" type="button" onClick={() => agir('downloads:pause', d.id)}>Pause</button>
                )}
                {d.etat === 'pause' && (
                  <button class="btn" type="button" onClick={() => agir('downloads:resume', d.id)}>Reprendre</button>
                )}
                {(d.etat === 'en-cours' || d.etat === 'pause') && (
                  <button class="btn" type="button" onClick={() => agir('downloads:cancel', d.id)}>Annuler</button>
                )}
                {d.etat === 'termine' && (
                  <>
                    <button class="btn" type="button" onClick={() => agir('downloads:open', d.id)}>Ouvrir</button>
                    <button class="btn" type="button" onClick={() => agir('downloads:reveal', d.id)}>Afficher</button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
