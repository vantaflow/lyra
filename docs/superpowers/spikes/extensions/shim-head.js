/* SPIKE SHIM: recursive no-op stubs for chrome.* APIs absent in Electron MV2 extension contexts */
(function(){const fn=()=>new Proxy(function(){},{get:(t,k)=>(k==='addListener'||k==='removeListener'||k==='hasListener')?()=>{}:fn(),apply:(t,th,a)=>{const cb=a[a.length-1];if(typeof cb==='function')cb();return Promise.resolve()}});
const top=()=>new Proxy({},{get:(t,k)=>(k==='addListener'||k==='removeListener'||k==='hasListener')?()=>{}:fn()});
for(const k of ['browserAction','action','webNavigation','privacy','contextMenus','menus','commands','windows','dns'])if(!chrome[k])chrome[k]=top();})();
