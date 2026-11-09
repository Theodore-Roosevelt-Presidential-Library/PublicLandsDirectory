// Official websites and social accounts for every site, verified against the live web.
//   1. Wikidata: official website (P856), Facebook (P2013), Instagram (P2003), X (P2002), YouTube channel (P2397)
//   2. Fish and Wildlife Service refuges: fws.gov/refuge/<name> pattern, kept only if the page answers
//   3. Every official website is fetched; only pages that load (after redirects) on a government domain are kept
// Output: data/reference/links.json (committed)
import { join } from 'node:path';
import { DATA, readJSON, writeJSON, nowISO, sleep, UA, mapLimit } from './lib.mjs';

const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const prev = (await readJSON(join(DATA, 'reference', 'links.json'), { sites: {} })).sites;
const labelVariants = (n) => [...new Set([n, n.replace(/ & /g, ' and '), n.replace(/\bOf The\b/g, 'of the')])];
const byLabel = new Map();
for (const s of dir) for (const v of labelVariants(s.name)) byLabel.set(v, s.slug);
const labels = [...byLabel.keys()];

const wd = {};
for (let i = 0; i < labels.length; i += 100) {
  const chunk = labels.slice(i, i + 100);
  const q = `SELECT ?name ?item ?web ?fb ?ig ?x ?yt WHERE { VALUES ?name { ${chunk.map((l) => JSON.stringify(l) + '@en').join(' ')} } ?item rdfs:label ?name; wdt:P17 wd:Q30.
    OPTIONAL { ?item wdt:P856 ?web } OPTIONAL { ?item wdt:P2013 ?fb } OPTIONAL { ?item wdt:P2003 ?ig } OPTIONAL { ?item wdt:P2002 ?x } OPTIONAL { ?item wdt:P2397 ?yt } }`;
  try {
    const res = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: q }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const b of (await res.json()).results.bindings) {
      const slug = byLabel.get(b.name.value);
      const r = (wd[slug] ||= { item: b.item.value, web: new Set(), facebook: new Set(), instagram: new Set(), x: new Set(), youtube: new Set() });
      if (b.web) r.web.add(b.web.value);
      if (b.fb) r.facebook.add(b.fb.value); if (b.ig) r.instagram.add(b.ig.value); if (b.x) r.x.add(b.x.value); if (b.yt) r.youtube.add(b.yt.value);
    }
  } catch (e) { console.warn(`Wikidata chunk ${i}: ${e.message}`); }
  await sleep(1000);
}
console.log(`Wikidata link data for ${Object.keys(wd).length} sites`);

// Live check: follow redirects; keep only working pages on .gov (or the agency's own domains), not a search or error page.
async function check(url) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PublicLandsDirectory/1.0; +https://directory.labs.trlibrary.com)' }, signal: ctrl.signal });
    clearTimeout(t);
    const final = r.url;
    const host = new URL(final).hostname;
    const ok = r.ok && /\.gov$|\.mil$/.test(host) && !/\/(search|404|not-found)\b/i.test(new URL(final).pathname) && new URL(final).pathname !== '/';
    return { ok, status: r.status, final };
  } catch (e) { return { ok: false, status: 0, error: String(e.message).slice(0, 60) }; }
}

// ---- Forest Service: current unit pages, read from the official regional "Forests and Grasslands" pages ----
const fsUnits = [];
for (const r of ['01', '02', '03', '04', '05', '06', '08', '09', '10']) {
  try {
    const html = await (await fetch(`https://www.fs.usda.gov/r${r}/forests-grasslands`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PublicLandsDirectory/1.0)' } })).text();
    for (const m of html.matchAll(/href="(?:https:\/\/www\.fs\.usda\.gov)?(\/r\d{2}\/[a-z0-9-]+)"[^>]*>([^<]{3,90})</g)) {
      const name = m[2].replace(/&amp;/g, '&').trim();
      if (/national (forest|grassland)|grasslands|scenic area|management unit|savannah river/i.test(name) && !fsUnits.some((u) => u.path === m[1])) fsUnits.push({ path: m[1], name });
    }
  } catch (e) { console.warn(`USFS region ${r}: ${e.message}`); }
}
console.log(`Forest Service units found: ${fsUnits.length}`);
const FS_STATE = { NC: 'North Carolina', AL: 'Alabama', FL: 'Florida', MS: 'Mississippi', TX: 'Texas' };
const base = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/national (forests?|grasslands?|recreation area|monument|volcanic monument|scenic area|game refuge|wildlife refuge|historic area)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function fsUnitFor(s) {
  const b = base(s.name);
  if (b) { const hit = fsUnits.find((u) => base(u.name).split(' ').join(' ').includes(b)); if (hit) return hit; }
  for (const st of s.states) if (FS_STATE[st]) { const hit = fsUnits.find((u) => u.name.includes(FS_STATE[st])); if (hit) return hit; }
  return null;
}
// Special areas (NRAs, monuments, scenic areas) take the unit of the proclaimed forest they sit in.
const forests = dir.filter((s) => s.agency.code === 'USFS' && /national forest|grassland/i.test(s.designation));
const { pointInGeom } = await import('./geo.mjs');
const forestGeoms = new Map();
async function containingForest(s) {
  if (!s.location) return null;
  for (const f of forests) {
    if (!f.bbox || s.location.lon < f.bbox[0] || s.location.lon > f.bbox[2] || s.location.lat < f.bbox[1] || s.location.lat > f.bbox[3]) continue;
    if (!forestGeoms.has(f.slug)) forestGeoms.set(f.slug, (await readJSON(join(DATA, 'boundaries', `${f.slug}.geojson`), null))?.geometry || null);
    const g = forestGeoms.get(f.slug);
    if (g && pointInGeom([s.location.lon, s.location.lat], g)) return f;
  }
  return null;
}

const FWS_SLUG = (name) => name.toLowerCase().replace(/ national wildlife refuge$| wetland management district$| national wildlife and fish refuge$/, '').replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = {};
await mapLimit(dir, 8, async (s) => {
  const w = wd[s.slug];
  const cands = [];
  if (s.agency.code === 'NPS' && s.links.official) cands.push({ url: s.links.official, from: 'NPS Data API' });
  for (const u of w?.web || []) cands.push({ url: u, from: 'Wikidata' });
  if (s.managedBy.some((m) => m.code === 'FWS')) {
    cands.push({ url: `https://www.fws.gov/refuge/${FWS_SLUG(s.name)}`, from: 'fws.gov pattern' });
    if (/wetland management district/i.test(s.name)) cands.push({ url: `https://www.fws.gov/refuge/${FWS_SLUG(s.name)}-wetland-management-district`, from: 'fws.gov pattern' });
  }
  if (s.managedBy.some((m) => m.code === 'USFS')) {
    let unit = fsUnitFor(s);
    if (!unit && !/national forest|grassland/i.test(s.designation)) { const f = await containingForest(s); if (f) unit = fsUnitFor(f); }
    if (unit) cands.push({ url: `https://www.fs.usda.gov${unit.path}`, from: `fs.usda.gov (${unit.name})` });
  }
  let official = null;
  for (const c of cands) {
    if (prev[s.slug]?.official?.url === c.url && prev[s.slug]?.official?.checked > new Date(Date.now() - 6 * 864e5).toISOString()) { official = prev[s.slug].official; break; }
    const r = await check(c.url);
    if (r.ok) { official = { url: r.final.replace(/\/$/, ''), from: c.from, checked: nowISO() }; break; }
  }
  const one = (set) => [...(set || [])][0] || null;
  const social = {};
  if (w) {
    if (one(w.facebook)) social.facebook = `https://www.facebook.com/${one(w.facebook)}`;
    if (one(w.instagram)) social.instagram = `https://www.instagram.com/${one(w.instagram)}`;
    if (one(w.x)) social.x = `https://x.com/${one(w.x)}`;
    if (one(w.youtube)) social.youtube = `https://www.youtube.com/channel/${one(w.youtube)}`;
  }
  out[s.slug] = { official, social, socialSource: Object.keys(social).length ? 'Wikidata' : null, wikidata: w?.item || null };
});

const n = Object.values(out);
const by = (f) => n.filter(f).length;
await writeJSON(join(DATA, 'reference', 'links.json'), { generated: nowISO(), counts: { sites: n.length, official: by((x) => x.official), social: by((x) => Object.keys(x.social).length) }, sites: out });
console.log(`Official websites verified: ${by((x) => x.official)}/${n.length}; with social accounts: ${by((x) => Object.keys(x.social).length)}`);
const missing = dir.filter((s) => !out[s.slug].official).reduce((m, s) => ((m[s.agency.code] = (m[s.agency.code] || 0) + 1), m), {});
console.log('Missing official site by agency', missing);
