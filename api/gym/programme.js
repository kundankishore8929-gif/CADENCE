/* CADENCE M2: a trainer's programme in a member's own openGym plan. Pure functions over a state
 * document (the member's `S`), applied by routes.js through the server's state writer, which
 * stamps the change so the member's devices merge it in like any other edit.
 *
 * The programme is ordinary openGym routines (copied from the trainer's own Plan, new ids),
 * marked `assignedBy` (the trainer's id) and `assignedByName`, plus the weekly days. The
 * workout screen, progression, records and the watch then work on it unchanged; the app only
 * reads the mark to show "From Aman" and to keep the member out of the editor.
 */

export const WEEK_DAYS = ['0', '1', '2', '3', '4', '5', '6'];   // S.week keys: 0 = Sunday
const MAX_ROUTINES = 14;

// What a routine copy and the trainer's snapshot of it never carry: sync bookkeeping. The copy
// gets fresh stamps from the server's writer.
const stripStamps = o => {
  const { _ts, _f, ...rest } = o;
  return rest;
};
const clone = v => JSON.parse(JSON.stringify(v));

export function newRoutineId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** The trainer's routine as it goes into the member's plan: same exercises and settings, new id. */
export function copyForMember(routine, trainer, now = new Date(), id = newRoutineId()) {
  const r = stripStamps(clone(routine));
  r.ex = (Array.isArray(r.ex) ? r.ex : []).filter(e => e && typeof e === 'object' && e.id != null).map(stripStamps);
  return { ...r, id, assignedBy: trainer.id, assignedByName: String(trainer.name || ''), assignedAt: now.toISOString() };
}

/**
 * What the trainer keeps of a routine they assigned (gym.json), to tell later what was asked:
 * the exercises and their targets. The member's own copy may change on their phone; this does not.
 */
export function snapshot(routine) {
  const KEEP = ['id', 'sets', 'reps', 'repsMin', 'repsMax', 'weight', 'sec', 'mode', 'bodyweight', 'side', 'sg'];
  return {
    id: routine.id, name: String(routine.name || ''), emoji: routine.emoji || null,
    ex: (routine.ex || []).map(e => Object.fromEntries(KEEP.filter(k => e[k] !== undefined).map(k => [k, e[k]]))),
  };
}

/**
 * The trainer's choice of days, made safe: weekday → routine ids, only routines being assigned,
 * each day at most once per routine, empty days left out.
 */
export function cleanWeek(days, ids) {
  const allowed = new Set(ids);
  const week = {};
  for (const d of WEEK_DAYS) {
    const v = days && typeof days === 'object' ? days[d] : null;
    const list = [...new Set([].concat(v || []).filter(id => allowed.has(id)))];
    if (list.length) week[d] = list;
  }
  return week;
}

/**
 * Builds the programme from the trainer's own routines. `picked` are their routine ids in order,
 * `days` maps a weekday to some of those ids. Refused with a word: 'no-routines', 'too-many',
 * 'unknown-routine', 'no-days'.
 */
export function buildProgramme(trainerState, trainer, picked, days, now = new Date()) {
  const ids = [...new Set(Array.isArray(picked) ? picked.map(String) : [])];
  if (!ids.length) return { error: 'no-routines' };
  if (ids.length > MAX_ROUTINES) return { error: 'too-many' };
  const own = Array.isArray(trainerState?.routines) ? trainerState.routines.filter(r => r && typeof r === 'object') : [];
  const chosen = ids.map(id => own.find(r => String(r.id) === id));
  if (chosen.some(r => !r)) return { error: 'unknown-routine' };
  // The trainer's days name their own routine ids; the member's plan gets the copies' ids.
  const byDay = {};
  for (const d of WEEK_DAYS) byDay[d] = [].concat(days?.[d] || []).map(String);
  const copies = chosen.map(r => copyForMember(r, trainer, now));
  const idMap = Object.fromEntries(chosen.map((r, i) => [String(r.id), copies[i].id]));
  const week = cleanWeek(Object.fromEntries(WEEK_DAYS.map(d => [d, byDay[d].map(id => idMap[id]).filter(Boolean)])), copies.map(c => c.id));
  if (!Object.keys(week).length) return { error: 'no-days' };
  // The trainer's own exercises the routines use, so the member's app can name them. By name and
  // muscles only: their pictures live in the trainer's own media store.
  const used = new Set(copies.flatMap(c => c.ex.map(e => String(e.id))));
  const customEx = (Array.isArray(trainerState?.customEx) ? trainerState.customEx : [])
    .filter(c => c && used.has(String(c.id)))
    .map(c => { const { media, url, ...rest } = stripStamps(clone(c)); return { ...rest, assignedBy: trainer.id }; });
  return { routines: copies, week, customEx, snapshots: copies.map(snapshot) };
}

/** Puts a programme into the member's state, replacing the trainer's previous one and the weekly plan. */
export function applyProgramme(S, trainerId, prog) {
  removeProgramme(S, trainerId);
  S.routines = [...(Array.isArray(S.routines) ? S.routines : []), ...prog.routines];
  const have = new Set((Array.isArray(S.customEx) ? S.customEx : []).map(c => String(c?.id)));
  const extra = prog.customEx.filter(c => !have.has(String(c.id)));
  if (extra.length) S.customEx = [...(Array.isArray(S.customEx) ? S.customEx : []), ...extra];
  // The trainer's days are the member's week now (SPEC M2, decision 3). The member's own routines
  // stay in their plan, just not on a weekday; a rotation gives way to the weekly plan.
  S.week = S.week && typeof S.week === 'object' ? S.week : {};
  for (const d of WEEK_DAYS) delete S.week[d];
  Object.assign(S.week, clone(prog.week));
  S.scheduleMode = 'week';
  S.queue = null;
}

/** Takes the trainer's programme out of the member's plan: its routines, their days and reschedules. */
export function removeProgramme(S, trainerId) {
  const gone = new Set((Array.isArray(S.routines) ? S.routines : []).filter(r => r && r.assignedBy === trainerId).map(r => r.id));
  if (!gone.size) return false;
  S.routines = S.routines.filter(r => !(r && gone.has(r.id)));
  // The same clean-up as openGym's own routine delete (frontend lib/routines.js deleteRoutine).
  for (const d of Object.keys(S.week || {})) {
    const ids = [].concat(S.week[d]).filter(id => !gone.has(id));
    if (ids.length) S.week[d] = ids; else delete S.week[d];
  }
  for (const iso of Object.keys(S.dayPlan || {})) if (gone.has(S.dayPlan[iso])) delete S.dayPlan[iso];
  // The trainer's own exercises came with the programme and go with it.
  if (Array.isArray(S.customEx)) S.customEx = S.customEx.filter(c => !(c && c.assignedBy === trainerId));
  return true;
}

/**
 * The member stops sharing (or the trainer lets them go): the routines and days stay, now the
 * member's own and editable. Returns how many routines were released.
 *
 * The marks are set to null, not deleted: the server writes like an app that does not stamp its
 * own changes, and for such a writer openGym's sync puts back any key it left out (an older app
 * never knew it, api/sync-stamps.js keepUnknown). A null is a change it stamps and keeps.
 */
export function releaseProgramme(S, trainerId) {
  let n = 0;
  for (const r of Array.isArray(S.routines) ? S.routines : []) {
    if (r && r.assignedBy === trainerId) { r.assignedBy = null; r.assignedByName = null; n++; }
  }
  for (const c of Array.isArray(S.customEx) ? S.customEx : []) if (c && c.assignedBy === trainerId) c.assignedBy = null;
  return n;
}
