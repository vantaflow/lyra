import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expediteurAutorise, type OriginesUI } from './ipc-origines'
import type { CanalEvenement, CanalRequete, Evenements, Requetes } from '../shared/ipc'

const origines = (): OriginesUI => ({
  dev: process.env.ELECTRON_RENDERER_URL,
  prod: pathToFileURL(join(__dirname, '../renderer/')).href
})

export function handle<K extends CanalRequete>(
  canal: K,
  fn: (data: Requetes[K][0], event: IpcMainInvokeEvent) => Requetes[K][1] | Promise<Requetes[K][1]>
): void {
  ipcMain.handle(canal, (event, data) => {
    const url = event.senderFrame?.url ?? ''
    if (!expediteurAutorise(url, origines())) throw new Error(`IPC refusé pour ${canal} depuis ${url}`)
    return fn(data as Requetes[K][0], event)
  })
}

export function envoyer<K extends CanalEvenement>(wc: WebContents, canal: K, data: Evenements[K]): void {
  if (!wc.isDestroyed()) wc.send(canal, data)
}
