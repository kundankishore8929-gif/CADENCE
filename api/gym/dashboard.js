/* The owner's dashboard (M4): everything the Gym screen shows, in one answer for the owner and
 * the front desk (admins). Pure: routes.js hands in gym.json, the accounts and small readers.
 *
 * Raw days and times rather than finished numbers, as for a trainer's client list: "today",
 * "this month" and the busy hours are counted on the owner's own calendar in the app
 * (frontend/src/gym/dashboard.js), not on the server's UTC clock.
 */
import * as G from './store.js';
import { ptSummary } from './pt.js';

const DAY = 86400e3;
export const SESSION_DAYS = 62;
export const CHART_DAYS = 35;

/**
 * `users` = the accounts, `summaryOf(uid)` = a client summary (routes.js clientSummary, cached),
 * `live(uid)` = the workout running now or null, `checkins` = desk.js checkinLog,
 * `since` = the owner's local midnight (epoch ms), for "checked in today".
 */
export function dashboard({ g, users, summaryOf, live, checkins, isAdmin, since, now = Date.now() }) {
  const nameOf = id => users.find(u => u.id === id)?.name || '';
  const lastVisit = new Map();
  for (const v of checkins.since(now - 92 * DAY, now)) if (v.at > (lastVisit.get(v.m) || 0)) lastVisit.set(v.m, v.at);
  const at = new Date(now);

  const members = users.filter(u => !u.disabled).map(u => {
    const l = G.linkOf(g, u.id);
    const p = G.programmeOf(g, u.id);
    const s = summaryOf(u.id);
    const run = live(u.id);
    return {
      id: u.id, name: u.name, joined: u.created || null,
      role: u.owner ? 'owner' : isAdmin(u) ? 'admin' : G.trainerOf(g, u.id) ? 'trainer' : null,
      trainer: l ? { id: l.trainer, name: nameOf(l.trainer) } : null,
      lastWorkout: s.lastWorkout, recent: s.recent,
      lastVisit: lastVisit.get(u.id) || null,
      programme: p ? { start: p.start, days: Object.keys(p.week) } : null,
      pt: ptSummary(g, u.id, at),
      phone: g.phones[u.id] || null,
      live: run ? { name: run.name || '', startedAt: run.startedAt || null } : null,
    };
  });

  const trainers = g.trainers.map(t => ({
    id: t.id, name: nameOf(t.id), code: t.code,
    clients: G.clientsOf(g, t.id).map(l => ({ member: l.member, since: l.since })),
    past: g.pastLinks.filter(l => l.trainer === t.id).map(l => ({ member: l.member, since: l.since, ended: l.ended })),
  }));

  const from = new Date(now - SESSION_DAYS * DAY).toISOString().slice(0, 10);
  const sessions = [], flagged = [];
  for (const p of g.packages) {
    for (const s of p.sessions) {
      if (s.d >= from) sessions.push({ id: s.id, d: s.d, by: s.by, member: p.member });
      if (s.flag && !s.flag.kept) flagged.push({ id: s.id, d: s.d, member: p.member, memberName: nameOf(p.member), by: s.by ? { id: s.by, name: nameOf(s.by) } : null, flaggedAt: s.flag.at });
    }
  }

  const day0 = Number.isFinite(since) ? Math.min(now, Math.max(now - 36 * 3600e3, since)) : now - DAY;
  return {
    now,
    members,
    trainers,
    sessions,
    flagged,
    today: checkins.since(day0, now).map(v => ({ m: v.m, at: v.at })),
    checkins: checkins.since(now - CHART_DAYS * DAY, now).map(v => v.at),
  };
}
