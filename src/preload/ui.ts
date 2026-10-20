// Preload de la vue d'interface (ui.html) : expose window.lyra, typé par shared/ipc.
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { exposerApi } from './api'

exposerApi()
// <browser-action-list> (icônes d'action des extensions, panneau du pied du ciel) : les icônes viennent de crx://.
injectBrowserAction()
