import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { CLES_COULEURS, THEMES } from '../../shared/themes'
import { NOMS_THEMES, type CleCouleur, type CouleursTheme, type NomTheme } from '../../shared/types-reglages'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'
import {
  apercuTheme, couleursAffichees, creerLimiteur, ecraseraPersonnalisation, estModifie, etiquettesContraste, type EtiquettesContraste, hexValide, modifierCouleur, patchPassage, segmentPassage, SEGMENTS_PASSAGE, type ModeCouleur
} from './couleursModele'
import { PlageSombre } from './PlageSombre'
import { useReglages } from './reglages'
import './couleurs.css'

const AIDES: Partial<Record<CleCouleur, string>> = {
  'etoile-active': 'Et sa lueur',
  accent: 'Boutons, réglages, liens de Lyra',
  'pages-fond': 'Nouvel onglet, réglages, extensions…'
}

/** Une couleur : pastille (sélecteur natif) et valeur hexadécimale éditable au clic. */
function Hex({ valeur, libelle, surChange }: { valeur: string; libelle: string; surChange: (hex: string) => void }) {
  const [edition, setEdition] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  /** Édition close (Entrée, Échap ou perte de focus déjà traitée) : le `blur` que Chromium émet en retirant le champ est ignoré. */
  const terminee = useRef(true)
  useEffect(() => {
    if (edition !== null) champ.current?.select()
  }, [edition === null])
  const commencer = (): void => {
    terminee.current = false
    setEdition(valeur)
  }
  const clore = (appliquer: boolean): void => {
    if (terminee.current) return
    terminee.current = true
    const hex = appliquer && edition !== null ? hexValide(edition) : null
    setEdition(null)
    if (hex && hex !== valeur.toUpperCase()) surChange(hex)
  }
  return (
    <span class="hex">
      <input class="pastille" type="color" value={valeur.toLowerCase()} aria-label={`${libelle} : sélecteur`} onInput={(e) => surChange((e.currentTarget as HTMLInputElement).value.toUpperCase())} />
      {edition === null ? (
        <button class="hex-val" type="button" aria-label={`${libelle} : ${valeur}`} onClick={commencer}>
          {valeur}
        </button>
      ) : (
        <input
          ref={champ}
          class="hex-champ"
          type="text"
          value={edition}
          maxLength={7}
          aria-label={`${libelle} : valeur`}
          aria-invalid={hexValide(edition) === null}
          onInput={(e) => setEdition((e.currentTarget as HTMLInputElement).value)}
          onBlur={() => clore(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') clore(true)
            else if (e.key === 'Escape') clore(false)
          }}
        />
      )}
    </span>
  )
}

/** Ligne du tableau : définie hors de `Couleurs` pour que les champs en cours d'édition survivent aux rendus. */
function LigneCouleur(p: { reglage: string; cle: CleCouleur; couleurs: CouleursTheme; etiquettes: EtiquettesContraste; changer: (cle: CleCouleur, mode: ModeCouleur) => (hex: string) => void }) {
  const def = CLES_COULEURS.find((x) => x.cle === p.cle)!
  const cellule = (mode: ModeCouleur) => (
    <span class="cellule-mode">
      <Hex valeur={p.couleurs[p.cle][mode]} libelle={`${def.libelle}, ${mode}`} surChange={p.changer(p.cle, mode)} />
      {p.etiquettes[p.cle]?.[mode] && (
        <span class="contraste-etiquette" data-mode={mode} title={`Contraste, ${mode}`}>
          {p.etiquettes[p.cle]![mode]}
        </span>
      )}
    </span>
  )
  return (
    <Ligne reglage={p.reglage} titre={def.libelle} aide={AIDES[p.cle]}>
      {cellule('clair')}
      {cellule('sombre')}
    </Ligne>
  )
}

type Ecriture = { actif: 'mes-couleurs'; personnalisees: CouleursTheme; depart: NomTheme; reference: CouleursTheme | null }
type Edition = { cle: CleCouleur; mode: ModeCouleur; hex: string }

export function Couleurs() {
  const [s, regler] = useReglages()
  const [message, setMessage] = useState('')
  // Valeurs en cours de réglage (sélecteur natif) : affichées tout de suite, écrites toutes les 60 ms puis à la fin.
  const [locales, setLocales] = useState<{ personnalisees: CouleursTheme; depart: NomTheme; reference: CouleursTheme | null } | null>(null)
  // Première édition depuis un thème prêt qui remplacerait une personnalisation : en attente de confirmation.
  const [aConfirmer, setAConfirmer] = useState<Edition | null>(null)
  const limiteur = useMemo(
    () =>
      creerLimiteur<Ecriture>(60, (c) => {
        void window.lyra.invoke('settings:set', { couleurs: c } as never)
      }),
    []
  )
  useEffect(() => () => limiteur.vider(), [limiteur])
  // Confirmation : le focus passe à « Remplacer » à l'ouverture, Échap = Annuler.
  const remplacer = useRef<HTMLButtonElement>(null)
  const ouverte = aConfirmer !== null
  useEffect(() => {
    if (!ouverte) return
    remplacer.current?.focus()
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAConfirmer(null)
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [ouverte])
  // L'affichage local s'efface quand le réglage enregistré l'a rattrapé.
  useEffect(() => {
    if (locales && s && JSON.stringify(s.couleurs.personnalisees) === JSON.stringify(locales.personnalisees) && s.couleurs.depart === locales.depart && JSON.stringify(s.couleurs.reference) === JSON.stringify(locales.reference)) setLocales(null)
  }, [s, locales])
  if (!s) return null
  const c = s.couleurs
  const etat = locales ? { actif: 'mes-couleurs' as const, personnalisees: locales.personnalisees, depart: locales.depart, reference: locales.reference } : { actif: c.actif, personnalisees: c.personnalisees, depart: c.depart, reference: c.reference }
  const affichees = couleursAffichees(etat)
  const modifie = estModifie(etat.personnalisees, etat.depart, etat.reference)
  const etiquettes = etiquettesContraste(affichees, c.corrigerContraste)

  const ecrire = (e: Edition): void => {
    const patch = modifierCouleur(etat, e.cle, e.mode, e.hex)
    setLocales({ personnalisees: patch.personnalisees, depart: patch.depart, reference: patch.reference })
    limiteur.pousser(patch)
  }
  const changer = (cle: CleCouleur, mode: ModeCouleur) => (hex: string): void => {
    if (aConfirmer) return setAConfirmer({ cle, mode, hex })
    if (ecraseraPersonnalisation(etat)) return setAConfirmer({ cle, mode, hex })
    ecrire({ cle, mode, hex })
  }
  const choisir = (actif: NomTheme): void => {
    limiteur.vider()
    setLocales(null)
    setAConfirmer(null)
    regler({ couleurs: { actif } })
  }
  const importer = async (): Promise<void> => {
    const r = await window.lyra.invoke('themes:importer')
    if (r) setMessage('erreur' in r ? r.erreur : `Thème « ${r.nom} » importé dans « Mes couleurs ».`)
  }
  const exporter = async (): Promise<void> => {
    limiteur.vider()
    const r = await window.lyra.invoke('themes:exporter')
    if (r === true) setMessage('« Mes couleurs » exporté.')
    else if (r) setMessage(`Export impossible : ${r.erreur}`)
  }

  const segment = segmentPassage(s.theme, c.passage)

  return (
    <>
      <div class="couleurs-entete">
        <div class="bloc-titre">
          <h1 data-reglage="couleurs" tabIndex={-1}>Couleurs et thèmes</h1>
          <p class="sous-titre">Chaque couleur de Lyra se change, en clair comme en sombre. Partez d'un thème ou faites le vôtre.</p>
        </div>
        <button class="btn" type="button" onClick={() => void importer()}>
          Importer un thème
        </button>
        <button class="btn" type="button" onClick={() => void exporter()}>
          Exporter « Mes couleurs »
        </button>
      </div>
      {aConfirmer && (
        <div class="couleurs-confirmation" role="alertdialog" aria-label="Remplacer Mes couleurs">
          <span>Remplacer Mes couleurs par une copie de {THEMES[c.actif].nom} ?</span>
          <button
            ref={remplacer}
            class="btn pri"
            type="button"
            onClick={() => {
              const e = aConfirmer
              setAConfirmer(null)
              // Remplacement confirmé : la copie part du thème affiché, sans la personnalisation précédente.
              const patch = modifierCouleur({ ...etat, personnalisees: null }, e.cle, e.mode, e.hex)
              setLocales({ personnalisees: patch.personnalisees, depart: patch.depart, reference: patch.reference })
              limiteur.pousser(patch)
            }}
          >
            Remplacer
          </button>
          <button class="btn" type="button" onClick={() => setAConfirmer(null)}>
            Annuler
          </button>
        </div>
      )}
      {message && (
        <p class="couleurs-message" role="status">
          {message}
        </p>
      )}

      <Titre>Thèmes</Titre>
      <div class="themes" data-reglage="couleurs.themes" tabIndex={-1}>
        {NOMS_THEMES.map((id) => {
          const ap = apercuTheme(id, id === 'mes-couleurs' ? (etat.personnalisees ?? THEMES['mes-couleurs'].couleurs) : THEMES[id].couleurs)
          return (
            <button key={id} class="th" type="button" aria-pressed={c.actif === id} onClick={() => choisir(id)}>
              <span class="pv" style={{ background: ap.page, color: ap.texte }}>
                <i style={{ background: ap.ciel }}></i>
                <b></b>
              </span>
              <span>
                {THEMES[id].nom}
                {id === 'indigo-nuit' && <span class="hint"> par défaut</span>}
                {id === 'mes-couleurs' && modifie && <span class="hint"> modifié</span>}
              </span>
            </button>
          )
        })}
      </div>

      <Titre>Chaque couleur</Titre>
      <div class="card">
        <div class="row" style={{ padding: '10px 0' }}>
          <div class="lbl">
            <span class="hint">Élément</span>
          </div>
          <span class="hint colonne-mode">Clair</span>
          <span class="hint colonne-mode">Sombre</span>
        </div>
        <LigneCouleur reglage="couleurs.cielFond" cle="ciel-fond" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.cielTexte" cle="ciel-texte" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.etoileActive" cle="etoile-active" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.etoileActiveFond" cle="etoile-active-fond" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.etoiles" cle="etoiles" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.etoilesEndormies" cle="etoiles-endormies" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.lignes" cle="lignes" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.capsuleFond" cle="capsule-fond" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.capsuleTexte" cle="capsule-texte" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.accent" cle="accent" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.boucliers" cle="boucliers" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.pagesFond" cle="pages-fond" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <LigneCouleur reglage="couleurs.nouvelOngletCiel" cle="nouvel-onglet-ciel" couleurs={affichees} etiquettes={etiquettes} changer={changer} />
        <Ligne reglage="couleurs.contraste" titre="Contraste insuffisant ?" aide="Lyra vérifie chaque paire texte/fond (4,5:1) et corrige la couleur du texte">
          <Interrupteur actif={c.corrigerContraste} libelle="Vérifier le contraste" surChange={(corrigerContraste) => regler({ couleurs: { corrigerContraste } })} />
        </Ligne>
      </div>

      <Titre>Comportement</Titre>
      <div class="card">
        <Ligne reglage="couleurs.teinteSite" titre="Le ciel prend la teinte du site actif" aide="Couleur du site (theme-color ou icône), fondue dans la couleur du ciel">
          <Interrupteur actif={c.cielTeinteParSite} libelle="Teinte du site" surChange={(cielTeinteParSite) => regler({ couleurs: { cielTeinteParSite } })} />
        </Ligne>
        <Ligne reglage="couleurs.constellation" titre="Chaque constellation a sa couleur" aide="Étoile active et lignes prennent la couleur du groupe">
          <Interrupteur actif={c.couleurParConstellation} libelle="Couleur par constellation" surChange={(couleurParConstellation) => regler({ couleurs: { couleurParConstellation } })} />
        </Ligne>
        <Ligne reglage="couleurs.passage" titre="Passer en sombre">
          <Segments valeur={(segment ?? '') as never} options={SEGMENTS_PASSAGE} surChange={(id) => regler(patchPassage(id))} />
        </Ligne>
        {segment === 'heure' && <PlageSombre debut={c.heureSombre} fin={c.heureClair} surChange={(p) => regler({ couleurs: p })} />}
        <Ligne reglage="couleurs.privee" titre="Fenêtres privées" aide="Un thème à part, pour les reconnaître d'un coup d'œil">
          <Selecteur
            libelle="Thème des fenêtres privées"
            valeur={c.privee}
            options={NOMS_THEMES.map((id) => ({ id, libelle: THEMES[id].nom }))}
            surChange={(privee) => regler({ couleurs: { privee } })}
          />
        </Ligne>
        <Ligne reglage="couleurs.themeSite" titre="Thème du site dans la page" aide="Demander aux sites leur version sombre quand Lyra est sombre (prefers-color-scheme)">
          <Interrupteur actif={c.prefersColorScheme} libelle="Sombre pour les sites" surChange={(prefersColorScheme) => regler({ couleurs: { prefersColorScheme } })} />
        </Ligne>
      </div>
    </>
  )
}
