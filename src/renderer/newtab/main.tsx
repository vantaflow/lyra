import { render } from 'preact'
import '../ui/theme.css'
import './newtab.css'

function NouvelOnglet() {
  return (
    <main class="nouvel-onglet">
      <h1>Bonsoir.</h1>
      <label class="recherche">
        <span class="sr-only">Rechercher ou saisir une adresse</span>
        <input id="recherche" type="text" placeholder="Rechercher ou saisir une adresse" />
      </label>
      <p class="pied">Aucune donnée ne quitte cet ordinateur.</p>
    </main>
  )
}

render(<NouvelOnglet />, document.getElementById('app')!)
