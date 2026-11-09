// National Wilderness Preservation System boundaries (Wilderness Connect / wilderness.net, University of Montana).
// Output: data/sources/wilderness.json — one record per wilderness, all agency pieces dissolved together.
import { join } from 'node:path';
import { arcgisQuery, dissolve, bboxOf, labelPoint, writeJSON, DATA } from './lib.mjs';

const L = 'https://services1.arcgis.com/ERdCHt0sNM6dENSD/arcgis/rest/services/Wilderness_Areas_in_the_United_States/FeatureServer/0';
const AGENCY = { FWS: 'FWS', USFWS: 'FWS', NPS: 'NPS', FS: 'USFS', USFS: 'USFS', BLM: 'BLM' };
const feats = await arcgisQuery(L, { returnGeometry: 'true', outFields: 'NAME,STATE,Agency,Designated,Acreage,URL,WID', outSR: '4326', maxAllowableOffset: '0.002', geometryPrecision: '4' }, { geojson: true, pageSize: 50 });

const byName = new Map();
for (const f of feats) {
  const p = f.properties || {};
  if (!p.NAME || !f.geometry) continue;
  const name = p.NAME.trim();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(f);
}
const out = [];
for (const [name, fs] of byName) {
  const geometry = dissolve(fs);
  if (!geometry) continue;
  const p = fs.map((f) => f.properties);
  const years = p.map((x) => parseInt(String(x.Designated || '').match(/\d{4}/)?.[0], 10)).filter(Boolean);
  out.push({
    name: /wilderness/i.test(name) ? name : `${name} Wilderness`,
    agencies: [...new Set(p.map((x) => AGENCY[String(x.Agency || '').toUpperCase()] || x.Agency).filter(Boolean))],
    states: [...new Set(p.flatMap((x) => String(x.STATE || '').split(/[,\s/]+/)).filter((s) => /^[A-Z]{2}$/.test(s)))],
    designated: years.length ? Math.min(...years) : null,
    // Agency pieces of one wilderness each carry their own acreage; add them up.
    acres: p.reduce((a, x) => a + (Number(x.Acreage) || 0), 0) || null,
    url: p.find((x) => x.URL)?.URL || null,
    bbox: bboxOf(geometry),
    label: labelPoint(geometry),
    geometry,
  });
}
out.sort((a, b) => a.name.localeCompare(b.name));
await writeJSON(join(DATA, 'sources', 'wilderness.json'), { generated: new Date().toISOString(), source: 'Wilderness Connect (wilderness.net), National Wilderness Preservation System', count: out.length, areas: out }, false);
console.log(`Wilderness: ${feats.length} agency pieces, ${out.length} wilderness areas`);
