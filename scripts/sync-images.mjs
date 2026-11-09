// Cover image for every site, following the Library's image-rights standard (Brand and Editorial Standards, 2026-11-08):
//   tier 1  U.S. government public domain (agency photos credited to the agency)
//   tier 2  Public domain or CC0 on Wikimedia Commons
//   tier 3  CC BY 4.0 or CC BY-SA 4.0 on Commons, shown with a linked license credit
//   never   CC 3.0 or earlier, NonCommercial, NoDerivatives, GFDL-only, unknown, or a blocklisted author
// Output: data/reference/cover-images.json (committed, so every change is reviewable in git)
import { join } from 'node:path';
import { DATA, fetchJSON, readJSON, writeJSON, nowISO, sleep, UA } from './lib.mjs';

const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const nps = new Map((await readJSON(join(DATA, 'sources', 'nps.json'), [])).map((r) => [r.id, r]));
const blocklist = (await readJSON(join(DATA, 'reference', 'image-blocklist.json'), { authors: [] })).authors.map((a) => a.toLowerCase());
const prev = (await readJSON(join(DATA, 'reference', 'cover-images.json'), { sites: {} })).sites;
const ovFile = await readJSON(join(DATA, 'editorial', '_cover-overrides.json'), { sites: {}, reject: [] });
const overrides = ovFile.sites || {}; // hand-picked covers win
const rejectSlugs = new Set(ovFile.reject || []); // automatic picks vetoed by a person

const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function classify(meta) {
  const short = strip(meta.LicenseShortName?.value), lic = strip(meta.License?.value).toLowerCase(), url = strip(meta.LicenseUrl?.value);
  const s = `${short} ${lic}`.toLowerCase();
  if (/\bnc\b|non-?commercial|\bnd\b|no-?deriv/.test(s)) return null;
  if (/cc0|public domain|^pd\b|\bpd-|pdm/.test(s)) return { tier: /usgov|nps|fws|usgs|usda|blm|nara|loc|nasa/.test(s) ? 1 : 2, license: short || 'Public domain', licenseUrl: url || null };
  if (/cc[- ]by(-sa)?[- ]4\.0|by(-sa)? 4\.0/.test(s)) return { tier: 3, license: short, licenseUrl: url || (s.includes('sa') ? 'https://creativecommons.org/licenses/by-sa/4.0/' : 'https://creativecommons.org/licenses/by/4.0/') };
  return null; // CC 3.0/2.5/2.0, GFDL, unknown: not allowed
}

// Cover quality: reject maps, signs, people, events, equipment and archival scans; favor landscapes and wildlife.
const BAD = /\bmaps?\b|plat|survey|diagram|chart|logo|seal|emblem|\bsigns?\b|signage|closed|closure|notice|brochure|poster|people|person|portrait|staff|employee|volunteer|director|secretary|ranger\b.*(with|and)|ceremony|meeting|event|award|dedication|press|students?|children|kids|visitors? cent|office|building|headquarters|vehicle|truck|car\b|boat|airboat|aircraft|helicopter|plane|equipment|construction|model|exhibit|museum|interior|aerial photograph of|black and white|b&w|historic(al)? photo|negative|scan|postcard|stamp|cover of|document|letter|book|screenshot|video|still from/i;
const GOOD = /landscape|scenic|sunset|sunrise|view|vista|panorama|lake|pond|marsh|wetland|swamp|prairie|grassland|meadow|mountain|peak|ridge|canyon|valley|river|creek|falls|waterfall|forest|woods|beach|shore|coast|dunes|island|bay|desert|badlands|buttes?|wildlife|birds?|heron|egret|crane|eagle|duck|geese|elk|bison|deer|pronghorn/i;
function quality(title, m) {
  const cats = strip(m.Categories?.value), desc = strip(m.ImageDescription?.value), name = strip(m.ObjectName?.value);
  const text = `${title} ${name} ${desc} ${cats}`;
  if (BAD.test(text)) return -1;
  const date = strip(m.DateTimeOriginal?.value).match(/(1[89]\d\d|19[0-4]\d)/);
  if (date) return -1; // archival photograph
  return GOOD.test(text) ? 2 : 1;
}
async function loads(url) {
  try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }); return r.ok && /image\//.test(r.headers.get('content-type') || ''); } catch { return false; }
}

// ---- 1. Agency photos: NPS images credited to NPS are public domain ----
const covers = {};
for (const s of dir) {
  if (overrides[s.slug]) { covers[s.slug] = { ...overrides[s.slug], tier: overrides[s.slug].tier ?? 0, source: overrides[s.slug].source || 'Library selection' }; continue; }
  const rec = nps.get(s.id);
  const img = rec?.images?.find((i) => /^\s*(NPS|National Park Service)\b|\bNPS\s*(Photo|\/)|^\s*NPS\//i.test(i.credit || ''));
  if (img) covers[s.slug] = { url: img.url, title: img.title, alt: img.alt || img.title, credit: img.credit, license: 'Public domain (U.S. government work)', licenseUrl: null, filePage: rec.url, tier: 1, source: 'National Park Service' };
}

// ---- 2. Wikidata lead image (P18) or page banner (P948) for every site, matched by English label in the U.S. ----
const need = dir.filter((s) => !covers[s.slug] || covers[s.slug].tier > 1);
const labelVariants = (n) => [...new Set([n, n.replace(/ & /g, ' and '), n.replace(/\bOf The\b/g, 'of the')])];
const byLabel = new Map();
for (const s of need) for (const v of labelVariants(s.name)) byLabel.set(v, s.slug);
const labels = [...byLabel.keys()];
const found = {}; // slug -> [{file, kind}]
for (let i = 0; i < labels.length; i += 100) {
  const chunk = labels.slice(i, i + 100);
  const q = `SELECT ?name ?item ?img ?banner WHERE { VALUES ?name { ${chunk.map((l) => JSON.stringify(l) + '@en').join(' ')} } ?item rdfs:label ?name; wdt:P17 wd:Q30. OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?item wdt:P948 ?banner } }`;
  try {
    const res = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: q }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    for (const b of d.results.bindings) {
      const slug = byLabel.get(b.name.value);
      for (const [k, kind] of [['img', 'image'], ['banner', 'banner']]) {
        if (!b[k]) continue;
        const file = decodeURIComponent(b[k].value.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ');
        if (file) (found[slug] ||= []).some((x) => x.file === file) || found[slug].push({ file, kind, item: b.item.value });
      }
    }
  } catch (e) { console.warn(`Wikidata chunk ${i} failed: ${e.message}`); }
  await sleep(1200);
}
console.log(`Wikidata images for ${Object.keys(found).length} of ${need.length} sites`);

// ---- 3. Commons license check, 50 files per request ----
const files = [...new Set(Object.values(found).flat().map((x) => x.file))];
const info = {};
for (let i = 0; i < files.length; i += 50) {
  const titles = files.slice(i, i + 50).map((f) => `File:${f}`).join('|');
  try {
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1600&titles=${encodeURIComponent(titles)}`, { headers: { 'User-Agent': UA } });
    const norm = Object.fromEntries((d.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of Object.values(d.query.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      info[(norm[p.title] || p.title).replace(/^File:/, '')] = ii;
    }
  } catch (e) { console.warn(`Commons batch ${i} failed: ${e.message}`); }
  await sleep(500);
}

let added = 0; const rejected = {};
for (const [slug, cands] of Object.entries(found)) {
  const ok = [];
  for (const c of cands) {
    const ii = info[c.file]; if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || '')) continue;
    const m = ii.extmetadata || {};
    const cls = classify(m);
    const artist = strip(m.Artist?.value) || 'Unknown author';
    if (!cls) { (rejected[slug] ||= []).push({ file: c.file, why: strip(m.LicenseShortName?.value) || 'unknown license' }); continue; }
    if (blocklist.some((b) => artist.toLowerCase().includes(b))) { (rejected[slug] ||= []).push({ file: c.file, why: `blocklisted author: ${artist}` }); continue; }
    if ((ii.width || 0) < 800) continue;
    if (quality(c.file, m) < 0 && c.kind !== 'banner') { (rejected[slug] ||= []).push({ file: c.file, why: 'not a cover subject (map, sign, people, archival…)' }); continue; }
    ok.push({
      url: ii.thumburl || ii.url, original: ii.url, title: strip(m.ObjectName?.value) || c.file.replace(/\.\w+$/, ''), alt: strip(m.ImageDescription?.value).slice(0, 200) || null,
      credit: artist, license: cls.license, licenseUrl: cls.licenseUrl, filePage: ii.descriptionurl, tier: cls.tier, source: 'Wikimedia Commons', wikidata: c.item, kind: c.kind,
    });
  }
  ok.sort((a, b) => a.tier - b.tier || (a.kind === 'image' ? -1 : 1));
  let best = null;
  for (const c of ok) { if (await loads(c.url)) { best = c; break; } }
  if (best && (!covers[slug] || best.tier < covers[slug].tier)) { covers[slug] = best; added++; }
}

// ---- 4. Fallback: the site's own Commons category (often full of public-domain agency photos) ----
const stillMissing = dir.filter((s) => !covers[s.slug] || covers[s.slug].tier > 2);
const LIMIT = Number(process.env.COMMONS_CATEGORY_LOOKUPS || 2000);
let fromCat = 0;
for (const s of stillMissing.slice(0, LIMIT)) {
  const cat = s.name.replace(/ & /g, ' and ');
  try {
    const q = `incategory:"${cat}" filetype:bitmap`;
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1600`, { headers: { 'User-Agent': UA } });
    const ok = [];
    for (const p of Object.values(d.query?.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || '')) continue;
      if ((ii.width || 0) < 1200 || ii.width < ii.height) continue; // landscape covers only
      const m = ii.extmetadata || {};
      const cls = classify(m); if (!cls) continue;
      const artist = strip(m.Artist?.value) || 'Unknown author';
      if (blocklist.some((b) => artist.toLowerCase().includes(b))) continue;
      const q = quality(p.title, m); if (q < 0) continue;
      ok.push({ q, url: ii.thumburl || ii.url, original: ii.url, title: strip(m.ObjectName?.value) || p.title.replace(/^File:|\.\w+$/g, ''), alt: strip(m.ImageDescription?.value).slice(0, 200) || null, credit: artist, license: cls.license, licenseUrl: cls.licenseUrl, filePage: ii.descriptionurl, tier: cls.tier, source: 'Wikimedia Commons', kind: 'category', index: p.index ?? 99 });
    }
    ok.sort((a, b) => b.q - a.q || a.tier - b.tier || a.index - b.index);
    for (const c of ok.slice(0, 4)) {
      if (covers[s.slug] && c.tier >= covers[s.slug].tier) break;
      if (!(await loads(c.url))) continue;
      delete c.index; delete c.q; c.review = 'auto-category'; covers[s.slug] = c; fromCat++; break;
    }
  } catch (e) { /* category missing or API hiccup: leave for next run */ }
  await sleep(250);
}
console.log(`Commons categories added or upgraded ${fromCat} covers`);

for (const slug of rejectSlugs) if (!overrides[slug]) delete covers[slug];
const tiers = Object.values(covers).reduce((m, c) => ((m[c.tier] = (m[c.tier] || 0) + 1), m), {});
const missing = dir.filter((s) => !covers[s.slug]).map((s) => s.slug);
const changed = Object.keys(covers).filter((k) => prev[k]?.url !== covers[k].url).length;
await writeJSON(join(DATA, 'reference', 'cover-images.json'), { generated: nowISO(), policy: 'TRPL image-rights standard: U.S. government PD, then PD/CC0, then CC BY/BY-SA 4.0 with linked license. Never CC 3.0 or earlier, NC or ND.', counts: { total: dir.length, withCover: Object.keys(covers).length, byTier: tiers, missing: missing.length }, sites: covers, rejected, missing });
console.log(`Covers: ${Object.keys(covers).length}/${dir.length} (tier counts ${JSON.stringify(tiers)}), ${added} from Commons, ${changed} changed, ${missing.length} still missing`);
