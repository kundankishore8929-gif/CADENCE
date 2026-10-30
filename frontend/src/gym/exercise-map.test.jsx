// @vitest-environment happy-dom
// M6: CADENCE never shows openGym's exercise pictures (licensed from Gym visual for openGym only,
// NOTICE.md). With CADENCE's own brand, a built-in exercise shows its muscles and no file from
// exercise-media/ is ever asked for; the media prefetch does not start either.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.unmock('./brand.js')
const { BRAND } = await import('./brand.js')
const { default: Media, Thumb } = await import('../components/Media.jsx')
const { startMediaPrefetch } = await import('../lib/media-prefetch.js')
const { EXIDX } = await import('../lib/exercises.js')

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

describe('exercise pictures in CADENCE', () => {
  it('are off, and a built-in exercise shows its muscles instead', async () => {
    expect(BRAND.exerciseMedia).toBe(false)
    const ex = EXIDX['0025']
    expect(ex?.gif).toBeTruthy()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => { root.render(<><Media ex={ex} /><Thumb ex={ex} /></>) })
    expect(host.querySelector('.gym-exmap')).not.toBe(null)
    expect(host.querySelector('.thumb-x')).not.toBe(null)
    expect(host.innerHTML).not.toMatch(/exercise-media/)
    expect(host.querySelector('img, video')).toBe(null)
    await act(async () => { root.unmount() })
  })

  it('are never fetched ahead for offline use', () => {
    const register = vi.fn()
    const stop = startMediaPrefetch({ getState: () => ({ S: {} }), subscribe: register },
      { delay: 0, win: {}, nav: { serviceWorker: {} }, cachesApi: {} })
    expect(typeof stop).toBe('function')
    expect(register).not.toHaveBeenCalled()
  })
})
