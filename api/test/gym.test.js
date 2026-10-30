/* CADENCE M1: trainers and the members who share with them (api/gym/). The pure rules in
   store.js, then the routes through the real server.js in a child, the way the admin tests do:
   who may give the role, what a member has to agree to, and above all what a trainer can and
   cannot read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import * as G from '../gym/store.js';
import { clientSummary, clientDetail } from '../gym/routes.js';
import * as P from '../gym/programme.js';
import * as PT from '../gym/pt.js';
import * as D from '../gym/desk.js';
import { dashboard } from '../gym/dashboard.js';

const records = v => (Array.isArray(v) ? v.filter(x => !!x && typeof x === 'object' && !Array.isArray(x)) : []);

/* ---------- store.js ---------- */

test('a trainer code is the first name in capitals plus a number, and never repeats', () => {
  assert.equal(G.codeFor('Aman Verma', []), 'AMAN01');
  assert.equal(G.codeFor('aman', ['AMAN01']), 'AMAN02');
  assert.equal(G.codeFor('Zoë', []), 'ZOE01');
  assert.equal(G.codeFor('अमन', []), 'TRAINER01');
  assert.equal(G.codeFor('Bartholomew', []), 'BARTHOLO01');
  assert.match(G.codeFor('Bartholomew', []), G.CODE_RE);
});

test('a member shares with one trainer at a time, never with themselves', () => {
  const g = G.emptyGym();
  const aman = G.makeTrainer(g, { id: 't1', name: 'Aman' });
  G.makeTrainer(g, { id: 't2', name: 'Riya' });
  assert.equal(G.makeTrainer(g, { id: 't1', name: 'Aman' }), aman, 'giving the role twice keeps the code');
  assert.deepEqual(G.link(g, 'm1', 'nope01'), { error: 'no-such-code' });
  assert.deepEqual(G.link(g, 't1', 'AMAN01'), { error: 'self' });
  assert.equal(G.link(g, 'm1', ' aman01 ').trainer.id, 't1', 'typed in lower case with spaces');
  assert.equal(G.link(g, 'm1', 'AMAN01').trainer.id, 't1', 'the same code again is no error');
  assert.deepEqual(G.link(g, 'm1', 'RIYA01'), { error: 'already-linked' });
  assert.equal(G.unlink(g, 'm1').trainer, 't1');
  assert.equal(G.link(g, 'm1', 'RIYA01').trainer.id, 't2');
});

test('taking the trainer role away ends every link to them; deleted accounts leave nothing behind', () => {
  const g = G.emptyGym();
  G.makeTrainer(g, { id: 't1', name: 'Aman' });
  G.link(g, 'm1', 'AMAN01'); G.link(g, 'm2', 'AMAN01');
  assert.equal(G.dropTrainer(g, 't1'), 2);
  assert.equal(g.links.length, 0);
  G.makeTrainer(g, { id: 't1', name: 'Aman' }); G.link(g, 'm1', 'AMAN01'); G.link(g, 'm2', 'AMAN01');
  assert.equal(G.prune(g, ['t1', 'm1']), true);
  assert.deepEqual(g.links.map(l => l.member), ['m1']);
  assert.equal(G.prune(g, ['m1']), true);
  assert.deepEqual(g, G.emptyGym());
});

test('a gym.json that is not the expected shape is read as far as it is sound', () => {
  assert.deepEqual(G.normalize(null), G.emptyGym());
  const g = G.normalize({
    trainers: [{ id: 't1', code: 'AMAN01' }, { id: 't1', code: 'AMAN02' }, { id: 't2', code: 'bad code' }, null],
    links: [{ member: 'm1', trainer: 't1' }, { member: 'm1', trainer: 't1' }, { member: 'm2', trainer: 'ghost' }, { member: 't1', trainer: 't1' }],
  });
  assert.deepEqual(g.trainers.map(t => t.code), ['AMAN01']);
  assert.deepEqual(g.links.map(l => l.member), ['m1']);
});

test('what a trainer reads of a client never carries photos, videos, notes or sync stamps', () => {
  const S = {
    unit: 'kg',
    workouts: [{ id: 'w1', d: '2026-10-20', name: 'Legs', note: 'felt awful, bad day at work', _ts: 5, media: [{ hash: 'x' }],
      entries: [{ id: '0043', note: 'knee', notePin: true, media: [{ hash: 'y' }], sets: [{ w: 100, r: 5, done: true, note: 'grind' }] }] }],
    bodyweight: [{ d: '2026-10-21', w: 80.2, t: 1 }, { d: '2026-10-01', w: 81 }],
    measurements: [{ d: '2026-10-01', waist: 88, note: 'x' }],
    customEx: [{ id: 'c1', n: 'Sled push', media: { hash: 'z' }, url: 'https://example.com/v.mp4' }],
    routines: [{ id: 'r1', name: 'Legs', emoji: '🦵', ex: [{ id: '0043' }, { id: '0044' }] }],
    dayNotes: { '2026-10-20': { text: 'private' } },
    photos: [{ hash: 'p' }],
  };
  const d = clientDetail(S, records);
  const text = JSON.stringify(d);
  for (const secret of ['felt awful', 'knee', 'grind', 'notePin', 'hash', 'example.com', 'private', '_ts']) {
    assert.ok(!text.includes(secret), `${secret} must not reach the trainer`);
  }
  assert.equal(d.workouts[0].entries[0].sets[0].w, 100, 'the training itself comes through');
  assert.deepEqual(d.bodyweight.map(b => b.d), ['2026-10-01', '2026-10-21'], 'oldest first');
  assert.deepEqual(d.customEx, [{ id: 'c1', n: 'Sled push' }]);
  assert.deepEqual(d.routines, [{ id: 'r1', name: 'Legs', emoji: '🦵', count: 2 }]);
});

test('a client line has the last workout, the last 40 days of dates and the latest weigh-in', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const S = { unit: 'lb', workouts: [{ d: '2026-08-01' }, { d: '2026-10-29' }, { d: '2026-10-02' }, null, { d: 7 }],
    bodyweight: [{ d: '2026-10-28', w: 176 }, { d: '2026-10-01', w: 180 }] };
  assert.deepEqual(clientSummary(S, records, now), {
    workouts: 3, lastWorkout: '2026-10-29', recent: ['2026-10-02', '2026-10-29'], weight: { d: '2026-10-28', w: 176 }, unit: 'lb',
  });
  assert.deepEqual(clientSummary(null, records, now), { workouts: 0, lastWorkout: null, recent: [], weight: null, unit: 'kg' });
});

/* ---------- the routes, through server.js ---------- */

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const OWNER = 'u_own', AMAN = 'u_aman', PRIYA = 'u_priya', RAHUL = 'u_rahul';

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-trainer-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const created = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: OWNER, name: 'Owner', created, admin: true, owner: true },
      { id: AMAN, name: 'Aman Verma', created },
      { id: PRIYA, name: 'Priya', created },
      { id: RAHUL, name: 'Rahul', created },
    ], creds: [], subs: [], invites: []
  }));
  fs.writeFileSync(path.join(dataDir, `state-${PRIYA}.json`), JSON.stringify({
    unit: 'kg',
    workouts: [{ id: 'w1', d: '2026-10-28', name: 'Push', note: 'private note', media: [{ hash: 'abc' }], entries: [{ id: '0025', sets: [{ w: 40, r: 8, done: true }] }] }],
    bodyweight: [{ d: '2026-10-28', w: 61.5 }],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' }
  });
  let log = '';
  child.stdout.on('data', d => log += d);
  child.stderr.on('data', d => log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const port = await boundPort(child, () => log);
  const call = async (uid, method, p, body) => {
    const headers = { Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: 'http://localhost:8080' };
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  return {
    dataDir,
    base: `http://127.0.0.1:${port}`,
    headers: uid => ({ Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: 'http://localhost:8080' }),
    get: (uid, p) => call(uid, 'GET', p),
    post: (uid, p, body = {}) => call(uid, 'POST', p, body),
    anon: async p => (await fetch(`http://127.0.0.1:${port}${p}`)).status,
  };
}

test('the owner makes a trainer, a member shares by code, and the trainer sees only that member', async t => {
  const s = await startServer(t);
  assert.equal(await s.anon('/api/gym/me'), 401);

  // Only an admin gives the role.
  assert.equal((await s.post(RAHUL, '/api/gym/trainer', { id: AMAN, trainer: true })).status, 403);
  const made = await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  assert.equal(made.status, 200);
  assert.equal(made.body.trainer.code, 'AMAN01');
  assert.deepEqual((await s.get(AMAN, '/api/gym/me')).body.trainer.code, 'AMAN01');

  // A member has to say yes, and the code has to exist.
  assert.equal((await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01' })).status, 400);
  assert.equal((await s.post(PRIYA, '/api/gym/link', { code: 'NOPE01', consent: true })).body.code, 'no-such-code');
  assert.equal((await s.post(AMAN, '/api/gym/link', { code: 'AMAN01', consent: true })).body.code, 'self');
  const linked = await s.post(PRIYA, '/api/gym/link', { code: 'aman01', consent: true });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.myTrainer.name, 'Aman Verma');
  assert.equal((await s.get(PRIYA, '/api/gym/me')).body.myTrainer.code, 'AMAN01');

  // The trainer's list has Priya, with her numbers; Rahul never shared and is not there.
  const list = await s.get(AMAN, '/api/gym/clients');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.clients.map(c => c.name), ['Priya']);
  assert.equal(list.body.clients[0].lastWorkout, '2026-10-28');
  assert.deepEqual(list.body.clients[0].weight, { d: '2026-10-28', w: 61.5 });

  // Her history, without the note or the photo.
  const detail = await s.get(AMAN, `/api/gym/client?id=${PRIYA}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.workouts[0].entries[0].sets[0].w, 40);
  assert.ok(!JSON.stringify(detail.body).includes('private note'));
  assert.ok(!JSON.stringify(detail.body).includes('abc'));

  // Nobody else gets in: not Rahul's data, not as a non-trainer, not anonymously.
  assert.equal((await s.get(AMAN, `/api/gym/client?id=${RAHUL}`)).status, 404);
  assert.equal((await s.get(AMAN, `/api/gym/client?id=nobody`)).status, 404);
  assert.equal((await s.get(RAHUL, '/api/gym/clients')).body.code, 'not-trainer');
  assert.equal((await s.get(RAHUL, `/api/gym/client?id=${PRIYA}`)).status, 404);
  assert.equal(await s.anon('/api/gym/clients'), 401);
  assert.equal((await s.get(RAHUL, '/api/gym/trainers')).status, 403);
  assert.deepEqual((await s.get(OWNER, '/api/gym/trainers')).body.trainers.map(x => [x.code, x.clients]), [['AMAN01', 1]]);
});

test('a member who stops sharing is gone from the trainer at once; so is everyone when the role goes', async t => {
  const s = await startServer(t);
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  await s.post(RAHUL, '/api/gym/link', { code: 'AMAN01', consent: true });

  assert.equal((await s.post(PRIYA, '/api/gym/unlink')).body.ended, true);
  assert.equal((await s.get(AMAN, `/api/gym/client?id=${PRIYA}`)).status, 404);
  assert.deepEqual((await s.get(AMAN, '/api/gym/clients')).body.clients.map(c => c.name), ['Rahul']);

  // The trainer lets Rahul go; he can share again later if he wants.
  assert.equal((await s.post(AMAN, '/api/gym/client/remove', { id: RAHUL })).status, 200);
  assert.equal((await s.post(AMAN, '/api/gym/client/remove', { id: RAHUL })).status, 404);
  assert.equal((await s.get(RAHUL, '/api/gym/me')).body.myTrainer, null);

  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  const taken = await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: false });
  assert.equal(taken.body.endedLinks, 1);
  assert.equal((await s.get(AMAN, '/api/gym/clients')).status, 403);
  assert.equal((await s.get(PRIYA, '/api/gym/me')).body.myTrainer, null);

  // What is on disk is roles, links, packages, the desk, phone numbers and ended links: no
  // training data is ever copied there. The three ended links are kept for retention (M4).
  const saved = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'gym.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['desk', 'links', 'packages', 'pastLinks', 'phones', 'programmes', 'trainers', 'v']);
  assert.deepEqual(saved.pastLinks.map(l => l.member), [PRIYA, RAHUL, PRIYA]);
});

test('a deleted member drops out of the trainer list', async t => {
  const s = await startServer(t);
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  assert.equal((await s.post(OWNER, '/api/admin/user/delete', { id: PRIYA })).status, 200);
  assert.deepEqual((await s.get(AMAN, '/api/gym/clients')).body.clients, []);
});

/* ---------- M2: a programme in the member's own plan ---------- */

const TRAINER_S = {
  routines: [
    { id: 'tr-push', name: 'Push', emoji: '💪', _ts: 9, ex: [{ id: '0025', sets: 3, reps: 8, weight: 60, _f: { reps: 1 } }, { id: 'c-sled', sets: 2, sec: 30, mode: 'time' }] },
    { id: 'tr-legs', name: 'Legs', ex: [{ id: '0043', sets: 3, reps: 6, repsMin: 5, repsMax: 8, weight: 80 }] },
    { id: 'tr-other', name: 'Mine only', ex: [] },
  ],
  customEx: [{ id: 'c-sled', n: 'sled push', m: ['quads'], media: { hash: 'h' }, url: 'https://x' }],
};
const AMAN_U = { id: 'u_aman', name: 'Aman Verma' };

test('a programme is the trainer\'s routines copied with new ids, on the days chosen', () => {
  const p = P.buildProgramme(TRAINER_S, AMAN_U, ['tr-push', 'tr-legs'], { 1: ['tr-push'], 3: ['tr-legs'], 5: ['tr-push', 'tr-legs'], 6: ['tr-other'] });
  assert.equal(p.routines.length, 2);
  const [push, legs] = p.routines;
  assert.notEqual(push.id, 'tr-push');
  assert.equal(push.assignedBy, 'u_aman');
  assert.equal(push.assignedByName, 'Aman Verma');
  assert.equal(push._ts, undefined, 'no stamps of the trainer\'s copy travel');
  assert.equal(push.ex[0]._f, undefined);
  assert.deepEqual(p.week, { 1: [push.id], 3: [legs.id], 5: [push.id, legs.id] }, 'a routine not picked never lands on a day');
  assert.deepEqual(p.customEx, [{ id: 'c-sled', n: 'sled push', m: ['quads'], assignedBy: 'u_aman' }], 'by name, without the trainer\'s pictures');
  assert.deepEqual(p.snapshots[1], { id: legs.id, name: 'Legs', emoji: null, ex: [{ id: '0043', sets: 3, reps: 6, repsMin: 5, repsMax: 8, weight: 80 }] });
  assert.deepEqual(P.buildProgramme(TRAINER_S, AMAN_U, [], {}), { error: 'no-routines' });
  assert.deepEqual(P.buildProgramme(TRAINER_S, AMAN_U, ['nope'], { 1: ['nope'] }), { error: 'unknown-routine' });
  assert.deepEqual(P.buildProgramme(TRAINER_S, AMAN_U, ['tr-push'], {}), { error: 'no-days' });
});

test('applying replaces the weekly plan and the trainer\'s old programme; the member\'s own routines stay', () => {
  const S = { routines: [{ id: 'own', name: 'My cardio', ex: [] }], week: { 2: ['own'], 4: 'own' }, queue: { items: [] }, scheduleMode: 'rotation', dayPlan: {} };
  const first = P.buildProgramme(TRAINER_S, AMAN_U, ['tr-push'], { 1: ['tr-push'] });
  P.applyProgramme(S, 'u_aman', first);
  assert.deepEqual(S.routines.map(r => r.name), ['My cardio', 'Push']);
  assert.deepEqual(S.week, { 1: [first.routines[0].id] });
  assert.equal(S.scheduleMode, 'week');
  assert.equal(S.queue, null);
  S.dayPlan['2026-11-02'] = first.routines[0].id;
  const second = P.buildProgramme(TRAINER_S, AMAN_U, ['tr-legs'], { 2: ['tr-legs'] });
  P.applyProgramme(S, 'u_aman', second);
  assert.deepEqual(S.routines.map(r => r.name), ['My cardio', 'Legs'], 'the old programme went, with its reschedule');
  assert.deepEqual(S.dayPlan, {});
  assert.deepEqual(S.customEx, [], 'the old programme\'s exercise went with it; Legs uses none');
  assert.equal(P.removeProgramme(S, 'u_aman'), true);
  assert.deepEqual(S.routines.map(r => r.name), ['My cardio']);
  assert.deepEqual(S.week, {});
});

test('when the sharing ends the member keeps the routines, as their own', () => {
  const S = { routines: [], week: {} };
  P.applyProgramme(S, 'u_aman', P.buildProgramme(TRAINER_S, AMAN_U, ['tr-push'], { 1: ['tr-push'] }));
  assert.equal(P.releaseProgramme(S, 'u_aman'), 1);
  assert.equal(S.routines[0].name, 'Push');
  assert.equal(S.routines[0].assignedBy, null);
  assert.equal(S.customEx[0].assignedBy, null);
  assert.equal(Object.keys(S.week).length, 1, 'the days stay too');
});

test('a trainer assigns a programme to a client; it lands in the member\'s plan, stamped, and survives a stale phone', async t => {
  const s = await startServer(t);
  fs.writeFileSync(path.join(s.dataDir, `state-${AMAN}.json`), JSON.stringify({ _rev: 3, ...TRAINER_S }));
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });

  // Priya has a routine of her own on Tuesdays, and her phone read her plan before the trainer
  // assigned anything.
  const own = JSON.parse(fs.readFileSync(path.join(s.dataDir, `state-${PRIYA}.json`), 'utf8'));
  fs.writeFileSync(path.join(s.dataDir, `state-${PRIYA}.json`), JSON.stringify({ ...own, _rev: 4, routines: [{ id: 'own', name: 'My cardio', ex: [] }], week: { 2: ['own'] } }));
  const before = await s.get(PRIYA, '/api/data');
  const phoneRev = before.body.rev ?? before.body.state?._rev;

  // Only for a client of theirs, and only their own routines.
  assert.equal((await s.post(AMAN, '/api/gym/programme', { id: RAHUL, routines: ['tr-push'], days: { 1: ['tr-push'] } })).status, 404);
  assert.equal((await s.post(RAHUL, '/api/gym/programme', { id: PRIYA, routines: ['tr-push'], days: { 1: ['tr-push'] } })).status, 404);
  assert.equal((await s.post(AMAN, '/api/gym/programme', { id: PRIYA, routines: ['nope'], days: { 1: ['nope'] } })).body.code, 'unknown-routine');

  const r = await s.post(AMAN, '/api/gym/programme', { id: PRIYA, routines: ['tr-push', 'tr-legs'], days: { 1: ['tr-push'], 4: ['tr-legs'] }, start: '2026-11-02' });
  assert.equal(r.status, 200);
  assert.equal(r.body.programme.start, '2026-11-02');
  assert.deepEqual(r.body.programme.routines.map(x => x.name), ['Push', 'Legs']);

  const S = JSON.parse(fs.readFileSync(path.join(s.dataDir, `state-${PRIYA}.json`), 'utf8'));
  const mine = S.routines.filter(x => x.assignedBy === AMAN);
  assert.deepEqual(mine.map(x => x.name), ['Push', 'Legs']);
  assert.ok(mine.every(x => Number(x._ts) > 0), 'each copy carries its own stamp, so a merge keeps it');
  assert.deepEqual(Object.keys(S.week).sort(), ['1', '4'], 'the trainer\'s days replace hers');
  assert.ok(S.routines.some(x => x.name === 'My cardio'), 'her own routine stays in her plan');
  assert.ok(S.workouts.length === 1, 'her history is untouched');
  assert.ok(S._rev > (phoneRev || 0), 'the revision moved: her devices pull it');

  // The stale phone pushes the copy it read: refused, so it merges instead of overwriting.
  const push = await fetch(`${s.base}/api/data`, { method: 'PUT', headers: s.headers(PRIYA), body: JSON.stringify({ state: before.body.state, baseRev: phoneRev, stamped: true }) });
  assert.equal(push.status, 409);

  // The trainer sees what was assigned; the client list knows the days.
  const detail = await s.get(AMAN, `/api/gym/client?id=${PRIYA}`);
  assert.deepEqual(detail.body.programme.routines[0].ex.map(e => e.id), ['0025', 'c-sled']);
  const list = await s.get(AMAN, '/api/gym/clients');
  assert.deepEqual(list.body.clients.find(c => c.id === PRIYA).programme, { start: '2026-11-02', days: ['1', '4'] });

  // Removing the programme takes the routines and their days out of her plan.
  assert.equal((await s.post(AMAN, '/api/gym/programme/remove', { id: PRIYA })).body.removed, true);
  const S2 = JSON.parse(fs.readFileSync(path.join(s.dataDir, `state-${PRIYA}.json`), 'utf8'));
  assert.equal(S2.routines.filter(x => x.assignedBy).length, 0);
  assert.deepEqual(S2.week, {});
  assert.equal((await s.get(AMAN, `/api/gym/client?id=${PRIYA}`)).body.programme, null);
});

test('a member who stops sharing keeps the programme as their own routines', async t => {
  const s = await startServer(t);
  fs.writeFileSync(path.join(s.dataDir, `state-${AMAN}.json`), JSON.stringify(TRAINER_S));
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  await s.post(AMAN, '/api/gym/programme', { id: PRIYA, routines: ['tr-push'], days: { 1: ['tr-push'] } });
  await s.post(PRIYA, '/api/gym/unlink');
  const S = JSON.parse(fs.readFileSync(path.join(s.dataDir, `state-${PRIYA}.json`), 'utf8'));
  const push = S.routines.find(x => x.name === 'Push');
  assert.ok(push, 'still in her plan');
  assert.equal(push.assignedBy, null, 'and hers to edit');
  const saved = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'gym.json'), 'utf8'));
  assert.deepEqual(saved.programmes, []);
});

/* ---------- M3: PT packages (pt.js) ---------- */

const at = iso => new Date(iso);

test('a package needs 1 to 200 sessions, a start, and an expiry on or after the start', () => {
  const g = G.emptyGym();
  assert.equal(PT.addPackage(g, { member: 'm1', total: 0 }, 't1').error, 'bad-total');
  assert.equal(PT.addPackage(g, { member: 'm1', total: 2.5 }, 't1').error, 'bad-total');
  assert.equal(PT.addPackage(g, { member: 'm1', total: 201 }, 't1').error, 'bad-total');
  assert.equal(PT.addPackage(g, { member: 'm1', total: 12, start: '30/10' }, 't1').error, 'bad-start');
  assert.equal(PT.addPackage(g, { member: 'm1', total: 12, start: '2026-10-30', expires: '2026-10-01' }, 't1').error, 'bad-expiry');
  const p = PT.addPackage(g, { member: 'm1', trainer: 't1', total: '12', expires: '', note: '  Paid cash  ' }, 't1', at('2026-10-30T09:00:00Z')).package;
  assert.deepEqual([p.total, p.start, p.expires, p.note, p.sessions.length], [12, '2026-10-30', null, 'Paid cash', 0]);
  assert.equal(PT.removePackage(g, p.id).package, p, 'a mistake goes while nothing is counted');
  assert.equal(g.packages.length, 0);
});

test('sessions go to the oldest package that covers the day, once a day unless asked twice', () => {
  const g = G.emptyGym();
  const now = at('2026-10-30T10:00:00Z');
  assert.equal(PT.countSession(g, 'm1', '2026-10-30', 't1', { now }).error, 'no-package');
  const a = PT.addPackage(g, { member: 'm1', total: 2, start: '2026-10-01', expires: '2026-10-31' }, 't1', now).package;
  const b = PT.addPackage(g, { member: 'm1', total: 10, start: '2026-10-20' }, 'desk', now).package;
  assert.equal(PT.countSession(g, 'm1', '2026-09-30', 't1', { now }).error, 'before-start');
  assert.equal(PT.countSession(g, 'm1', '2026-11-02', 't1', { now }).error, 'future');
  assert.equal(PT.countSession(g, 'm1', '2026-10-28', 't1', { now }).package, a);
  assert.equal(PT.countSession(g, 'm1', '2026-10-28', 't1', { now }).error, 'same-day');
  assert.equal(PT.countSession(g, 'm1', '2026-10-28', 't1', { now, again: true }).package, a, 'a second session that day, when meant');
  assert.equal(PT.countSession(g, 'm1', '2026-10-29', 't1', { now }).package, b, 'the first package is used up');
  assert.equal(PT.removePackage(g, a.id).error, 'has-sessions');
  assert.equal(PT.stateOf(a, '2026-10-30'), 'used-up');
  assert.equal(PT.stateOf(b, '2026-10-30'), 'active');
  assert.equal(PT.stateOf(b, '2026-10-19'), 'upcoming');

  const h = G.emptyGym();
  PT.addPackage(h, { member: 'm1', total: 5, start: '2026-09-01', expires: '2026-09-30' }, 't1', now);
  assert.equal(PT.countSession(h, 'm1', '2026-10-30', 't1', { now }).error, 'expired');
  assert.equal(PT.countSession(h, 'm1', '2026-09-30', 't1', { now }).error, undefined, 'a forgotten session from inside the dates still counts');
});

test('the trainer undoes their own count for 24 hours; the member flags for 48; the desk settles', () => {
  const g = G.emptyGym();
  const t0 = at('2026-10-30T10:00:00Z');
  PT.addPackage(g, { member: 'm1', total: 12 }, 't1', at('2026-10-01T10:00:00Z'));
  const s = PT.countSession(g, 'm1', '2026-10-30', 't1', { now: t0 }).session;
  const later = h => new Date(t0.getTime() + h * 3600e3);
  assert.equal(PT.undoSession(g, s.id, 't2', { now: later(1) }).error, 'not-yours');
  assert.equal(PT.undoSession(g, s.id, 't1', { now: later(25) }).error, 'too-late');
  assert.equal(PT.flagSession(g, s.id, 'm2', later(1)).error, 'no-session', 'only the member it was counted for');
  assert.equal(PT.flagSession(g, s.id, 'm1', later(49)).error, 'too-late');
  assert.equal(PT.keepSession(g, s.id, 'desk').error, 'not-flagged');
  assert.ok(PT.flagSession(g, s.id, 'm1', later(47)).session.flag);
  assert.equal(PT.ptSummary(g, 'm1', later(47)).flagged, 1);
  const v = PT.packageView(g.packages[0], { nameOf: id => id.toUpperCase(), viewer: 'm1', now: later(47) });
  assert.deepEqual([v.used, v.left, v.sessions[0].flagged, v.sessions[0].canFlag, v.sessions[0].canUndo, v.sessions[0].by.name], [1, 11, true, false, false, 'T1']);
  assert.ok(PT.keepSession(g, s.id, 'desk', later(50)).session.flag.kept);
  assert.equal(PT.ptSummary(g, 'm1', later(50)).flagged, 0, 'a kept flag is settled');
  assert.equal(PT.undoSession(g, s.id, 'desk', { admin: true, now: later(500) }).session, s, 'the front desk removes any session');
  assert.equal(g.packages[0].sessions.length, 0);
});

test('packages survive in gym.json as far as they are sound, and go with a deleted member', () => {
  const g = G.normalize({
    packages: [
      { id: 'p1', member: 'm1', trainer: 't1', total: 2, start: '2026-10-01', expires: '2026-09-01', sessions: [
        { id: 's1', d: '2026-10-02', at: '2026-10-02T10:00:00Z', by: 't1', flag: { at: '2026-10-03T10:00:00Z' } },
        { id: 's1', d: '2026-10-03', at: '2026-10-03T10:00:00Z' },
        { id: 's2', d: 'yesterday', at: '2026-10-03T10:00:00Z' },
      ] },
      { id: 'p2', member: 'm1', total: 0, start: '2026-10-01' },
      { id: 'p3', member: 'm2', total: 5, start: '2026-10-01' },
    ],
    desk: { key: 'short', secret: 'x' },
  });
  assert.deepEqual(g.packages.map(p => p.id), ['p1', 'p3']);
  assert.equal(g.packages[0].expires, null, 'an expiry before the start is dropped');
  assert.deepEqual(g.packages[0].sessions.map(s => [s.id, !!s.flag]), [['s1', true]]);
  assert.equal(g.desk, null);
  assert.equal(G.prune(g, ['m1']), true);
  assert.deepEqual(g.packages.map(p => p.member), ['m1']);
});

/* ---------- M3: the desk code and check-ins (desk.js) ---------- */

test('the desk code changes every 30 seconds and a scan is good for the code shown or the one before', () => {
  const desk = D.newDesk('u_own');
  const t = 1_800_000_000_000;   // on a window edge
  const now = D.currentCode(desk, t + 5000);
  assert.match(now.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(now.msLeft, 25000);
  assert.notEqual(D.currentCode(desk, t + 30000).code, now.code);
  assert.equal(D.codeValid(desk, now.code, t + 29999), true);
  assert.equal(D.codeValid(desk, now.code.toLowerCase(), t + 45000), true, 'the window after it too');
  assert.equal(D.codeValid(desk, now.code, t + 60000), false, 'a photo sent home is dead within a minute');
  assert.equal(D.codeValid(D.newDesk('u_own'), now.code, t + 5000), false, 'a new desk link has its own codes');
  assert.equal(D.codeValid(desk, 'ÄÄÄÄÄÄÄÄÄÄ', t), false);
  assert.equal(D.keyMatches(desk, desk.key), true);
  assert.equal(D.keyMatches(desk, desk.key + 'x'), false);
  assert.equal(D.keyMatches(null, desk.key), false);
});

test('a member checks in once per 3 hours, into one file per month', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-checkins-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (f, c) => fs.writeFileSync(f, c);
  const log = D.checkinLog({ dataDir: dir, atomicWrite: write });
  const t0 = Date.parse('2026-10-31T22:00:00Z');
  assert.deepEqual(log.add('m1', t0), { at: t0, already: false });
  assert.deepEqual(log.add('m1', t0 + 3600e3), { at: t0, already: true });
  assert.equal(log.add('m1', t0 + 3.5 * 3600e3).already, false, 'the next morning (UTC) is a new visit, in November');
  log.add('m2', t0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'gym-checkins-2026-10.json'), 'utf8')).map(x => x.m), ['m1', 'm2']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'gym-checkins-2026-11.json'), 'utf8')).length, 1);
  const fresh = D.checkinLog({ dataDir: dir, atomicWrite: write });
  assert.deepEqual(fresh.of('m1', t0 - 86400e3, t0 + 4 * 3600e3), [t0, t0 + 3.5 * 3600e3], 'read back from disk across the month');
});

/* ---------- M3: the routes ---------- */

test('PT: the trainer and the front desk add packages, the trainer counts, the member sees and flags', async t => {
  const s = await startServer(t);
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  const today = new Date().toISOString().slice(0, 10);

  // Not Rahul for Priya, not Priya for herself, not Aman for Rahul (not his client).
  assert.equal((await s.post(RAHUL, '/api/gym/pt/package', { member: PRIYA, total: 12 })).status, 404);
  assert.equal((await s.post(PRIYA, '/api/gym/pt/package', { member: PRIYA, total: 12 })).status, 404);
  assert.equal((await s.post(AMAN, '/api/gym/pt/package', { member: RAHUL, total: 12 })).status, 404);
  assert.equal((await s.post(AMAN, '/api/gym/pt/session', { member: PRIYA, d: today })).body.code, 'no-package');
  assert.equal((await s.post(AMAN, '/api/gym/pt/package', { member: PRIYA, total: 500 })).body.code, 'bad-total');

  const added = await s.post(AMAN, '/api/gym/pt/package', { member: PRIYA, total: 12, start: today, note: 'October offer' });
  assert.equal(added.status, 200);
  assert.deepEqual([added.body.packages[0].total, added.body.packages[0].trainer.name, added.body.packages[0].state], [12, 'Aman Verma', 'active']);
  // The front desk can sell Rahul one before he has a trainer.
  assert.equal((await s.post(OWNER, '/api/gym/pt/package', { member: RAHUL, total: 8 })).body.packages[0].trainer, null);

  // Only her trainer counts.
  assert.equal((await s.post(OWNER, '/api/gym/pt/session', { member: PRIYA, d: today })).status, 404);
  const done = await s.post(AMAN, '/api/gym/pt/session', { member: PRIYA, d: today });
  assert.equal(done.status, 200);
  assert.deepEqual([done.body.packages[0].used, done.body.packages[0].left, done.body.packages[0].sessions[0].canUndo], [1, 11, true]);
  assert.equal((await s.post(AMAN, '/api/gym/pt/session', { member: PRIYA, d: today })).body.code, 'same-day');
  assert.equal((await s.post(AMAN, '/api/gym/pt/session', { member: PRIYA, d: today, again: true })).status, 200);

  // The trainer's list and her page carry the numbers.
  const line = (await s.get(AMAN, '/api/gym/clients')).body.clients[0];
  assert.deepEqual([line.pt.left, line.pt.flagged, line.pt.lastSession], [10, 0, today]);
  assert.equal((await s.get(AMAN, `/api/gym/client?id=${PRIYA}`)).body.pt.packages[0].used, 2);

  // Priya sees both in My trainer, flags one; Aman sees the flag; Rahul cannot flag hers.
  const mine = (await s.get(PRIYA, '/api/gym/me')).body.pt.packages[0];
  assert.deepEqual([mine.used, mine.sessions.every(x => x.canFlag && !x.canUndo)], [2, true]);
  const sid = mine.sessions[0].id;
  assert.equal((await s.post(RAHUL, '/api/gym/pt/session/flag', { id: sid })).status, 404);
  assert.equal((await s.post(PRIYA, '/api/gym/pt/session/flag', { id: sid })).body.packages[0].sessions[0].flagged, true);
  assert.equal((await s.get(AMAN, '/api/gym/clients')).body.clients[0].pt.flagged, 1);

  // The front desk sees it and keeps it; then removes the other one.
  assert.equal((await s.get(AMAN, `/api/gym/pt?member=${PRIYA}`)).status, 403);
  const desk = await s.get(OWNER, `/api/gym/pt?member=${PRIYA}`);
  assert.deepEqual([desk.body.trainer.name, desk.body.packages[0].sessions[0].flagged], ['Aman Verma', true]);
  assert.equal((await s.post(AMAN, '/api/gym/pt/session/keep', { id: sid })).status, 403);
  assert.equal((await s.post(OWNER, '/api/gym/pt/session/keep', { id: sid })).body.packages[0].sessions[0].kept, true);
  const other = desk.body.packages[0].sessions[1].id;
  assert.equal((await s.post(RAHUL, '/api/gym/pt/session/undo', { id: other })).status, 404);
  assert.equal((await s.post(OWNER, '/api/gym/pt/session/undo', { id: other })).body.packages[0].used, 1);

  // A package with sessions stays; when Priya stops sharing it stays hers, out of Aman's reach.
  const pid = desk.body.packages[0].id;
  assert.equal((await s.post(AMAN, '/api/gym/pt/package/remove', { id: pid })).body.code, 'has-sessions');
  await s.post(PRIYA, '/api/gym/unlink');
  assert.equal((await s.post(AMAN, '/api/gym/pt/session/undo', { id: sid })).status, 404);
  assert.equal((await s.get(PRIYA, '/api/gym/me')).body.pt.packages[0].used, 1);
  const g = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'gym.json'), 'utf8'));
  assert.equal(g.packages.length, 2);
});

test('desk: the admin makes a link, the screen shows the code, members check in with it', async t => {
  const s = await startServer(t);
  const deskCode = async body => {
    const r = await fetch(`${s.base}/api/gym/desk/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await s.get(PRIYA, '/api/gym/me')).body.desk, false);
  assert.equal((await s.post(PRIYA, '/api/gym/checkin', { code: 'ABCDEFGHJK' })).body.code, 'desk-off');
  assert.equal((await s.post(RAHUL, '/api/gym/desk', { on: true })).status, 403);
  const made = await s.post(OWNER, '/api/gym/desk', { on: true });
  assert.equal(made.status, 200);
  const key = made.body.desk.key;
  assert.equal((await s.get(OWNER, '/api/gym/desk')).body.desk.key, key);
  assert.equal((await s.get(PRIYA, '/api/gym/me')).body.desk, true);

  // The screen needs the key, nothing else.
  assert.equal((await deskCode({ key: 'wrong' })).body.code, 'desk-off');
  const shown = await deskCode({ key, since: Date.now() - 3600e3 });
  assert.equal(shown.status, 200);
  assert.equal(shown.body.today, 0);

  assert.equal((await s.post(PRIYA, '/api/gym/checkin', { code: 'ABCDEFGHJK' })).body.code, 'stale-code');
  const first = await s.post(PRIYA, '/api/gym/checkin', { code: shown.body.code });
  assert.deepEqual([first.status, first.body.already, first.body.visits.length], [200, false, 1]);
  assert.equal((await s.post(PRIYA, '/api/gym/checkin', { code: shown.body.code })).body.already, true);
  await s.post(RAHUL, '/api/gym/checkin', { code: (await deskCode({ key })).body.code });
  assert.equal((await deskCode({ key, since: Date.now() - 3600e3 })).body.today, 2);
  assert.equal((await s.get(PRIYA, '/api/gym/visits')).body.visits.length, 1);

  // Her trainer sees her visits; a new link ends the old one.
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  assert.equal((await s.get(AMAN, `/api/gym/client?id=${PRIYA}`)).body.visits.length, 1);
  assert.equal((await s.get(AMAN, '/api/gym/clients')).body.clients[0].visits.length, 1);
  await s.post(OWNER, '/api/gym/desk', { on: true });
  assert.equal((await deskCode({ key })).status, 404);
  await s.post(OWNER, '/api/gym/desk', { on: false });
  assert.equal((await s.get(OWNER, '/api/gym/desk')).body.desk, null);
});

/* ---------- M4: the owner's dashboard (dashboard.js) ---------- */

test('the dashboard has every member with their trainer, last visit and PT, and the raw times to count', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const g = G.emptyGym();
  G.makeTrainer(g, { id: 't1', name: 'Aman' });
  G.link(g, 'm1', 'AMAN01', new Date('2026-09-01T10:00:00Z'));
  G.link(g, 'm2', 'AMAN01', new Date('2026-09-01T10:00:00Z'));
  G.removeClient(g, 't1', 'm2', new Date('2026-10-10T10:00:00Z'));
  g.phones.m1 = '+919876543210';
  const pkg = PT.addPackage(g, { member: 'm1', trainer: 't1', total: 10, start: '2026-10-01' }, 't1', new Date(now)).package;
  PT.countSession(g, 'm1', '2026-10-29', 't1', { now: new Date(now) });
  PT.flagSession(g, pkg.sessions[0].id, 'm1', new Date(now));
  const visits = [{ m: 'm1', at: now - 3600e3 }, { m: 'm1', at: now - 5 * 86400e3 }, { m: 'm3', at: now - 50 * 86400e3 }];
  const checkins = { since: (from, to) => visits.filter(v => v.at >= from && v.at <= to) };
  const users = [
    { id: 't1', name: 'Aman', created: '2026-01-01T00:00:00Z' },
    { id: 'm1', name: 'Priya', created: '2026-01-01T00:00:00Z' },
    { id: 'm2', name: 'Rahul', created: '2026-01-01T00:00:00Z' },
    { id: 'm3', name: 'Neha', created: '2026-01-01T00:00:00Z' },
    { id: 'gone', name: 'Off', disabled: true },
    { id: 'own', name: 'Kundan', owner: true, admin: true },
  ];
  const d = dashboard({
    g, users, checkins, now, since: now - 4 * 3600e3,
    summaryOf: id => ({ lastWorkout: id === 'm1' ? '2026-10-28' : null, recent: id === 'm1' ? ['2026-10-28'] : [] }),
    live: id => (id === 'm1' ? { name: 'Push', startedAt: now - 600e3, exIdx: 2 } : null),
    isAdmin: u => !!u.admin,
  });
  assert.deepEqual(d.members.map(m => [m.id, m.role]), [['t1', 'trainer'], ['m1', null], ['m2', null], ['m3', null], ['own', 'owner']]);
  const priya = d.members.find(m => m.id === 'm1');
  assert.deepEqual([priya.trainer.name, priya.lastVisit, priya.phone, priya.pt.left, priya.live], ['Aman', now - 3600e3, '+919876543210', 9, { name: 'Push', startedAt: now - 600e3 }]);
  assert.equal(d.members.find(m => m.id === 'm3').lastVisit, now - 50 * 86400e3, 'a visit 50 days back still dates the last one');
  assert.deepEqual(d.trainers[0].clients.map(c => c.member), ['m1']);
  assert.deepEqual(d.trainers[0].past.map(c => [c.member, c.ended]), [['m2', '2026-10-10T10:00:00.000Z']]);
  assert.deepEqual(d.sessions.map(x => [x.d, x.by, x.member]), [['2026-10-29', 't1', 'm1']]);
  assert.deepEqual(d.flagged.map(x => [x.memberName, x.by.name]), [['Priya', 'Aman']]);
  assert.deepEqual(d.today, [{ m: 'm1', at: now - 3600e3 }]);
  assert.deepEqual(d.checkins, [now - 3600e3, now - 5 * 86400e3], 'the chart gets 35 days');
});

test('dashboard and phone numbers are for admins; a phone number is digits with an optional +', async t => {
  const s = await startServer(t);
  await s.post(OWNER, '/api/gym/trainer', { id: AMAN, trainer: true });
  await s.post(PRIYA, '/api/gym/link', { code: 'AMAN01', consent: true });
  assert.equal((await s.get(AMAN, '/api/gym/dashboard')).status, 403);
  assert.equal((await s.post(AMAN, '/api/gym/phone', { member: PRIYA, phone: '9876543210' })).status, 403);
  assert.equal((await s.post(OWNER, '/api/gym/phone', { member: PRIYA, phone: 'call me' })).body.code, 'bad-phone');
  assert.equal((await s.post(OWNER, '/api/gym/phone', { member: PRIYA, phone: '+91 98765-43210' })).body.phone, '+919876543210');
  assert.equal((await s.get(OWNER, `/api/gym/pt?member=${PRIYA}`)).body.phone, '+919876543210');

  const d = (await s.get(OWNER, `/api/gym/dashboard?since=${Date.now() - 3600e3}`)).body;
  const priya = d.members.find(m => m.id === PRIYA);
  assert.deepEqual([priya.trainer.name, priya.phone, priya.lastWorkout], ['Aman Verma', '+919876543210', '2026-10-28']);
  assert.deepEqual(d.trainers.map(x => [x.code, x.clients.length]), [['AMAN01', 1]]);
  assert.ok(!JSON.stringify(d).includes('private note'), 'a member\'s notes never reach the dashboard');
  // The trainer never sees a client's phone number.
  assert.ok(!JSON.stringify((await s.get(AMAN, `/api/gym/client?id=${PRIYA}`)).body).includes('9876543210'));

  assert.equal((await s.post(OWNER, '/api/gym/phone', { member: PRIYA, phone: '' })).body.phone, null);
  await s.post(PRIYA, '/api/gym/unlink');
  assert.deepEqual((await s.get(OWNER, '/api/gym/dashboard')).body.trainers[0].past.map(x => x.member), [PRIYA]);
});
