// Draft national forest designation histories from the Forest Service chronologic record
// (FS-612, Establishment and Modification of National Forest Boundaries, 1891–1985; archive.org CAT92970816).
// Writes only to sites with no history yet. Every event is reviewed: false until HistorianPanel review.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJSON, writeJSON, DATA } from '../lib.mjs';
import { presidentOn } from './presidents.mjs';

const SRC = 'Establishment and Modification of National Forest Boundaries: A Chronologic Record, 1891–1985 (USDA Forest Service, Lands Staff, 1985)';
const URL = 'https://archive.org/details/CAT92970816';
const rows = await readJSON(join(DATA, 'research', 'fs612-rows.json'));
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const norm = (t) => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/\bmt\.?\b/g, 'mount').replace(/\s\S*(mber land|forest reserve|and fish culture)\b.*$/, '').replace(/[^a-z]+/g, ' ').trim();
// A name the OCR read cleanly: capitalized words only.
const readable = (t) => /^[A-Z][a-z]+(?:[ -](?:[A-Z][a-z]+|and|of|&|Mt\.))*(?: Timber Land)?$/.test(t);
const clean = (t) => String(t).replace(/\s*\d+\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
// Small edit distance to absorb OCR slips in the first letters ("’ikes Peak").
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const same = (a, b) => a === b || (a.length > 6 && lev(a, b) <= (a.length >= 9 ? 2 : 1));

const authority = (r) => {
  const t = r.type;
  const num = t.match(/[\d,]+$/)?.[0]?.replace(/,/g, '');
  const p = presidentOn(r.date);
  if (/^Proc/.test(t)) return { type: 'presidential-proclamation', administration: p.name, citation: [num && `Proclamation ${num}`, r.citation].filter(Boolean).join(', ') || null, ambiguous: p.ambiguous };
  if (/^E\.\s?O/.test(t)) return { type: 'executive-order', administration: p.name, citation: [num && `Executive Order ${num}`, r.citation].filter(Boolean).join(', ') || null, ambiguous: p.ambiguous };
  if (/^(Act|P\.\s?L\.(?!\s?O)|Public Law|Joint)/.test(t)) return { type: 'act-of-congress', administration: p.name, citation: [num && `Public Law ${num}`, r.citation].filter(Boolean).join(', ') || null, ambiguous: p.ambiguous };
  return { type: 'administrative-order', administration: p.name, citation: [t, r.citation].filter(Boolean).join(', '), ambiguous: p.ambiguous };
};

let wrote = 0, events = 0; const none = [];
for (const s of dir.filter((x) => x.agency.code === 'USFS' && /national forest$/i.test(x.name))) {
  const file = join(DATA, 'editorial', `${s.slug}.json`);
  const prev = existsSync(file) ? await readJSON(file) : {};
  if ((prev.designationHistory || []).length) continue;
  const base = norm(s.name.replace(/ National Forest$/i, ''));
  const st = s.states;
  const mine = rows.filter((r) => same(norm(r.name), base) && (!st.length || r.states.some((x) => st.includes(x))));
  const est = mine.filter((r) => /establish/i.test(r.effect)).sort((a, b) => a.date.localeCompare(b.date))[0];
  // A forest that took its current name by renaming another unit.
  const renamed = rows.filter((r) => new RegExp(`name changed to ${base.replace(/ /g, '\\s*')}\\b`, 'i').test(norm(r.effect)) && (!st.length || r.states.some((x) => st.includes(x)))).sort((a, b) => a.date.localeCompare(b.date))[0];
  // When the forest took its name from a predecessor reserve, start with that reserve's establishment.
  let pred = null;
  if (renamed) {
    const pname = norm(renamed.name);
    pred = rows.filter((r) => same(norm(r.name), pname) && /establish/i.test(r.effect) && r.date <= renamed.date).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  const picks = [
    pred && { r: pred, action: 'established', predecessor: clean(pred.name) },
    renamed && { r: renamed, action: 'renamed' },
    est && !(renamed && est.date === renamed.date) && { r: est, action: 'established' },
  ].filter(Boolean);
  if (!picks.length) { none.push(s.name); continue; }
  const hist = picks.map(({ r, action, predecessor }) => {
    const a = authority(r);
    return {
      // Forest reserves became national forests by the act of March 4, 1907.
      date: r.date, action, designation: r.date < '1907-03-04' ? 'Forest Reserve' : 'National Forest',
      name: predecessor ? (readable(predecessor) ? `${predecessor.replace(/ Timber Land$/, '')} ${/Timber Land/.test(predecessor) ? 'Timber Land Reserve' : 'Forest Reserve'}` : null)
        : action === 'renamed' ? (r.date < '1907-03-04' ? s.name.replace(/National Forest$/, 'Forest Reserve') : s.name) : null,
      indexText: `${clean(r.name)}: ${r.effect}`.replace(/\s+/g, ' ').slice(0, 300),
      authority: { type: a.type, administration: a.administration, citation: a.citation },
      note: [r.effective && r.effective !== r.date && `Effective ${r.effective}.`, a.ambiguous && 'Dated on an inauguration day; confirm which President signed.', predecessor && !readable(predecessor) && 'Predecessor reserve name unreadable in the OCR; fill in from the original.', 'Drafted from OCR of a scanned table; check names, dates and citations against the original.'].filter(Boolean).join(' '),
      sources: [{ name: `${SRC}, PDF page ${r.pdfPage}`, url: URL }],
      research: 'fs612', reviewed: false,
    };
  });
  await writeJSON(file, { ...prev, slug: s.slug, designationHistory: hist, historySource: 'Forest Service chronologic record FS-612 (draft, pending review)' });
  wrote++; events += hist.length;
}
console.log(`Drafted ${wrote} national forests (${events} events) from FS-612. No match: ${none.length}`);
console.log(none.join(' | '));
