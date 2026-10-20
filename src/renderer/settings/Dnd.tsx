import { useEffect, useState } from 'preact/hooks'
import type { DureeDnd } from '../../shared/ipc'
import type { RegleSite } from '../../shared/types'
import { Ligne, Segments, Titre } from './controles'
import { exceptionsDnd } from './exceptionsDnd'
import { MessageErreur, useErreur } from './erreurs'
import { useReglages } from './reglages'
import './sections.css'

const DUREES: { id: string; libelle: string }[] = [
  { id: '30', libelle: '30 min' },
  { id: '60', libelle: '1 h' },
  { id: 'arret', libelle: "Jusqu'à l'arrêt" }
]
const enDuree = (id: string): DureeDnd => (id === 'arret' ? 'arret' : id === '30' ? 30 : 60)

export function Dnd() {
  const [s, regler] = useReglages()
  const [sites, setSites] = useState<Record<string, RegleSite>>({})
  const [erreur, rattraper] = useErreur()
  useEffect(() => {
    window.lyra.invoke('sites:lister').then(setSites, () => undefined)
    return window.lyra.on('sites:changed', setSites)
  }, [])
  if (!s) return null
  const exceptions = exceptionsDnd(sites)
  // Retirer une exception écrit la règle du site (`exceptionDnd` retiré) : la liste n'a pas de stockage propre.
  const retirer = (cle: string): void => void rattraper(window.lyra.invoke('sites:ecrire', { cle, regle: { exceptionDnd: null } }), "L'exception n'a pas pu être retirée.")

  return (
    <>
      <Titre>Durée</Titre>
      <div class="card">
        <Ligne reglage="nepasderanger.duree" titre="Durée par défaut" aide="Utilisée par le raccourci et le bouton du ciel">
          <Segments valeur={String(s.dnd.duree)} options={DUREES} surChange={(id) => regler({ dnd: { duree: enDuree(id) } })} />
        </Ligne>
      </div>

      <Titre>Sites en exception</Titre>
      <div class="card">
        <Ligne reglage="nepasderanger.exceptions" titre="Sites qui peuvent vous déranger" aide="Leurs notifications et leurs fenêtres surgissantes passent, même en mode Ne pas déranger">
          <a class="btn lien" href="#/sites">
            Règles par site
          </a>
        </Ligne>
        {exceptions.length === 0 ? (
          <div class="row">
            <p class="vide" id="aucune-exception">
              Aucun site en exception.
            </p>
          </div>
        ) : (
          exceptions.map((cle) => (
            <div key={cle} class="row entree-site" data-exception={cle}>
              <span class="site-cle">{cle}</span>
              <button class="btn" type="button" aria-label={`Retirer l'exception de ${cle}`} onClick={() => retirer(cle)}>
                Retirer
              </button>
            </div>
          ))
        )}
      </div>
      <MessageErreur message={erreur} />
    </>
  )
}
