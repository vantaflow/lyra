import { app } from 'electron'

/** Dossier de données : LYRA_USER_DATA (tests) sinon celui d'Electron. */
export function userData(): string {
  return process.env.LYRA_USER_DATA || app.getPath('userData')
}
