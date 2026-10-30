/* A client's lifts, for the trainer's alerts (M5): a new personal record this week, and a lift
 * that stalled. Each session of an exercise is scored by its best set's estimated one-rep max
 * (Epley: weight × (1 + reps ÷ 30)), over the sets done that are not warm-ups and carry weight.
 *
 *   PR:    the latest session, in the last 7 days, beat every earlier one (2 earlier at least).
 *   Stall: the last 3 sessions all stayed at or under the best before them (4 sessions at least),
 *          and the last one was in the last 21 days: they still do it, and it stopped moving.
 *          `since` is the day of that best: no progress since then.
 */
const DAY = 86400e3;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

function sessionsByExercise(workouts) {
  const by = new Map();
  for (const w of workouts) {
    if (typeof w?.d !== 'string' || !Array.isArray(w.entries)) continue;
    for (const e of w.entries) {
      if (e?.id == null || !Array.isArray(e.sets)) continue;
      let best = null;
      for (const s of e.sets) {
        if (!s || s.done === false || s.warmup) continue;
        const wt = Number(s.w), r = Number(s.r);
        if (!(wt > 0 && r > 0)) continue;
        const e1 = wt * (1 + r / 30);
        if (!best || e1 > best.e1) best = { e1, w: wt, r };
      }
      if (!best) continue;
      const id = String(e.id);
      const list = by.get(id) || [];
      const same = list.find(x => x.d === w.d);
      if (same) { if (best.e1 > same.e1) Object.assign(same, best); } else list.push({ d: w.d, ...best });
      by.set(id, list);
    }
  }
  for (const list of by.values()) list.sort((a, b) => (a.d < b.d ? -1 : 1));
  return by;
}

/** { prs: [{ id, d, w, r }], stalls: [{ id, since, best }] }, the newest first, 3 of each at most. */
export function liftAlerts(workouts, now = Date.now()) {
  const week = isoDay(now - 7 * DAY), recent = isoDay(now - 21 * DAY);
  const prs = [], stalls = [];
  for (const [id, s] of sessionsByExercise(Array.isArray(workouts) ? workouts : [])) {
    const last = s[s.length - 1];
    if (s.length >= 3 && last.d >= week && last.e1 > Math.max(...s.slice(0, -1).map(x => x.e1))) prs.push({ id, d: last.d, w: last.w, r: last.r });
    if (s.length >= 4 && last.d >= recent) {
      const before = Math.max(...s.slice(0, -3).map(x => x.e1));
      if (s.slice(-3).every(x => x.e1 <= before)) {
        const top = s.slice(0, -3).reduce((a, x) => (x.e1 > a.e1 ? x : a));
        stalls.push({ id, since: top.d, best: { w: top.w, r: top.r } });
      }
    }
  }
  const newest = (a, b) => ((a.d || a.since) < (b.d || b.since) ? 1 : -1);
  return { prs: prs.sort(newest).slice(0, 3), stalls: stalls.sort(newest).slice(0, 3) };
}
