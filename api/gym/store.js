/* CADENCE's gym layer: who is a trainer, and which members share their training with which
 * trainer. Pure functions over one small document, kept in DATA_DIR/gym.json by routes.js.
 *
 *   { v: 1,
 *     trainers: [{ id, code, since }],             // id = the user's id; code = what members type
 *     links:    [{ member, trainer, since }] }     // since = when the member said yes (consent)
 *
 * A member shares with one trainer at a time. Only the member creates a link (by typing the
 * trainer's code and agreeing); the member or the trainer can end it, and ending a trainer's
 * role ends every link to them. Nothing here touches a member's own training data.
 */

export const CODE_RE = /^[A-Z]{1,8}\d{2,3}$/;

export function emptyGym() {
  return { v: 1, trainers: [], links: [] };
}

/** A document read from disk made safe to use: anything that is not the shape above is dropped. */
export function normalize(doc) {
  const g = emptyGym();
  if (!doc || typeof doc !== 'object') return g;
  const str = v => typeof v === 'string' && v.length > 0 && v.length <= 80;
  for (const t of Array.isArray(doc.trainers) ? doc.trainers : []) {
    if (t && str(t.id) && typeof t.code === 'string' && CODE_RE.test(t.code) && !g.trainers.some(x => x.id === t.id || x.code === t.code)) {
      g.trainers.push({ id: t.id, code: t.code, since: str(t.since) ? t.since : null });
    }
  }
  for (const l of Array.isArray(doc.links) ? doc.links : []) {
    if (l && str(l.member) && str(l.trainer) && l.member !== l.trainer
      && g.trainers.some(t => t.id === l.trainer) && !g.links.some(x => x.member === l.member)) {
      g.links.push({ member: l.member, trainer: l.trainer, since: str(l.since) ? l.since : null });
    }
  }
  return g;
}

/**
 * The code a trainer hands out: the first name in capitals plus a number, "AMAN01". Latin letters
 * only, so it can be typed on any keyboard; a name without any becomes "TRAINER01".
 */
export function codeFor(name, taken) {
  const first = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/)[0] || '';
  const base = (first.toUpperCase().replace(/[^A-Z]/g, '') || 'TRAINER').slice(0, 8);
  const used = new Set(taken);
  for (let n = 1; n < 1000; n++) {
    const code = base + String(n).padStart(2, '0');
    if (!used.has(code)) return code;
  }
  throw new Error('no free trainer code for ' + base);
}

export const trainerOf = (g, userId) => g.trainers.find(t => t.id === userId) || null;
export const trainerByCode = (g, code) => g.trainers.find(t => t.code === cleanCode(code)) || null;
export const linkOf = (g, memberId) => g.links.find(l => l.member === memberId) || null;
export const clientsOf = (g, trainerId) => g.links.filter(l => l.trainer === trainerId);

/** What a member typed, as a code: capitals, no spaces. */
export function cleanCode(code) {
  return typeof code === 'string' ? code.replace(/\s+/g, '').toUpperCase().slice(0, 12) : '';
}

/** Gives `user` the trainer role. Already a trainer: the same record back, code unchanged. */
export function makeTrainer(g, user, now = new Date()) {
  const had = trainerOf(g, user.id);
  if (had) return had;
  const t = { id: user.id, code: codeFor(user.name, g.trainers.map(x => x.code)), since: now.toISOString() };
  g.trainers.push(t);
  return t;
}

/** Takes the role away, and with it every member's link to them. Returns how many links ended. */
export function dropTrainer(g, userId) {
  const before = g.links.length;
  g.trainers = g.trainers.filter(t => t.id !== userId);
  g.links = g.links.filter(l => l.trainer !== userId);
  return before - g.links.length;
}

/**
 * A member starts sharing with the trainer whose code they typed. Refused, with the reason as a
 * word the app turns into a sentence: 'no-such-code', 'self' (a trainer's own code) or
 * 'already-linked' (one trainer at a time: stop sharing first).
 */
export function link(g, memberId, code, now = new Date()) {
  const t = trainerByCode(g, code);
  if (!t) return { error: 'no-such-code' };
  if (t.id === memberId) return { error: 'self' };
  const had = linkOf(g, memberId);
  if (had) return had.trainer === t.id ? { link: had, trainer: t } : { error: 'already-linked' };
  const l = { member: memberId, trainer: t.id, since: now.toISOString() };
  g.links.push(l);
  return { link: l, trainer: t };
}

/** The member stops sharing. Returns the link that ended, or null if there was none. */
export function unlink(g, memberId) {
  const had = linkOf(g, memberId);
  if (had) g.links = g.links.filter(l => l !== had);
  return had;
}

/** The trainer lets a client go. True when that member was theirs. */
export function removeClient(g, trainerId, memberId) {
  const had = g.links.find(l => l.trainer === trainerId && l.member === memberId);
  if (had) g.links = g.links.filter(l => l !== had);
  return !!had;
}

/** Drops trainers and links whose accounts no longer exist. True when anything changed. */
export function prune(g, userIds) {
  const live = new Set(userIds);
  const t0 = g.trainers.length, l0 = g.links.length;
  g.trainers = g.trainers.filter(t => live.has(t.id));
  g.links = g.links.filter(l => live.has(l.member) && live.has(l.trainer) && g.trainers.some(t => t.id === l.trainer));
  return g.trainers.length !== t0 || g.links.length !== l0;
}
