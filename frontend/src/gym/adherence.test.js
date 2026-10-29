// Assigned vs done (adherence.js), and the one thing M2 must never get wrong: a programme the
// server put into a member's plan survives the member's phone syncing a copy from before it.
import { describe, expect, it } from 'vitest'
import { onTarget, compareEntry, compareWorkout, plannedDays, monthStats, listConsistency } from './adherence.js'
import { mergeStates } from '../lib/sync-merge.js'
import { stampPut } from '../../../api/sync-stamps.js'
import { buildProgramme, applyProgramme } from '../../../api/gym/programme.js'

const today = new Date(2026, 9, 30, 18, 0)   // Friday 30 October 2026, evening

describe('one set against its target', () => {
  it('needs the reps (the low end of a range) and the load', () => {
    const t = { sets: 3, reps: 8, repsMin: 6, weight: 60 }
    expect(onTarget({ w: 60, r: 6, done: true }, t)).toBe(true)
    expect(onTarget({ w: 60, r: 5, done: true }, t)).toBe(false)
    expect(onTarget({ w: 57.5, r: 8, done: true }, t)).toBe(false)
    expect(onTarget({ w: 60, r: 8, done: false }, t)).toBe(false)
    expect(onTarget({ w: 60, r: 8, done: true, warmup: true }, t)).toBe(false)
  })
  it('reads bodyweight, timed and per-side sets', () => {
    expect(onTarget({ r: 12, done: true }, { sets: 3, reps: 10 })).toBe(true)
    expect(onTarget({ sec: 45, done: true }, { sets: 2, sec: 45, mode: 'time' })).toBe(true)
    expect(onTarget({ sec: 40, done: true }, { sets: 2, sec: 45, mode: 'time' })).toBe(false)
    expect(onTarget({ sides: { L: { r: 10, w: 12 }, R: { r: 9, w: 12 } }, done: true }, { sets: 3, reps: 10, weight: 12 })).toBe(false)
  })
})

describe('an exercise and a workout against the programme', () => {
  it('counts sets done and sets on target, never more than prescribed', () => {
    const e = { id: '0025', target: { sets: 3, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }, { w: 60, r: 6, done: true }, { w: 60, r: 8, done: true }] }
    expect(compareEntry(e)).toMatchObject({ prescribed: 3, done: 3, hit: 3, status: 'done' })
    expect(compareEntry({ ...e, sets: e.sets.slice(1, 3) })).toMatchObject({ done: 2, hit: 1, status: 'partly' })
    expect(compareEntry(null, { sets: 3, reps: 8 })).toMatchObject({ prescribed: 3, done: 0, hit: 0, status: 'missed' })
  })

  it('lists what the routine asked for, then what was swapped in', () => {
    const programme = { routines: [{ id: 'g1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }, { id: '0662', sets: 2, reps: 15 }] }] }
    const w = { d: '2026-10-29', routineIds: ['g1'], entries: [
      { id: '0025', target: { sets: 3, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }, { w: 60, r: 7, done: true }] },
      { id: '0198', target: { sets: 2, reps: 12 }, sets: [{ w: 30, r: 12, done: true }] },
    ] }
    const c = compareWorkout(w, programme)
    expect(c.rows.map(r => [r.id, r.status])).toEqual([['0025', 'partly'], ['0662', 'missed'], ['0198', 'swapped']])
    expect([c.prescribed, c.done, c.hit]).toEqual([5, 3, 2])
    expect(compareWorkout({ ...w, routineIds: ['mine'] }, programme)).toBe(null)
  })
})

describe('a client’s month', () => {
  const programme = { start: '2026-10-12', week: { 1: ['g1'], 3: ['g2'], 5: ['g1'] }, routines: [{ id: 'g1', ex: [{ id: '0025', sets: 2, reps: 8 }] }, { id: 'g2', ex: [] }] }
  const w = (d, rid = 'g1', r = 8) => ({ d, routineIds: [rid], entries: [{ id: '0025', target: { sets: 2, reps: 8 }, sets: [{ r, done: true }, { r, done: true }] }] })

  it('plans the programme’s weekdays from its start', () => {
    expect(plannedDays(programme, '2026-10-01', '2026-10-23')).toEqual(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23'])
  })

  it('counts done against planned, lists missed days, and leaves today alone until it is over', () => {
    // Planned 12 Oct → 30 Oct: 12, 14, 16, 19, 21, 23, 26, 28, 30 (today, not done yet: not counted).
    const workouts = [w('2026-10-12'), w('2026-10-16', 'g1', 6), w('2026-10-19'), w('2026-10-21', 'g2'), w('2026-10-24'), w('2026-10-26'), w('2026-10-28')]
    const m = monthStats(workouts, programme, today)
    expect(m.from).toBe('2026-10-12')
    expect(m.planned).toBe(8)
    expect(m.done).toBe(7)
    expect(m.consistency).toBe(88)
    expect(m.missed).toEqual(['2026-10-14', '2026-10-23'])
    // Programme sets: g1 workouts on 12, 16, 19, 24, 26, 28 → 12 prescribed, all done, 10 on target (16th fell short).
    expect([m.prescribed, m.setsDone, m.hit]).toEqual([12, 12, 10])
    expect(m.setCompletion).toBe(100)
    expect(m.targetHit).toBe(83)
  })

  it('caps consistency at 100 % and shows the extra sessions', () => {
    const m = monthStats(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map(d => w(d)), { ...programme, start: '2026-10-26' }, today)
    expect([m.planned, m.done, m.consistency, m.extra]).toEqual([2, 4, 100, 2])
  })

  it('has no figure without a programme, and the list reads the same month', () => {
    expect(listConsistency({ recent: ['2026-10-26'] }, today)).toBe(null)
    expect(listConsistency({ recent: ['2026-10-12', '2026-10-19'], programme: { start: '2026-10-12', days: ['1'] } }, today)).toBe(67)
  })
})

describe('a programme and a phone that synced before it', () => {
  it('the phone’s merge keeps the trainer’s routines and days, and its own new workout', () => {
    const t0 = Date.parse('2026-10-28T10:00:00Z')
    const base = {
      _rev: 5, unit: 'kg', routines: [{ id: 'own', name: 'My cardio', ex: [], _ts: t0 - 9000 }], week: { 2: ['own'] },
      workouts: [], edited: { week: { 2: t0 - 9000 } }, deleted: {},
    }
    // The phone logs a workout while offline, on the copy it read.
    const phone = structuredClone(base)
    phone.workouts.push({ id: 'w-new', d: '2026-10-28', start: t0, end: t0 + 3600000, entries: [{ id: '0025', sets: [{ w: 40, r: 10, done: true }] }], _ts: t0 + 3600000 })
    // Meanwhile the server writes the programme the way writeStateFor does (api/server.js).
    const trainerS = { routines: [{ id: 'tr-push', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }] }] }
    const prog = buildProgramme(trainerS, { id: 'u_aman', name: 'Aman' }, ['tr-push'], { 1: ['tr-push'], 4: ['tr-push'] })
    const server = structuredClone(base)
    applyProgramme(server, 'u_aman', prog)
    stampPut(base, server, { overRead: true, stamped: false, now: t0 + 7200000 })
    server._rev = 6

    const merged = mergeStates(phone, server)
    const push = merged.routines.find(r => r.assignedBy === 'u_aman')
    expect(push?.name).toBe('Push')
    expect(merged.routines.some(r => r.id === 'own')).toBe(true)
    expect(Object.keys(merged.week).sort()).toEqual(['1', '4'])
    expect(merged.workouts.map(w => w.id)).toEqual(['w-new'])
  })
})
