import { render } from 'preact'
import './theme.css'
import { Capsule } from './Capsule'
import { Sky } from './Sky'
import { initialiserEtat } from './state'
import { Overlay } from './Overlay'
import { FindBar } from './FindBar'

function App() {
  const winStyle = window.lyra.plateforme === 'win32' ? ' win' : ''
  return (
    <div class={`fenetre${winStyle}`}>
      <Sky />
      <section class="page-zone" aria-label="Page active">
        <div class="carte">
          <Capsule />
          <FindBar />
          {/* La vraie page est une WebContentsView posée au-dessus de cette zone. */}
          <main class="page-vide"></main>
        </div>
      </section>
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
