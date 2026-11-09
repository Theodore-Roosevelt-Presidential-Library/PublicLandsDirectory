// Apply HistorianPanel verdicts to editorial designation histories.
// Usage: node scripts/research/apply-verdicts.mjs data/research/review-batch1-verdicts.json
//   confirmed  -> reviewed:true, independent sources added (and any authority refinement applied)
//   corrected  -> correction applied, original Index wording kept as indexOriginal, reviewed:true
//   unresolved -> left unreviewed (stays off the live site)
// Corrections that show an event is not a designation action (boundary revisions, leases) remove the event.
import { join } from 'node:path';
import { DATA, readJSON, writeJSON } from '../lib.mjs';

const verdicts = await readJSON(process.argv[2]);
const NOT_DESIGNATION = /boundary .*revised|lease agreement/i;
const bySlug = {};
for (const v of verdicts) { const [slug, i] = v.id.split('#'); (bySlug[slug] ||= []).push({ ...v, index: Number(i) }); }

const counts = { confirmed: 0, corrected: 0, removed: 0, unresolved: 0 };
for (const [slug, vs] of Object.entries(bySlug)) {
  const file = join(DATA, 'editorial', `${slug}.json`);
  const ed = await readJSON(file, null);
  if (!ed?.designationHistory) continue;
  const drop = new Set();
  for (const v of vs) {
    const h = ed.designationHistory[v.index];
    if (!h) continue;
    h.review = { verdict: v.verdict, note: v.note, by: 'HistorianPanel accuracy review, batch 1', date: new Date().toISOString().slice(0, 10) };
    if (v.verdict === 'unresolved') { counts.unresolved++; continue; }
    const c = v.correction || {};
    if (c.text && NOT_DESIGNATION.test(c.text)) { drop.add(v.index); counts.removed++; continue; }
    if (c.date) h.date = c.date;
    if (c.text) { h.indexOriginal = h.indexText; h.indexText = c.text; }
    if (c.authorityType) h.authority.type = c.authorityType;
    if (c.president) { h.authority.administration = c.president; h.authority.signedBy = h.authority.type === 'unspecified' ? null : c.president; h.note = null; }
    if (h.authority.type === 'unspecified') h.authority.signedBy = null;
    h.sources = [...h.sources, ...(v.sources || []).filter((s) => s.url && !h.sources.some((x) => x.url === s.url))];
    h.reviewed = true;
    counts[v.verdict === 'corrected' ? 'corrected' : 'confirmed']++;
  }
  ed.designationHistory = ed.designationHistory.filter((_, i) => !drop.has(i)).sort((a, b) => a.date.localeCompare(b.date));
  if (ed.designationHistory.every((h) => h.reviewed)) ed.status = 'reviewed';
  await writeJSON(file, ed);
}
console.log(counts);
