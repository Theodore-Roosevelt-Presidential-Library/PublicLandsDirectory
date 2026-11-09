// Theodore Roosevelt connections for every site, from the Library's own published datasets:
//   1. Roosevelt's Public Lands (publiclands.labs) — places T.R. protected as President, checked against acts and proclamations
//   2. Executive Actions "Then and now" (executiveactions.labs) — present-day places that trace to a T.R. order or proclamation
//   3. Day by Day (daybyday.labs) — places T.R. was, with dates; matched to site boundaries
// Output: data/reference/tr-connections.json (committed; reviewed by people before changes go live)
//         data/reference/tr-visit-candidates.json (town/city-level matches for human review; never published)
import { join } from 'node:path';
import { DATA, fetchJSON, readJSON, writeJSON, nowISO } from './lib.mjs';
import { pointInGeom, distanceToGeomKm } from './geo.mjs';

const PPL = 'https://raw.githubusercontent.com/Theodore-Roosevelt-Presidential-Library/PresidentialPublicLands/main/data/sites.json';
const EA = 'https://executiveactions.labs.trlibrary.com/api/v1/then-and-now/index.json';
const DBD = 'https://raw.githubusercontent.com/Theodore-Roosevelt-Presidential-Library/DaybyDay/main/data/places.json';

const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const key = (n) => String(n || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/['’.]/g, '').replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
// Loose key: drop the designation words so "Bighorn National Forest" matches "Bighorn National Forests" etc.
const loose = (n) => key(n).replace(/\b(national|forests?|wildlife|refuge|park|monument|historical|historic|site|memorial|recreation|area|preserve|and|the|of|nwr|game|range)\b/g, ' ').replace(/\s+/g, ' ').trim();
const byKey = new Map(), byLoose = new Map();
for (const s of dir) {
  byKey.set(key(s.name), s);
  const l = loose(s.name);
  if (l) (byLoose.get(l) || byLoose.set(l, []).get(l)).push(s);
}
function find(name, cat) {
  if (!name) return null;
  const exact = byKey.get(key(name));
  if (exact) return exact;
  const cands = byLoose.get(loose(name)) || [];
  if (cands.length === 1) return cands[0];
  const wantCat = { forest: 'national-forest', bird: 'national-wildlife-refuge', game: 'national-wildlife-refuge', park: 'national-park', monument: 'national-monument', national_forest: 'national-forest', wildlife_refuge: 'national-wildlife-refuge', national_park: 'national-park', national_monument: 'national-monument' }[cat];
  return cands.find((c) => c.category === wantCat) || null;
}

const out = {}; // slug -> [connection]
const add = (slug, c) => { const arr = (out[slug] ||= []); if (!arr.some((x) => x.id === c.id)) arr.push(c); };
const unmatched = { ppl: [], ea: [] };
const fmt = (d) => d;

// ---- 1. Roosevelt's Public Lands ----
const ppl = await fetchJSON(PPL);
const CAT_LABEL = { forest: 'forest reserve', bird: 'federal bird reservation', game: 'national game preserve', park: 'national park', monument: 'national monument', water: 'reclamation project' };
for (const p of ppl) {
  if (p.era !== 'tr' || p.cat === 'water') continue; // reclamation projects are not public-land units in this directory
  const s = find(p.today, p.cat) || find(p.name, p.cat);
  if (!s) { unmatched.ppl.push(`${p.name} → ${p.today}`); continue; }
  const how = p.cat === 'park' ? 'signed the act creating' : p.cat === 'forest' ? 'proclaimed or enlarged the reserve that became' : 'set aside';
  add(s.slug, {
    id: `ppl-${p.id}`, type: 'protected', label: 'Protected by T.R.',
    date: p.date, then: p.name, thenKind: CAT_LABEL[p.cat] || p.cat,
    text: `As President, Theodore Roosevelt ${how} ${p.name === s.name ? 'it' : `${p.name}`}${p.date ? ` (${p.date})` : ''}.`,
    // Notes that quote T.R. are left out: quotations publish only after verification against the TR Quotes tiers.
    note: p.note && !/[\u201c"]/.test(p.note) ? p.note : null,
    sources: (p.sources || []).map((u) => ({ url: u, name: (() => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Source'; } })() })).concat([{ name: 'Roosevelt’s Public Lands', url: `https://publiclands.labs.trlibrary.com/#place=${p.id}` }]),
    dataset: 'publiclands', reviewed: true,
  });
}

// ---- 2. Executive Actions: then and now ----
const ea = await fetchJSON(EA);
for (const p of ea.places) {
  if (!['national_park', 'national_monument', 'national_forest', 'wildlife_refuge', 'other'].includes(p.kind)) continue;
  const s = find(p.name, p.kind);
  if (!s) { if (p.kind !== 'other') unmatched.ea.push(p.name); continue; }
  for (const d of p.documents) {
    add(s.slug, {
      id: `ea-${d.id}`, type: 'executive-action', label: 'Traces to a T.R. proclamation or order',
      date: d.date, document: d.label, title: d.title, relation: d.relation_label,
      text: `${d.label} (${d.date}): “${d.title}.” Today’s site ${d.relation_label}.`,
      note: d.note && !/[\u201c"]/.test(d.note) ? d.note : null,
      sources: [{ name: `${d.label} in Theodore Roosevelt’s Executive Orders and Proclamations`, url: `https://executiveactions.labs.trlibrary.com/document.html?id=${d.id}` }].concat(d.source ? [{ name: d.source }] : []),
      dataset: 'executiveactions', reviewed: true,
    });
  }
}

// ---- 3. Day by Day: where T.R. actually was (each day's recorded location, not places merely mentioned) ----
const DAYS = 'https://raw.githubusercontent.com/Theodore-Roosevelt-Presidential-Library/DaybyDay/main/data/days.jsonl';
// Only locations taken from T.R.'s own record. Excluded: 'entry' (world-event days, where the location is the event's,
// e.g. Antietam on September 17, 1862) and 'carried' (empty days that inherit the previous location).
const TRUSTED = /^(heading|index|arrival|correction)(\+refined)?$/;
const PRECISE = new Set(['building', 'park', 'mountain', 'camp', 'ranch', 'battlefield', 'residence', 'institution', 'other']); // rivers and lakes excluded: one point can't say where along them he was
const TOLERANCE_KM = 0; // strict: inside the boundary. Small sites that geocode just outside go in _tr-place-links.json
const PLACE_LINKS = (await readJSON(join(DATA, 'editorial', '_tr-place-links.json'), { links: {} })).links;
const placeInfo = new Map((await fetchJSON(DBD)).map((p) => [p.id, p]));
const daysText = await (await fetch(DAYS, { headers: { 'User-Agent': 'PublicLandsDirectory' } })).text();
const visits = new Map(); // place id -> {first,last,days}
for (const line of daysText.split('\n')) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  const l = d.location;
  if (!d.has_entry || !l || !TRUSTED.test(l.source || '')) continue;
  for (const id of [l.id, ...(l.also || []).map((a) => (typeof a === 'string' ? a : a?.id))].filter(Boolean)) {
    const v = visits.get(id) || { first: d.date, last: d.date, days: 0 };
    if (d.date < v.first) v.first = d.date; if (d.date > v.last) v.last = d.date; v.days++;
    visits.set(id, v);
  }
}
const geoms = new Map();
for (const s of dir) if (s.bbox) { const f = await readJSON(join(DATA, 'boundaries', `${s.slug}.geojson`), null); if (f) geoms.set(s.slug, { s, g: f.geometry, b: s.bbox }); }
const candidates = [];
for (const [pid, v] of visits) {
  const p = placeInfo.get(pid);
  if (!p || p.lat == null || p.lon == null) continue;
  const pt = [p.lon, p.lat];
  for (const { s, g, b } of geoms.values()) {
    const pad = 0.004;
    const linked = PLACE_LINKS[pid] === s.slug;
    if (!linked && (pt[0] < b[0] - pad || pt[0] > b[2] + pad || pt[1] < b[1] - pad || pt[1] > b[3] + pad)) continue;
    if (!linked && !pointInGeom(pt, g) && !(TOLERANCE_KM > 0 && distanceToGeomKm(pt, g) <= TOLERANCE_KM)) continue;
    const precise = linked || (PRECISE.has(p.kind) && p.coord_precision === 'exact' && !p.uncertain);
    const rec = { place: p.name, placeId: pid, kind: p.kind, first: v.first, last: v.last, days: v.days };
    if (!precise) { candidates.push({ slug: s.slug, site: s.name, ...rec, precision: p.coord_precision || null }); continue; }
    add(s.slug, {
      id: `dbd-${pid}`, type: 'visited', label: 'T.R. was here',
      place: p.name, first: v.first, last: v.last, days: v.days,
      text: v.days > 1 ? `Day by Day places T.R. at ${p.name} on ${v.days} days between ${v.first} and ${v.last}.` : `Day by Day places T.R. at ${p.name} on ${v.first}.`,
      sources: [{ name: `${p.name} in Theodore Roosevelt Day by Day`, url: `https://daybyday.labs.trlibrary.com/place.html?id=${encodeURIComponent(pid)}` }, { name: 'First recorded day', url: `https://daybyday.labs.trlibrary.com/day.html?date=${v.first}` }],
      dataset: 'daybyday', reviewed: true,
    });
  }
}

// Order: protected, executive actions, visits; then by date.
const ORDER = { protected: 0, 'executive-action': 1, visited: 2 };
for (const k of Object.keys(out)) out[k].sort((a, b) => ORDER[a.type] - ORDER[b.type] || String(a.date || a.first).localeCompare(String(b.date || b.first)));

await writeJSON(join(DATA, 'reference', 'tr-connections.json'), { generated: nowISO(), sources: { publiclands: PPL, executiveactions: EA, daybyday: DBD }, unmatched, sites: out });
await writeJSON(join(DATA, 'reference', 'tr-visit-candidates.json'), { generated: nowISO(), note: 'Town, city or approximate Day by Day places that fall inside a site boundary. Not published. Promote one to a site by adding a reviewed entry to data/editorial/<slug>.json trConnections.', candidates: candidates.sort((a, b) => a.site.localeCompare(b.site)) });
const types = Object.values(out).flat().reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});
console.log(`T.R. connections: ${Object.keys(out).length} sites`, types, `| unmatched PPL ${unmatched.ppl.length}, EA ${unmatched.ea.length} | visit candidates for review ${candidates.length}`);
