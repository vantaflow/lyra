/** User-agent sans « Electron/x » ni « lyra/x » : les sites ne doivent pas voir un navigateur intégré. */
export function nettoyerUserAgent(ua: string): string {
  return ua.replace(/ Electron\/\S+/, '').replace(/ lyra\/\S+/i, '')
}
