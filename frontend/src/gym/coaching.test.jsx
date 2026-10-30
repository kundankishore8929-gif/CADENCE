// @vitest-environment happy-dom
// M5 on screen: the member's diet chart, the trainer's private notes, and the gym's colour for a
// member who never picked their own.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const sent = vi.hoisted(() => [])
vi.mock('./api.js', async orig => ({
  ...(await orig()),
  addNote: vi.fn((member, text) => { sent.push([member, text]); return Promise.resolve({ notes: [{ id: 'n1', at: '2026-10-30T10:00:00Z', text }] }) }),
}))
const { MemberDiet, TrainerNotes, targetsLine } = await import('./Coaching.jsx')
const { gymAccent, gymName } = await import('./brand-live.js')

async function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(el) })
  return { host, root }
}
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; sent.length = 0 })

const diet = { calories: 2200, protein: 120, water: 3, meals: { breakfast: 'Oats, 4 egg whites', lunch: '', dinner: 'Dal, rice', snacks: '' }, notes: 'No sugar', trainerName: 'Aman', updatedAt: '2026-10-29T10:00:00Z', current: true }

describe('the diet chart', () => {
  it('shows the targets set and the meals filled in', async () => {
    expect(targetsLine({ calories: 2200, protein: null, water: 2.5 })).toBe('2,200 kcal · 2.5 L water')
    const { host, root } = await mount(<MemberDiet diet={diet} />)
    expect(host.textContent).toContain('2,200 kcal · 120 g protein · 3 L water')
    expect(host.textContent).toContain('Oats, 4 egg whites')
    expect(host.textContent).not.toContain('Lunch')
    expect(host.textContent).toContain('From Aman')
    await act(async () => { root.render(<MemberDiet diet={{ ...diet, current: false }} />) })
    expect(host.textContent).toContain('no longer updated')
    await act(async () => { root.unmount() })
  })
})

describe('the trainer’s notes', () => {
  it('adds a note and says who can read them', async () => {
    const onChange = vi.fn()
    const { host, root } = await mount(<TrainerNotes client={{ id: 'm1', name: 'Priya' }} notes={[]} onChange={onChange} />)
    expect(host.textContent).toContain('Only you see these')
    const area = host.querySelector('textarea')
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      set.call(area, 'Knee pain, avoid lunges')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Add').click() })
    expect(sent).toEqual([['m1', 'Knee pain, avoid lunges']])
    expect(onChange.mock.calls[0][0][0].text).toBe('Knee pain, avoid lunges')
    await act(async () => { root.unmount() })
  })
})

describe('the gym’s look', () => {
  it('colours members on the default accent, and leaves a colour they chose', () => {
    expect(gymAccent('lime', { accent: '#ff6b00' })).toBe('#ff6b00')
    expect(gymAccent('sky', { accent: '#ff6b00' })).toBe('sky')
    expect(gymAccent('#123456', { accent: '#ff6b00' })).toBe('#123456')
    expect(gymAccent('lime', null)).toBe('lime')
    expect(gymName({ name: 'Iron Temple Gym' })).toBe('Iron Temple Gym')
    expect(gymName(null)).toBe('openGym')   // tests run with openGym's identity (gym/test-setup.js)
  })
})
