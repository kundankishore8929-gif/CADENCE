// The CADENCE brand, unmocked (src/gym/test-setup.js gives every other test openGym's identity).
import { describe, expect, it, vi } from 'vitest'

vi.unmock('./brand.js')
vi.unmock('../gym/brand.js')

const { BRAND, REPO, rebrand } = await import('./brand.js')
const { t } = await import('../lib/i18n-core.js')

describe('CADENCE brand', () => {
  it('names the app CADENCE, with the wordmark and the lime', () => {
    expect(BRAND.name).toBe('CADENCE')
    expect(BRAND.first + BRAND.second).toBe(BRAND.name)
    expect(BRAND.lime).toBe('#c8f135')
  })

  it('points source code and updates at this fork, and credits openGym', () => {
    expect(REPO).not.toMatch(/DuarteSantos8/)
    expect(BRAND.source).toBe(`https://github.com/${REPO}`)
    expect(BRAND.releases).toBe(`https://github.com/${REPO}/releases/latest`)
    expect(BRAND.upstream).toBe('https://github.com/DuarteSantos8/openGym')
  })

  it('leaves out openGym\'s own APK, rating and donation links', () => {
    expect(BRAND.openGymLinks).toBe(false)
  })

  it('rebrands openGym in interface text, but not in a folder path', () => {
    expect(rebrand('Reload openGym')).toBe('Reload CADENCE')
    expect(rebrand('openGym can no longer write, so copies go to Documents/openGym again.'))
      .toBe('CADENCE can no longer write, so copies go to Documents/openGym again.')
    expect(rebrand('openGym/notes.txt')).toBe('openGym/notes.txt')
    expect(rebrand('Nothing to change here')).toBe('Nothing to change here')
    expect(rebrand(null)).toBe(null)
  })

  it('reaches every translated string through t()', () => {
    expect(t('Reload openGym')).toBe('Reload CADENCE')
    expect(t('Update to openGym v{0}', '1.4.4')).toBe('Update to CADENCE v1.4.4')
  })
})
