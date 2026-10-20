import { useState } from 'preact/hooks'
import { Interrupteur, Ligne, Titre } from './controles'
import { MessageErreur, useErreur } from './erreurs'
import { useReglages } from './reglages'
import './sections.css'

type Etat = 'repos' | 'confirmer' | 'en-cours' | 'fait'

export function Confidentialite() {
  const [s, regler] = useReglages()
  const [purge, setPurge] = useState<Etat>('repos')
  const [historiqueEfface, setHistoriqueEfface] = useState(false)
  const [erreur, , setErreur] = useErreur()
  if (!s) return null
  const c = s.confidentialite

  const purger = async (): Promise<void> => {
    setPurge('en-cours')
    setErreur('')
    try {
      await window.lyra.invoke('confidentialite:purger')
      setPurge('fait')
    } catch {
      setPurge('repos')
      setErreur("Les données n'ont pas pu être effacées.")
    }
  }

  return (
    <>
      <Titre>À la fermeture de Lyra</Titre>
      <div class="card">
        <Ligne reglage="confidentialite.effacerHistorique" titre="Effacer l'historique de navigation" aide="Les pages visitées sont supprimées à chaque fermeture">
          <Interrupteur actif={c.effacerHistorique} libelle="Effacer l'historique à la fermeture" surChange={(effacerHistorique) => regler({ confidentialite: { effacerHistorique } })} />
        </Ligne>
        <Ligne reglage="confidentialite.effacerCookies" titre="Effacer les cookies" aide="Vous serez déconnecté des sites à la prochaine ouverture">
          <Interrupteur actif={c.effacerCookies} libelle="Effacer les cookies à la fermeture" surChange={(effacerCookies) => regler({ confidentialite: { effacerCookies } })} />
        </Ligne>
        <Ligne reglage="confidentialite.effacerCache" titre="Vider le cache" aide="Les fichiers gardés pour accélérer l'affichage des pages">
          <Interrupteur actif={c.effacerCache} libelle="Vider le cache à la fermeture" surChange={(effacerCache) => regler({ confidentialite: { effacerCache } })} />
        </Ligne>
      </div>

      <Titre>Effacer maintenant</Titre>
      <div class="card">
        <Ligne reglage="confidentialite.historique" titre="Historique de navigation" aide={historiqueEfface ? 'Historique effacé.' : 'Supprime toutes les pages visitées'}>
          <button
            class="btn"
            type="button"
            onClick={() => {
              setErreur('')
              window.lyra.invoke('history:clear').then(
                () => setHistoriqueEfface(true),
                () => setErreur("L'historique n'a pas pu être effacé.")
              )
            }}
          >
            Effacer l'historique
          </button>
        </Ligne>
        <Ligne
          reglage="confidentialite.purge"
          titre="Historique, cookies et cache"
          aide={purge === 'confirmer' ? 'Cette action est définitive.' : purge === 'fait' ? 'Données effacées.' : "Efface tout de suite les données de navigation"}
        >
          {purge === 'confirmer' ? (
            <div class="actions-ligne">
              <button class="btn" type="button" onClick={() => setPurge('repos')}>
                Annuler
              </button>
              <button class="btn danger" type="button" id="confirmer-purge" onClick={() => void purger()}>
                Tout effacer
              </button>
            </div>
          ) : (
            <button class="btn danger" type="button" id="purger" disabled={purge === 'en-cours'} onClick={() => setPurge('confirmer')}>
              {purge === 'en-cours' ? 'Effacement…' : 'Tout effacer…'}
            </button>
          )}
        </Ligne>
      </div>
      <MessageErreur message={erreur} />
      <p class="note">Aucune donnée ne quitte cet ordinateur.</p>
    </>
  )
}
