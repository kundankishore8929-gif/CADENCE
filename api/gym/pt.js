/* PT session packages (M3): the sessions a member bought with a trainer, counted one tap at a time.
 * Pure functions over gym.json's `packages` (store.js keeps the document):
 *
 *   packages: [{ id, member, trainer, total, start, expires, note, addedBy, addedAt,
 *                sessions: [{ id, d, at, by, flag: null | { at, kept: null | { at, by } } }] }]
 *
 * Counts only, no money (SPEC "Not in v1"). A package is the member's: it stays when they change
 * trainer or stop sharing, and whoever trains them now counts against it. A session goes to the
 * oldest package that covers its day and still has sessions left.
 *
 * Who can do what (SPEC, "PT session"):
 *   - the trainer taps "Session done"; the member is told, and can say "this wasn't me" within
 *     48 hours (`flag`), which the trainer and the front desk then see;
 *   - the trainer can undo their own count within 24 hours, for a wrong tap;
 *   - the front desk (an admin) can remove any session, or keep a flagged one (`flag.kept`).
 */
import crypto from 'node:crypto';

export const MAX_TOTAL = 200;
export const UNDO_MS = 24 * 3600e3;
export const FLAG_MS = 48 * 3600e3;
export const NOTE_MAX = 120;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = v => typeof v === 'string' && ISO_DAY.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
export const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => dayOf(Date.parse(d + 'T00:00:00Z') + n * 86400e3);
const newId = prefix => prefix + crypto.randomBytes(6).toString('hex');
const str = (v, max = 80) => typeof v === 'string' && v.length > 0 && v.length <= max;
const ms = iso => Date.parse(iso);

/** A `packages` list read from disk, as far as it is sound. `members` = the ids that may own one. */
export function normalizePackages(list, isMember) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || !str(p.id) || !str(p.member) || !isMember(p.member) || out.some(x => x.id === p.id)) continue;
    if (!Number.isInteger(p.total) || p.total < 1 || p.total > MAX_TOTAL || !isDay(p.start)) continue;
    const sessions = [];
    for (const s of Array.isArray(p.sessions) ? p.sessions : []) {
      if (!s || !str(s.id) || !isDay(s.d) || !str(s.at) || Number.isNaN(ms(s.at)) || sessions.some(x => x.id === s.id)) continue;
      const flag = s.flag && str(s.flag.at) ? { at: s.flag.at, kept: s.flag.kept && str(s.flag.kept.at) ? { at: s.flag.kept.at, by: str(s.flag.kept.by) ? s.flag.kept.by : null } : null } : null;
      sessions.push({ id: s.id, d: s.d, at: s.at, by: str(s.by) ? s.by : null, flag });
    }
    out.push({
      id: p.id, member: p.member, trainer: str(p.trainer) ? p.trainer : null, total: p.total, start: p.start,
      expires: isDay(p.expires) && p.expires >= p.start ? p.expires : null,
      note: str(p.note, NOTE_MAX) ? p.note : '', addedBy: str(p.addedBy) ? p.addedBy : null,
      addedAt: str(p.addedAt) ? p.addedAt : null, sessions: sessions.slice(0, p.total),
    });
  }
  return out;
}

const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : String(a.addedAt) < String(b.addedAt) ? -1 : 1);
export const packagesOf = (g, member) => g.packages.filter(p => p.member === member).sort(byStart);

/** 'active', 'upcoming' (starts later), 'used-up' or 'expired', on `today` ('YYYY-MM-DD'). */
export function stateOf(p, today) {
  if (p.sessions.length >= p.total) return 'used-up';
  if (p.expires && today > p.expires) return 'expired';
  if (p.start > today) return 'upcoming';
  return 'active';
}
const covers = (p, d) => p.start <= d && (!p.expires || d <= p.expires) && p.sessions.length < p.total;

/**
 * A new package for `member`. Refused with 'bad-total' (1 to 200 sessions), 'bad-start' or
 * 'bad-expiry' (a day, not before the start). No start = today; no expiry = never expires.
 */
export function addPackage(g, { member, trainer, total, start, expires, note }, by, now = new Date()) {
  const n = Number(total);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TOTAL) return { error: 'bad-total' };
  const s = start == null || start === '' ? dayOf(now) : start;
  if (!isDay(s)) return { error: 'bad-start' };
  const e = expires == null || expires === '' ? null : expires;
  if (e !== null && (!isDay(e) || e < s)) return { error: 'bad-expiry' };
  const p = {
    id: newId('p'), member, trainer: trainer || null, total: n, start: s, expires: e,
    note: typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '',
    addedBy: by, addedAt: now.toISOString(), sessions: [],
  };
  g.packages.push(p);
  return { package: p };
}

/** A package added by mistake goes again, but only while nothing has been counted on it. */
export function removePackage(g, id) {
  const p = g.packages.find(x => x.id === id);
  if (!p) return { error: 'no-package' };
  if (p.sessions.length) return { error: 'has-sessions' };
  g.packages = g.packages.filter(x => x !== p);
  return { package: p };
}

/**
 * The trainer's "Session done" for `member` on day `d`. Refused with 'bad-day', 'future',
 * 'same-day' (one already counted that day: pass `again` to count a second), 'no-package',
 * 'used-up', 'expired' or 'before-start'.
 */
export function countSession(g, member, d, by, { again = false, now = new Date() } = {}) {
  if (!isDay(d)) return { error: 'bad-day' };
  // A day ahead is the trainer's own calendar east of the server's; more is a mistake.
  if (d > addDays(dayOf(now.getTime()), 1)) return { error: 'future' };
  const mine = packagesOf(g, member);
  if (!again && mine.some(p => p.sessions.some(s => s.d === d))) return { error: 'same-day' };
  const p = mine.find(x => covers(x, d));
  if (!p) {
    const open = mine.filter(x => x.sessions.length < x.total);
    if (!mine.length) return { error: 'no-package' };
    if (!open.length) return { error: 'used-up' };
    return { error: open.every(x => x.expires && d > x.expires) ? 'expired' : 'before-start' };
  }
  const s = { id: newId('s'), d, at: now.toISOString(), by, flag: null };
  p.sessions.push(s);
  p.sessions.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.at < b.at ? -1 : 1));
  return { package: p, session: s };
}

export function findSession(g, id) {
  for (const p of g.packages) {
    const s = p.sessions.find(x => x.id === id);
    if (s) return { package: p, session: s };
  }
  return null;
}

/** Takes a counted session back: the trainer who counted it within 24 hours, an admin any time. */
export function undoSession(g, id, userId, { admin = false, now = new Date() } = {}) {
  const f = findSession(g, id);
  if (!f) return { error: 'no-session' };
  if (!admin) {
    if (f.session.by !== userId) return { error: 'not-yours' };
    if (now.getTime() - ms(f.session.at) > UNDO_MS) return { error: 'too-late' };
  }
  f.package.sessions = f.package.sessions.filter(s => s !== f.session);
  return f;
}

/** The member's "This wasn't me", within 48 hours of the count. Saying it twice changes nothing. */
export function flagSession(g, id, member, now = new Date()) {
  const f = findSession(g, id);
  if (!f || f.package.member !== member) return { error: 'no-session' };
  if (f.session.flag) return f;
  if (now.getTime() - ms(f.session.at) > FLAG_MS) return { error: 'too-late' };
  f.session.flag = { at: now.toISOString(), kept: null };
  return f;
}

/** The front desk checked a flagged session and it stands. */
export function keepSession(g, id, by, now = new Date()) {
  const f = findSession(g, id);
  if (!f) return { error: 'no-session' };
  if (!f.session.flag) return { error: 'not-flagged' };
  f.session.flag.kept = { at: now.toISOString(), by };
  return f;
}

/** One package as a screen shows it, for `viewer` (what they may undo or flag). */
export function packageView(p, { nameOf, viewer, admin = false, now = new Date() }) {
  const t = now.getTime();
  const sessions = [...p.sessions].sort((a, b) => (a.d > b.d ? -1 : a.d < b.d ? 1 : a.at > b.at ? -1 : 1)).map(s => ({
    id: s.id, d: s.d, at: s.at, by: s.by ? { id: s.by, name: nameOf(s.by) } : null,
    flagged: !!s.flag, flaggedAt: s.flag?.at || null, kept: !!s.flag?.kept,
    canUndo: admin || (s.by === viewer && t - ms(s.at) <= UNDO_MS),
    canFlag: viewer === p.member && !s.flag && t - ms(s.at) <= FLAG_MS,
  }));
  return {
    id: p.id, total: p.total, used: p.sessions.length, left: p.total - p.sessions.length,
    start: p.start, expires: p.expires, note: p.note, state: stateOf(p, dayOf(t)),
    trainer: p.trainer ? { id: p.trainer, name: nameOf(p.trainer) } : null,
    addedAt: p.addedAt, sessions,
  };
}

/** A member's packages, oldest first, the last 10 at most. */
export function ptView(g, member, opts) {
  return { packages: packagesOf(g, member).slice(-10).map(p => packageView(p, opts)) };
}

/**
 * The few numbers a client list needs: sessions left on the packages still running, the current
 * package's expiry, flags nobody has looked at, the last session. Null: never had a package.
 */
export function ptSummary(g, member, now = new Date()) {
  const mine = packagesOf(g, member);
  if (!mine.length) return null;
  const today = dayOf(now.getTime());
  const live = mine.filter(p => ['active', 'upcoming'].includes(stateOf(p, today)));
  const current = live.find(p => stateOf(p, today) === 'active') || live[0] || null;
  const all = mine.flatMap(p => p.sessions);
  return {
    live: live.length,
    left: live.reduce((n, p) => n + p.total - p.sessions.length, 0),
    expires: current?.expires || null,
    flagged: all.filter(s => s.flag && !s.flag.kept).length,
    lastSession: all.reduce((m, s) => (s.d > m ? s.d : m), '') || null,
  };
}
