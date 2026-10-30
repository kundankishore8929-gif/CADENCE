// @vitest-environment happy-dom
// The owner's Gym screen (M4) on screen: each tab draws from one dashboard answer, and a member
// with a phone number gets a WhatsApp link with the message filled in.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const now = Date.now()
const day = n => new Date(now - n * 86400e3).toISOString().slice(0, 10)
const data = {
  now,
  members: [
    { id: 'm1', name: 'Priya Sharma', joined: '2026-01-01T00:00:00Z', role: null, trainer: { id: 't1', name: 'Aman' }, lastWorkout: day(1), recent: [day(1)], lastVisit: now - 3600e3, programme: null, pt: null, phone: null, live: { name: 'Push', startedAt: now - 600e3 } },
    { id: 'm2', name: 'Vikram Rao', joined: '2026-01-01T00:00:00Z', role: null, trainer: null, lastWorkout: day(11), recent: [day(11)], lastVisit: null, programme: null, pt: null, phone: '9900112233', live: null },
    { id: 't1', name: 'Aman', joined: '2026-01-01T00:00:00Z', role: 'trainer', trainer: null, lastWorkout: null, recent: [], lastVisit: null, programme: null, pt: null, phone: null, live: null },
  ],
  trainers: [{ id: 't1', name: 'Aman', code: 'AMAN01', clients: [{ member: 'm1', since: '2026-01-01T00:00:00Z' }], past: [] }],
  sessions: [{ id: 's1', d: day(0), by: 't1', member: 'm1' }],
  flagged: [],
  today: [{ m: 'm1', at: now - 3600e3 }],
  checkins: [now - 3600e3, now - 2 * 86400e3],
}
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('./api.js', async orig => ({ ...(await orig()), gymDashboard: vi.fn(() => Promise.resolve(data)) }))
const { default: GymDashboard } = await import('./GymDashboard.jsx')

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; try { sessionStorage.clear() } catch { /* none */ } })
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text))

describe('the Gym screen', () => {
  it('shows today, the members by status with WhatsApp, the trainers and the check-ins', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => { root.render(<GymDashboard />) })
    expect(host.textContent).toContain('2 members')                  // the trainer is staff, not a member
    expect(host.textContent).toContain('Training now')
    expect(host.textContent).toContain('Push')

    await act(async () => { button(host, 'Members').click() })
    expect(host.textContent).toContain('Vikram Rao')                  // 11 days: Slipping, the first filter
    const wa = host.querySelector('a.gym-act.wa')
    expect(decodeURIComponent(wa.href)).toMatch(/^https:\/\/wa\.me\/919900112233\?text=Hi Vikram, we haven’t seen you at the gym since/)

    await act(async () => { button(host, 'Trainers').click() })
    expect(host.textContent).toContain('AMAN01')
    expect(host.textContent).toMatch(/1 client · 1 PT session in/)

    await act(async () => { button(host, 'Check-ins').click() })
    expect(host.textContent).toContain('Visits per day')
    expect(host.querySelectorAll('.gym-bar-col').length).toBe(30)
    expect(host.querySelectorAll('.gym-hm-row .hm-c').length).toBe(7 * 19)
    await act(async () => { root.unmount() })
  })
})
