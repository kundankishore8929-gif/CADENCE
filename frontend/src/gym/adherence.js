// CADENCE M2: assigned vs done. Pure functions over a client's workouts and the programme the
// trainer assigned (api/gym/programme.js snapshot). The numbers follow SPEC.md "Numbers, defined
// once"; each screen shows the formula under the number.
//
// What was asked is read from each logged exercise's own `target`: openGym saves, with every
// exercise of a finished workout, the sets, reps and weight the app gave that day (after
// progression). The trainer's snapshot of the routine stands in only where a workout has none.

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const atNoon = s => new Date(s + 'T12:00:00')

/** A set that counts: logged as done, not a warm-up. */
export const doneSet = s => !!s && typeof s === 'object' && s.done !== false && !s.warmup

const repsOf = s => Number.isFinite(Number(s.r)) ? Number(s.r)
  : s.sides ? Math.min(Number(s.sides.L?.r) || 0, Number(s.sides.R?.r) || 0) : 0
const weightOf = s => Number.isFinite(Number(s.w)) ? Number(s.w)
  : s.sides ? Math.min(Number(s.sides.L?.w) || 0, Number(s.sides.R?.w) || 0) : 0

/** Whether one logged set met the target: time for a timed exercise, else reps (and the load, if one was set). */
export function onTarget(set, target) {
  if (!doneSet(set) || !target) return false
  if (target.mode === 'time' || (Number(target.sec) > 0 && !(Number(target.reps) > 0))) return (Number(set.sec) || 0) >= Number(target.sec || 0)
  const reps = Number(target.repsMin ?? target.reps) || 0
  if (repsOf(set) < reps) return false
  const w = Number(target.weight) || 0
  return w > 0 ? weightOf(set) >= w - 1e-9 : true
}

/** One prescribed exercise against what was logged: `{ prescribed, done, hit, status }`. */
export function compareEntry(entry, fallbackTarget) {
  const target = entry?.target || fallbackTarget || null
  const prescribed = Number(target?.sets) || 0
  const sets = (Array.isArray(entry?.sets) ? entry.sets : []).filter(doneSet)
  const done = prescribed ? Math.min(sets.length, prescribed) : sets.length
  const hit = Math.min(sets.filter(s => onTarget(s, target)).length, prescribed || Infinity)
  const status = !entry || !sets.length ? 'missed' : prescribed && hit >= prescribed ? 'done' : 'partly'
  return { target, prescribed, done, hit, status }
}

/** The snapshot routines a logged workout was built from, if it came from the programme. */
export function programmeRoutinesOf(w, programme) {
  const ids = new Set([].concat(w?.routineIds || []).concat(w?.routineId ? [w.routineId] : []))
  return (programme?.routines || []).filter(r => ids.has(r.id))
}

/**
 * A programme workout, exercise by exercise: every exercise the routine asked for (done, partly,
 * missed), then whatever was done in their place or on top ('swapped' — a machine was taken, or
 * an exercise added).
 */
export function compareWorkout(w, programme) {
  const routines = programmeRoutinesOf(w, programme)
  if (!routines.length) return null
  const entries = (Array.isArray(w.entries) ? w.entries : []).filter(e => e && Array.isArray(e.sets))
  const used = new Set()
  const rows = []
  for (const ex of routines.flatMap(r => r.ex || [])) {
    const i = entries.findIndex((e, k) => !used.has(k) && String(e.id) === String(ex.id))
    if (i >= 0) used.add(i)
    rows.push({ id: ex.id, ...compareEntry(i >= 0 ? entries[i] : null, ex) })
  }
  entries.forEach((e, k) => {
    if (used.has(k)) return
    const c = compareEntry(e, null)
    rows.push({ id: e.id, ...c, prescribed: 0, status: 'swapped' })
  })
  const asked = rows.filter(r => r.status !== 'swapped')
  return {
    rows,
    prescribed: asked.reduce((n, r) => n + r.prescribed, 0),
    done: asked.reduce((n, r) => n + r.done, 0),
    hit: asked.reduce((n, r) => n + r.hit, 0),
  }
}

/** The days a workout with at least one done set was logged. */
export function trainedDays(workouts) {
  return new Set((workouts || []).filter(w => w && typeof w.d === 'string' && (w.entries || []).some(e => (e?.sets || []).some(doneSet))).map(w => w.d))
}

/** Every day from `from` to `to` (inclusive) whose weekday has a routine in the programme, from its start. */
export function plannedDays(programme, from, to) {
  if (!programme?.week) return []
  const days = new Set(Object.keys(programme.week).filter(d => [].concat(programme.week[d] || []).length))
  const start = programme.start && programme.start > from ? programme.start : from
  const out = []
  for (let d = atNoon(start); iso(d) <= to; d.setDate(d.getDate() + 1)) if (days.has(String(d.getDay()))) out.push(iso(d))
  return out
}

/**
 * A client's month against their programme: the calendar month so far, from the programme's start.
 *   consistency = sessions done ÷ sessions planned (at most 100 %, the rest shown as extra)
 *   setCompletion = prescribed sets done ÷ prescribed sets
 *   targetHit = prescribed sets done at or above the target ÷ prescribed sets
 * A planned day still to come today is not counted against them until it is over.
 */
export function monthStats(workouts, programme, today = new Date()) {
  const to = iso(today)
  const monthStart = to.slice(0, 8) + '01'
  const from = programme?.start && programme.start > monthStart ? programme.start : monthStart
  const trained = trainedDays(workouts)
  const planned = plannedDays(programme, from, to).filter(d => d < to || trained.has(d))
  const done = [...trained].filter(d => d >= from && d <= to).length
  const missed = planned.filter(d => d < to && !trained.has(d))
  let prescribed = 0, setsDone = 0, hit = 0
  for (const w of workouts || []) {
    if (!w || typeof w.d !== 'string' || w.d < from || w.d > to) continue
    const c = compareWorkout(w, programme)
    if (!c) continue
    prescribed += c.prescribed; setsDone += c.done; hit += c.hit
  }
  const pct = (a, b) => (b ? Math.round((Math.min(a, b) / b) * 100) : null)
  return {
    from, to,
    planned: planned.length, done, extra: Math.max(0, done - planned.length), missed,
    consistency: pct(done, planned.length),
    prescribed, setsDone, hit,
    setCompletion: pct(setsDone, prescribed),
    targetHit: pct(hit, prescribed),
  }
}

/** The client list's figure: this month's consistency from the dates it already has. */
export function listConsistency(client, today = new Date()) {
  if (!client?.programme) return null
  const week = Object.fromEntries((client.programme.days || []).map(d => [d, ['x']]))
  const workouts = (client.recent || []).map(d => ({ d, entries: [{ sets: [{ done: true }] }] }))
  return monthStats(workouts, { start: client.programme.start, week, routines: [] }, today).consistency
}
