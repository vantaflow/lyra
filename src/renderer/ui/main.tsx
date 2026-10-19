import { render } from 'preact'
import { useEffect } from 'preact/hooks'
import './theme.css'
import { Capsule } from './Capsule'
import { Bande } from './Bande'
import { Sky } from './Sky'
import { CielRevele, Rail } from './Rail'
import { cielAppui, cielCible, cielMasque, cielPosition, cielRevele, initialiserEtat } from './state'
import { Overlay } from './Overlay'
import { FindBar } from './FindBar'

function App() {
  const winStyle = window.lyra.plateforme === 'win32' ? ' win' : window.lyra.plateforme === 'darwin' ? ' mac' : ''
  const masque = cielMasque.value
  const revele = masque && cielRevele.value
  const position = cielPosition.value
  const mac = window.lyra.plateforme === 'darwin'
  // Les pastilles macOS sont dans le ciel (colonne à gauche, bande en haut) ; sinon la capsule leur laisse la place.
  const pastillesCapsule = mac && (masque || (position !== 'gauche' && position !== 'haut'))
  const cible = cielCible.value
  // Révélé, la vue chrome ne couvre plus que le ciel : fond transparent autour pour laisser voir la page.
  useEffect(() => {
    document.documentElement.classList.toggle('revele', revele)
  }, [revele])
  return (
    <div class={`fenetre${winStyle} pos-${position}${masque ? ' masque' : ''}${revele ? ' revele' : ''}${cible ? ' glisse' : ''}${cible || cielAppui.value ? ' appui' : ''}${pastillesCapsule ? ' capsule-pastilles' : ''}`}>
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

// La vue overlay (#overlay) dessine la palette ou un panneau, sur fond transparent ; elle ne dessine pas le ciel.
if (location.hash === '#overlay') {
  document.documentElement.classList.add('overlay')
  render(<Overlay />, document.getElementById('app')!)
} else {
  void initialiserEtat()
  render(<App />, document.getElementById('app')!)
}
