// Public-domain photos from a refuge's own fws.gov pages. Every fws.gov media page states its
// "Media Usage Rights/License"; only items marked Public Domain are kept (most FWS staff photos).
const UA = 'TRPL-PublicLandsDirectory/1.0 (+https://directory.labs.trlibrary.com/about/)';
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) }); return r.ok ? r.text() : ''; };
const un = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
const SKIP = /logo|brochure|map|pdf|guide|regulation|sign|permit|form|leaflet|flyer|fact-?sheet|chart|graphic|icon|staff|portrait|headshot|meeting/i;

export async function fwsCover(refugeUrl, maxItems = 12) {
  const page = await get(refugeUrl);
  if (!page) return null;
  const items = [...new Set([...page.matchAll(/href="(?:https:\/\/www\.fws\.gov)?\/media\/([a-z0-9-]+)"/g)].map((m) => m[1]))].filter((s) => !SKIP.test(s)).slice(0, maxItems);
  const ok = [];
  for (const slug of items) {
    const t = await get(`https://www.fws.gov/media/${slug}`);
    if (!t || !/<div class="media-type field">Image<\/div>/.test(t)) continue;
    const rights = un(t.match(/Media Usage Rights\/License<\/div><div class="field--item">([^<]+)/)?.[1]);
    if (!/^public domain/i.test(rights)) continue;
    const a = t.match(/field--name-field-media-image[^>]*>\s*<a href="([^"]+)"[^>]*data-pswp-width="(\d+)" data-pswp-height="(\d+)"/);
    if (!a) continue;
    const [, url, w, h] = a;
    if (+w < 1200 || +w < +h * 1.2) continue; // landscape, large enough for a cover
    const credit = un(t.match(/Photo By\/Credit<\/div>\s*(?:<p>)?([^<]+)/)?.[1]) || 'U.S. Fish and Wildlife Service';
    const title = un(t.match(/<meta property="og:title" content="([^"]+)"/)?.[1]);
    const alt = un(t.match(/field--name-field-media-caption[^>]*>([^<]+)/)?.[1]) || title;
    if (SKIP.test(`${title} ${alt}`)) continue;
    ok.push({ url, original: url, title, alt: alt.slice(0, 200), credit: /usfws|fish and wildlife/i.test(credit) ? credit : `${credit}/USFWS`, license: 'Public domain', licenseUrl: null, filePage: `https://www.fws.gov/media/${slug}`, tier: 1, source: 'U.S. Fish and Wildlife Service', kind: 'fws-media', review: 'auto-fws', w: +w });
  }
  // Prefer wide landscapes over close-ups: widest aspect ratio first among the first few.
  return ok[0] || null;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(await fwsCover(process.argv[2]));
