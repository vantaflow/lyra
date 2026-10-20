// Télécharge les listes de filtres embarquées dans resources/shields/ et écrit LISTES.json.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'shields')
const ubo = 'https://ublockorigin.github.io/uAssets/filters/'
const listes = [
  ...['filters', 'filters-2020', 'filters-2021', 'filters-2022', 'filters-2023', 'filters-2024', 'filters-2025', 'filters-2026', 'privacy', 'unbreak', 'badware', 'quick-fixes', 'resource-abuse'].map(
    (n) => ({ nom: `uBO ${n}`, url: `${ubo}${n}.txt`, fichier: `ubo-${n}.txt` })
  ),
  { nom: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt', fichier: 'easylist.txt' },
  { nom: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt', fichier: 'easyprivacy.txt' },
  { nom: 'Peter Lowe', url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext', fichier: 'peter-lowe.txt' },
  // Gênes (option « Masquer aussi les gênes ») : moteur à part, consulté seulement si l'option est active.
  { nom: 'uBO annoyances-cookies', url: `${ubo}annoyances-cookies.txt`, fichier: 'genes-ubo-cookies.txt', categorie: 'genes' },
  { nom: 'uBO annoyances-others', url: `${ubo}annoyances-others.txt`, fichier: 'genes-ubo-autres.txt', categorie: 'genes' },
  { nom: 'EasyList Cookie', url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt', fichier: 'genes-easylist-cookie.txt', categorie: 'genes' },
  // Faute d'URL publiée stable, resources.json vient du dépôt Ghostery (à réévaluer).
  { nom: 'Scriptlets uBO (resources.json)', url: 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resources.json', fichier: 'resources.json' }
]

await mkdir(dossier, { recursive: true })
for (const l of listes) {
  const r = await fetch(l.url)
  if (!r.ok) throw new Error(`${l.url} : HTTP ${r.status}`)
  await writeFile(join(dossier, l.fichier), await r.text())
  console.log('ok', l.fichier)
}
await writeFile(join(dossier, 'LISTES.json'), JSON.stringify({ date: new Date().toISOString(), listes }, null, 2) + '\n')
