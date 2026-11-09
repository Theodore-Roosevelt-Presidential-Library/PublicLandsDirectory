// Merge agency sources + hand-written editorial into one global directory.
// Output: data/directory.json (no geometry) and data/boundaries/<slug>.geojson
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { DATA, readJSON, writeJSON, listJSON, slugify, arcgisQuery, AGENCIES, CATEGORIES, categorize, STATE_NAMES, nowISO, bboxOf, labelPoint } from './lib.mjs';
import { pointInGeom, sampleVertices } from './geo.mjs';

const SHOW_UNREVIEWED = process.env.SHOW_UNREVIEWED === '1';
const AGENCY_PRIORITY = { NPS: 0, FWS: 1, BLM: 2, USFS: 3 };

// Spherical polygon area (acres) — holes subtracted.
function ringArea(ring) {
  const R = 6378137, rad = Math.PI / 180;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((a * R * R) / 2);
}
function areaAcres(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let m2 = 0;
  for (const p of polys) m2 += ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0);
  return m2 / 4046.8564224;
}

// ---- reference: state boundaries (TIGERweb), cached ----
const statesFile = join(DATA, 'reference', 'states.geojson');
if (!existsSync(statesFile)) {
  const L = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0';
  const feats = await arcgisQuery(L, { returnGeometry: 'true', outFields: 'STUSAB,NAME', outSR: '4326', maxAllowableOffset: '0.02', geometryPrecision: '3' }, { geojson: true, pageSize: 20 });
  await writeJSON(statesFile, { type: 'FeatureCollection', features: feats }, false);
  console.log(`Cached ${feats.length} state boundaries`);
}
const states = (await readJSON(statesFile)).features.map((f) => ({ code: f.properties.STUSAB, geom: f.geometry, bbox: bboxOf(f.geometry) }));
function statesFor(geom, pt) {
  const pts = geom ? sampleVertices(geom, 150) : [];
  if (pt) pts.push([pt.lon, pt.lat]);
  // A state counts when it holds the site's label point or a real share of its boundary. One vertex across a line,
  // left by simplification (Beaver Dam Wash in Nevada, Baaj Nwaavjo in Utah), is not enough.
  const n = {}, labelState = [];
  pts.forEach((p, i) => { for (const s of states) {
    if (p[0] < s.bbox[0] || p[0] > s.bbox[2] || p[1] < s.bbox[1] || p[1] > s.bbox[3]) continue;
    if (pointInGeom(p, s.geom)) { n[s.code] = (n[s.code] || 0) + 1; if (pt && i === pts.length - 1) labelState.push(s.code); break; }
  } });
  const min = 2;
  return Object.keys(n).filter((c) => n[c] >= min || labelState.includes(c) || Object.keys(n).length === 1).sort();
}

// ---- load sources ----
const sources = [];
for (const a of ['nps', 'fws', 'usfs', 'blm']) {
  const f = join(DATA, 'sources', `${a}.json`);
  if (existsSync(f)) sources.push(...(await readJSON(f)).map((r) => (r.agency === 'NPS' ? { ...r, category: categorize(r.designation, r.name) } : r)));
  else console.warn(`(missing source ${a})`);
}

// ---- hand-added sites missing from agency map data (data/editorial/_manual-sites.json) ----
for (const m of (await readJSON(join(DATA, 'editorial', '_manual-sites.json'), { sites: [] })).sites) {
  if (sources.some((r) => r.name.toLowerCase() === m.name.toLowerCase())) continue; // the agency data has it now
  sources.push({ ...m, boundary: null, images: [], synced: nowISO() });
}

// ---- cross-agency grouping: one directory entry per place, listing every managing agency ----
const nameKey = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').replace(/\b(and preserve|national monument and preserve)\b/g, (m) => m).trim();
// Same place, different names across agencies. Keys are nameKey() forms.
const NAME_ALIASES = {
  'craters of the moon national monument': 'craters of the moon national monument and preserve',
  'santa rosa san jacinto mountains national monument': 'santa rosa and san jacinto national monument',
};
const groups = new Map();
for (const r of sources) {
  const k0 = nameKey(r.name);
  const k = NAME_ALIASES[k0] || k0;
  (groups.get(k) || groups.set(k, []).get(k)).push(r);
}

// ---- editorial (hand-maintained, reviewed) ----
const editorial = new Map();
for (const f of (await listJSON(join(DATA, 'editorial'))).filter((f) => !f.split('/').pop().startsWith('_'))) {
  const e = await readJSON(f);
  editorial.set(e.id || e.slug, e);
}

const live = await readJSON(join(DATA, 'live', 'alerts.json'), { sites: {} });
const covers = (await readJSON(join(DATA, 'reference', 'cover-images.json'), { sites: {} })).sites;
const allTrails = (await readJSON(join(DATA, 'reference', 'alltrails.json'), { sites: {} })).sites;
const geomOf = new Map();
const visits = (await readJSON(join(DATA, 'reference', 'visitation.json'), { sites: {} })).sites;
const recGov = (await readJSON(join(DATA, 'reference', 'recgov.json'), { sites: {} })).sites;
const manualLinks = (await readJSON(join(DATA, 'editorial', '_official-links.json'), { sites: {} })).sites;
const verifiedLinks = (await readJSON(join(DATA, 'reference', 'links.json'), { sites: {} })).sites;
const trAuto = (await readJSON(join(DATA, 'reference', 'tr-connections.json'), { sites: {} })).sites;
const slugs = new Set();
const directory = [];

for (const recs of groups.values()) {
  recs.sort((a, b) => AGENCY_PRIORITY[a.agency] - AGENCY_PRIORITY[b.agency] || (b.acres?.value || 0) - (a.acres?.value || 0));
  const primary = recs[0];
  // Same name within one agency (e.g. two FWS units) are different places — keep them separate.
  const sameAgencyDupes = recs.filter((r, i) => i > 0 && r.agency === primary.agency);
  const partners = recs.filter((r) => r.agency !== primary.agency);
  for (const rec of [primary, ...sameAgencyDupes]) {
    const co = rec === primary ? partners : [];
    let geometry = rec.boundary?.geometry || null;
    // Co-managed non-NPS places: combine every agency's portion of the boundary.
    if (rec === primary && rec.agency !== 'NPS' && co.length) {
      const parts = [rec, ...co].filter((r) => r.boundary).flatMap((r) => r.boundary.geometry.coordinates);
      if (parts.length) geometry = { type: 'MultiPolygon', coordinates: parts };
    }
    let slug = slugify(rec.name);
    if (slugs.has(slug)) slug = `${slug}-${rec.agency.toLowerCase()}`;
    if (slugs.has(slug)) slug = `${slug}-${rec.agencyUnitCode}`.toLowerCase();
    slugs.add(slug);

    const raw = editorial.get(rec.id) || editorial.get(slug) || {};
    // Accuracy gate: unreviewed history, guide text and Roosevelt connections stay off the public site
    // unless SHOW_UNREVIEWED=1 (for review previews). See docs/EDITORIAL.md.
    const ed = SHOW_UNREVIEWED ? raw : {
      ...raw,
      designationHistory: (raw.designationHistory || []).filter((h) => h.reviewed),
      guide: raw.guide && raw.guide.reviewed !== false ? raw.guide : {},
      trConnection: raw.trConnection && raw.trConnection.reviewed !== false ? raw.trConnection : null,
    };
    const location = rec.location || (geometry ? labelPoint(geometry) : null);
    // A reviewed editorial "states" list wins over the computed one (boundaries can stray over a state line).
    const st = ed.states?.length ? ed.states : rec.states?.length ? rec.states : statesFor(geometry, location);
    const bbox = geometry ? bboxOf(geometry) : null;
    const history = (ed.designationHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    // Only claim "first protected" when no unreviewed event is older than the earliest reviewed one.
    const rawHist = (raw.designationHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const first = history[0] && (SHOW_UNREVIEWED || !rawHist.length || rawHist[0].reviewed) ? history[0] : null;
    // "Since": the earliest event that names today's designation (Grand Canyon: national park established 1919, not the
    // 1975 enlargement); otherwise the latest establishing or redesignating action.
    const desig = String(rec.designation || '').toLowerCase().split(/ (?:&|and) /)[0];
    const current = (desig && history.find((h) => ['established', 'designated', 'redesignated'].includes(h.action) && String(h.indexText || h.designation || '').toLowerCase().includes(desig)))
      || [...history].reverse().find((h) => ['established', 'designated', 'redesignated'].includes(h.action));
    const administrations = [...new Set(history.map((h) => h.authority?.administration).filter(Boolean))];

    const entry = {
      id: rec.id,
      slug,
      name: ed.name || rec.name,
      designation: rec.designation,
      category: rec.category,
      categoryLabel: CATEGORIES[rec.category],
      agency: AGENCIES[rec.agency],
      managedBy: [rec, ...co].map((r) => ({ ...AGENCIES[r.agency], unitCode: r.agencyUnitCode, designation: r.designation, sourceId: r.id })),
      states: st,
      stateNames: st.map((s) => STATE_NAMES[s] || s),
      location,
      bbox,
      acres: ed.acres || rec.acres || (geometry ? { value: Math.round(areaAcres(geometry)), kind: 'gis-estimate', source: 'Computed from the simplified boundary', note: 'Approximate. The managing agency publishes official acreage.' } : null),
      firstProtected: first ? { date: first.date, designation: first.designation, name: first.name, text: first.indexText || null, authority: first.authority, reviewed: !!first.reviewed } : null,
      established: current ? { date: current.date, designation: current.designation || rec.designation, name: current.name, text: current.indexText || null, authority: current.authority, reviewed: !!current.reviewed } : null,
      administrations,
      designationHistory: history,
      summary: ed.summary || rec.description || null,
      summarySource: ed.summary ? null : rec.description ? (rec.descriptionSource || AGENCIES[rec.agency].name) : null,
      guide: ed.guide || {},
      trConnection: ed.trConnection || null,
      trConnections: [...(trAuto[slug] || []), ...((raw.trConnections || []).filter((c) => SHOW_UNREVIEWED || c.reviewed))],
      trTypes: [...new Set([...(trAuto[slug] || []), ...((raw.trConnections || []).filter((c) => SHOW_UNREVIEWED || c.reviewed))].map((c) => c.type))],
      links: {
        official: ed.links?.official || rec.url || verifiedLinks[slug]?.official?.url || manualLinks[slug]?.url || null,
        social: ed.links?.social || verifiedLinks[slug]?.social || {},
        ...(!ed.links?.social && verifiedLinks[slug]?.social && Object.keys(verifiedLinks[slug].social).length ? { socialSource: verifiedLinks[slug].socialSource || 'Wikidata' } : {}),
        recreationGov: ed.links?.recreationGov || rec.links?.recreationGov || recGov[slug]?.url || null,
        ...(!ed.links?.recreationGov && recGov[slug]?.shared ? { recreationGovName: recGov[slug].name } : {}),
        alltrails: ed.links?.alltrails || allTrails[slug]?.park || null,
        alltrailsExplore: bbox ? `https://www.alltrails.com/explore?b_tl_lat=${bbox[3]}&b_tl_lng=${bbox[0]}&b_br_lat=${bbox[1]}&b_br_lng=${bbox[2]}` : null,
        recreationGovSearch: `https://www.recreation.gov/search?q=${encodeURIComponent(rec.name)}`,
        directions: rec.links?.directions || (location ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lon}` : null),
        ...(ed.links?.other ? { other: ed.links.other } : {}),
      },
      visitation: (() => { const n = [rec, ...co].find((r) => r.agency === 'NPS'); return (n && visits[n.agencyUnitCode]) || null; })(),
      trails: (allTrails[slug]?.trails || []).map((t) => ({ ...t, source: 'AllTrails' })),
      cover: covers[slug] || null,
      images: (() => {
        const c = covers[slug];
        // Agency photos only when credited to the agency (public domain); outside photographers' work stays off.
        const PD = /^\s*(NPS|National Park Service|USFWS|U\.?S\.? ?Fish|USFS|Forest Service|BLM|Bureau of Land Management)\b|\bNPS\s*(Photo|\/)/i;
        const rest = [...(ed.images || []), ...(rec.images || []).filter((i) => PD.test(i.credit || ''))];
        if (!c) return rest;
        return [{ url: c.url, title: c.title, alt: c.alt || c.title, credit: c.credit, license: c.license, licenseUrl: c.licenseUrl, filePage: c.filePage, source: c.source, cover: true }, ...rest.filter((i) => i.url !== c.url)];
      })(),
      activities: rec.activities || [],
      topics: rec.topics || [],
      fees: rec.fees || [],
      passes: rec.passes || [],
      hours: rec.hours || [],
      directions: rec.directions || null,
      weatherInfo: rec.weatherInfo || null,
      contacts: rec.contacts || null,
      visitorCenters: rec.visitorCenters || [],
      campgrounds: rec.campgrounds || [],
      thingsToDo: rec.thingsToDo || [],
      nearby: [],
      hasBoundary: !!geometry,
      boundarySource: rec.boundary ? { name: rec.boundary.source, url: rec.boundary.sourceUrl } : null,
      sources: [...[rec, ...co].flatMap((r) => r.sources), ...(ed.sources || [])],
      editorialStatus: ed.status || (Object.keys(ed).length ? 'draft' : 'none'),
      synced: rec.synced,
    };
    directory.push(entry);
    if (geometry) geomOf.set(slug, geometry);
    if (geometry) await writeJSON(join(DATA, 'boundaries', `${slug}.geojson`), { type: 'Feature', properties: { slug, name: entry.name, agency: rec.agency, source: entry.boundarySource?.name }, geometry }, false);
  }
}

// ---- nearby: 6 closest other sites (great-circle), for "pair it with" ----
const R = 6371, rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => { const dl = rad(b.lat - a.lat), dn = rad(b.lon - a.lon); const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const located = directory.filter((d) => d.location);
for (const d of located) {
  d.nearby = located.filter((o) => o !== d).map((o) => ({ slug: o.slug, km: Math.round(dist(d.location, o.location)) })).sort((a, b) => a.km - b.km).slice(0, 6).filter((n) => n.km < 250);
}

// ---- wilderness: National Wilderness Preservation System areas inside each site ----
// A wilderness belongs to a site when the site's own agency manages part of it and most of it lies inside the site boundary.
const wild = (await readJSON(join(DATA, 'sources', 'wilderness.json'), { areas: [] })).areas;
const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
let wCount = 0;
for (const d of directory) {
  const g = geomOf.get(d.slug);
  d.wilderness = [];
  if (!g) continue;
  const codes = d.managedBy.map((m) => m.code);
  const bb = bboxOf(g);
  const hits = wild.filter((w) => w.agencies.some((a) => codes.includes(a)) && overlap(bb, w.bbox)).filter((w) => {
    // Share of the wilderness's area inside the site, from a grid of points over the wilderness.
    w.grid ||= (() => { const [a, b, c, e] = w.bbox, n = 16, pts = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = [a + ((i + 0.5) * (c - a)) / n, b + ((j + 0.5) * (e - b)) / n]; if (pointInGeom(p, w.geometry)) pts.push(p); } return pts.length ? pts : [[w.label.lon, w.label.lat]]; })();
    const share = w.grid.filter((p) => pointInGeom(p, g)).length / w.grid.length;
    return share >= 0.1;
  });
  if (!hits.length) continue;
  d.wilderness = hits.map((w) => ({ name: w.name, designated: w.designated, acres: w.acres, agencies: w.agencies, url: w.url, source: 'Wilderness Connect (wilderness.net)' })).sort((a, b) => (b.acres || 0) - (a.acres || 0));
  wCount += hits.length;
  await writeJSON(join(DATA, 'wilderness', `${d.slug}.geojson`), { type: 'FeatureCollection', features: hits.map((w) => ({ type: 'Feature', properties: { name: w.name, designated: w.designated }, geometry: w.geometry })) }, false);
}
console.log(`Wilderness: ${wCount} areas placed in ${directory.filter((d) => d.wilderness.length).length} sites (${wild.length} in the system)`);

directory.sort((a, b) => a.name.localeCompare(b.name));
await writeJSON(join(DATA, 'directory.json'), { generated: nowISO(), count: directory.length, sites: directory }, false);
const by = (k) => directory.reduce((m, d) => ((m[k(d)] = (m[k(d)] || 0) + 1), m), {});
console.log(`Directory: ${directory.length} sites`, by((d) => d.agency.code), by((d) => d.category));
console.log(`Co-managed: ${directory.filter((d) => d.managedBy.length > 1).map((d) => d.name).join('; ')}`);
