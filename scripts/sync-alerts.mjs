// Live notices for every site, refreshed hourly by GitHub Actions:
//  - NPS park alerts (closures, cautions, information, danger)        — NPS Data API
//  - National Weather Service watches, warnings and advisories        — api.weather.gov
//  - Active wildfire perimeters touching the site                     — NIFC WFIGS
// Output: data/live/alerts.json
import { join } from 'node:path';
import { DATA, fetchJSON, readJSON, writeJSON, arcgisQuery, mapLimit, nowISO, sleep } from './lib.mjs';
import { pointInGeom, bboxOverlap, bboxOfCoords, sampleVertices, geomsIntersect } from './geo.mjs';

const KEY = process.env.NPS_API_KEY || 'DEMO_KEY';
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const out = { generated: nowISO(), sources: {}, sites: {} };
const add = (slug, a) => (out.sites[slug] ||= []).push(a);

// ---------- NPS alerts ----------
try {
  const byCode = new Map(dir.filter((d) => d.agency.code === 'NPS').map((d) => [d.managedBy[0].unitCode.toLowerCase(), d.slug]));
  let start = 0, total = Infinity, n = 0;
  while (start < total) {
    const d = await fetchJSON(`https://developer.nps.gov/api/v1/alerts?limit=500&start=${start}&api_key=${KEY}`);
    total = Number(d.total); const items = d.data || [];
    for (const a of items) {
      const slug = byCode.get(a.parkCode?.toLowerCase()); if (!slug) continue;
      add(slug, { source: 'NPS', kind: a.category, title: a.title, text: a.description, url: a.url || null, updated: a.lastIndexedDate || null, id: `nps-${a.id}` });
      n++;
    }
    if (!items.length) break;
    start += items.length;
  }
  out.sources.nps = { ok: true, count: n };
  console.log(`NPS alerts: ${n}`);
} catch (e) { out.sources.nps = { ok: false, error: e.message }; console.warn(`NPS alerts failed: ${e.message}`); }

// ---------- NWS: map each site to forecast/county/fire zones once (cached), then match active alerts ----------
const zonesFile = join(DATA, 'reference', 'nws-zones.json');
const zones = await readJSON(zonesFile, {});
const need = dir.filter((d) => d.location && !zones[d.slug] && d.states.every((s) => !['AS', 'GU', 'MP', 'UM'].includes(s)));
const LIMIT = Number(process.env.NWS_ZONE_LOOKUPS || 2000);
if (need.length) {
  console.log(`NWS zone lookups needed: ${need.length} (doing up to ${LIMIT})`);
  await mapLimit(need.slice(0, LIMIT), 6, async (d) => {
    try {
      const p = await fetchJSON(`https://api.weather.gov/points/${d.location.lat.toFixed(4)},${d.location.lon.toFixed(4)}`, { retries: 2 });
      const pr = p.properties || {};
      zones[d.slug] = { zones: [pr.forecastZone, pr.county, pr.fireWeatherZone].filter(Boolean).map((u) => u.split('/').pop()), office: pr.cwa || null, updated: nowISO().slice(0, 10) };
    } catch (e) { zones[d.slug] = { zones: [], error: String(e.status || e.message).slice(0, 60), updated: nowISO().slice(0, 10) }; }
    await sleep(150);
  });
  await writeJSON(zonesFile, zones);
}
try {
  const d = await fetchJSON('https://api.weather.gov/alerts/active?status=actual');
  const byZone = new Map();
  for (const [slug, z] of Object.entries(zones)) for (const id of z.zones || []) (byZone.get(id) || byZone.set(id, []).get(id)).push(slug);
  const siteGeoms = new Map(dir.filter((x) => x.bbox).map((x) => [x.slug, x]));
  let n = 0;
  for (const f of d.features || []) {
    const p = f.properties;
    if (p.messageType === 'Cancel') continue;
    const hits = new Set();
    for (const z of p.affectedZones || []) for (const s of byZone.get(z.split('/').pop()) || []) hits.add(s);
    // Polygon-based warnings: also match sites whose bbox the polygon overlaps and whose label point/boundary it covers.
    if (f.geometry) {
      const gb = bboxOfCoords(f.geometry.coordinates);
      for (const s of siteGeoms.values()) if (bboxOverlap(gb, s.bbox) && s.location && pointInGeom([s.location.lon, s.location.lat], f.geometry)) hits.add(s.slug);
    }
    for (const slug of hits) {
      add(slug, { source: 'NWS', kind: p.event, severity: p.severity, title: p.headline || p.event, text: p.description?.slice(0, 1200) || null, instruction: p.instruction?.slice(0, 600) || null, url: `https://alerts.weather.gov/search?id=${encodeURIComponent(p.id)}`, starts: p.onset || p.effective, ends: p.ends || p.expires, id: `nws-${p.id}` });
      n++;
    }
  }
  out.sources.nws = { ok: true, count: n };
  console.log(`NWS alert matches: ${n}`);
} catch (e) { out.sources.nws = { ok: false, error: e.message }; console.warn(`NWS failed: ${e.message}`); }

// ---------- Wildfire perimeters (NIFC WFIGS, current) ----------
try {
  const L = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0';
  const fires = await arcgisQuery(L, { returnGeometry: 'true', outFields: 'poly_IncidentName,attr_IncidentSize,attr_PercentContained,attr_FireDiscoveryDateTime,poly_DateCurrent,attr_UniqueFireIdentifier', outSR: '4326', maxAllowableOffset: '0.002', geometryPrecision: '4' }, { geojson: true, pageSize: 100 });
  let n = 0;
  const cache = new Map();
  for (const f of fires) {
    if (!f.geometry) continue;
    const fb = bboxOfCoords(f.geometry.coordinates);
    for (const s of dir) {
      if (!s.bbox || !bboxOverlap(fb, s.bbox)) continue;
      let g = cache.get(s.slug);
      if (g === undefined) { g = (await readJSON(join(DATA, 'boundaries', `${s.slug}.geojson`), null))?.geometry || null; cache.set(s.slug, g); }
      if (!g || !geomsIntersect(f.geometry, g)) continue;
      const p = f.properties;
      const nm = (p.poly_IncidentName || 'Wildfire').trim();
      const rx = /^RX\b|prescribed/i.test(nm), contained = Number(p.attr_PercentContained) >= 100;
      add(s.slug, { source: 'NIFC', kind: rx ? 'Prescribed fire' : 'Wildfire', severity: contained ? 'Minor' : 'Moderate', title: `${rx ? 'Prescribed fire: ' + nm.replace(/^RX\s*/i, '') : nm + ' Fire'}: ${Math.round(p.attr_IncidentSize || 0).toLocaleString('en-US')} acres${p.attr_PercentContained != null ? `, ${p.attr_PercentContained}% contained` : ''}`, text: rx ? 'A prescribed (planned) burn overlaps this site. Expect smoke and possible area closures.' : contained ? 'A wildfire perimeter that overlaps this site is fully contained. Some areas may stay closed while crews finish work.' : 'An active wildfire perimeter overlaps this site. Check the managing agency for closures before you go.', url: 'https://www.nifc.gov/fire-information/nfn', updated: p.poly_DateCurrent ? new Date(p.poly_DateCurrent).toISOString() : null, id: `fire-${p.attr_UniqueFireIdentifier}` });
      n++;
    }
  }
  out.sources.fires = { ok: true, count: n, perimeters: fires.length };
  console.log(`Wildfire matches: ${n} (from ${fires.length} perimeters)`);
} catch (e) { out.sources.fires = { ok: false, error: e.message }; console.warn(`Fires failed: ${e.message}`); }

await writeJSON(join(DATA, 'live', 'alerts.json'), out);
console.log(`Sites with notices: ${Object.keys(out.sites).length}`);
