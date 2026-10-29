// @vitest-environment happy-dom
// The rules the trainer screens show: counts on the trainer's own calendar, who slipped, and how
// one logged exercise reads in a client's history.
import { describe, expect, it } from 'vitest'
import { clientLine, sortClients, agoLabel, daysSince, isoDaysAgo, gt, linkError, localDay } from './api.js'
import { exerciseLine } from './ClientDetail.jsx'

const today = new Date(2026, 9, 30, 9, 0)   // Friday 30 October 2026, local time

describe('client lines', () => {
  it('counts this week and the last 30 days on the local calendar', () => {
    const l = clientLine({ lastWorkout: '2026-10-29', recent: ['2026-09-20', '2026-10-01', '2026-10-24', '2026-10-29'] }, today)
    expect(l.last7).toBe(2)
    expect(l.last30).toBe(3)
    expect(l.gap).toBe(1)
    expect(l.attention).toBe(false)
  })

  it('needs attention after 7 days without a workout, or with none at all', () => {
    expect(clientLine({ lastWorkout: '2026-10-23', recent: [] }, today).attention).toBe(true)
    expect(clientLine({ lastWorkout: '2026-10-24', recent: [] }, today).attention).toBe(false)
    expect(clientLine({ lastWorkout: null, recent: [] }, today).attention).toBe(true)
  })

  it('puts slipping clients first, the longest gap first, then the rest by name', () => {
    const lines = [
      { name: 'Zara', lastWorkout: '2026-10-29' }, { name: 'Amit', lastWorkout: '2026-10-28' },
      { name: 'Ravi', lastWorkout: '2026-10-10' }, { name: 'Neha', lastWorkout: null }, { name: 'Om', lastWorkout: '2026-10-20' },
    ].map(c => clientLine({ ...c, recent: [] }, today))
    expect(sortClients(lines).map(c => c.name)).toEqual(['Neha', 'Ravi', 'Om', 'Amit', 'Zara'])
  })

  it('says how long ago in words', () => {
    expect(agoLabel('2026-10-30', today)).toBe('today')
    expect(agoLabel('2026-10-29', today)).toBe('yesterday')
    expect(agoLabel('2026-10-25', today)).toBe('5 days ago')
    expect(agoLabel(null, today)).toBe('never')
    expect(daysSince('2026-10-01', today)).toBe(29)
    expect(isoDaysAgo(6, today)).toBe('2026-10-24')
    const ts = new Date(2026, 9, 30, 0, 30).toISOString()   // just after midnight here, still the 29th in UTC west of here
    expect(localDay(ts)).toBe('2026-10-30')
    expect(localDay('nonsense')).toBe(null)
  })
})

describe('a logged exercise in a client’s history', () => {
  it('shows the sets done and the heaviest set, warm-ups left out', () => {
    const e = { id: 'c1', sets: [{ w: 20, r: 10, done: true, warmup: true }, { w: 80, r: 8, done: true }, { w: 85, r: 5, done: true }, { w: 90, r: 3, done: false }] }
    expect(exerciseLine(e, { c1: 'sled push' }, 'kg')).toEqual({ name: 'Sled push', detail: '2 sets · best 85 kg × 5' })
  })
  it('reads bodyweight and timed sets too', () => {
    expect(exerciseLine({ id: 'c1', sets: [{ r: 12, done: true }, { r: 15, done: true }] }, { c1: 'push-up' }, 'kg').detail).toBe('2 sets · best 15 reps')
    expect(exerciseLine({ id: 'c1', sets: [{ sec: 45, done: true }, { sec: 60, done: true }] }, { c1: 'plank' }, 'kg').detail).toBe('2 sets · longest 60 s')
    expect(exerciseLine({ id: 'c1', sets: [] }, { c1: 'plank' }, 'kg').detail).toBe('no sets done')
  })
})

describe('a refused link, in words', () => {
  it('names what went wrong', () => {
    const err = code => Object.assign(new Error(code), { data: { code } })
    expect(linkError(err('no-such-code'), 'AMAN07')).toBe('No trainer has the code AMAN07. Check it with your trainer.')
    expect(linkError(err('already-linked'))).toMatch(/Stop sharing first/)
    expect(linkError(err('self'))).toBe('That is your own trainer code.')
    expect(gt('{0} of {1}', 1, 2)).toBe('1 of 2')
  })
})
