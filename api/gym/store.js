/* CADENCE's gym layer: who is a trainer, and which members share their training with which
 * trainer. Pure functions over one small document, kept in DATA_DIR/gym.json by routes.js.
 *
 *   { v: 1,
 *     trainers: [{ id, code, since }],             // id = the user's id; code = what members type
 *     links:    [{ member, trainer, since }],      // since = when the member said yes (consent)
 *     programmes: [{ member, trainer, start, assignedAt, week, routines }],   // M2, one per member
 *     packages: [{ id, member, trainer, total, start, expires, … sessions }],  // M3, pt.js
 *     desk: null | { key, secret, createdAt, by },                            // M3, desk.js
 *     phones: { [memberId]: '+919876543210' },                                // M4, admins only
 *     pastLinks: [{ member, trainer, since, ended }] }                        // M4, for retention
 *
 * A member shares with one trainer at a time. Only the member creates a link (by typing the
 * trainer's code and agreeing); the member or the trainer can end it, and ending a trainer's
 * role ends every link to them. Nothing here touches a member's own training data.
 *
 * A programme is what the trainer assigned (programme.js puts the routines into the member's own
 * plan): the start day, the weekdays and a snapshot of each routine's exercises and targets, so
 * the trainer can tell later what was asked even if the member's copy changes.
 */

import { normalizePackages } from './pt.js';
import { normalizeDesk } from './desk.js';

export const CODE_RE = /^[A-Z]{1,8}\d{2,3}$/;
/** A phone number as stored: an optional + and 8 to 15 digits, nothing else. */
export const PHONE_RE = /^\+?\d{8,15}$/;

export function emptyGym() {
  return { v: 1, trainers: [], links: [], programmes: [], packages: [], desk: null, phones: {}, pastLinks: [] };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  for (const p of Array.isArray(doc.programmes) ? doc.programmes : []) {
    if (p && g.links.some(l => l.member === p.member && l.trainer === p.trainer) && !g.programmes.some(x => x.member === p.member)
      && typeof p.start === 'string' && ISO_DAY.test(p.start) && p.week && typeof p.week === 'object' && Array.isArray(p.routines)) {
      g.programmes.push({ member: p.member, trainer: p.trainer, start: p.start, assignedAt: str(p.assignedAt) ? p.assignedAt : null, week: p.week, routines: p.routines });
    }
  }
  // A member's PT packages outlive the sharing: they are the member's, not the link's.
  g.packages = normalizePackages(doc.packages, str);
  g.desk = normalizeDesk(doc.desk);
  for (const [id, ph] of Object.entries(doc.phones && typeof doc.phones === 'object' ? doc.phones : {})) {
    if (str(id) && typeof ph === 'string' && PHONE_RE.test(ph)) g.phones[id] = ph;
  }
  for (const l of Array.isArray(doc.pastLinks) ? doc.pastLinks : []) {
    if (l && str(l.member) && str(l.trainer) && str(l.since) && str(l.ended)) g.pastLinks.push({ member: l.member, trainer: l.trainer, since: l.since, ended: l.ended });
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
export const programmeOf = (g, memberId) => g.programmes.find(p => p.member === memberId) || null;

/** Records the programme a trainer assigned to a linked client, replacing the one before. */
export function setProgramme(g, rec) {
  g.programmes = g.programmes.filter(p => p.member !== rec.member);
  g.programmes.push(rec);
  return rec;
}

/** Forgets a member's programme. Returns the record that went, or null. */
export function dropProgramme(g, memberId) {
  const had = programmeOf(g, memberId);
  if (had) g.programmes = g.programmes.filter(p => p !== had);
  return had;
}
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

/**
 * Remembers a sharing that ended, for the owner's client retention (M4). A year of them is kept,
 * at most 5,000.
 */
const PAST_KEEP_MS = 400 * 86400e3;
function endLinks(g, ended, now = new Date()) {
  const at = now.toISOString(), cutoff = now.getTime() - PAST_KEEP_MS;
  g.pastLinks = [...g.pastLinks, ...ended.map(l => ({ member: l.member, trainer: l.trainer, since: l.since || at, ended: at }))]
    .filter(l => Date.parse(l.ended) >= cutoff).slice(-5000);
}

/** Takes the role away, and with it every member's link to them. Returns how many links ended. */
export function dropTrainer(g, userId, now = new Date()) {
  const before = g.links.length;
  endLinks(g, g.links.filter(l => l.trainer === userId), now);
  g.trainers = g.trainers.filter(t => t.id !== userId);
  g.links = g.links.filter(l => l.trainer !== userId);
  g.programmes = g.programmes.filter(p => p.trainer !== userId);
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
export function unlink(g, memberId, now = new Date()) {
  const had = linkOf(g, memberId);
  if (had) { endLinks(g, [had], now); g.links = g.links.filter(l => l !== had); dropProgramme(g, memberId); }
  return had;
}

/** The trainer lets a client go. True when that member was theirs. */
export function removeClient(g, trainerId, memberId, now = new Date()) {
  const had = g.links.find(l => l.trainer === trainerId && l.member === memberId);
  if (had) { endLinks(g, [had], now); g.links = g.links.filter(l => l !== had); dropProgramme(g, memberId); }
  return !!had;
}

/** Drops trainers and links whose accounts no longer exist. True when anything changed. */
export function prune(g, userIds) {
  const live = new Set(userIds);
  const t0 = g.trainers.length, l0 = g.links.length, p0 = g.programmes.length, k0 = g.packages.length;
  const n0 = Object.keys(g.phones).length, x0 = g.pastLinks.length;
  g.trainers = g.trainers.filter(t => live.has(t.id));
  g.links = g.links.filter(l => live.has(l.member) && live.has(l.trainer) && g.trainers.some(t => t.id === l.trainer));
  g.programmes = g.programmes.filter(p => g.links.some(l => l.member === p.member && l.trainer === p.trainer));
  g.packages = g.packages.filter(p => live.has(p.member));
  for (const id of Object.keys(g.phones)) if (!live.has(id)) delete g.phones[id];
  g.pastLinks = g.pastLinks.filter(l => live.has(l.member) && live.has(l.trainer));
  return g.trainers.length !== t0 || g.links.length !== l0 || g.programmes.length !== p0 || g.packages.length !== k0
    || Object.keys(g.phones).length !== n0 || g.pastLinks.length !== x0;
}
