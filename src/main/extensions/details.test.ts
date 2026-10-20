import { describe, expect, it } from 'vitest'
import { porteeDuManifest, urlOptions } from './details'

const ID = 'a'.repeat(32)

describe('urlOptions', () => {
  it('options_ui.page puis options_page', () => {
    expect(urlOptions(ID, { options_ui: { page: 'opt/options.html' } })).toBe(`chrome-extension://${ID}/opt/options.html`)
    expect(urlOptions(ID, { options_page: '/options.html' })).toBe(`chrome-extension://${ID}/options.html`)
    expect(urlOptions(ID, { options_ui: { page: 'a.html' }, options_page: 'b.html' })).toBe(`chrome-extension://${ID}/a.html`)
  })
  it('refuse une page hors de l\'extension', () => {
    expect(urlOptions(ID, { options_page: 'https://evil.example/x.html' })).toBeUndefined()
    expect(urlOptions(ID, { options_page: '../x.html' })).toBeUndefined()
    expect(urlOptions(ID, { options_page: 'javascript:alert(1)' })).toBeUndefined()
    expect(urlOptions(ID, {})).toBeUndefined()
  })
})

describe('porteeDuManifest', () => {
  it('tous les sites', () => {
    expect(porteeDuManifest({ permissions: ['<all_urls>'] })).toEqual({ tous: true, hotes: [] })
    expect(porteeDuManifest({ content_scripts: [{ matches: ['http://*/*', 'https://*/*'] }] }).tous).toBe(true)
  })
  it('hôtes précis', () => {
    expect(porteeDuManifest({ host_permissions: ['*://*.youtube.com/*', 'https://www.youtube.com/*'], content_scripts: [{ matches: ['https://youtu.be/*'] }] })).toEqual({
      tous: false,
      hotes: ['www.youtube.com', 'youtu.be', 'youtube.com']
    })
  })
  it('aucun site', () => {
    expect(porteeDuManifest({ permissions: ['storage'] })).toEqual({ tous: false, hotes: [] })
  })
})
