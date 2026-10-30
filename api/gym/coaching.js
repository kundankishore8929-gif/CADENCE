/* A trainer's diet chart and notes for a client (M5). Pure functions over gym.json's
 *
 *   diets: { [member]: { trainer, calories, protein, water, meals: { breakfast, lunch, dinner,
 *                        snacks }, notes, updatedAt } }
 *   notes: [{ id, member, trainer, at, text }]
 *
 * A diet chart is for the member: they read it in My trainer and keep the last one when the
 * sharing ends (marked as no longer updated), the way they keep their routines. A note is the
 * trainer's own, private: no member, owner or other trainer reads it, and it is deleted when the
 * sharing ends.
 */
import crypto from 'node:crypto';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_MAX = 600;
export const DIET_NOTES_MAX = 1000;
export const NOTE_MAX = 500;
export const NOTES_KEEP = 200;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, max, step = 1) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n / step) * step : undefined;
};

/** A diet chart as sent, made safe. Refused ('bad-diet') for a number out of range or no content at all. */
export function cleanDiet(d) {
  if (!d || typeof d !== 'object') return { error: 'bad-diet' };
  const calories = num(d.calories, 10000), protein = num(d.protein, 1000), water = num(d.water, 20, 0.1);
  if (calories === undefined || protein === undefined || water === undefined) return { error: 'bad-diet' };
  const meals = Object.fromEntries(MEALS.map(k => [k, text(d.meals?.[k], MEAL_MAX)]));
  const diet = { calories, protein, water: water == null ? null : Math.round(water * 10) / 10, meals, notes: text(d.notes, DIET_NOTES_MAX) };
  const empty = calories == null && protein == null && water == null && !diet.notes && MEALS.every(k => !meals[k]);
  return empty ? { error: 'bad-diet' } : { diet };
}

export function normalizeDiets(obj, isId) {
  const out = {};
  for (const [member, d] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
    const c = cleanDiet(d);
    if (isId(member) && !c.error) out[member] = { trainer: isId(d.trainer) ? d.trainer : null, ...c.diet, updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null };
  }
  return out;
}

export function normalizeNotes(list, isId) {
  const out = [];
  for (const n of Array.isArray(list) ? list : []) {
    if (n && isId(n.id) && isId(n.member) && isId(n.trainer) && typeof n.at === 'string' && text(n.text, NOTE_MAX) && !out.some(x => x.id === n.id)) {
      out.push({ id: n.id, member: n.member, trainer: n.trainer, at: n.at, text: text(n.text, NOTE_MAX) });
    }
  }
  return out;
}

export function setDiet(g, member, trainer, diet, now = new Date()) {
  g.diets[member] = { trainer, ...diet, updatedAt: now.toISOString() };
  return g.diets[member];
}

/** A trainer's notes on one client, newest first. */
export const notesFor = (g, member, trainer) => g.notes.filter(n => n.member === member && n.trainer === trainer).sort((a, b) => (a.at < b.at ? 1 : -1));

export function addNote(g, member, trainer, body, now = new Date()) {
  const t = text(body, NOTE_MAX);
  if (!t) return { error: 'empty' };
  if (notesFor(g, member, trainer).length >= NOTES_KEEP) return { error: 'too-many' };
  const n = { id: 'n' + crypto.randomBytes(6).toString('hex'), member, trainer, at: now.toISOString(), text: t };
  g.notes.push(n);
  return { note: n };
}

/** Only its author removes a note. */
export function removeNote(g, id, trainer) {
  const n = g.notes.find(x => x.id === id && x.trainer === trainer);
  if (n) g.notes = g.notes.filter(x => x !== n);
  return n || null;
}

/** The sharing between them ended: the trainer's notes on that member go. */
export function dropNotes(g, member, trainer) {
  const before = g.notes.length;
  g.notes = g.notes.filter(n => !(n.member === member && (trainer == null || n.trainer === trainer)));
  return before - g.notes.length;
}
