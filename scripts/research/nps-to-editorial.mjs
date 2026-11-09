// Turn parsed NPS Index histories (research/nps-index.json) into designationHistory entries in data/editorial/<slug>.json.
// Usage: node scripts/research/nps-to-editorial.mjs path/to/nps-index.json
// Entries are written with reviewed:false. They publish only after HistorianPanel review (see docs/EDITORIAL.md).
import { join } from 'node:path';
import { DATA, readJSON, writeJSON } from '../lib.mjs';
import { presidentOn } from './presidents.mjs';

const INDEX_URL = 'https://www.nps.gov/aboutus/upload/npindex2012-2016.pdf';
const INDEX_NAME = 'The National Parks: Index 2012–2016 (National Park Service)';
const idx = await readJSON(process.argv[2]);
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;

const ACTION = { proclaimed: 'designated', authorized: 'designated', established: 'established', designated: 'designated', redesignated: 'redesignated', combined: 'redesignated', renamed: 'renamed', changed: 'renamed', transferred: 'transferred', reestablished: 'established' };
const AUTH = { proclaimed: 'presidential-proclamation', authorized: 'act-of-congress' };

let n = 0, events = 0;
for (const s of dir) {
  const nps = s.managedBy.find((m) => m.code === 'NPS');
  if (!nps) continue;
  const rec = idx[nps.unitCode.toLowerCase()];
  if (!rec) continue;
  const hist = [];
  rec.events.forEach((e) => {
    if (!ACTION[e.verb]) return; // dedications, additions, grants etc. stay in the Index text only
    const p = presidentOn(e.date);
    const type = AUTH[e.verb] || 'unspecified';
    const text = e.clause.replace(/^./, (c) => c.toUpperCase());
    hist.push({
      date: e.date,
      action: hist.length === 0 ? 'established' : ACTION[e.verb],
      designation: null,
      name: null,
      indexText: text,
      authority: {
        type,
        signedBy: type !== 'unspecified' && p && !p.ambiguous ? p.name : null,
        administration: p && !p.ambiguous ? p.name : null,
        citation: null,
      },
      note: p?.ambiguous ? `Dated on a day the presidency changed hands (${p.name}'s first day); administration to confirm.` : null,
      sources: [{ name: `${INDEX_NAME}, PDF page ${rec.page}`, url: INDEX_URL }],
      research: 'nps-index-2012-2016',
      reviewed: false,
    });
  });
  if (!hist.length) continue;
  const file = join(DATA, 'editorial', `${s.slug}.json`);
  const ed = await readJSON(file, { slug: s.slug, status: 'draft' });
  ed.designationHistory = hist;
  ed.historySource = { name: INDEX_NAME, page: rec.page, url: INDEX_URL, indexText: rec.history };
  delete ed.reviewNote;
  await writeJSON(file, ed);
  n++; events += hist.length;
}
console.log(`Wrote designation histories for ${n} NPS sites (${events} events), all pending review.`);
