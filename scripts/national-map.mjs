// One combined, simplified file of every site boundary for the national map (/map/).
// Douglas-Peucker per ring, then coordinates rounded; rings that collapse are dropped and tiny sites keep a point.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJSON } from './lib.mjs';

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / len));
      const d = Math.hypot(pts[i][0] - (x1 + t * dx), pts[i][1] - (y1 + t * dy));
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const PROGRAM = /Wetland Management District|Conservation Area|Tallgrass|Driftless|Conte|Michigan Islands|Great Thicket|Headwaters|Watershed|Legacy|Easement|Grassland/i;
const round = (p, d) => [Math.round(p[0] * 10 ** d) / 10 ** d, Math.round(p[1] * 10 ** d) / 10 ** d];

export async function nationalMap(sites, DATA, tol = 0.004, digits = 3) {
  const features = [];
  for (const s of sites) {
    const f = existsSync(join(DATA, 'boundaries', `${s.slug}.geojson`)) ? await readJSON(join(DATA, 'boundaries', `${s.slug}.geojson`)) : null;
    const g = f?.geometry || f?.features?.[0]?.geometry;
    const props = { s: s.slug, n: s.name, a: s.agency.code, c: s.category, tr: (s.trTypes || []).length ? 1 : 0 };
    // Program and acquisition areas outline where the agency may buy land or easements; most of the area inside is private.
    if (s.agency.code === 'FWS' && PROGRAM.test(s.name)) props.o = 1;
    let polys = [];
    if (g) {
      const src = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of src) {
        const rings = poly.map((r) => dp(r, tol).map((p) => round(p, digits))).filter((r) => r.length >= 4);
        if (rings.length && rings[0].length >= 4) polys.push(rings);
      }
    }
    if (polys.length) features.push({ type: 'Feature', properties: props, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
    else if (s.location) features.push({ type: 'Feature', properties: { ...props, pt: 1 }, geometry: { type: 'Point', coordinates: [s.location.lon, s.location.lat] } });
  }
  return { type: 'FeatureCollection', features };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { DATA } = await import('./lib.mjs');
  const sites = (await readJSON(join(DATA, 'directory.json'))).sites;
  for (const [tol, d] of [[0.002, 4], [0.004, 3], [0.008, 3]]) {
    const fc = await nationalMap(sites, DATA, tol, d);
    const js = JSON.stringify(fc);
    const { gzipSync } = await import('node:zlib');
    console.log(`tol ${tol}: ${fc.features.length} features, ${(js.length / 1e6).toFixed(1)} MB, gzip ${(gzipSync(js).length / 1e6).toFixed(1)} MB, points ${fc.features.filter((f) => f.properties.pt).length}`);
  }
}
