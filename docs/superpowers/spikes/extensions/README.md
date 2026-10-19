# Spike jetable — extensions Chrome et Firefox (2026-10-19)

Code de référence, **pas du code produit**. Electron 44.9.0 + electron-chrome-extensions 4.9.0 + electron-chrome-web-store 0.13.0 + webextension-polyfill 0.12.0.

Résultats (détail en spec §7) :
- MV2 se charge (avertissement « deprecated ») ; MV3 service worker fonctionne (Dark Reader installé depuis le Chrome Web Store).
- uBlock Origin (Chrome MV2 et Firefox MV2 converti) **plante** au démarrage sans `chrome.browserAction` (absent en MV2 chez electron-chrome-extensions) ; avec les stubs `shim-head.js` (avant le polyfill) + `shim-post.js` (après), il démarre et bloque via webRequest (4 requêtes pub sur 6 bloquées).
- Dark Reader Firefox converti par `convert.js` fonctionne (8 styles injectés).
- `installExtension` du Chrome Web Store : OK pour un MV3 publié ; uBO MV2 n'est plus servi (HTTP 204).
- Un `session.webRequest` côté application neutralise les listeners webRequest des extensions (README ece) : les Boucliers de Lyra priment.
- `logs/` : sorties réelles par scénario (base, chrome, chromeshim, ff, ffs, cws).
