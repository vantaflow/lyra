import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CanalEvenement, CanalRequete, Evenements, Requetes } from '../shared/ipc'

/** Origine de confiance : pages lyra:// ou vue UI (dev : serveur Vite, prod : out/renderer/). */
export function expediteurAutorise(url: string): boolean {
  if (url.startsWith('lyra://')) return true
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) return url === dev || url.startsWith(`${dev}/`)
  return url.startsWith(pathToFileURL(join(__dirname, '../renderer/')).href)
}

export function handle<K extends CanalRequete>(
  canal: K,
  fn: (data: Requetes[K][0], event: IpcMainInvokeEvent) => Requetes[K][1] | Promise<Requetes[K][1]>
): void {
  ipcMain.handle(canal, (event, data) => {
    const url = event.senderFrame?.url ?? ''
    if (!expediteurAutorise(url)) throw new Error(`IPC refusé pour ${canal} depuis ${url}`)
    return fn(data as Requetes[K][0], event)
  })
}

export function envoyer<K extends CanalEvenement>(wc: WebContents, canal: K, data: Evenements[K]): void {
  if (!wc.isDestroyed()) wc.send(canal, data)
}
