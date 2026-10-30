// CADENCE's brand, in one place. Everything the gym layer adds lives under src/gym/, so
// openGym's own releases keep merging into this fork with few clashes (SPEC.md, decision 4).
//
// The name shown to people is CADENCE. openGym stays credited where the licence and fairness
// ask for it: the About page, NOTICE.md and the README.

// This fork's GitHub address ('<account>/<repo>'): the About page's "Source code" link and the update check.
export const REPO = 'kundankishore8929-gif/CADENCE'

export const BRAND = {
  name: 'CADENCE',
  // The wordmark: an accent part and a text-colour part. CADENCE is one word, all in the accent.
  // The lime and near-black come from the Iron Body prototype (v7.2), the app this grew out of.
  first: 'CADENCE',
  second: '',
  lime: '#c8f135',
  ink: '#0b0d0a',
  source: `https://github.com/${REPO}`,
  releases: `https://github.com/${REPO}/releases/latest`,
  upstream: 'https://github.com/DuarteSantos8/openGym',
  // openGym's own links on the About page: its APK download, its App Store rating and Duarte's
  // donation pages. They are his, not ours, so this fork leaves them out.
  openGymLinks: false,
  // openGym's exercise stills and animations are licensed from Gym visual for openGym only
  // (NOTICE.md, "Exercise media"): a commercial fork may not show them. CADENCE shows each
  // exercise's muscles instead (gym/ExerciseMap.jsx, MIT-licensed outlines) until it has its own.
  exerciseMedia: false,
}

// openGym's interface text names the app "openGym" in about forty strings, in every language.
// They are rebranded on the way out of t() instead of being edited in each language pack, so the
// packs stay openGym's own and keep merging. A name that is part of a path is left alone:
// "Documents/openGym" and "openGym/notes.txt" are the real folder the phone writes backups to.
export function rebrand(s) {
  if (typeof s !== 'string' || s.indexOf('openGym') < 0) return s
  return s.replace(/openGym/g, (m, at, all) => (all[at - 1] === '/' || all[at + m.length] === '/' ? m : BRAND.name))
}
