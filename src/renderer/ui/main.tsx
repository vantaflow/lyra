import { render } from 'preact'
import { t } from '../../shared/i18n'
import './theme.css'

function App() {
  return <div class="marque">{t('app.nom')}</div>
}

render(<App />, document.getElementById('app')!)
