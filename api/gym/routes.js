/* HTTP surface of CADENCE's gym layer (M1: trainers and the members who share with them).
 *
 * A factory taking server.js's own helpers, like coach/routes.js, so this module holds no
 * session secret or db of its own and can be tested against fakes. Its one file is
 * DATA_DIR/gym.json (store.js has the shape), written temp-then-rename like db.json.
 *
 * Who sees what:
 *   - an admin (the owner or front desk) gives and takes the trainer role;
 *   - a member chooses a trainer by code and has to say yes to sharing (`consent: true`);
 *   - a trainer reads only members who share with them, and only their training: workouts,
 *     body weight, measurements, routine names. Never photos, videos or notes (stripped below),
 *     and nothing at all once the member stops sharing;
 *   - a trainer puts a programme into a client's own plan (M2, programme.js). It is written by the
 *     server's state writer (`writeStateFor`), stamped like any edit, so the member's devices
 *     merge it in on their next pull. When the sharing ends the member keeps the routines.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as G from './store.js';
import { buildProgramme, applyProgramme, removeProgramme, releaseProgramme } from './programme.js';

// What a trainer never gets from a member's workouts and measurements, at any depth: photos and
// videos (`media`), the member's own notes, and the sync bookkeeping (`_ts`, `_f`, …).
const PRIVATE = new Set(['media', 'note', 'notePin', 'url']);
function withoutPrivate(v) {
  if (Array.isArray(v)) return v.map(withoutPrivate);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!PRIVATE.has(k) && !k.startsWith('_')) out[k] = withoutPrivate(x);
  return out;
}

const DAY = 86400000;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0);

/**
 * One line of a trainer's client list. The dates of the last 40 days come as they are: the app
 * counts "this week" and "this month" on the trainer's own calendar, not the server's clock.
 */
export function clientSummary(S, records, now = Date.now()) {
  const dates = records(S?.workouts).map(w => w.d).filter(d => typeof d === 'string').sort();
  const cutoff = isoDay(now - 40 * DAY);
  const weighIns = records(S?.bodyweight).filter(b => typeof b.d === 'string' && Number.isFinite(b.w)).sort(byDay);
  const last = weighIns[weighIns.length - 1];
  return {
    workouts: dates.length,
    lastWorkout: dates[dates.length - 1] || null,
    recent: dates.filter(d => d >= cutoff),
    weight: last ? { d: last.d, w: last.w } : null,
    unit: S?.unit === 'lb' ? 'lb' : 'kg',
  };
}

/** Everything a trainer may see of one client. */
export function clientDetail(S, records) {
  return {
    unit: S?.unit === 'lb' ? 'lb' : 'kg',
    workouts: withoutPrivate(records(S?.workouts).filter(w => typeof w.d === 'string').sort(byDay).reverse()),
    bodyweight: withoutPrivate(records(S?.bodyweight).filter(b => typeof b.d === 'string').sort(byDay)),
    measurements: withoutPrivate(records(S?.measurements).filter(m => typeof m.d === 'string').sort(byDay)),
    // Their own exercises by name only, so the history reads right; no pictures or links.
    customEx: records(S?.customEx).filter(c => c.id != null).map(c => ({ id: c.id, n: typeof c.n === 'string' ? c.n : '' })),
    routines: records(S?.routines).map(r => ({ id: r.id, name: r.name, emoji: r.emoji, count: records(r.ex).length })),
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PROGRAMME_ERROR = {
  'no-routines': 'pick at least one routine',
  'too-many': 'at most 14 routines',
  'unknown-routine': 'a routine is not in your plan (yet): sync and try again',
  'no-days': 'put at least one routine on a day',
};

export function gymRoutes({ json, readBody, readSession, requireAdmin, audit, users, readState, records, dataDir, atomicWrite, writeStateFor }) {
  const file = path.join(dataDir, 'gym.json');
  let gym = null;
  const load = () => {
    if (!gym) {
      let raw = null;
      try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet, or unreadable: start empty */ }
      gym = G.normalize(raw);
    }
    // An account deleted since (the admin's delete) leaves nothing behind here.
    if (G.prune(gym, users().map(u => u.id))) save();
    return gym;
  };
  const save = () => atomicWrite(file, JSON.stringify(gym, null, 2), 0o600);
  const userById = id => users().find(u => u.id === id) || null;
  const signedIn = (req, res) => {
    const u = readSession(req);
    if (!u) json(res, 401, { error: 'not signed in' });
    return u;
  };
  const trainerView = (t, g) => t && { id: t.id, name: userById(t.id)?.name || '', code: t.code, since: t.since, clients: G.clientsOf(g, t.id).length };
  // A sharing that ended: the member keeps the trainer's routines and days, as their own now.
  const release = (memberId, trainerId) => writeStateFor(memberId, S => releaseProgramme(S, trainerId) > 0);
  const programmeView = p => p && { start: p.start, assignedAt: p.assignedAt, week: p.week, routines: p.routines };

  return {
    /* ---------- everyone: where do I stand ---------- */
    'GET /api/gym/me': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const g = load();
      const mine = G.trainerOf(g, me.id);
      const l = G.linkOf(g, me.id);
      const t = l && G.trainerOf(g, l.trainer);
      json(res, 200, {
        trainer: mine ? { code: mine.code, since: mine.since, clients: G.clientsOf(g, me.id).length } : null,
        myTrainer: t ? { id: t.id, name: userById(t.id)?.name || '', code: t.code, since: l.since } : null,
      });
    },

    /* ---------- member: share with a trainer, or stop ---------- */
    'POST /api/gym/link': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const body = await readBody(req);
      if (body.consent !== true) return json(res, 400, { error: 'consent needed', code: 'consent' });
      const g = load();
      const r = G.link(g, me.id, body.code);
      if (r.error) return json(res, r.error === 'no-such-code' ? 404 : 409, { error: r.error, code: r.error });
      save();
      const trainer = userById(r.trainer.id);
      audit(req, 'gym.client.link', { user: me, target: trainer, msg: r.trainer.code });
      json(res, 200, { myTrainer: { id: r.trainer.id, name: trainer?.name || '', code: r.trainer.code, since: r.link.since } });
    },

    'POST /api/gym/unlink': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const g = load();
      const ended = G.unlink(g, me.id);
      if (ended) { save(); release(me.id, ended.trainer); audit(req, 'gym.client.unlink', { user: me, target: userById(ended.trainer) }); }
      json(res, 200, { ok: true, ended: !!ended });
    },

    /* ---------- trainer: the members who share with them ---------- */
    'GET /api/gym/clients': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const g = load();
      const mine = G.trainerOf(g, me.id);
      if (!mine) return json(res, 403, { error: 'not a trainer', code: 'not-trainer' });
      const clients = G.clientsOf(g, me.id)
        .map(l => ({ l, u: userById(l.member) }))
        .filter(x => x.u && !x.u.disabled)
        .map(({ l, u }) => {
          const p = G.programmeOf(g, u.id);
          return { id: u.id, name: u.name, since: l.since, ...clientSummary(readState(u.id), records), programme: p ? { start: p.start, days: Object.keys(p.week) } : null };
        });
      json(res, 200, { code: mine.code, clients, now: Date.now() });
    },

    'GET /api/gym/client': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const g = load();
      // One answer for "not your client" and "no such member": a trainer cannot probe who exists.
      const l = G.trainerOf(g, me.id) && G.clientsOf(g, me.id).find(x => x.member === id);
      const u = l && userById(id);
      if (!u || u.disabled) return json(res, 404, { error: 'not your client', code: 'not-client' });
      json(res, 200, { client: { id: u.id, name: u.name, since: l.since }, ...clientDetail(readState(u.id), records), programme: programmeView(G.programmeOf(g, u.id)) });
    },

    'POST /api/gym/client/remove': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const body = await readBody(req);
      const g = load();
      if (!G.removeClient(g, me.id, String(body.id || ''))) return json(res, 404, { error: 'not your client', code: 'not-client' });
      save();
      release(String(body.id), me.id);
      audit(req, 'gym.client.remove', { user: me, target: userById(String(body.id)) });
      json(res, 200, { ok: true });
    },

    /* ---------- trainer: a programme in a client's own plan (M2) ---------- */
    'POST /api/gym/programme': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const body = await readBody(req);
      const id = String(body.id || '');
      const g = load();
      const l = G.trainerOf(g, me.id) && G.clientsOf(g, me.id).find(x => x.member === id);
      const u = l && userById(id);
      if (!u || u.disabled) return json(res, 404, { error: 'not your client', code: 'not-client' });
      const start = typeof body.start === 'string' && ISO_DAY.test(body.start) ? body.start : new Date().toISOString().slice(0, 10);
      const now = new Date();
      // From the trainer's own plan as the server has it (the app syncs before it asks).
      const prog = buildProgramme(readState(me.id), me, body.routines, body.days, now);
      if (prog.error) return json(res, 400, { error: PROGRAMME_ERROR[prog.error], code: prog.error });
      writeStateFor(u.id, S => { applyProgramme(S, me.id, prog); return true; });
      const rec = G.setProgramme(g, { member: u.id, trainer: me.id, start, assignedAt: now.toISOString(), week: prog.week, routines: prog.snapshots });
      save();
      audit(req, 'gym.programme.assign', { user: me, target: u, msg: prog.routines.map(r => r.name).join(', ') });
      json(res, 200, { programme: programmeView(rec) });
    },

    'POST /api/gym/programme/remove': async (req, res) => {
      const me = signedIn(req, res); if (!me) return;
      const body = await readBody(req);
      const id = String(body.id || '');
      const g = load();
      const l = G.trainerOf(g, me.id) && G.clientsOf(g, me.id).find(x => x.member === id);
      if (!l || !userById(id)) return json(res, 404, { error: 'not your client', code: 'not-client' });
      writeStateFor(id, S => removeProgramme(S, me.id));
      const had = G.dropProgramme(g, id);
      if (had) save();
      audit(req, 'gym.programme.remove', { user: me, target: userById(id) });
      json(res, 200, { ok: true, removed: !!had });
    },

    /* ---------- admin: who trains here ---------- */
    'GET /api/gym/trainers': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const g = load();
      json(res, 200, { trainers: g.trainers.map(t => trainerView(t, g)) });
    },

    'POST /api/gym/trainer': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = userById(String(body.id || ''));
      if (!u) return json(res, 404, { error: 'no such user' });
      const g = load();
      if (body.trainer === true) {
        if (u.disabled) return json(res, 400, { error: 'enable the account first' });
        const had = !!G.trainerOf(g, u.id);
        const t = G.makeTrainer(g, u);
        if (!had) { save(); audit(req, 'gym.trainer.grant', { user: admin, target: u, msg: t.code }); }
        return json(res, 200, { trainer: trainerView(t, g) });
      }
      if (body.trainer === false) {
        const had = G.trainerOf(g, u.id);
        const members = G.clientsOf(g, u.id).map(l => l.member);
        const ended = G.dropTrainer(g, u.id);
        for (const m of members) release(m, u.id);
        if (had) { save(); audit(req, 'gym.trainer.revoke', { user: admin, target: u, msg: ended + ' clients' }); }
        return json(res, 200, { trainer: null, endedLinks: ended });
      }
      json(res, 400, { error: 'say trainer: true or false' });
    },
  };
}
