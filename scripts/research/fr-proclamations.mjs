// Draft designation histories for national monuments from presidential proclamations in the Federal Register
// (federalregister.gov, 1994 to today). Covers monuments the NPS Index (2012–2016) does not, across all agencies.
// Drafts are written with reviewed: false, so nothing shows on the site until HistorianPanel review.
// Usage: node scripts/research/fr-proclamations.mjs [slug,slug...]
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fetchJSON, readJSON, writeJSON, DATA, mapLimit } from '../lib.mjs';
import { presidentOn } from './presidents.mjs';

const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const norm = (t) => String(t || '').toLowerCase().replace(/[-–]\s+/g, '-').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const targets = dir.filter((s) => (ONLY.length ? ONLY.includes(s.slug) : /national monument/i.test(s.name)));

let wrote = 0, events = 0;
await mapLimit(targets, 3, async (s) => {
  const file = join(DATA, 'editorial', `${s.slug}.json`);
  const prev = existsSync(file) ? await readJSON(file) : {};
  if ((prev.designationHistory || []).length) return; // never touch existing histories, drafted or reviewed
  const name = s.name.replace(/ & Preserve$/, '');
  const q = new URLSearchParams();
  q.set('conditions[term]', `"${name}"`);
  q.append('conditions[type][]', 'PRESDOCU');
  q.append('conditions[presidential_document_type][]', 'proclamation');
  for (const f of ['title', 'proclamation_number', 'signing_date', 'president', 'html_url', 'citation']) q.append('fields[]', f);
  q.set('per_page', '50');
  const d = await fetchJSON(`https://www.federalregister.gov/api/v1/documents.json?${q}`);
  const n = norm(name);
  // Only proclamations whose title is about this monument (not observances that mention it in passing).
  const mine = (d.results || []).filter((r) => r.signing_date && norm(r.title).includes(n) && (/establish|boundary|modif|enlarg|amend|adjust|expan|reduc/i.test(r.title) || norm(r.title) === n));
  if (!mine.length) return;
  mine.sort((a, b) => a.signing_date.localeCompare(b.signing_date));
  const hist = mine.map((r, i) => {
    const p = presidentOn(r.signing_date);
    const est = /establish/i.test(r.title);
    return {
      date: r.signing_date,
      action: est ? 'established' : 'modified',
      designation: est ? 'National Monument' : null,
      name: null,
      indexText: r.title.replace(/-\s+/g, '-'),
      authority: { type: 'presidential-proclamation', signedBy: r.president?.name || p.name, administration: p.name, citation: `Proclamation ${r.proclamation_number}, ${r.citation}` },
      note: [p.ambiguous && 'Signed on an inauguration day; confirm which President signed.', !est && norm(r.title) === n && 'Title names the monument only; read the proclamation to describe what it changed.'].filter(Boolean).join(' ') || null,
      sources: [{ name: `Federal Register: Proclamation ${r.proclamation_number}, ${r.citation}`, url: r.html_url }],
      research: 'federal-register',
      reviewed: false,
    };
  });
  await writeJSON(file, { ...prev, slug: s.slug, designationHistory: hist, historySource: 'Federal Register presidential proclamations (draft, pending review)' });
  wrote++; events += hist.length;
});
console.log(`Drafted ${wrote} monuments from the Federal Register (${events} events), all pending review.`);
