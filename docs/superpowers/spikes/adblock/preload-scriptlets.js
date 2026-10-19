// Préload "scriptlets tôt" (phase fix) : récupère les scriptlets en SYNCHRONE puis les exécute dans le monde principal
// via webFrame.executeJavaScript (renderer, pas d'attente de fin de chargement), chacun dans un bloc { } pour éviter
// les collisions de class/const entre scriptlets (ex. "Identifier 'JSONPath' has already been declared").
const { ipcRenderer, webFrame } = require('electron');

if (window === window.top && location.protocol.startsWith('http')) {
  const scripts = ipcRenderer.sendSync('spike:scriptlets', location.href) || [];
  webFrame.executeJavaScript(`window.__spikeEarly = document.readyState + '@' + Math.round(performance.now()) + 'ms n=${scripts.length}'`);
  for (const s of scripts) {
    webFrame.executeJavaScript('{\n' + s + '\n}').catch((e) => ipcRenderer.send('spike:scriptlet-error', String(e && e.message)));
  }
}
