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
  assert.deepEqual(g, { v: 1, trainers: [], links: [], programmes: [] });
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

  // What is on disk is only roles and links: no training data is ever copied there.
  const saved = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'gym.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['links', 'programmes', 'trainers', 'v']);
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
