// Shared helpers for the Public Lands Directory sync and build scripts.
// Zero dependencies: Node 20+ (global fetch).
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');
export const UA = 'PublicLandsDirectory/1.0 (directory.labs.trlibrary.com; Theodore Roosevelt Presidential Library)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJSON(url, { retries = 3, headers = {}, timeout = 90000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, application/geo+json', ...headers }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) { const e = new Error(`HTTP ${res.status} ${url}`); e.status = res.status; e.fatal = true; throw e; }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function readJSON(path, fallback = undefined) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { if (fallback !== undefined) return fallback; throw new Error(`Cannot read ${path}`); }
}

export async function writeJSON(path, obj, pretty = true) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, pretty ? 2 : 0) + '\n');
}

export async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

export async function listJSON(dir) {
  try { return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)); } catch { return []; }
}

export function slugify(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const SMALL = new Set(['and', 'of', 'the', 'at', 'in', 'on', 'for', 'de', 'del', 'la', 'to']);
export function titleCase(s) {
  return String(s).toLowerCase().split(/(\s+|-)/).map((w, i) => {
    if (/^\s+$|^-$/.test(w)) return w;
    if (i > 0 && SMALL.has(w)) return w;
    if (/^(nwr|wmd|nfh|nra|nm|nca|usfs|blm|ii|iii)$/.test(w)) return w.toUpperCase();
    return w.replace(/^(mc)(\w)/, (_, a, b) => 'Mc' + b.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
  }).join('');
}

export const today = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

// ---------- ArcGIS REST helpers ----------

// Page through an ArcGIS feature/map layer query. Returns array of features (GeoJSON when f=geojson).
export async function arcgisQuery(layerUrl, params = {}, { pageSize = 500, geojson = false } = {}) {
  const out = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', f: geojson ? 'geojson' : 'json', resultOffset: String(offset), resultRecordCount: String(pageSize), ...params });
    const d = await fetchJSON(`${layerUrl}/query?${q}`);
    if (d.error) throw new Error(`ArcGIS error ${JSON.stringify(d.error)} for ${layerUrl}`);
    const feats = d.features || [];
    out.push(...feats);
    const more = d.exceededTransferLimit || d.properties?.exceededTransferLimit;
    if (!feats.length || (!more && feats.length < pageSize)) break;
    offset += feats.length;
  }
  return out;
}

// Fetch a simplified boundary for one where-clause as GeoJSON FeatureCollection, dissolved client-side into a MultiPolygon.
export async function arcgisBoundary(layerUrl, where, { offset = 0.002 } = {}) {
  const feats = await arcgisQuery(layerUrl, { where, returnGeometry: 'true', outFields: '', outSR: '4326', maxAllowableOffset: String(offset), geometryPrecision: '4' }, { geojson: true, pageSize: 200 });
  return dissolve(feats);
}

export function dissolve(features) {
  const polys = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  if (!polys.length) return null;
  return { type: 'MultiPolygon', coordinates: polys.map((p) => p.map((ring) => ring.map(([x, y]) => [round(x), round(y)]))) };
}

const round = (n) => Math.round(n * 1e4) / 1e4;

export function bboxOf(geom) {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (x) => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]); } else x.forEach(walk); };
  walk(geom.coordinates);
  return [round(a), round(b), round(c), round(d)];
}

// Representative point: centroid of the largest outer ring (good enough for map pins and weather lookups).
export function labelPoint(geom) {
  let best = null, bestA = -1;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) {
    const ring = p[0];
    let A = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      A += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(A) > bestA) { bestA = Math.abs(A); best = A ? [cx / (3 * A), cy / (3 * A)] : ring[0]; }
  }
  return best ? { lat: round(best[1]), lon: round(best[0]) } : null;
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { results[idx] = await fn(items[idx], idx); } catch (e) { results[idx] = { __error: String(e.message || e) }; } }
  });
  await Promise.all(workers);
  return results;
}

export const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', UM: 'U.S. Minor Outlying Islands' };

// Normalized designation categories used for filters across all agencies.
export const CATEGORIES = {
  'national-park': 'National Park',
  'national-monument': 'National Monument',
  'national-forest': 'National Forest',
  'national-grassland': 'National Grassland',
  'national-wildlife-refuge': 'National Wildlife Refuge',
  'wetland-management-district': 'Wetland Management District',
  'national-recreation-area': 'National Recreation Area',
  'national-seashore-lakeshore': 'National Seashore and Lakeshore',
  'national-preserve': 'National Preserve',
  'historic-site': 'Historic Site and Historical Park',
  'memorial': 'Memorial',
  'battlefield': 'Battlefield and Military Park',
  'river': 'Wild, Scenic and National River',
  'trail': 'National Trail',
  'parkway': 'Parkway',
  'conservation-area': 'National Conservation Area',
  'scenic-area': 'National Scenic Area',
  'other': 'Other Designation',
};

export function categorize(designation = '', name = '') {
  const d = `${designation} ${name}`.toLowerCase();
  if (/wetland management district/.test(d)) return 'wetland-management-district';
  if (/wildlife refuge|game refuge|game range/.test(d)) return 'national-wildlife-refuge';
  if (/grassland/.test(d)) return 'national-grassland';
  if (/national forest/.test(d)) return 'national-forest';
  if (/national park/.test(designation.toLowerCase()) || /^national park/.test(designation.toLowerCase())) return 'national-park';
  if (/monument/.test(d) && !/memorial/.test(designation.toLowerCase())) return 'national-monument';
  if (/battlefield|military park/.test(d)) return 'battlefield';
  if (/memorial/.test(d)) return 'memorial';
  if (/historic|historical/.test(d)) return 'historic-site';
  if (/recreation area/.test(d)) return 'national-recreation-area';
  if (/seashore|lakeshore/.test(d)) return 'national-seashore-lakeshore';
  if (/preserve|reserve/.test(d)) return 'national-preserve';
  if (/river/.test(d)) return 'river';
  if (/trail/.test(d)) return 'trail';
  if (/parkway/.test(d)) return 'parkway';
  if (/conservation area|cooperative management|conservation lands/.test(d)) return 'conservation-area';
  if (/scenic area/.test(d)) return 'scenic-area';
  if (/national park/.test(d)) return 'national-park';
  return 'other';
}

export const AGENCIES = {
  NPS: { code: 'NPS', name: 'National Park Service', department: 'U.S. Department of the Interior', url: 'https://www.nps.gov' },
  FWS: { code: 'FWS', name: 'U.S. Fish and Wildlife Service', department: 'U.S. Department of the Interior', url: 'https://www.fws.gov' },
  USFS: { code: 'USFS', name: 'USDA Forest Service', department: 'U.S. Department of Agriculture', url: 'https://www.fs.usda.gov' },
  BLM: { code: 'BLM', name: 'Bureau of Land Management', department: 'U.S. Department of the Interior', url: 'https://www.blm.gov' },
};
