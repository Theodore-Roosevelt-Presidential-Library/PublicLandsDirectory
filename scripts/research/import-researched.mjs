// Import designation histories researched from scratch (no earlier draft) into data/editorial.
// Input: data/research/researched-*.json, each { "<slug>": { "events": [ ... ], "note": "..." } } where an event is
//   { date, action, designation, name, text, authority: { type, citation, president }, sources: [{ name, url, independent? }],
//     verdict: "confirmed" | "unresolved", note }
// An event is published (reviewed: true) only when its verdict is "confirmed" after the two-pass check and it carries
// at least two sources. Sites that already have a history are left alone.
// Usage: node scripts/research/import-researched.mjs data/research/researched-nps.json [...]
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { DATA, readJSON, writeJSON } from '../lib.mjs';
import { presidentOn, presidentName } from './presidents.mjs';

const PRESIDENTIAL = ['presidential-proclamation', 'executive-order', 'act-of-congress'];
const counts = { sites: 0, published: 0, held: 0, skipped: 0 };
for (const file of process.argv.slice(2)) {
  const data = await readJSON(file);
  for (const [slug, r] of Object.entries(data)) {
    if (!r?.events?.length) continue;
    const path = join(DATA, 'editorial', `${slug}.json`);
    const ed = existsSync(path) ? await readJSON(path) : { slug };
    if ((ed.designationHistory || []).length) { counts.skipped++; continue; }
    ed.designationHistory = r.events.filter((e) => e.date).map((e) => {
      const ok = e.verdict === 'confirmed' && (e.sources || []).filter((s) => s.url).length >= 2;
      ok ? counts.published++ : counts.held++;
      const type = e.authority?.type || 'unspecified';
      const pres = presidentName(e.authority?.president) || (/^\d{4}-\d\d-\d\d$/.test(e.date) && !presidentOn(e.date)?.ambiguous ? presidentOn(e.date).name : null);
      return {
        date: e.date, action: /^established/i.test(e.action || '') ? 'established' : e.action || 'established',
        designation: e.designation || null, name: e.name || null, indexText: e.text || null,
        authority: { type, administration: pres, citation: e.authority?.citation || null, signedBy: PRESIDENTIAL.includes(type) ? presidentName(e.authority?.president) : null },
        note: e.note || null,
        sources: (e.sources || []).map(({ name, url }) => ({ name, url })),
        research: file.replace(/^.*researched-|\.json$/g, ''), reviewed: ok,
        ...(ok ? { review: { verdict: 'confirmed', by: 'HistorianPanel research and review', date: new Date().toISOString().slice(0, 10) } } : {}),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    ed.historySource ||= 'Researched from primary sources (HistorianPanel)';
    await writeJSON(path, ed);
    counts.sites++;
  }
}
console.log(counts);
