// Turns an AllTrails research batch into data/reference/alltrails.json.
// Trail URLs come straight from the AllTrails connector. The park URL's region is
// rebuilt from those trail URLs (the most common one), since AllTrails files
// territories outside /us/ and the batch guessed the region from the park label.
import { readFile, writeFile } from 'node:fs/promises';
const [, , ...batches] = process.argv;
const OUT = 'data/reference/alltrails.json';
let out = { sites: {} };
try { out = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
let fixed = 0, n = 0;
for (const f of batches.length ? batches : ['data/research/alltrails-batch1.json']) {
  const b = JSON.parse(await readFile(f, 'utf8'));
  for (const [slug, r] of Object.entries(b.sites || b)) {
    if (!r?.trails?.length) continue;
    const regions = {};
    for (const t of r.trails) { const m = t.url?.match(/alltrails\.com\/trail\/(.+)\/[^/]+$/); if (m) regions[m[1]] = (regions[m[1]] || 0) + 1; }
    const region = Object.entries(regions).sort((a, b) => b[1] - a[1])[0]?.[0];
    let park = r.parkUrl || null;
    const pm = park?.match(/\/parks\/(.+)\/([^/]+)$/);
    if (pm && region && pm[1] !== region) { park = `https://www.alltrails.com/parks/${region}/${pm[2]}`; fixed++; }
    out.sites[slug] = { park, label: r.parkLabel || null, trails: r.trails.slice(0, 5).map((t) => ({ name: t.name, url: t.url, miles: t.length_miles ?? null, difficulty: t.difficulty || null, route: t.route_type || null })), from: 'AllTrails connector', gathered: new Date().toISOString().slice(0, 10) };
    n++;
  }
}
out.generated = new Date().toISOString();
await writeFile(OUT, JSON.stringify(out, null, 1));
console.log(`${n} sites with trails; park region corrected for ${fixed}`);
