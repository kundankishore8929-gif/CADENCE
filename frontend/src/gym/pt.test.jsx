// @vitest-environment happy-dom
// PT packages on screen (M3): the trainer's one-tap "Session done", a second session on the same
// day only when meant, and the member's "Not me" on a session counted in the last 48 hours.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => ({ count: [], flag: [] }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: vi.fn(o => o.onConfirm()) }))
vi.mock('./api.js', async orig => ({
  ...(await orig()),
  countSession: vi.fn((member, d, again) => {
    calls.count.push([member, d, again])
    return again || calls.count.length > 1
      ? Promise.resolve({ packages: [pkg({ used: 8 })] })
      : Promise.reject(Object.assign(new Error('same day'), { data: { code: 'same-day' } }))
  }),
  flagSession: vi.fn(id => { calls.flag.push(id); return Promise.resolve({ packages: [pkg({ flagged: true })] }) }),
}))

const { TrainerPt, MemberPt } = await import('./PtPackages.jsx')
const { useUI } = await import('../store/useUI.js')

function pkg({ used = 7, flagged = false } = {}) {
  return {
    id: 'p1', total: 12, used, left: 12 - used, start: '2026-10-01', expires: '2026-11-30', note: '', state: 'active',
    trainer: { id: 't1', name: 'Aman' },
    sessions: [{ id: 's1', d: '2026-10-29', at: '2026-10-29T12:00:00Z', by: { id: 't1', name: 'Aman' }, flagged, kept: false, canUndo: true, canFlag: !flagged }],
  }
}

async function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(el) })
  return { host, root }
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; calls.count.length = 0; calls.flag.length = 0 })

describe('the trainer’s PT section', () => {
  it('shows used and left, and counts today in one tap, asking before a second one that day', async () => {
    const toast = vi.spyOn(useUI.getState(), 'toast')
    const onChange = vi.fn()
    const { host, root } = await mount(<TrainerPt client={{ id: 'm1', name: 'Priya' }} pt={{ packages: [pkg()] }} onChange={onChange} />)
    expect(host.textContent).toContain('7 of 12 used · 5 left')
    expect(button(host, 'Undo')).toBeTruthy()
    await act(async () => { button(host, 'Session done').click() })
    expect(calls.count.map(c => !!c[2])).toEqual([false, true])   // refused as same-day, then counted on yes
    expect(onChange).toHaveBeenCalledWith({ packages: [expect.objectContaining({ used: 8 })] })
    expect(toast.mock.calls.at(-1)[0]).toBe('Session counted · 4 left')
    await act(async () => { root.unmount() })
  })

  it('offers a package when there is none', async () => {
    const { host, root } = await mount(<TrainerPt client={{ id: 'm1', name: 'Priya' }} pt={{ packages: [] }} onChange={() => {}} />)
    expect(host.textContent).toContain('Add PT package')
    expect(button(host, 'Session done')).toBeFalsy()
    await act(async () => { root.unmount() })
  })
})

describe('the member’s PT section', () => {
  it('lists each session and flags one with “Not me”', async () => {
    const onChange = vi.fn()
    const { host, root } = await mount(<MemberPt pt={{ packages: [pkg()] }} onChange={onChange} />)
    expect(host.textContent).toContain('Counted by Aman')
    expect(button(host, 'Undo')).toBeFalsy()
    await act(async () => { button(host, 'Not me').click() })
    expect(calls.flag).toEqual(['s1'])
    expect(onChange.mock.calls[0][0].packages[0].sessions[0].flagged).toBe(true)
    await act(async () => { root.unmount() })
  })
})
