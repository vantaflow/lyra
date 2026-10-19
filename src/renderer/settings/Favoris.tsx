import { useEffect, useState } from 'preact/hooks'
import type { FavoriIpc } from '../../shared/ipc'
import { lettre } from './jours'

const ouvrir = (url: string): void => void window.lyra.invoke('tabs:open', { url })
const normaliser = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Favoris() {
  const [texte, setTexte] = useState('')
  const [favoris, setFavoris] = useState<FavoriIpc[]>([])

  const charger = (): Promise<void> => window.lyra.invoke('bookmarks:list').then(setFavoris)
  useEffect(() => {
    void charger()
  }, [])

  const mots = normaliser(texte).split(/\s+/).filter(Boolean)
  const visibles = favoris.filter((f) => {
    const cible = normaliser(`${f.title} ${f.url} ${f.dossier ?? ''}`)
    return mots.every((m) => cible.includes(m))
  })

  const retirer = async (url: string): Promise<void> => {
    await window.lyra.invoke('bookmarks:remove', { url })
    await charger()
  }

  return (
    <>
      <div class="barre">
        <input
          id="chercher-favoris"
          class="champ"
          type="search"
          placeholder="Rechercher dans les favoris…"
          value={texte}
          onInput={(e) => setTexte((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      {visibles.length === 0 ? (
        <p class="vide">{texte ? 'Aucun résultat.' : "Aucun favori. Touchez l'étoile de la capsule pour en ajouter."}</p>
      ) : (
        <div class="card">
          {visibles.map((f) => (
            <div key={f.url} class="row entree">
              <span class="ico" aria-hidden="true">{lettre(f.title, f.url)}</span>
              <a class="texte" href={f.url} onClick={(ev) => (ev.preventDefault(), ouvrir(f.url))}>
                <span class="titre">{f.title || f.url}</span>
                <span class="url">{f.url}</span>
              </a>
              {f.dossier && <span class="dossier">{f.dossier}</span>}
              <button class="btn suppr" type="button" aria-label={`Retirer ${f.title || f.url}`} onClick={() => void retirer(f.url)}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
