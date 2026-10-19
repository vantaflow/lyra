import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/defaut/userData' } }))

import { userData } from './paths'

describe('paths.userData', () => {
  afterEach(() => {
    delete process.env.LYRA_USER_DATA
  })

  it('respecte LYRA_USER_DATA', () => {
    process.env.LYRA_USER_DATA = '/tmp/lyra-test'
    expect(userData()).toBe('/tmp/lyra-test')
  })

  it("se replie sur app.getPath('userData')", () => {
    expect(userData()).toBe('/defaut/userData')
  })
})
