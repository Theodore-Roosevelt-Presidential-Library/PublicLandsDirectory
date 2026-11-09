// Recreation.gov recreation-area pages for every site, across all four agencies.
// Uses Recreation.gov's public site search. A page is kept only when its name matches the site's name
// and it belongs to the same agency. Output: data/reference/recgov.json
import { join } from 'node:path';
import { fetchJSON, readJSON, writeJSON, mapLimit, DATA } from './lib.mjs';

const ORG = { 'National Park Service': 'NPS', 'Fish and Wildlife Service': 'FWS', 'USDA Forest Service': 'USFS', 'Bureau of Land Management': 'BLM' };
const norm = (t) => String(t || '').toLowerCase().replace(/&/g, ' and ').replace(/[’'.]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
const STATE_UNITS = { TX: 'National Forests in Texas', NC: 'National Forests in North Carolina', AL: 'National Forests in Alabama', FL: 'National Forests in Florida', MS: 'National Forests in Mississippi' };
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const out = {};
let found = 0;
await mapLimit(dir, 4, async (s) => {
  const codes = s.managedBy.map((m) => m.code);
  const names = [s.name, ...(s.aliases || [])].map(norm);
  const d = await fetchJSON(`https://www.recreation.gov/api/search?q=${encodeURIComponent(s.name.replace(/&/g, 'and'))}&size=10&fq=${encodeURIComponent('entity_type:recarea')}`, { retries: 2 });
  let hit = (d.results || []).find((r) => names.includes(norm(r.name)) && codes.includes(ORG[r.org_name]));
  // Forest Service units are often listed under combined names ("Apache-Sitgreaves National Forests")
  // or a state umbrella ("National Forests in Texas").
  if (!hit && s.agency.code === 'USFS' && /national (forest|grassland)$/i.test(s.name)) {
    const base = norm(s.name.replace(/national (forest|grassland)$/i, ''));
    const re = new RegExp(`(^| )${base}( |$)`);
    const fsHits = (r) => (r.results || []).filter((x) => ORG[x.org_name] === 'USFS' && /national (forest|grassland)s?/.test(norm(x.name)));
    hit = fsHits(d).find((x) => re.test(norm(x.name)));
    if (!hit && STATE_UNITS[s.states[0]]) {
      const d2 = await fetchJSON(`https://www.recreation.gov/api/search?q=${encodeURIComponent(STATE_UNITS[s.states[0]])}&size=5&fq=${encodeURIComponent('entity_type:recarea')}`, { retries: 2 });
      hit = fsHits(d2).find((x) => norm(x.name) === norm(STATE_UNITS[s.states[0]]));
      if (hit) hit = { ...hit, umbrella: true };
    }
  }
  if (!hit) return;
  out[s.slug] = { url: `https://www.recreation.gov/gateways/${hit.entity_id}`, name: hit.name, id: hit.entity_id, reservable: !!hit.reservable, campgrounds: Number(hit.campgrounds_count) || 0, ...(hit.umbrella || norm(hit.name) !== norm(s.name) ? { shared: true } : {}) };
  found++;
});
await writeJSON(join(DATA, 'reference', 'recgov.json'), { generated: new Date().toISOString(), source: 'Recreation.gov', count: found, sites: out });
const by = {}; for (const s of dir) if (out[s.slug]) by[s.agency.code] = (by[s.agency.code] || 0) + 1;
console.log(`Recreation.gov pages: ${found}/${dir.length}`, by);
