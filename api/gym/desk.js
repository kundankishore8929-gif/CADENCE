/* The front-desk QR screen and check-ins (M3).
 *
 * The desk screen is a tablet at reception, signed in to nobody. An admin makes a desk link:
 * gym.json's `desk: { key, secret, createdAt, by }`. The key in that link is the screen's only
 * credential, and all it can do is fetch the current code and today's count, so a tablet left
 * on a counter never holds an admin account. Making a new link (or turning it off) ends the old.
 *
 * The code on the screen is an HMAC of the desk secret and the 30-second window it belongs to,
 * so it changes every 30 seconds and the server needs to store none of them. A scan is accepted
 * for the window shown and the one before it: a code is good for 30 to 60 seconds, so a photo
 * of the screen sent home stops working within a minute.
 *
 * Check-ins live in one file per month, DATA_DIR/gym-checkins-YYYY-MM.json, `[{ m, at }]`
 * (member id, epoch ms), written temp-then-rename like every other file the API keeps. A member
 * counts once per 3 hours: scanning twice at the door is one visit.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const WINDOW_MS = 30000;
export const REPEAT_MS = 3 * 3600e3;
// Letters and digits that are never mistaken for each other when read out (no I, O, 0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

export function newDesk(by, now = new Date()) {
  return { key: crypto.randomBytes(18).toString('base64url'), secret: crypto.randomBytes(32).toString('hex'), createdAt: now.toISOString(), by };
}

/** A desk record read from disk, or null. */
export function normalizeDesk(d) {
  if (!d || typeof d.key !== 'string' || d.key.length < 20 || typeof d.secret !== 'string' || !/^[0-9a-f]{64}$/.test(d.secret)) return null;
  return { key: d.key, secret: d.secret, createdAt: typeof d.createdAt === 'string' ? d.createdAt : null, by: typeof d.by === 'string' ? d.by : null };
}

const digest = s => crypto.createHash('sha256').update(String(s)).digest();
/** Whether `key` is this desk's key, in constant time. */
export const keyMatches = (desk, key) => !!desk && typeof key === 'string' && crypto.timingSafeEqual(digest(desk.key), digest(key));

/** The code for window `w` (epoch ms ÷ 30 s). */
export function codeAt(secret, w) {
  const h = crypto.createHmac('sha256', secret).update('checkin:' + w).digest();
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[h[i] & 31];
  return s;
}

/** What the desk screen shows now, and how long until it changes. */
export function currentCode(desk, now = Date.now()) {
  const w = Math.floor(now / WINDOW_MS);
  return { code: codeAt(desk.secret, w), msLeft: (w + 1) * WINDOW_MS - now, windowMs: WINDOW_MS };
}

/** Whether a scanned code is the one on the screen now or the one just before it. */
export function codeValid(desk, code, now = Date.now()) {
  if (!desk || typeof code !== 'string') return false;
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return false;
  const w = Math.floor(now / WINDOW_MS);
  return [w, w - 1].some(x => crypto.timingSafeEqual(Buffer.from(codeAt(desk.secret, x)), Buffer.from(c)));
}

const monthOf = t => new Date(t).toISOString().slice(0, 7);
function monthsBetween(from, to) {
  const out = [];
  const d = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1));
  while (d.getTime() <= to && out.length < 4) { out.push(monthOf(d.getTime())); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}

/** The check-in files. Reads are cached per month; only the current months are ever asked for. */
export function checkinLog({ dataDir, atomicWrite }) {
  const cache = new Map();
  const fileOf = m => path.join(dataDir, `gym-checkins-${m}.json`);
  const read = m => {
    if (!cache.has(m)) {
      let list = [];
      try {
        const raw = JSON.parse(fs.readFileSync(fileOf(m), 'utf8'));
        if (Array.isArray(raw)) list = raw.filter(x => x && typeof x.m === 'string' && Number.isFinite(x.at));
      } catch { /* none yet this month, or unreadable: start empty */ }
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(m, list);
    }
    return cache.get(m);
  };
  /** Every check-in from `from` to `now`, at most about three months back. */
  const since = (from, now = Date.now()) => {
    const f = Math.max(from, now - 92 * 86400e3);
    return monthsBetween(f, now).flatMap(read).filter(x => x.at >= f && x.at <= now);
  };
  return {
    since,
    /** One member's check-in times since `from`, oldest first. */
    of: (member, from, now = Date.now()) => since(from, now).filter(x => x.m === member).map(x => x.at),
    /**
     * Checks `member` in at `now`, unless they already did within 3 hours: then the earlier
     * check-in stands and comes back with `already: true`.
     */
    add(member, now = Date.now()) {
      const last = since(now - REPEAT_MS, now).filter(x => x.m === member).pop();
      if (last) return { at: last.at, already: true };
      const m = monthOf(now);
      const list = read(m);
      const rec = { m: member, at: now };
      atomicWrite(fileOf(m), JSON.stringify([...list, rec]), 0o600);
      list.push(rec);   // only once it is on disk
      return { at: now, already: false };
    },
  };
}
