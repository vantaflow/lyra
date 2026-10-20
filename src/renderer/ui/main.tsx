import { render } from 'preact'
import { useEffect } from 'preact/hooks'
import './theme.css'
import { Capsule } from './Capsule'
import { Bande } from './Bande'
import { Sky } from './Sky'
import { CielRevele, Rail } from './Rail'
import { cielAppui, cielCible, cielMasque, cielPosition, cielRevele, cielTeinteParSite, dnd, etats, initialiserEtat, sky } from './state'
import { RappelDnd } from './Rappel'
import { Overlay } from './Overlay'
import { FindBar } from './FindBar'
import { signal } from '@preact/signals'
import { demarrerTheme, variablesAppliquees, versionTheme } from './themeVivant'
import { creerLisseur, teinteDuCiel } from './teinteCiel'

/** Teinte affichée, lissée : une page qui change vite de `theme-color` ne fait pas clignoter le ciel. */
const teinteAffichee = signal<string | undefined>(undefined)
const viserTeinte = creerLisseur<string | undefined>((v) => {
  teinteAffichee.value = v
})

function App() {
  const winStyle = window.lyra.plateforme === 'win32' ? ' win' : window.lyra.plateforme === 'darwin' ? ' mac' : ''
  const masque = cielMasque.value
  const revele = masque && cielRevele.value
  const position = cielPosition.value
  const mac = window.lyra.plateforme === 'darwin'
  // Les pastilles macOS sont dans le ciel (colonne à gauche, bande en haut) ; sinon la capsule leur laisse la place.
  const pastillesCapsule = mac && (masque || (position !== 'gauche' && position !== 'haut'))
  const cible = cielCible.value
  // « Le ciel prend la teinte du site actif » : 18 % (ou moins, tant que les textes du ciel restent lisibles) de la couleur de la page ;
  // jamais en fenêtre privée. Les variables viennent de `themeVivant` (aucune lecture du style calculé) ; un changement par seconde au plus.
  versionTheme.value
  const privee = document.documentElement.classList.contains('privee')
  const cibleTeinte = teinteDuCiel(variablesAppliquees(), etats.value[sky.value.activeId ?? ''], { actif: cielTeinteParSite.value, privee })
  useEffect(() => viserTeinte(cibleTeinte), [cibleTeinte])
  const teinte = teinteAffichee.value
  // Révélé, la vue chrome ne couvre plus que le ciel : fond transparent autour pour laisser voir la page.
  useEffect(() => {
    document.documentElement.classList.toggle('revele', revele)
  }, [revele])
  return (
    <div style={teinte ? { '--ciel': teinte } : undefined} class={`fenetre${winStyle} pos-${position}${masque ? ' masque' : ''}${revele ? ' revele' : ''}${cible ? ' glisse' : ''}${cible || cielAppui.value ? ' appui' : ''}${pastillesCapsule ? ' capsule-pastilles' : ''}`}>
      {masque ? <Rail /> : position === 'haut' || position === 'bas' ? <Bande position={position} /> : <Sky />}
      <section class="page-zone" aria-label="Page active">
        <div class="carte">
          <Capsule />
          <FindBar />
          {/* La vraie page est une WebContentsView posée au-dessus de cette zone. */}
          <main class="page-vide"></main>
        </div>
      </section>
      {revele && <CielRevele />}
      {cible && <div class={`cible-ciel cible-${cible}`} aria-hidden="true"></div>}
    </div>
  )
}

/** Ne pas déranger : plus de ciel ni de capsule, la vue chrome se réduit au rappel (ou au croissant). */
function Racine() {
  const enDnd = dnd.value.actif
  useEffect(() => {
    document.documentElement.classList.toggle('dnd', enDnd)
  }, [enDnd])
  return enDnd ? <RappelDnd /> : <App />
}

// La vue overlay (#overlay) dessine la palette ou un panneau, sur fond transparent ; elle ne dessine pas le ciel.
if (location.hash === '#overlay') {
  document.documentElement.classList.add('overlay')
  render(<Overlay />, document.getElementById('app')!)
} else {
  // Fenêtre privée : la classe `privee` fait prendre à cette vue les variables du thème privé (Aurore par défaut), voir themeVivant.
  if (location.hash === '#privee') document.documentElement.classList.add('privee')
  void initialiserEtat()
  render(<Racine />, document.getElementById('app')!)
}

demarrerTheme()
