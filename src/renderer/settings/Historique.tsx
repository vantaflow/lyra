import { useEffect, useState } from 'preact/hooks'
import type { HistoryEntry } from '../../shared/types'
import { grouperParJour, heure, lettre } from './jours'

const ouvrir = (url: string): void => void window.lyra.invoke('tabs:open', { url })

export function Historique() {
  const [texte, setTexte] = useState('')
  const [entrees, setEntrees] = useState<HistoryEntry[]>([])

  const charger = (t: string): Promise<void> =>
    window.lyra.invoke('history:search', { texte: t, limite: 500 }).then(setEntrees)

  useEffect(() => {
    void charger(texte)
  }, [texte])

  const supprimer = async (url: string): Promise<void> => {
    await window.lyra.invoke('history:delete', { url })
    await charger(texte)
  }
  const effacer = async (): Promise<void> => {
    await window.lyra.invoke('history:clear')
    await charger(texte)
  }

  const groupes = grouperParJour(entrees)
  return (
    <>
      <div class="barre">
        <input
          id="chercher-historique"
          class="champ"
          type="search"
          placeholder="Rechercher dans l'historique…"
          value={texte}
          onInput={(e) => setTexte((e.currentTarget as HTMLInputElement).value)}
        />
        <button class="btn" type="button" id="effacer-historique" onClick={() => void effacer()} disabled={entrees.length === 0 && !texte}>
          Effacer l'historique
        </button>
      </div>
      {groupes.length === 0 && <p class="vide">{texte ? 'Aucun résultat.' : "Aucune page visitée pour l'instant."}</p>}
      {groupes.map((g) => (
        <section key={g.libelle} class="jour">
          <h2>{g.libelle}</h2>
          <div class="card">
            {g.entrees.map((e) => (
              <div key={e.url} class="row entree">
                <span class="heure">{heure(e.visitedAt ?? 0)}</span>
                <span class="ico" aria-hidden="true">{lettre(e.title, e.url)}</span>
                <a class="texte" href={e.url} onClick={(ev) => (ev.preventDefault(), ouvrir(e.url))}>
                  <span class="titre">{e.title || e.url}</span>
                  <span class="url">{e.url}</span>
                </a>
                <button class="btn suppr" type="button" aria-label={`Supprimer ${e.title || e.url}`} onClick={() => void supprimer(e.url)}>
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
