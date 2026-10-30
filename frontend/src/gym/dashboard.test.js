// The owner's numbers (M4), on the owner's own calendar: who is Active, Slipping, At risk or
// Lost; a trainer's month and retention; the check-in charts; the WhatsApp message.
import { describe, expect, it } from 'vitest'
import { statusOf, lastActive, trainerStats, visitsByDay, busyHours, levels, waNumber, waLink, waText } from './dashboard.js'

const today = new Date(2026, 9, 30, 9, 0)   // Friday 30 October 2026, local time
const at = (m, d, h = 18) => new Date(2026, m - 1, d, h, 5).getTime()

describe('member status', () => {
  it('counts from the last visit or workout: 7 days active, 14 slipping, 30 at risk, then lost', () => {
    expect(statusOf({ lastVisit: at(10, 23) }, today)).toBe('active')
    expect(statusOf({ lastWorkout: '2026-10-22' }, today)).toBe('slipping')
    expect(statusOf({ lastVisit: at(10, 16), lastWorkout: '2026-10-15' }, today)).toBe('slipping')
    expect(statusOf({ lastVisit: at(10, 15) }, today)).toBe('at-risk')
    expect(statusOf({ lastWorkout: '2026-09-30' }, today)).toBe('at-risk')
    expect(statusOf({ lastWorkout: '2026-09-29' }, today)).toBe('lost')
    expect(lastActive({ lastVisit: at(10, 20), lastWorkout: '2026-10-18' })).toBe('2026-10-20')
  })
  it('counts someone who never came from the day they joined', () => {
    expect(statusOf({ joined: new Date(2026, 9, 27).toISOString() }, today)).toBe('active')
    expect(statusOf({ joined: new Date(2026, 8, 1).toISOString() }, today)).toBe('lost')
    expect(statusOf({}, today)).toBe('lost')
  })
})

describe('a trainer’s month', () => {
  const m = (id, extra) => ({ id, name: id, recent: [], lastWorkout: null, ...extra })
  const byId = {
    a: m('a', { lastVisit: at(10, 29), programme: { start: '2026-10-01', days: ['1', '4'] }, recent: ['2026-10-05', '2026-10-08', '2026-10-12'] }),
    b: m('b', { lastVisit: at(10, 1) }),                 // 29 days ago: at risk
    c: m('c', { lastVisit: at(10, 28), pt: { live: 1, left: 1, flagged: 0 } }),
    d: m('d', { lastVisit: at(10, 29) }),
  }
  const t = {
    id: 't1',
    clients: [{ member: 'a', since: '2026-09-01T00:00:00Z' }, { member: 'b', since: '2026-09-10T00:00:00Z' }, { member: 'c', since: '2026-10-20T00:00:00Z' }],
    past: [{ member: 'd', since: '2026-08-01T00:00:00Z', ended: '2026-09-20T00:00:00Z' }, { member: 'x', since: '2026-07-01T00:00:00Z', ended: '2026-08-01T00:00:00Z' }],
  }
  const sessions = [{ d: '2026-10-02', by: 't1' }, { d: '2026-10-29', by: 't1' }, { d: '2026-09-30', by: 't1' }, { d: '2026-10-29', by: 't2' }]
  it('counts clients, PT sessions this month, consistency and who needs something', () => {
    const s = trainerStats(t, byId, sessions, today)
    expect(s.clients).toBe(3)
    expect(s.ptMonth).toBe(2)
    expect(s.consistency).not.toBe(null)
    expect(s.attention).toBe(3)   // b slipped, c has 1 PT session left, a has not trained in 7 days
  })
  it('keeps last month’s clients who are still theirs and coming: b stopped coming, d left', () => {
    // Last month: a and b (linked before October) and d (left 20 Sep). Still theirs and coming: a.
    expect(trainerStats(t, byId, sessions, today).retention).toEqual({ kept: 1, of: 3, pct: 33 })
    expect(trainerStats({ ...t, clients: [{ member: 'c', since: '2026-10-20T00:00:00Z' }], past: [] }, byId, sessions, today).retention).toBe(null)
  })
})

describe('check-ins', () => {
  const times = [at(10, 30, 7), at(10, 29, 18), at(10, 29, 19), at(10, 26, 18), at(10, 19, 18), at(10, 12, 18), at(10, 5, 18), at(9, 28, 6)]
  it('counts visits per day, today last', () => {
    const v = visitsByDay(times, today)
    expect(v.length).toBe(30)
    expect(v[29]).toEqual({ d: '2026-10-30', n: 1 })
    expect(v[28]).toEqual({ d: '2026-10-29', n: 2 })
    expect(v.reduce((a, x) => a + x.n, 0)).toBe(7)
  })
  it('averages each weekday and hour over 4 weeks and finds the busiest', () => {
    const b = busyHours(times, today)
    expect(b.grid[0][13]).toBe(1)          // Mondays 18:00: 26, 19, 12, 5 Oct = 4 visits ÷ 4 weeks
    expect(b.grid[3][14]).toBe(0.3)        // Thursday 19:00 once
    expect(b.grid[4][2]).toBe(0)           // today (Friday 7:00) is not counted
    expect(b.busiest).toEqual({ day: 0, hour: 18, avg: 1 })
    const level = levels([0, 1, 2, 3, 4])
    expect([0, 1, 2, 3, 4].map(level)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('the WhatsApp message', () => {
  it('turns a number into wa.me’s: Indian when it has 10 digits', () => {
    expect(waNumber('98765 43210')).toBe('919876543210')
    expect(waNumber('098765 43210')).toBe('919876543210')
    expect(waNumber('+44 7700 900123')).toBe('447700900123')
    expect(waNumber('')).toBe(null)
    expect(waLink('9876543210', 'Hi Priya')).toBe('https://wa.me/919876543210?text=Hi%20Priya')
    expect(waLink(null, 'x')).toBe(null)
    expect(waNumber('7700 900123', '44')).toBe('447700900123')   // the gym's own country code (M5)
  })
  it('says what the member needs: back to the gym, or their next PT package', () => {
    expect(waText({ name: 'Priya Sharma', lastVisit: at(10, 20) }, today)).toMatch(/^Hi Priya, we haven’t seen you at the gym since 20 Oct/)
    expect(waText({ name: 'Rahul', lastWorkout: '2026-09-01' }, today)).toMatch(/been a while since your last visit \(1 Sept?\)/)
    expect(waText({ name: 'Neha', lastVisit: at(10, 29), pt: { live: 1, left: 2, expires: '2026-11-04', flagged: 0 } }, today))
      .toMatch(/^Hi Neha, you have 2 PT sessions left \(valid till 4 Nov\)/)
    expect(waText({ name: 'Om', joined: new Date(2026, 9, 1).toISOString() }, today)).toMatch(/We haven’t seen you yet/)
    expect(waText({ name: 'Priya', lastVisit: at(10, 20) }, today, 'Iron Temple Gym')).toMatch(/^Hi Priya, we haven’t seen you at Iron Temple Gym since 20 Oct/)
  })
})
