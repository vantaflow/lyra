import { describe, it, expect, vi } from 'vitest'
import { messageErreur } from './messageErreur'

const ipc = (canal: string, m: string): Error => new Error(`Error invoking remote method '${canal}': ${m}`)

describe('messageErreur : jamais de message technique brut à l’écran', () => {
  it('garde une phrase française émise par Lyra, sans l’enrobage IPC', () => {
    expect(messageErreur(ipc('passerelles:ajouter', 'Error: Adresse invalide : saisissez un nom de site (ex. exemple.com).'))).toBe('Adresse invalide : saisissez un nom de site (ex. exemple.com).')
  })

  it.each([
    ['SyntaxError: Unexpected token < in JSON at position 0'],
    ['SyntaxError: Unexpected end of JSON input'],
    ['SyntaxError: "<!DOCTYPE "... is not valid JSON'],
    ['Error: parse error'],
    ["TypeError: Cannot read properties of undefined (reading 'x')"],
    ["Error: EPERM: operation not permitted, rename 'C:\\Users\\a\\settings.json.tmp' -> 'C:\\Users\\a\\settings.json'"],
    ['Error: An object could not be cloned.'],
    ['Error: No handler registered for \'settings:set\''],
    ['Error: IPC refusé pour settings:set depuis https://x'],
    ['Error: net::ERR_CONNECTION_RESET']
  ])('remplace « %s » par une phrase lisible et journalise le détail', (brut) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const m = messageErreur(ipc('x:y', brut))
    expect(m).toBe('Une erreur est survenue. Réessayez.')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('repli propre au contexte', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(messageErreur(new SyntaxError('Unexpected token'), 'Installation impossible.')).toBe('Installation impossible.')
  })
})
