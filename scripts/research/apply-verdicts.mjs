// Apply HistorianPanel verdicts to editorial designation histories.
// Usage: node scripts/research/apply-verdicts.mjs data/research/review-batch1-verdicts.json
//   confirmed  -> reviewed:true, independent sources added (and any authority refinement applied)
//   corrected  -> correction applied, original Index wording kept as indexOriginal, reviewed:true
//   unresolved -> left unreviewed (stays off the live site)
// Corrections that show an event is not a designation action (boundary revisions, leases) remove the event.
// Correction fields: date, text, action, designation, name, authorityType, citation, president, remove (true drops the event).
// Usage: node apply-verdicts.mjs <verdicts.json> [batch label]
import { join } from 'node:path';
import { DATA, readJSON, writeJSON } from '../lib.mjs';
import { presidentName } from './presidents.mjs';

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
    h.review = { verdict: v.verdict, note: v.note, by: `HistorianPanel accuracy review, ${process.argv[3] || 'batch 1'}`, date: new Date().toISOString().slice(0, 10) };
    if (v.verdict === 'unresolved') { counts.unresolved++; continue; }
    const c = v.correction || {};
    if (c.remove || (c.text && NOT_DESIGNATION.test(c.text))) { drop.add(v.index); counts.removed++; continue; }
    if (c.date) h.date = c.date;
    if (c.text) { h.indexOriginal = h.indexText; h.indexText = c.text; }
    // Reviewers sometimes describe the action; keep the standard vocabulary (the earlier name has its own field).
    if (c.action) h.action = /^established/i.test(c.action) ? 'established' : c.action;
    if (c.designation) h.designation = c.designation;
    if ('name' in c) h.name = c.name;
    if (c.authorityType) h.authority.type = c.authorityType;
    if (c.citation) h.authority.citation = c.citation;
    if (c.president) { h.authority.administration = c.president; h.authority.signedBy = h.authority.type === 'unspecified' ? null : c.president; h.note = null; }
    if (h.authority.type === 'unspecified') h.authority.signedBy = null;
    // Only a President can be a signer; drafts sometimes caught other words after "by" ("by Island Light").
    for (const k of ['signedBy', 'administration']) if (h.authority[k]) h.authority[k] = presidentName(h.authority[k]) || (k === 'administration' ? presidentName(c.president) : null);
    h.sources = [...h.sources, ...(v.sources || []).filter((s) => s.url && !h.sources.some((x) => x.url === s.url))];
    // Drafting notes (OCR warnings, inauguration-day flags) are settled by review.
    if (h.note && /OCR|confirm which President|read the proclamation/.test(h.note)) h.note = null;
    h.reviewed = true;
    counts[v.verdict === 'corrected' ? 'corrected' : 'confirmed']++;
  }
  ed.designationHistory = ed.designationHistory.filter((_, i) => !drop.has(i)).sort((a, b) => a.date.localeCompare(b.date));
  if (ed.designationHistory.every((h) => h.reviewed)) ed.status = 'reviewed';
  await writeJSON(file, ed);
}
console.log(counts);
