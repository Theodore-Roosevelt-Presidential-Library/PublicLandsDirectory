// Annual recreation visits for National Park Service units, from NPS Visitor Use Statistics (IRMA).
// Uses the most recent calendar year with all 12 months reported. Output: data/reference/visitation.json
import { join } from 'node:path';
import { fetchJSON, readJSON, writeJSON, DATA } from './lib.mjs';

const nps = await readJSON(join(DATA, 'sources', 'nps.json'));
const recs = Array.isArray(nps.sites || nps.records || nps) ? (nps.sites || nps.records || nps) : Object.values(nps.sites || nps.records || nps);
// Units the NPS API lists once but statistics report as separate parks.
const PARTS = { SEKI: ['SEQU', 'KICA'] };
const codes = [...new Set(recs.flatMap((r) => PARTS[r.agencyUnitCode] || [r.agencyUnitCode]).filter(Boolean))];

async function year(y) {
  const totals = {};
  for (let i = 0; i < codes.length; i += 40) {
    const batch = codes.slice(i, i + 40).join(',');
    const rows = await fetchJSON(`https://irmaservices.nps.gov/v3/rest/stats/visitation?unitCodes=${batch}&startMonth=1&startYear=${y}&endMonth=12&endYear=${y}&format=json`);
    for (const r of rows) {
      const t = (totals[r.UnitCode] ||= { recreation: 0, months: 0 });
      t.recreation += r.RecreationVisitors || 0; t.months++;
    }
  }
  return totals;
}

const now = new Date();
let y = now.getUTCFullYear() - 1, totals = await year(y);
// Fall back a year if the latest year is not fully reported yet.
if (Object.values(totals).filter((t) => t.months === 12).length < Object.keys(totals).length * 0.8) { y--; totals = await year(y); }

const sites = {};
for (const r of recs) {
  const parts = PARTS[r.agencyUnitCode] || [r.agencyUnitCode];
  const t = parts.map((c) => totals[c]).filter(Boolean);
  if (!t.length || t.some((x) => x.months < 12)) continue;
  const v = t.reduce((a, x) => a + x.recreation, 0);
  if (v > 0) sites[r.agencyUnitCode] = { year: y, recreation: v, source: 'NPS Visitor Use Statistics', url: `https://irma.nps.gov/Stats/Reports/Park/${r.agencyUnitCode}` };
}
await writeJSON(join(DATA, 'reference', 'visitation.json'), { generated: new Date().toISOString(), year: y, count: Object.keys(sites).length, sites });
console.log(`Visitation ${y}: ${Object.keys(sites).length} NPS units`);
