// @vitest-environment happy-dom
// A routine a trainer assigned (SPEC M2, decision 2): Plan's delete refuses it, a duplicate is the
// member's own, and the editor shows it read-only.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav, useParams: () => ({ id: 'g1' }) }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), beacon: vi.fn(), appBase: () => '/' }))

const { deleteRoutineWithUndo } = await import('../views/Plan.jsx')
const { default: RoutineEdit } = await import('../views/RoutineEdit.jsx')

const assigned = { id: 'g1', name: 'Push', assignedBy: 'u_aman', assignedByName: 'Aman Verma', ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }] }
const own = { id: 'own', name: 'My cardio', ex: [] }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useStore.setState({ S: { ...structuredClone(DEF), routines: [structuredClone(assigned), own], week: { 1: ['g1'] } }, user: null })
})

describe('a routine from the trainer', () => {
  it('cannot be deleted from Plan, and says who to ask', () => {
    const toast = vi.spyOn(useUI.getState(), 'toast')
    expect(deleteRoutineWithUndo('g1')).toBe(false)
    expect(useStore.getState().S.routines.map(r => r.id)).toEqual(['g1', 'own'])
    expect(toast.mock.calls[0][0]).toMatch(/Aman Verma set this routine/)
    expect(deleteRoutineWithUndo('own')).toBe(true)
  })

  it('opens read-only, with the trainer named and the targets shown', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => { root.render(<RoutineEdit />) })
    expect(host.textContent).toContain('From Aman Verma')
    expect(host.textContent).toContain('3 × 8 @ 60 kg')
    expect(host.textContent).toContain('Set by Aman Verma')
    expect(host.querySelector('input')).toBe(null)   // no name field, nothing to edit
    await act(async () => { root.unmount() })
  })
})
