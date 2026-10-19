/* SPIKE SHIM (post-polyfill): ensure browser.* has the stubbed APIs too */
(function(){const g=globalThis;const mkF=()=>new Proxy(function(){},{get:(t,k)=>(k==='addListener'||k==='removeListener'||k==='hasListener')?()=>{}:mkF(),apply:(t,th,a)=>{const cb=a[a.length-1];if(typeof cb==='function')cb();return Promise.resolve()}});
const top=()=>new Proxy({},{get:(t,k)=>(k==='addListener'||k==='removeListener'||k==='hasListener')?()=>{}:mkF()});
if(typeof g.browser==='object')for(const k of ['browserAction','action','webNavigation','privacy','contextMenus','menus','commands','windows','dns']){if(!g.browser[k]){try{Object.defineProperty(g.browser,k,{value:top(),configurable:true,enumerable:true})}catch(e){try{g.browser[k]=top()}catch(e2){console.warn('shim-post failed',k,String(e2))}}}}})();
