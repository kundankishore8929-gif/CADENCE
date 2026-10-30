/* The gym's own look (M5): its name, logo, colour, and the country code its members' phone
 * numbers are read in (WhatsApp). Kept in DATA_DIR/gym-brand.json, apart from gym.json: the logo
 * is a small picture (up to 200 KB) that changes rarely, and gym.json is rewritten on every PT
 * count. Public: the sign-in screen shows it before anyone is signed in.
 *
 * The logo is stored as a data: URL of a PNG, JPEG or WebP, checked by its first bytes, never SVG
 * (a script can hide in one). The app shrinks the picture to 256 px before it sends it.
 */
export const NAME_MAX = 40;
export const LOGO_MAX = 200 * 1024;
const HEX = /^#[0-9a-f]{6}$/;
const CC = /^\d{1,3}$/;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAGIC = {
  png: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

export const emptyBrand = () => ({ name: '', accent: null, cc: '91', logo: null, updatedAt: null });

/** A logo as sent: a data: URL of a real PNG, JPEG or WebP of at most 200 KB, or null. */
export function cleanLogo(v) {
  if (v == null || v === '') return { logo: null };
  const m = typeof v === 'string' && DATA_URL.exec(v);
  if (!m) return { error: 'bad-logo' };
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > LOGO_MAX) return { error: 'logo-too-big' };
  if (bytes.length < 12 || !MAGIC[m[1]](bytes)) return { error: 'bad-logo' };
  return { logo: v };
}

/** gym-brand.json read from disk, as far as it is sound. */
export function normalizeBrand(doc) {
  const b = emptyBrand();
  if (!doc || typeof doc !== 'object') return b;
  if (typeof doc.name === 'string') b.name = doc.name.trim().slice(0, NAME_MAX);
  if (typeof doc.accent === 'string' && HEX.test(doc.accent.toLowerCase())) b.accent = doc.accent.toLowerCase();
  if (typeof doc.cc === 'string' && CC.test(doc.cc)) b.cc = doc.cc;
  if (!cleanLogo(doc.logo).error) b.logo = cleanLogo(doc.logo).logo;
  if (typeof doc.updatedAt === 'string') b.updatedAt = doc.updatedAt;
  return b;
}

/**
 * The owner's change: only the fields sent change. `accent: null` and `logo: null` go back to
 * CADENCE's own. Refused with 'bad-name', 'bad-colour', 'bad-cc', 'bad-logo' or 'logo-too-big'.
 */
export function updateBrand(cur, body, now = new Date()) {
  const b = { ...cur };
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length > NAME_MAX) return { error: 'bad-name' };
    b.name = body.name.trim();
  }
  if ('accent' in body) {
    if (body.accent !== null && !(typeof body.accent === 'string' && HEX.test(body.accent.toLowerCase()))) return { error: 'bad-colour' };
    b.accent = body.accent ? body.accent.toLowerCase() : null;
  }
  if ('cc' in body) {
    const cc = String(body.cc ?? '').replace(/^\+/, '');
    if (!CC.test(cc)) return { error: 'bad-cc' };
    b.cc = cc;
  }
  if ('logo' in body) {
    const l = cleanLogo(body.logo);
    if (l.error) return { error: l.error };
    b.logo = l.logo;
  }
  b.updatedAt = now.toISOString();
  return { brand: b };
}
