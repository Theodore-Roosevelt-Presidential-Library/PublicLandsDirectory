// National Park Service: every unit from the NPS Data API + boundaries from the NPS Land Resources Division.
// Needs NPS_API_KEY (free: https://www.nps.gov/subjects/developer/get-started.htm). Falls back to DEMO_KEY (very low rate limit).
import { join } from 'node:path';
import { DATA, fetchJSON, writeJSON, readJSON, arcgisQuery, dissolve, bboxOf, labelPoint, categorize, nowISO, mapLimit } from './lib.mjs';

const KEY = process.env.NPS_API_KEY || 'DEMO_KEY';
const API = 'https://developer.nps.gov/api/v1';
const LRD = 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2';
const SKIP_BOUNDARIES = process.env.SKIP_BOUNDARIES === '1';

async function npsAll(endpoint, extra = '') {
  const d = await fetchJSON(`${API}/${endpoint}?limit=1000${extra}&api_key=${KEY}`);
  return d.data || [];
}

const parks = process.env.NPS_PARKS_FILE ? (await readJSON(process.env.NPS_PARKS_FILE)).data : await npsAll('parks');
console.log(`NPS parks: ${parks.length}`);

// Optional richer endpoints (only with a real key — DEMO_KEY allows ~50 requests/day).
const extras = { visitorcenters: [], campgrounds: [], thingstodo: [] };
if (KEY !== 'DEMO_KEY') {
  for (const ep of Object.keys(extras)) {
    try { extras[ep] = await npsAll(ep); console.log(`NPS ${ep}: ${extras[ep].length}`); } catch (e) { console.warn(`NPS ${ep} failed: ${e.message}`); }
  }
}
const byPark = (arr) => arr.reduce((m, x) => ((m[x.parkCode] ||= []).push(x), m), {});
const vc = byPark(extras.visitorcenters), cg = byPark(extras.campgrounds), ttd = byPark(extras.thingstodo);

// Boundaries: one pass over the whole LRD layer, grouped by unit code.
const boundaries = {};
if (!SKIP_BOUNDARIES) {
  const feats = await arcgisQuery(LRD, { returnGeometry: 'true', outFields: 'UNIT_CODE,UNIT_NAME,UNIT_TYPE', outSR: '4326', maxAllowableOffset: '0.002', geometryPrecision: '4' }, { geojson: true, pageSize: 100 });
  for (const f of feats) (boundaries[f.properties.UNIT_CODE?.toLowerCase()] ||= []).push(f);
  console.log(`NPS boundary units: ${Object.keys(boundaries).length}`);
}

const pick = (arr, n) => (arr || []).slice(0, n);
const records = [];
for (const p of parks) {
  const code = p.parkCode.toLowerCase();
  // Units the NPS API lists once but the boundary layer keeps as separate parks.
  const parts = { seki: ['sequ', 'kica'] }[code]?.flatMap((c) => boundaries[c] || []);
  const geom = boundaries[code] ? dissolve(boundaries[code]) : parts?.length ? dissolve(parts) : null;
  const lat = parseFloat(p.latitude), lon = parseFloat(p.longitude);
  const rec = {
    id: `nps-${code}`,
    agency: 'NPS',
    agencyUnitCode: p.parkCode.toUpperCase(),
    name: p.fullName.trim(),
    shortName: p.name,
    designation: p.designation || 'Unit of the National Park System',
    category: categorize(p.designation || '', p.fullName),
    states: p.states.split(',').map((s) => s.trim()).filter(Boolean),
    location: Number.isFinite(lat) && lat !== 0 ? { lat, lon } : geom ? labelPoint(geom) : null,
    description: p.description,
    url: p.url,
    links: { official: p.url, directions: p.directionsUrl || null },
    images: (p.images || []).map((i) => ({ url: i.url, title: i.title, alt: i.altText, caption: i.caption, credit: i.credit, source: 'NPS' })),
    activities: (p.activities || []).map((a) => a.name),
    topics: (p.topics || []).map((t) => t.name),
    fees: (p.entranceFees || []).map((f) => ({ title: f.title, cost: f.cost, description: f.description })),
    passes: (p.entrancePasses || []).map((f) => ({ title: f.title, cost: f.cost, description: f.description })),
    hours: (p.operatingHours || []).map((h) => ({ name: h.name, description: h.description, standardHours: h.standardHours, exceptions: pick(h.exceptions, 6).map((e) => ({ name: e.name, start: e.startDate, end: e.endDate, hours: e.exceptionHours })) })),
    directions: p.directionsInfo || null,
    weatherInfo: p.weatherInfo || null,
    contacts: { phone: p.contacts?.phoneNumbers?.find((x) => x.type === 'Voice')?.phoneNumber || null, email: p.contacts?.emailAddresses?.[0]?.emailAddress || null },
    addresses: (p.addresses || []).map((a) => ({ type: a.type, line1: a.line1, city: a.city, state: a.stateCode, zip: a.postalCode })),
    visitorCenters: (vc[p.parkCode] || []).map((v) => ({ name: v.name, description: v.description, url: v.url, lat: parseFloat(v.latitude) || null, lon: parseFloat(v.longitude) || null })),
    campgrounds: (cg[p.parkCode] || []).map((c) => ({ name: c.name, description: c.description, url: c.url, reservationUrl: c.reservationUrl || null, sites: c.campsites?.totalSites ? Number(c.campsites.totalSites) : null })),
    thingsToDo: pick(ttd[p.parkCode], 12).map((t) => ({ title: t.title, description: t.shortDescription, url: t.url, image: t.images?.[0]?.url || null })),
    boundary: geom ? { geometry: geom, bbox: bboxOf(geom), source: 'NPS Land Resources Division', sourceUrl: 'https://irma.nps.gov/DataStore/Reference/Profile/2224545' } : null,
    sources: [{ name: 'NPS Data API', url: `https://developer.nps.gov/api/v1/parks?parkCode=${code}` }].concat(geom ? [{ name: 'NPS Land Resources Division boundaries', url: LRD }] : []),
    synced: nowISO(),
  };
  records.push(rec);
}

await writeJSON(join(DATA, 'sources', 'nps.json'), records, false);
console.log(`Wrote ${records.length} NPS records (${records.filter((r) => r.boundary).length} with boundaries).`);
