// @vitest-environment happy-dom
// The rules the trainer screens show: counts on the trainer's own calendar, who slipped, and how
// one logged exercise reads in a client's history.
import { describe, expect, it } from 'vitest'
import {
  clientLine, sortClients, agoLabel, daysSince, isoDaysAgo, gt, linkError, localDay,
  ptAlerts, packageLine, currentPackage, localState, onThisCalendar, codeFromScan, visitsThisMonth, daysUntil, gymError, checkinUrl,
} from './api.js'
import { deskKeyFrom } from './Desk.jsx'
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

describe('PT packages, in words (M3)', () => {
  const fmt = d => d.slice(5)
  it('leads with the package running now, then the next, then the latest', () => {
    const a = { id: 'a', state: 'used-up' }, b = { id: 'b', state: 'active' }, c = { id: 'c', state: 'upcoming' }
    expect(currentPackage([a, b, c])).toBe(b)
    expect(currentPackage([a, c])).toBe(c)
    expect(currentPackage([a])).toBe(a)
    expect(currentPackage([])).toBe(null)
  })
  it('works out a package\'s state on this device\'s calendar, not the server\'s', () => {
    const p = { used: 0, total: 12, start: '2026-10-30', expires: '2026-11-29' }
    expect(localState(p, today)).toBe('active')
    expect(localState(p, new Date(2026, 9, 29, 23))).toBe('upcoming')
    expect(localState({ ...p, used: 12 }, today)).toBe('used-up')
    expect(localState(p, new Date(2026, 10, 30))).toBe('expired')
    expect(onThisCalendar([{ ...p, state: 'upcoming' }], today)[0].state).toBe('active')
  })
  it('says how much is used and left, or how it ended', () => {
    expect(packageLine({ state: 'active', used: 7, total: 12, left: 5, expires: '2026-11-30' }, fmt)).toBe('7 of 12 used · 5 left · expires 11-30')
    expect(packageLine({ state: 'active', used: 0, total: 8, left: 8, expires: null }, fmt)).toBe('0 of 8 used · 8 left')
    expect(packageLine({ state: 'upcoming', total: 12, start: '2026-11-05' }, fmt)).toBe('12 sessions · starts 11-05')
    expect(packageLine({ state: 'used-up', total: 12 }, fmt)).toBe('All 12 sessions used')
    expect(packageLine({ state: 'expired', used: 9, total: 12, expires: '2026-10-01' }, fmt)).toBe('Expired 10-01 · 9 of 12 used')
  })
  it('flags a client whose package runs low, expires soon, just ran out, or has a flagged session', () => {
    expect(ptAlerts(null, today)).toEqual([])
    expect(ptAlerts({ live: 1, left: 5, expires: '2026-12-01', flagged: 0 }, today)).toEqual([])
    expect(ptAlerts({ live: 1, left: 2, expires: null, flagged: 0 }, today).map(a => a.text)).toEqual(['2 sessions left'])
    expect(ptAlerts({ live: 1, left: 9, expires: '2026-11-04', flagged: 1 }, today).map(a => a.text)).toEqual(['1 session flagged', 'expires in 5 days'])
    expect(ptAlerts({ live: 1, left: 9, expires: '2026-10-30', flagged: 0 }, today).map(a => a.text)).toEqual(['expires today'])
    expect(ptAlerts({ live: 0, left: 0, lastSession: '2026-10-25', flagged: 0 }, today).map(a => a.kind)).toEqual(['ended'])
    expect(ptAlerts({ live: 0, left: 0, lastSession: '2026-09-01', flagged: 0 }, today)).toEqual([], 'long finished: not news')
    expect(daysUntil('2026-11-04', today)).toBe(5)
  })
  it('puts a client whose package needs something on top, even when they trained', () => {
    const lines = [
      { name: 'Amit', lastWorkout: '2026-10-29', pt: null },
      { name: 'Zara', lastWorkout: '2026-10-29', pt: { live: 1, left: 1, flagged: 0 } },
    ].map(c => clientLine({ ...c, recent: [] }, today))
    expect(lines[1].attention).toBe(false)
    expect(lines[1].needs).toBe(true)
    expect(sortClients(lines).map(c => c.name)).toEqual(['Zara', 'Amit'])
  })
  it('names a refused PT or check-in call in words', () => {
    const err = code => Object.assign(new Error('server words'), { data: { code } })
    expect(gymError(err('used-up'))).toBe('Every session of the package is used. Add a new package.')
    expect(gymError(err('stale-code'))).toBe('That code has changed. Scan the screen again.')
    expect(gymError(err('something-new'))).toBe('server words')
  })
})

describe('the desk check-in (M3)', () => {
  it('reads the code from the desk link a phone camera opens, or a bare code', () => {
    expect(codeFromScan('https://gym.example/#/gym/checkin?c=ABCDEFGH23')).toBe('ABCDEFGH23')
    expect(codeFromScan(' abcdefgh23 ')).toBe('ABCDEFGH23')
    expect(codeFromScan('https://example.com/some-other-qr')).toBe(null)
    expect(codeFromScan('ABCDEFGHI1')).toBe(null, 'I and 1 are never in a code')
    expect(checkinUrl('ABCDEFGH23', 'https://gym.example/')).toBe('https://gym.example/#/gym/checkin?c=ABCDEFGH23')
    expect(deskKeyFrom('#/desk?k=abc_DEF-123')).toBe('abc_DEF-123')
    expect(deskKeyFrom('#/desk')).toBe(null)
  })
  it('counts visits in this calendar month on this device', () => {
    const v = [new Date(2026, 8, 30, 18).getTime(), new Date(2026, 9, 1, 7).getTime(), new Date(2026, 9, 29, 19).getTime()]
    expect(visitsThisMonth(v, today)).toBe(2)
    expect(visitsThisMonth(undefined, today)).toBe(0)
    expect(clientLine({ lastWorkout: null, recent: [], visits: v }, today).visits).toBe(2)
  })
})
