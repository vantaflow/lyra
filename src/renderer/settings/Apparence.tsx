import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { LARGEUR_MAX, LARGEUR_MIN } from '../../main/window/layout'
import { PASTILLES_CIEL, PASTILLES_ETOILE, POLICES, TAILLE_MAX, TAILLE_MIN, tailleTexteCss, pastilleActive, type Pastille } from '../../shared/apparence'
import type { CleCouleur, CouleursTheme, NomTheme } from '../../shared/types-reglages'
import { THEMES } from '../../shared/themes'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'
import { couleursAffichees, creerLimiteur, ecraseraPersonnalisation, modifierCouleur, patchTheme, type ModeCouleur } from './couleursModele'
import { useReglages } from './reglages'
import './couleurs.css'

/** Options d'un délai en minutes ; une valeur hors liste (réglage modifié à la main) reste affichée. */
function optionsMinutes(liste: readonly number[], courant: number): { id: string; libelle: string }[] {
  const ids = liste.includes(courant) ? liste : [...liste, courant].sort((a, b) => a - b)
  return ids.map((n) => ({ id: String(n), libelle: libelleMinutes(n) }))
}
export function libelleMinutes(n: number): string {
  if (n % 60 === 0) return n === 60 ? '1 heure' : `${n / 60} heures`
  return `${n} minutes`
}
const TERNIR = [5, 15, 30, 60] as const
const ENDORMIR = [30, 60, 120, 240] as const
const ARCHIVER: { id: string; libelle: string }[] = [
  { id: 'jamais', libelle: 'Jamais' },
  { id: '1', libelle: '1 jour' },
  { id: '7', libelle: '7 jours' },
  { id: '30', libelle: '30 jours' },
  { id: '90', libelle: '90 jours' }
]

/** Mode des couleurs en vigueur (clair ou sombre), suivi sur l'attribut `data-mode` posé par le thème vivant. */
function useModeActif(): ModeCouleur {
  const lire = (): ModeCouleur => (document.documentElement.getAttribute('data-mode') === 'sombre' ? 'sombre' : 'clair')
  const [mode, setMode] = useState<ModeCouleur>(lire)
  useEffect(() => {
    const o = new MutationObserver(() => setMode(lire()))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] })
    setMode(lire())
    return () => o.disconnect()
  }, [])
  return mode
}

type Ecriture = { actif: 'mes-couleurs'; personnalisees: CouleursTheme; depart: NomTheme; reference: CouleursTheme | null }
type Edition = { cle: CleCouleur; hex: string }

/** Pastilles + « Autre… » : raccourci vers une couleur de « Mes couleurs » (mode actif), même modèle que l'écran Couleurs. */
function Pastilles(p: { pastilles: readonly Pastille[]; courante: string; libelle: string; changer: (hex: string) => void }) {
  const autre = useRef<HTMLInputElement>(null)
  const active = pastilleActive(p.pastilles, p.courante)
  return (
    <div class="pastilles">
      {p.pastilles.map((x) => (
        <button
          key={x.hex}
          class="sw"
          type="button"
          aria-pressed={active?.hex === x.hex}
          aria-label={x.libelle}
          title={x.libelle}
          style={{ background: x.hex, ...(x.hex === '#FFFFFF' ? { border: '1px solid #D6D6E2' } : {}) }}
          onClick={() => p.changer(x.hex)}
        ></button>
      ))}
      <button class="btn" type="button" style={{ height: '30px' }} aria-pressed={active === null} onClick={() => autre.current?.click()}>
        Autre…
      </button>
      <input
        ref={autre}
        class="autre-couleur"
        type="color"
        tabIndex={-1}
        aria-label={`${p.libelle} : autre couleur`}
        value={p.courante.toLowerCase()}
        onInput={(e) => p.changer((e.currentTarget as HTMLInputElement).value.toUpperCase())}
      />
    </div>
  )
}

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
  /** Taille du texte en cours de réglage au curseur (même principe que la largeur). */
  const [taille, setTaille] = useState<number | null>(null)
  const derniereTaille = useRef(0)
  const attenteTaille = useRef<number | undefined>(undefined)
  const mode = useModeActif()
  // Raccourcis « Couleur de l'étoile active » / « Couleur du ciel » : valeurs en cours de réglage, écrites toutes les 60 ms.
  const [locales, setLocales] = useState<{ personnalisees: CouleursTheme; depart: NomTheme; reference: CouleursTheme | null } | null>(null)
  const [aConfirmer, setAConfirmer] = useState<Edition | null>(null)
  const limiteur = useMemo(() => creerLimiteur<Ecriture>(60, (c) => void window.lyra.invoke('settings:set', { couleurs: c } as never)), [])
  useEffect(() => () => limiteur.vider(), [limiteur])
  useEffect(() => {
    if (locales && s && JSON.stringify(s.couleurs.personnalisees) === JSON.stringify(locales.personnalisees) && s.couleurs.depart === locales.depart && JSON.stringify(s.couleurs.reference) === JSON.stringify(locales.reference)) setLocales(null)
  }, [s, locales])

  // L'affichage local s'efface quand le réglage enregistré l'a rattrapé.
  useEffect(() => {
    if (largeur !== null && s?.ciel.largeur === largeur) setLargeur(null)
    if (taille !== null && s?.apparence.tailleTexte === taille) setTaille(null)
  }, [s, largeur, taille])
  if (!s) return null
  const c = s.couleurs
  const etat = locales ? { actif: 'mes-couleurs' as const, personnalisees: locales.personnalisees, depart: locales.depart, reference: locales.reference } : { actif: c.actif, personnalisees: c.personnalisees, depart: c.depart, reference: c.reference }
  const affichees = couleursAffichees(etat)
  const poser = (e: Edition, base: typeof etat): void => {
    const patch = modifierCouleur(base, e.cle, mode, e.hex)
    setLocales({ personnalisees: patch.personnalisees, depart: patch.depart, reference: patch.reference })
    limiteur.pousser(patch)
  }
  const changerCouleur = (cle: CleCouleur) => (hex: string): void => {
    if (aConfirmer || ecraseraPersonnalisation(etat)) return setAConfirmer({ cle, hex })
    poser({ cle, hex }, etat)
  }
  const a = s.apparence

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

  const reglerTaille = (v: number, final: boolean): void => {
    setTaille(v)
    window.clearTimeout(attenteTaille.current)
    const ecrire = (): void => {
      derniereTaille.current = Date.now()
      regler({ apparence: { tailleTexte: v } })
    }
    const ecoule = Date.now() - derniereTaille.current
    if (final || ecoule >= 60) ecrire()
    else attenteTaille.current = window.setTimeout(ecrire, 60 - ecoule)
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
        <Ligne reglage="apparence.revelerSurvol" titre="Révéler le ciel masqué au survol du bord" aide="Sinon seulement avec ⌘ \ ou le bouton de la capsule">
          <Interrupteur
            actif={s.ciel.revelerAuSurvol}
            libelle="Révéler au survol"
            surChange={(revelerAuSurvol) => regler({ ciel: { revelerAuSurvol } })}
          />
        </Ligne>
        <Ligne reglage="apparence.largeur" titre="Largeur du ciel" aide={`${largeur ?? s.ciel.largeur} px — se règle aussi en tirant son bord`}>
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
        <Ligne reglage="apparence.glisser" titre="Glisser l'en-tête du ciel vers un bord pour le déplacer">
          <Interrupteur
            actif={s.ciel.deplacerParGlisser}
            libelle="Déplacer par glisser"
            surChange={(deplacerParGlisser) => regler({ ciel: { deplacerParGlisser } })}
          />
        </Ligne>
      </div>

      <Titre>Étoiles et constellations</Titre>
      <div class="card">
        <Ligne reglage="apparence.relier" titre="Relier un onglet à celui qui l'a ouvert" aide="Dessine les lignes de constellation">
          <Interrupteur actif={a.relierEnfants} libelle="Relier les onglets" surChange={(relierEnfants) => regler({ apparence: { relierEnfants } })} />
        </Ligne>
        <Ligne reglage="apparence.icones" titre="Afficher les icônes des sites à la place des points">
          <Interrupteur actif={a.iconesSites} libelle="Icônes des sites" surChange={(iconesSites) => regler({ apparence: { iconesSites } })} />
        </Ligne>
        <Ligne reglage="apparence.ternir" titre="Ternir une étoile inactive après" aide="Elle reste chargée, seulement plus discrète">
          <Selecteur
            libelle="Ternir une étoile inactive après"
            valeur={String(s.ciel.ternirApresMin)}
            options={optionsMinutes(TERNIR, s.ciel.ternirApresMin)}
            surChange={(v) => regler({ ciel: { ternirApresMin: Number(v) } })}
          />
        </Ligne>
        <Ligne reglage="apparence.endormir" titre="Endormir une étoile inactive après" aide="L'onglet est déchargé de la mémoire, rechargé au clic">
          <Selecteur
            libelle="Endormir une étoile inactive après"
            valeur={String(s.ciel.endormirApresMin)}
            options={optionsMinutes(ENDORMIR, s.ciel.endormirApresMin)}
            surChange={(v) => regler({ ciel: { endormirApresMin: Number(v) } })}
          />
        </Ligne>
        <Ligne reglage="apparence.archiver" titre="Archiver les étoiles éteintes depuis" aide="Retirées du ciel, retrouvables dans l'historique">
          <Selecteur
            libelle="Archiver les étoiles éteintes depuis"
            valeur={a.archiverApresJours === null ? 'jamais' : String(a.archiverApresJours)}
            options={a.archiverApresJours !== null && !ARCHIVER.some((o) => o.id === String(a.archiverApresJours)) ? [...ARCHIVER, { id: String(a.archiverApresJours), libelle: `${a.archiverApresJours} jours` }] : ARCHIVER}
            surChange={(v) => regler({ apparence: { archiverApresJours: v === 'jamais' ? null : Number(v) } })}
          />
        </Ligne>
        <Ligne reglage="apparence.nouvelleEtoile" titre="Nouvelle étoile ouverte">
          <Segments
            valeur={a.nouvelleEtoile}
            options={[
              { id: 'sous-active', libelle: "Sous l'étoile active" },
              { id: 'fin-constellation', libelle: 'En fin de constellation' },
              { id: 'hors-constellation', libelle: 'Hors constellation' }
            ]}
            surChange={(nouvelleEtoile) => regler({ apparence: { nouvelleEtoile } })}
          />
        </Ligne>
        <Ligne reglage="apparence.regrouper" titre="Regrouper automatiquement par site" aide="Une constellation par domaine, sauf si vous en nommez une">
          <Interrupteur actif={a.regrouperParSite} libelle="Regrouper par site" surChange={(regrouperParSite) => regler({ apparence: { regrouperParSite } })} />
        </Ligne>
      </div>

      <Titre>Apparence</Titre>
      {aConfirmer && (
        <div class="couleurs-confirmation" role="alertdialog" aria-label="Remplacer Mes couleurs">
          <span>Remplacer Mes couleurs par une copie de {THEMES[c.actif].nom} ?</span>
          <button
            class="btn pri"
            type="button"
            onClick={() => {
              const e = aConfirmer
              setAConfirmer(null)
              poser(e, { ...etat, personnalisees: null })
            }}
          >
            Remplacer
          </button>
          <button class="btn" type="button" onClick={() => setAConfirmer(null)}>
            Annuler
          </button>
        </div>
      )}
      <div class="card">
        <Ligne reglage="apparence.theme" titre="Thème">
          <Segments
            valeur={s.theme}
            options={[
              { id: 'systeme', libelle: 'Système' },
              { id: 'clair', libelle: 'Clair' },
              { id: 'sombre', libelle: 'Sombre' },
              { id: 'programme', libelle: 'Programmé' }
            ]}
            surChange={(theme) => regler(patchTheme(theme, c.passage))}
          />
        </Ligne>
        <Ligne reglage="apparence.couleurEtoile" titre="Couleur de l'étoile active" aide="Or de Véga par défaut ; n'importe quelle couleur avec le sélecteur">
          <Pastilles pastilles={PASTILLES_ETOILE} courante={affichees['etoile-active'][mode]} libelle="Couleur de l'étoile active" changer={changerCouleur('etoile-active')} />
        </Ligne>
        <Ligne reglage="apparence.couleurCiel" titre="Couleur du ciel" aide="Indigo nuit, ou votre couleur">
          <Pastilles pastilles={PASTILLES_CIEL} courante={affichees['ciel-fond'][mode]} libelle="Couleur du ciel" changer={changerCouleur('ciel-fond')} />
        </Ligne>
        <Ligne reglage="apparence.police" titre="Police de l'interface">
          <Selecteur libelle="Police de l'interface" valeur={a.police} options={POLICES.map((p) => ({ id: p.id, libelle: p.libelle }))} surChange={(police) => regler({ apparence: { police } })} />
        </Ligne>
        <Ligne reglage="apparence.tailleTexte" titre="Taille du texte de l'interface" aide={tailleTexteCss(taille ?? a.tailleTexte).replace('px', ' px')}>
          <input
            class="rng"
            type="range"
            min={TAILLE_MIN}
            max={TAILLE_MAX}
            step={1}
            value={taille ?? a.tailleTexte}
            aria-label="Taille du texte"
            onInput={(e) => reglerTaille(Number((e.currentTarget as HTMLInputElement).value), false)}
            onChange={(e) => reglerTaille(Number((e.currentTarget as HTMLInputElement).value), true)}
          />
        </Ligne>
        <Ligne reglage="apparence.densite" titre="Densité">
          <Segments
            valeur={a.densite}
            options={[
              { id: 'confortable', libelle: 'Confortable' },
              { id: 'compacte', libelle: 'Compacte' }
            ]}
            surChange={(densite) => regler({ apparence: { densite } })}
          />
        </Ligne>
        <Ligne reglage="apparence.coins" titre="Coins arrondis de la page">
          <Interrupteur actif={a.coinsArrondis} libelle="Coins arrondis" surChange={(coinsArrondis) => regler({ apparence: { coinsArrondis } })} />
        </Ligne>
        <Ligne reglage="apparence.capsuleAuto" titre="Masquer la capsule quand la souris ne bouge plus" aide="Réapparaît au mouvement ou en approchant du haut">
          <Interrupteur actif={a.capsuleAuto} libelle="Capsule automatique" surChange={(capsuleAuto) => regler({ apparence: { capsuleAuto } })} />
        </Ligne>
      </div>
    </>
  )
}
