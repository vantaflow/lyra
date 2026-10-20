import { useState } from 'preact/hooks'
import { moteursDisponibles, type Moteur } from '../../main/palette/engines'
import { creerMoteurPerso, type SaisieMoteur } from '../../shared/moteursPerso'
import { Interrupteur, Ligne, Selecteur, Titre } from './controles'
import { useReglages } from './reglages'
import './palette.css'
import './reseau.css'

/** Nombre maximal de moteurs personnalisés (celui que le processus principal accepte). */
const MAX_PERSO = 100
const DEFAUT = 'duckduckgo'

const hoteDe = (url: string): string => {
  try {
    return new URL(url.replace('%s', 'x')).hostname
  } catch {
    return url
  }
}

const VIDE: SaisieMoteur = { nom: '', motCle: '', url: '' }

/** Moteurs de recherche, mots-clés de la palette, suggestions de la palette et fenêtres privées. */
export function PaletteSection() {
  const [s, regler] = useReglages()
  const [saisie, setSaisie] = useState<SaisieMoteur>(VIDE)
  const [refus, setRefus] = useState<{ champ: keyof SaisieMoteur; message: string } | null>(null)
  if (!s) return null

  const moteurs: Moteur[] = moteursDisponibles(s)
  const estPerso = (id: string): boolean => s.moteursPerso.some((m) => m.id === id)

  const ajouter = (ev: Event): void => {
    ev.preventDefault()
    if (s.moteursPerso.length >= MAX_PERSO) {
      setRefus({ champ: 'nom', message: `Vous avez atteint la limite de ${MAX_PERSO} moteurs personnalisés.` })
      return
    }
    const r = creerMoteurPerso(saisie, moteurs)
    if (!r.ok) {
      setRefus({ champ: r.champ, message: r.message })
      return
    }
    setRefus(null)
    setSaisie(VIDE)
    regler({ moteursPerso: [...s.moteursPerso, r.moteur] })
  }
  const retirer = (id: string): void => {
    // Un moteur retiré ne peut plus être le moteur par défaut : retour à DuckDuckGo.
    regler({ moteursPerso: s.moteursPerso.filter((m) => m.id !== id), ...(s.moteurParDefaut === id ? { moteurParDefaut: DEFAUT } : {}) })
  }
  const champ = (cle: keyof SaisieMoteur) => ({
    value: saisie[cle],
    'aria-invalid': refus?.champ === cle ? true : undefined,
    'aria-describedby': refus ? 'ajout-moteur-refus' : undefined,
    onInput: (e: Event) => {
      setSaisie({ ...saisie, [cle]: (e.currentTarget as HTMLInputElement).value })
      setRefus(null)
    }
  })

  return (
    <>
      <Titre>Moteur de recherche</Titre>
      <div class="card">
        <Ligne reglage="palette.moteur" titre="Moteur par défaut" aide="Utilisé par le nouvel onglet et la palette">
          <Selecteur
            libelle="Moteur par défaut"
            valeur={s.moteurParDefaut}
            options={moteurs.map((m) => ({ id: m.id, libelle: m.nom }))}
            surChange={(id) => regler({ moteurParDefaut: id, moteurChoisi: true })}
          />
        </Ligne>
      </div>

      <Titre>{`Moteurs et mots-clés — ${moteurs.length}`}</Titre>
      <div class="card" id="moteurs">
        <Ligne reglage="palette.moteurs" titre="Mots-clés de la palette" aide="Tapez le mot-clé puis votre recherche (ex. « w véga ») pour chercher avec ce moteur" />
        {moteurs.map((m) => (
          <div class="row moteur" key={m.id} data-moteur={m.id}>
            <span class="pastille-moteur" style={{ background: m.couleur }} aria-hidden="true">
              {m.lettre}
            </span>
            <div class="lbl">
              <strong>{m.nom}</strong>
              <span class="hint">{hoteDe(m.url)}</span>
            </div>
            <span class="tag mot-cle" aria-label={`Mot-clé ${m.motCle}`}>
              {m.motCle}
            </span>
            {estPerso(m.id) ? (
              <button class="btn" type="button" aria-label={`Retirer ${m.nom}`} onClick={() => retirer(m.id)}>
                Retirer
              </button>
            ) : (
              <span class="tag">Intégré</span>
            )}
          </div>
        ))}
        <form class="row ajout-moteur" data-reglage="palette.ajouterMoteur" tabIndex={-1} onSubmit={ajouter}>
          <label for="moteur-nom" class="sr">
            Nom du moteur
          </label>
          <input id="moteur-nom" class="inp nom" type="text" placeholder="Nom (ex. Mon wiki)" maxLength={100} {...champ('nom')} />
          <label for="moteur-mot-cle" class="sr">
            Mot-clé
          </label>
          <input id="moteur-mot-cle" class="inp cle" type="text" placeholder="Mot-clé" maxLength={24} autocapitalize="off" {...champ('motCle')} />
          <label for="moteur-url" class="sr">
            Adresse de recherche
          </label>
          <input id="moteur-url" class="inp adresse" type="text" inputMode="url" placeholder="https://exemple.fr/?q=%s" {...champ('url')} />
          <button class="btn pri" type="submit">
            Ajouter
          </button>
        </form>
        {refus && (
          <p class="refus" id="ajout-moteur-refus" role="alert">
            {refus.message}
          </p>
        )}
      </div>

      <Titre>Suggestions de la palette</Titre>
      <div class="card">
        <Ligne reglage="palette.suggestionsHistorique" titre="Proposer l'historique" aide="Les pages visitées qui correspondent à ce que vous tapez">
          <Interrupteur
            actif={s.palette.suggestionsHistorique}
            libelle="Suggestions de l'historique"
            surChange={(suggestionsHistorique) => regler({ palette: { suggestionsHistorique } })}
          />
        </Ligne>
        <Ligne reglage="palette.suggestionsFavoris" titre="Proposer les favoris" aide="Les favoris qui correspondent à ce que vous tapez">
          <Interrupteur
            actif={s.palette.suggestionsFavoris}
            libelle="Suggestions des favoris"
            surChange={(suggestionsFavoris) => regler({ palette: { suggestionsFavoris } })}
          />
        </Ligne>
      </div>

      <Titre>Fenêtres privées</Titre>
      <div class="card">
        <Ligne reglage="palette.suggestionsEnPrivee" titre="Suggestions en fenêtre privée" aide="Proposer l'historique et les favoris dans la palette d'une fenêtre privée">
          <Interrupteur
            actif={s.palette.suggestionsEnPrivee}
            libelle="Suggestions en fenêtre privée"
            surChange={(suggestionsEnPrivee) => regler({ palette: { suggestionsEnPrivee } })}
          />
        </Ligne>
      </div>
    </>
  )
}
