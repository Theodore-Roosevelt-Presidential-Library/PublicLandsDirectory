// Draft refuge establishment events from each refuge's own fws.gov "About Us" page
// ("... was established on August 18, 1908, by President Theodore Roosevelt as the Lake Malheur Reservation").
// Writes only to sites with no history yet. Every event is reviewed: false until HistorianPanel review.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJSON, writeJSON, DATA, mapLimit } from '../lib.mjs';
import { presidentOn } from './presidents.mjs';

const UA = 'TRPL-PublicLandsDirectory/1.0 (+https://directory.labs.trlibrary.com/about/)';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;|&quot;/g, '"').replace(/\s+/g, ' ');
const DATE = /(?:on |in )?((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December),? \d{4}|\d{4})/;
function iso(s) {
  let m = s.match(/^(\w+) (\d{1,2}), (\d{4})$/); if (m) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\w+),? (\d{4})$/); if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}`;
  return s;
}
const dir = (await readJSON(join(DATA, 'directory.json'))).sites;
const targets = dir.filter((s) => s.agency.code === 'FWS' && /^https:\/\/www\.fws\.gov\/refuge\//.test(s.links?.official || ''));
let wrote = 0; const none = [];
await mapLimit(targets, 4, async (s) => {
  const file = join(DATA, 'editorial', `${s.slug}.json`);
  const prev = existsSync(file) ? await readJSON(file) : {};
  if ((prev.designationHistory || []).length) return;
  const url = s.links.official.replace(/\/$/, '') + '/about-us';
  let t = '';
  try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); if (r.ok) t = text(await r.text()); } catch {}
  // The first sentence that says this unit "was established" (or "Established in ...") with a date.
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((x) => /\bestablished\b/i.test(x) && !/wilderness|Refuge System is established|each unit of the national wildlife refuge system|established the mission|Improvement Act|Administration Act/i.test(x) && DATE.test(x.slice(x.search(/established/i))));
  const sen = sentences[0];
  if (!sen) { none.push(s.slug); return; }
  const at = sen.search(/established/i);
  // Start the quote at the refuge's name (or "The refuge"/"Established") just before "established".
  const short = s.name.replace(/ (National Wildlife Refuge|Wetland Management District)$/, '');
  const win = sen.slice(Math.max(0, at - 250), at);
  const starts = [win.lastIndexOf(short), win.search(/The (refuge|district)\b/i), win.lastIndexOf('Established')].filter((i) => i >= 0);
  const quoteStart = Math.max(0, at - 250) + (starts.length ? Math.max(...starts) : Math.max(0, win.length - 120));
  const quote = sen.slice(quoteStart).replace(/^\W+/, '');
  const after = sen.slice(at);
  const date = iso(after.match(DATE)[1]);
  const by = after.match(/by (?:President )?((?:[A-Z][a-z.]+ ){1,3}[A-Z][a-z]+)(?=[ ,.])/)?.[1] || null;
  const asName = after.match(/\bas (?:the |a )?((?:[A-Z][\w'.-]+ )+(?:Reservation|Refuge|Preserve|Range|Reserve|Area|Migratory Bird Refuge|Bird Reservation))/)?.[1] || null;
  const how = /executive order/i.test(sen) ? 'executive-order' : /proclamation/i.test(sen) ? 'presidential-proclamation' : /\b(act|congress|public law)\b/i.test(sen) ? 'act-of-congress' : 'unspecified';
  const p = date.length === 10 ? presidentOn(date) : null;
  const hist = [{
    date, action: 'established', designation: asName ? null : (s.name.match(/(National Wildlife Refuge|Wetland Management District)$/)?.[1] || null), name: asName,
    indexText: quote.trim().slice(0, 400),
    authority: { type: how, administration: by && /^[A-Z]/.test(by) && !/Congress/.test(by) ? by : p?.name || null, citation: null, ...(by && !/Congress/.test(by) ? { signedBy: by } : {}) },
    note: [date.length < 10 && 'The refuge page gives only the month or year.', p?.ambiguous && 'Dated on an inauguration day; confirm which President signed.', !by && how === 'unspecified' && 'The refuge page does not say how it was established.'].filter(Boolean).join(' ') || null,
    sources: [{ name: `U.S. Fish and Wildlife Service: ${s.name}, About Us`, url }],
    research: 'fws-about', reviewed: false,
  }];
  await writeJSON(file, { ...prev, slug: s.slug, designationHistory: hist, historySource: 'Refuge About Us pages, fws.gov (draft, pending review)' });
  wrote++;
});
console.log(`Drafted ${wrote} of ${targets.length} refuges from fws.gov About Us pages. No establishment sentence: ${none.length}`);
