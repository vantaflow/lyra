import { render } from 'preact'
import './theme.css'
import { Capsule } from './Capsule'
import { Sky } from './Sky'
import { initialiserEtat } from './state'
import { Palette } from './Palette'

function App() {
  const winStyle = window.lyra.plateforme === 'win32' ? ' win' : ''
  return (
    <div class={`fenetre${winStyle}`}>
      <Sky />
      <section class="page-zone" aria-label="Page active">
        <div class="carte">
          <Capsule />
          {/* La vraie page est une WebContentsView posée au-dessus de cette zone. */}
          <main class="page-vide"></main>
        </div>
      </section>
    </div>
  )
}

// La vue overlay (#overlay) dessine la palette, sur fond transparent ; elle ne dessine pas le ciel.
if (location.hash === '#overlay') {
  document.documentElement.classList.add('overlay')
  render(<Palette />, document.getElementById('app')!)
} else {
  void initialiserEtat()
  render(<App />, document.getElementById('app')!)
}
