// Build the static site into dist/ for GitHub Pages.
import { nationalMap } from './national-map.mjs';
import { join } from 'node:path';
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ROOT, DATA, readJSON, writeJSON, writeText, CATEGORIES, AGENCIES } from './lib.mjs';

const DIST = join(ROOT, 'dist');
const SITE = process.env.SITE_URL || 'https://directory.labs.trlibrary.com';
const MAPCOLORS = { NPS: '#1B4532', FWS: '#E7805D', USFS: '#87BB41', BLM: '#092A4D' };
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const { sites, generated } = await readJSON(join(DATA, 'directory.json'));
const alerts = await readJSON(join(DATA, 'live', 'alerts.json'), { generated: null, sites: {} });
const bySlug = new Map(sites.map((s) => [s.slug, s]));

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(ROOT, 'src', 'assets'), join(DIST, 'assets'), { recursive: true });
await cp(join(ROOT, 'src', 'embed'), join(DIST, 'embed'), { recursive: true });
await writeText(join(DIST, 'CNAME'), 'directory.labs.trlibrary.com\n');
await writeText(join(DIST, '.nojekyll'), '');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paras = (s) => String(s || '').split(/\n{2,}|\r?\n/).filter((x) => x.trim()).map((p) => `<p>${esc(p.trim())}</p>`).join('');
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); if (!m) return String(y); // year-only dates, where the source gives only a year
  if (!d) return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }); return new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
const num = (n) => Math.round(n).toLocaleString('en-US');
const AUTH = { 'act-of-congress': 'Act of Congress', 'presidential-proclamation': 'Presidential proclamation', 'executive-order': 'Executive order', 'secretarial-order': 'Secretarial order', 'public-land-order': 'Public land order', other: 'Other authority' };
const authLine = (a) => a && a.type === 'unspecified' ? (a.administration ? `${esc(a.administration)} administration` : '') : a ? `${AUTH[a.type] || a.type}${a.citation ? ` (${esc(a.citation)})` : ''}${a.type === 'act-of-congress' ? (a.signedBy ? `, signed by ${esc(a.signedBy)}` : '') : a.signedBy ? ` by ${esc(a.signedBy)}` : ''}` : '';
const pendingTag = (reviewed) => reviewed ? '' : ' <span class="tag tag-pending" title="This entry is waiting for review by the Library\u2019s historians">Pending historian review</span>';

function layout({ title, description, path, body, head = '', jsonld = null, image = null }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/embedded.js"></script>
${head}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<header class="masthead"><div class="wrap">
  <a class="brand" href="/"><span class="brand-kicker">Theodore Roosevelt Presidential Library</span><span class="brand-title">Public Lands Directory</span></a>
  <nav><a href="/">Directory</a><a href="/map/">Map</a><a href="/roosevelt/">T.R.\u2019s public lands</a><a href="/embed/">Embed</a><a href="/about/">About the data</a></nav>
</div></header>
<main>${body}</main>
<footer class="foot"><div class="wrap">
  <p>A project of the <a href="https://www.trlibrary.com">Theodore Roosevelt Presidential Library</a> in Medora, North Dakota. Data from the National Park Service, U.S. Fish and Wildlife Service, USDA Forest Service, Bureau of Land Management, National Weather Service and National Interagency Fire Center, refreshed automatically. <a href="/about/">Sources and methods</a> · <a href="/api/">Open data</a></p>
</div></footer>
</body></html>`;
}

// Photo credit per the Library's image-rights standard: "Photo: Name, CC BY-SA 4.0" with the license and file linked.
function creditHTML(i) {
  const who = esc(i.credit || i.source || '');
  if (i.license && i.licenseUrl) return `Photo: ${who}, <a href="${esc(i.licenseUrl)}" rel="license noopener">${esc(i.license)}</a>${i.filePage ? ` · <a href="${esc(i.filePage)}" rel="noopener">source</a>` : ''}`;
  if (i.license) return `Photo: ${who} (${esc(i.license)})${i.filePage && i.source === 'Wikimedia Commons' ? ` · <a href="${esc(i.filePage)}" rel="noopener">source</a>` : ''}`;
  return `Photo: ${who}${i.title ? `, ${esc(i.title)}` : ''}`;
}

// ---------- alerts ----------
function alertsHTML(slug) {
  const list = alerts.sites[slug] || [];
  if (!list.length) return `<div class="alerts-empty">All clear. The managing agency, the National Weather Service and wildfire reporting show no current alerts.</div>`;
  return list.map((a) => `<details class="alert alert-${esc((a.source + '-' + (a.severity || a.kind || '')).toLowerCase().replace(/[^a-z]+/g, '-'))}">
    <summary><span class="alert-src">${esc(a.source === 'NWS' ? 'Weather' : a.source === 'NIFC' ? (a.kind || 'Wildfire') : a.kind || 'Alert')}</span> ${esc(a.title)}</summary>
    ${a.text ? `<div class="alert-body">${paras(a.text)}${a.instruction ? `<p><strong>What to do:</strong> ${esc(a.instruction)}</p>` : ''}</div>` : ''}
    ${a.url ? `<p class="alert-link"><a href="${esc(a.url)}" rel="noopener">Read the full alert</a>${a.ends ? ` · Until ${esc(new Date(a.ends).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))}` : ''}</p>` : ''}
  </details>`).join('');
}

// ---------- Roosevelt connections ----------
const TR_TYPES = { protected: 'Protected by T.R.', 'executive-action': 'His proclamations and orders', visited: 'T.R. was here', lived: 'Where T.R. lived and worked', named: 'Named for T.R.', other: 'More connections' };
function trHTML(s) {
  const list = s.trConnections || [];
  const parts = [];
  if (s.trConnection?.summary) parts.push(paras(s.trConnection.summary) + pendingTag(s.trConnection.reviewed));
  const groups = {};
  for (const c of list) (groups[c.type] ||= []).push(c);
  for (const [type, cs] of Object.entries(groups)) {
    const items = cs.map((c) => {
      const src = (c.sources || []).filter((x) => x.url).map((x) => `<a href="${esc(x.url)}">${esc(x.name || 'Source')}</a>`).join(' · ');
      let line;
      if (type === 'protected') line = `<strong>${fmtDate(c.date)}</strong>: as President, Theodore Roosevelt ${c.thenKind === 'national park' ? 'signed the act creating' : 'set aside'} ${esc(c.then)}${c.thenKind && !new RegExp(c.thenKind, 'i').test(c.then) ? ` (${esc(c.thenKind)})` : ''}.`;
      else if (type === 'executive-action') line = `<strong>${fmtDate(c.date)}</strong>: ${esc(c.document)}, \u201c${esc(c.title)}.\u201d Today\u2019s site ${esc(c.relation)}.`;
      else if (type === 'visited' && !c.days) line = `<strong>${esc(c.place)}</strong>: ${fmtDate(c.first)}${c.last && c.last !== c.first ? ` to ${fmtDate(c.last)}` : ''}.${c.text ? ` ${esc(c.text)}` : ''}`;
      else if (type === 'visited') line = c.days > 1 ? `<strong>${esc(c.place)}</strong>: ${c.days.toLocaleString('en-US')} days in Roosevelt\u2019s record, ${fmtDate(c.first)} to ${fmtDate(c.last)}.` : `<strong>${esc(c.place)}</strong>: ${fmtDate(c.first)}.`;
      else line = `${c.date ? `<strong>${fmtDate(c.date)}</strong>: ` : ''}${esc(c.text)}`;
      return `<li>${line}${c.note ? ` <span class="muted">${esc(c.note)}</span>` : ''}${pendingTag(c.reviewed !== false)}${src ? `<br><span class="src">${src}</span>` : ''}</li>`;
    }).join('');
    parts.push(`<h3>${TR_TYPES[type] || type}</h3><ul class="tr-list">${items}</ul>`);
  }
  return parts.join('');
}

// ---------- KML ----------
function kml(s, geom) {
  const rings = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map((p) => `<Polygon>${p.map((r, i) => `<${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}><LinearRing><coordinates>${r.map((c) => c.join(',')).join(' ')}</coordinates></LinearRing></${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}>`).join('')}</Polygon>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(s.name)}</name><Style id="b"><LineStyle><color>ff32451b</color><width>2</width></LineStyle><PolyStyle><color>4d95c88f</color></PolyStyle></Style><Placemark><name>${esc(s.name)}</name><description>Simplified boundary. Source: ${esc(s.boundarySource?.name || '')}. ${SITE}/sites/${s.slug}/</description><styleUrl>#b</styleUrl><MultiGeometry>${rings}</MultiGeometry></Placemark></Document></kml>\n`;
}

// ---------- site pages ----------
const LINK_LABELS = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', twitter: 'X', youtube: 'YouTube', flickr: 'Flickr', threads: 'Threads', bluesky: 'Bluesky' };

function wildHTML(s) {
  return `<p>${s.wilderness.length === 1 ? 'Part of this place is' : 'Parts of this place are'} designated wilderness, protected by Congress under the Wilderness Act of 1964. Roads, motor vehicles and mechanized travel, including bicycles, are generally not allowed. Most travel is on foot or on horseback.</p>
<ul class="wild">${s.wilderness.map((w) => `<li><a href="${esc(w.url || 'https://wilderness.net')}">${esc(w.name)}</a> <span class="muted">${[w.designated && `designated ${w.designated}`, w.acres && `${num(w.acres)} acres`, w.agencies.length > 1 && `managed by ${w.agencies.join(' and ')}`].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>
<p class="muted small">Wilderness boundaries and acreage from Wilderness Connect (wilderness.net). Acreage is the whole wilderness, which can extend beyond this site.</p>`;
}

for (const s of sites) {
  const path = `/sites/${s.slug}/`;
  const hero = s.images[0];
  const desc = (s.summary || `${s.name}, managed by the ${s.agency.name}.`).replace(/\s+/g, ' ').slice(0, 300);
  const hist = s.designationHistory;
  const geomFile = join(DATA, 'boundaries', `${s.slug}.geojson`);
  const hasGeom = s.hasBoundary && existsSync(geomFile);
  const wildFile = join(DATA, 'wilderness', `${s.slug}.geojson`);
  const hasWild = s.wilderness?.length && existsSync(wildFile);
  if (hasWild) await writeJSON(join(DIST, 'wilderness', `${s.slug}.geojson`), await readJSON(wildFile), false);
  if (hasGeom) {
    const f = await readJSON(geomFile);
    await writeJSON(join(DIST, 'boundaries', `${s.slug}.geojson`), f, false);
    await writeText(join(DIST, 'boundaries', `${s.slug}.kml`), kml(s, f.geometry));
  }

  const facts = [
    ['Designation', esc(s.designation)],
    ['Managed by', s.managedBy.map((m) => `<a href="${esc(AGENCIES[m.code].url)}">${esc(m.name)}</a>`).join(' and ') + (s.managedBy.length > 1 ? ' <span class="muted">(jointly)</span>' : '')],
    ['Location', esc(s.stateNames.join(', ')) || '<span class="muted">Outside the 50 states</span>'],
    s.acres ? ['Size', `${num(s.acres.value)} acres${s.acres.kind !== 'documented' ? ` <span class="muted" title="${esc(s.acres.note || s.acres.source)}">(${s.acres.kind === 'gis-estimate' ? 'estimate' : 'GIS'})</span>` : ''}`] : null,
    s.firstProtected && (!s.established || s.firstProtected.date !== s.established.date) ? ['First protected', `${fmtDate(s.firstProtected.date)}${s.firstProtected.name || s.firstProtected.designation ? ` as ${esc(s.firstProtected.name || s.firstProtected.designation)}` : ''}${s.firstProtected.text ? `<br><span class="muted">${esc(s.firstProtected.text)}</span>` : ''}<br><span class="muted">${authLine(s.firstProtected.authority)}</span>${pendingTag(s.firstProtected.reviewed)}`] : null,
    s.established ? [`${esc(s.established.designation)} since`, `${fmtDate(s.established.date)}<br><span class="muted">${authLine(s.established.authority)}</span>${pendingTag(s.established.reviewed)}`] : ['Established', '<span class="muted">Designation history being researched</span>'],
    s.wilderness?.length ? ['Wilderness', `${s.wilderness.length === 1 ? esc(s.wilderness[0].name) : `${s.wilderness.length} designated areas`}<br><a href="#wilderness">See wilderness</a>`] : null,
    s.visitation ? ['Visitors', `${num(s.visitation.recreation)} in ${s.visitation.year}<br><span class="muted">Recreation visits, <a href="${esc(s.visitation.url)}">${esc(s.visitation.source)}</a></span>`] : null,
    s.administrations.length ? ['Administration' + (s.administrations.length > 1 ? 's' : ''), esc(s.administrations.join(', '))] : null,
  ].filter(Boolean);

  const social = Object.entries(s.links.social || {}).filter(([, v]) => v);
  const linkList = [
    s.links.official && `<a class="btn" href="${esc(s.links.official)}">Official website</a>`,
    s.links.recreationGov ? `<a class="btn btn-ghost" href="${esc(s.links.recreationGov)}"${s.links.recreationGovName ? ` title="Listed on Recreation.gov as ${esc(s.links.recreationGovName)}"` : ''}>Reserve on Recreation.gov</a>` : `<a class="btn btn-ghost" href="${esc(s.links.recreationGovSearch)}">Permits and camping on Recreation.gov</a>`,
    s.links.alltrails ? `<a class="btn btn-ghost" href="${esc(s.links.alltrails)}">Trails on AllTrails</a>` : s.links.alltrailsExplore ? `<a class="btn btn-ghost" href="${esc(s.links.alltrailsExplore)}">Find trails on AllTrails</a>` : null,
    s.links.directions && `<a class="btn btn-ghost" href="${esc(s.links.directions)}">Directions</a>`,
    ...social.map(([k, v]) => `<a class="btn btn-ghost" href="${esc(v)}">${esc(LINK_LABELS[k] || k)}</a>`),
    ...(s.links.other || []).map((o) => `<a class="btn btn-ghost" href="${esc(o.url)}">${esc(o.label)}</a>`),
  ].filter(Boolean).join('');

  const g = s.guide || {};
  const section = (id, title, html) => html ? `<section id="${id}" class="block"><h2>${title}</h2>${html}</section>` : '';
  const guidePending = g.reviewed === false ? `<p class="note">Draft guide text${pendingTag(false)}</p>` : '';

  const historyHTML = (g.history ? paras(g.history) : '') + (hist.length ? `<ol class="timeline">${hist.map((h) => `<li><time datetime="${h.date}">${fmtDate(h.date)}</time><div>${h.indexText ? esc(h.indexText) + '.' : `<strong>${esc(h.name || h.designation)}</strong> ${h.action !== 'established' ? `<span class="muted">(${esc(h.action)})</span>` : ''}`}<br><span class="muted">${authLine(h.authority)}</span>${h.note ? `<br><span class="muted">${esc(h.note)}</span>` : ''}${pendingTag(h.reviewed)}</div></li>`).join('')}</ol>` : '<p class="muted">The designation history for this site (every law, proclamation and order, and the administration behind each) is being researched and checked by the Library\u2019s historians.</p>');

  const visit = [
    s.hours.length && `<h3>Hours</h3>${s.hours.map((h) => `<p><strong>${esc(h.name)}</strong>: ${esc(h.description)}</p>`).join('')}`,
    (s.fees.length || s.passes.length) && `<h3>Fees and passes</h3><ul>${[...s.fees, ...s.passes].map((f) => `<li><strong>${esc(f.title)}</strong>${Number(f.cost) ? ` \u2014 $${esc(Number(f.cost).toFixed(2))}` : ''}</li>`).join('')}</ul><p class="muted">The <a href="https://www.nps.gov/planyourvisit/passes.htm">America the Beautiful pass</a> covers entrance fees at federal recreation lands across all four agencies.</p>`,
    s.directions && `<h3>Getting there</h3>${paras(s.directions)}`,
    s.visitorCenters.length && `<h3>Visitor centers</h3><ul>${s.visitorCenters.map((v) => `<li>${v.url ? `<a href="${esc(v.url)}">${esc(v.name)}</a>` : esc(v.name)}</li>`).join('')}</ul>`,
    s.campgrounds.length && `<h3>Campgrounds</h3><ul>${s.campgrounds.map((c) => `<li>${esc(c.name)}${c.sites ? ` <span class="muted">(${c.sites} sites)</span>` : ''}${c.reservationUrl ? ` \u2014 <a href="${esc(c.reservationUrl)}">reserve</a>` : ''}</li>`).join('')}</ul>`,
    s.weatherInfo && `<h3>Weather</h3>${paras(s.weatherInfo)}`,
    s.contacts?.phone && `<p><strong>Phone:</strong> <a href="tel:${esc(s.contacts.phone.replace(/[^0-9+]/g, ''))}">${esc(s.contacts.phone)}</a></p>`,
  ].filter(Boolean).join('');

  const doHTML = [
    g.seeAndDo && paras(g.seeAndDo),
    s.thingsToDo.length && `<ul class="cards-mini">${s.thingsToDo.map((t) => `<li><a href="${esc(t.url)}">${esc(t.title)}</a>${t.description ? `<br><span class="muted">${esc(t.description.slice(0, 160))}</span>` : ''}</li>`).join('')}</ul>`,
    s.activities.length && `<h3>Activities</h3><ul class="chips">${s.activities.map((a) => `<li><a href="/?act=${encodeURIComponent(a)}" title="More places for ${esc(a.toLowerCase())}">${esc(a)}</a></li>`).join('')}</ul>`,
    s.trails?.length && `<h3>Popular trails</h3><ul class="trails">${s.trails.map((t) => `<li><a href="${esc(t.url)}">${esc(t.name)}</a>${[t.miles != null && `${t.miles} mi`, t.route?.replace(' & ', ' and '), t.difficulty].filter(Boolean).length ? ` <span class="muted">${esc([t.miles != null && `${t.miles} mi`, t.route?.replace(' & ', ' and '), t.difficulty].filter(Boolean).join(' · '))}</span>` : ''}</li>`).join('')}</ul><p class="muted small">Trail details from AllTrails. Check conditions with the managing agency before you go.</p>`,
    s.links.alltrailsExplore && `<p><a href="${esc(s.links.alltrails || s.links.alltrailsExplore)}">${s.trails?.length ? 'More routes on AllTrails' : 'Browse hiking, biking and paddling routes on AllTrails'}</a></p>`,
  ].filter(Boolean).join('');

  // Shown only when reviewed text exists (tribal review required); no placeholder.
  const homelands = g.tribalHomelands && g.reviewed !== false ? paras(g.tribalHomelands) : '';

  const nearby = s.nearby.map((n) => bySlug.get(n.slug)).filter(Boolean);
  const gallery = s.images.slice(1, 7);

  const jsonld = {
    '@context': 'https://schema.org', '@type': s.category === 'national-park' ? ['TouristAttraction', 'Park'] : ['TouristAttraction', 'Place'],
    name: s.name, description: desc, url: `${SITE}${path}`, sameAs: [s.links.official, ...social.map(([, v]) => v)].filter(Boolean),
    ...(s.location ? { geo: { '@type': 'GeoCoordinates', latitude: s.location.lat, longitude: s.location.lon } } : {}),
    ...(hero ? { image: hero.url } : {}),
    address: { '@type': 'PostalAddress', addressRegion: s.states.join(', '), addressCountry: 'US' },
    publicAccess: true,
    ...(s.established ? { foundingDate: s.established.date } : {}),
    containedInPlace: s.stateNames.map((n) => ({ '@type': 'State', name: n })),
    isAccessibleForFree: s.fees.length ? !s.fees.some((f) => Number(f.cost) > 0) : undefined,
  };

  const body = `
<article class="site" data-slug="${s.slug}">
  <div class="hero${hero ? '' : ' hero-plain'}"${hero ? ` style="--hero:url('${esc(hero.url)}')" role="img" aria-label="${esc(hero.alt || hero.title || s.name)}"` : ''}>
    <div class="wrap hero-inner">
      <p class="eyebrow">${esc(s.categoryLabel)} · ${esc(s.managedBy.map((m) => m.code).join(' / '))} · ${esc(s.states.join(', '))}${s.trTypes?.length ? ` · <a class="tr-badge" href="#roosevelt">Roosevelt connection</a>` : ''}</p>
      <h1>${esc(s.name)}</h1>
      ${hero ? `<p class="credit">${creditHTML(hero)}</p>` : ''}
    </div>
  </div>
  <div class="wrap grid">
    <div class="main">
      <section id="alerts" class="block alerts" aria-live="polite"><h2>Alerts and conditions</h2><div class="alerts-list" data-generated="${esc(alerts.generated || '')}">${alertsHTML(s.slug)}</div></section>
      ${section('overview', 'Overview', s.summary ? paras(s.summary) + (s.summarySource ? `<p class="muted">${/Library/.test(s.summarySource) ? 'Written by the ' : 'From the '}${esc(s.summarySource)}</p>` : '') : '')}
      ${section('special', 'What makes it special', g.special ? paras(g.special) + guidePending : '')}
      ${section('history', 'History', historyHTML)}
      ${(s.trConnections?.length || s.trConnection) ? section('roosevelt', 'The Roosevelt connection', trHTML(s)) : ''}
      ${section('see-and-do', 'What to see and do', doHTML)}
      ${s.wilderness?.length ? section('wilderness', 'Wilderness', wildHTML(s)) : ''}
      ${section('visit', 'Plan your visit', visit || `<p>Check the <a href="${esc(s.links.official || s.agency.url)}">${esc(s.agency.name)}</a> for current hours, fees and access.</p>`)}
      ${homelands ? section('homelands', 'Whose lands these are', homelands) : ''}
      ${gallery.length ? section('photos', 'Photos', `<div class="gallery">${gallery.map((i) => `<figure><img loading="lazy" src="${esc(i.url)}" alt="${esc(i.alt || i.title || '')}"><figcaption>${esc(i.title || '')}${i.credit ? ` <span class="muted">· ${esc(i.credit)}</span>` : ''}</figcaption></figure>`).join('')}</div>`) : ''}
      ${nearby.length ? section('nearby', 'Pair it with', `<ul class="nearby">${s.nearby.map((n) => { const o = bySlug.get(n.slug); return o ? `<li><a href="/sites/${o.slug}/">${esc(o.name)}</a> <span class="muted">${esc(o.agency.code)} · ${Math.round(n.km * 0.621)} miles</span></li>` : ''; }).join('')}</ul>`) : ''}
    </div>
    <aside class="side">
      ${hasGeom || s.location ? `<div class="mapbox"><div id="map" class="map" data-geojson="${hasGeom ? `/boundaries/${s.slug}.geojson` : ''}" data-lat="${s.location?.lat ?? ''}" data-lon="${s.location?.lon ?? ''}"${hasWild ? ` data-wilderness="/wilderness/${s.slug}.geojson"` : ''}></div>${hasGeom ? `<p class="dl">Boundary: <a href="/boundaries/${s.slug}.geojson" download>GeoJSON</a> · <a href="/boundaries/${s.slug}.kml" download>KML</a> <span class="muted">(simplified)</span></p>` : ''}${hasWild ? `<p class="dl"><span class="key key-wild"></span> Designated wilderness · <a href="/wilderness/${s.slug}.geojson" download>GeoJSON</a></p>` : ''}</div>` : ''}
      <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="links">${linkList}</div>
      <details class="embed-box"><summary>Embed this site</summary>
        <p>Paste on any web page:</p>
        <textarea readonly rows="3">&lt;script src="${SITE}/embed/embed.js" async&gt;&lt;/script&gt;
&lt;public-lands-card site="${s.slug}"&gt;&lt;/public-lands-card&gt;</textarea>
        <p><a href="/embed/?site=${s.slug}">More embed options</a></p>
      </details>
      <div class="sources"><h3>Sources</h3><ul>${s.sources.map((x) => `<li><a href="${esc(x.url)}">${esc(x.name || x.title)}</a></li>`).join('')}</ul><p class="muted">Facts synced ${esc((s.synced || generated).slice(0, 10))}. Alerts refresh hourly. <a href="/api/sites/${s.slug}.json">This entry as JSON</a></p></div>
    </aside>
  </div>
</article>`;
  await writeText(join(DIST, 'sites', s.slug, 'index.html'), layout({ title: `${s.name} | Public Lands Directory`, description: desc, path, body, jsonld, image: hero?.url, head: hasGeom || s.location ? `<link rel="stylesheet" href="${LEAFLET_CSS}"><script defer src="${LEAFLET_JS}"></script><script defer src="/assets/site.js"></script>` : '<script defer src="/assets/site.js"></script>' }));
  await writeJSON(join(DIST, 'api', 'sites', `${s.slug}.json`), { ...s, alerts: alerts.sites[s.slug] || [], url: `${SITE}${path}`, boundaryUrl: hasGeom ? `${SITE}/boundaries/${s.slug}.geojson` : null }, false);
}

// ---------- index data, full data, CSV ----------
const index = sites.map((s) => ({
  s: s.slug, n: s.name, c: s.category, a: s.managedBy.map((m) => m.code), st: s.states,
  y: s.established ? Number(s.established.date.slice(0, 4)) : null, fy: s.firstProtected ? Number(s.firstProtected.date.slice(0, 4)) : null,
  p: s.administrations, lat: s.location?.lat ?? null, lon: s.location?.lon ?? null,
  img: s.images[0]?.url || null, ac: s.acres?.value || null, al: (alerts.sites[s.slug] || []).length,
  act: s.activities, tr: s.trTypes || [], w: s.wilderness?.length || 0,
}));
await writeJSON(join(DIST, 'api', 'index.json'), { generated, categories: CATEGORIES, agencies: AGENCIES, sites: index }, false);
await writeJSON(join(DIST, 'api', 'directory.json'), { generated, license: 'Public domain (U.S. government data) and CC BY 4.0 for Library-written guide text', sites }, false);
await writeJSON(join(DIST, 'api', 'alerts.json'), alerts, false);
const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = [['slug', 'name', 'designation', 'category', 'managing_agencies', 'states', 'acres', 'acres_kind', 'latitude', 'longitude', 'first_protected', 'current_designation_since', 'established_by_authority', 'established_signed_by', 'history_reviewed', 'tr_connections', 'official_url', 'page_url']]
  .concat(sites.map((s) => [s.slug, s.name, s.designation, s.category, s.managedBy.map((m) => m.code).join(';'), s.states.join(';'), s.acres?.value, s.acres?.kind, s.location?.lat, s.location?.lon, s.firstProtected?.date, s.established?.date, s.established?.authority?.type, s.established?.authority?.signedBy, s.established ? s.designationHistory.every((h) => h.reviewed) : '', (s.trTypes || []).join(';'), s.links.official, `${SITE}/sites/${s.slug}/`]))
  .map((r) => r.map(csvEsc).join(',')).join('\n');
await writeText(join(DIST, 'api', 'directory.csv'), csv + '\n');

// ---------- home ----------
const counts = (k) => sites.reduce((m, s) => ((m[k(s)] = (m[k(s)] || 0) + 1), m), {});
const byAgency = {}; for (const s of sites) for (const m of s.managedBy) byAgency[m.code] = (byAgency[m.code] || 0) + 1;
const totalAcres = sites.reduce((t, s) => t + (s.acres?.value || 0), 0);
const home = `
<section class="intro"><div class="wrap">
  <h1>America\u2019s public lands, all in one place</h1>
  <p class="lede">Every national park, forest, grassland, wildlife refuge, monument, seashore, recreation area and historic site managed by the four federal land agencies \u2014 with maps, history, alerts and links to plan a visit.</p>
  <ul class="stats"><li><strong>${num(sites.length)}</strong> places</li><li><strong>${num(byAgency.NPS || 0)}</strong> National Park Service</li><li><strong>${num(byAgency.FWS || 0)}</strong> Fish and Wildlife Service</li><li><strong>${num(byAgency.USFS || 0)}</strong> Forest Service</li><li><strong>${num(byAgency.BLM || 0)}</strong> Bureau of Land Management</li></ul>
</div></section>
<section class="finder wrap">
  <form class="filters" id="filters" role="search" onsubmit="return false">
    <label class="grow"><span>Search</span><input type="search" id="q" placeholder="Name, state or activity" autocomplete="off"></label>
    <label><span>Type</span><select id="cat"><option value="">All types</option>${Object.entries(CATEGORIES).filter(([k]) => counts((s) => s.category)[k]).map(([k, v]) => `<option value="${k}">${esc(v)} (${counts((s) => s.category)[k]})</option>`).join('')}</select></label>
    <label><span>Agency</span><select id="agency"><option value="">All agencies</option>${Object.values(AGENCIES).map((a) => `<option value="${a.code}">${esc(a.name)}</option>`).join('')}</select></label>
    <label><span>State</span><select id="state"><option value="">All states</option></select></label>
    <label><span>Administration</span><select id="admin"><option value="">Any</option></select></label>
    <label><span>Activity</span><select id="act"><option value="">Any activity</option></select></label>
    <label><span>Roosevelt connection</span><select id="tr"><option value="">Any</option><option value="any">Any Roosevelt connection</option><option value="protected">Protected by T.R.</option><option value="executive-action">His proclamations and orders</option><option value="visited">T.R. was here</option><option value="both">Protected by T.R. and visited</option></select></label>
    <label class="check"><input type="checkbox" id="alerts"> <span>Has alerts</span></label>
    <label class="check"><input type="checkbox" id="wild"> <span>Has wilderness</span></label>
  </form>
  <div class="viewbar"><p id="count" aria-live="polite"></p><div class="toggle"><button type="button" data-view="list" aria-pressed="true">List</button><button type="button" data-view="map" aria-pressed="false">Map</button></div></div>
  <div id="map" class="map map-big" hidden></div>
  <ul id="results" class="results"></ul>
  <button type="button" id="more" class="btn btn-ghost" hidden>Show more</button>
</section>`;
await writeText(join(DIST, 'index.html'), layout({ title: 'Public Lands Directory | Theodore Roosevelt Presidential Library', description: `A guide to ${sites.length} national parks, forests, grasslands, wildlife refuges, monuments and other federal public lands, with maps, history and live alerts.`, path: '/', body: home, head: `<link rel="stylesheet" href="${LEAFLET_CSS}"><script defer src="${LEAFLET_JS}"></script><script defer src="/assets/directory.js"></script>`, jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Public Lands Directory', url: SITE, publisher: { '@type': 'Organization', name: 'Theodore Roosevelt Presidential Library', url: 'https://www.trlibrary.com' } } }));

// ---------- T.R.'s public lands ----------
{
  const trSites = sites.filter((x) => x.trTypes?.length);
  const groupHTML = (type, title, blurb) => {
    const list = trSites.filter((x) => x.trTypes.includes(type));
    if (!list.length) return '';
    return `<section class="block"><h2>${title}</h2><p>${blurb}</p><ul class="tr-groups">${list.map((x) => {
      const c = x.trConnections.filter((y) => y.type === type);
      const when = type === 'visited' ? c.map((y) => y.first.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i).join(', ') : c.map((y) => (y.date || '').slice(0, 4)).filter(Boolean).sort()[0];
      return `<li><a href="/sites/${x.slug}/#roosevelt">${esc(x.name)}</a> <span class="muted">${esc(x.states.join(', '))}${when ? ` · ${esc(when)}` : ''}</span></li>`;
    }).join('')}</ul></section>`;
  };
  const pts = trSites.filter((x) => x.location).map((x) => ({ s: x.slug, n: x.name, lat: x.location.lat, lon: x.location.lon, t: x.trTypes }));
  const body = `<section class="intro"><div class="wrap">
  <h1>Theodore Roosevelt’s public lands</h1>
  <p class="lede">Forests he proclaimed, birds he protected, canyons and cliff dwellings he set aside, and the places his own record shows he walked. Find T.R.’s mark on today’s public lands, site by site.</p>
  </div></section>
  <div class="wrap" style="padding-top:26px">
  <div id="trmap" class="map map-big" data-points='${esc(JSON.stringify(pts))}'></div>
  ${(() => { const both = trSites.filter((x) => x.trTypes.includes('visited') && (x.trTypes.includes('protected') || x.trTypes.includes('executive-action'))); return both.length ? `<section class="block"><h2>Protected by T.R. and visited</h2><p>Places Roosevelt set aside or acted on as President and also saw for himself, before or after.</p><ul class="tr-groups">${both.map((x) => `<li><a href="/sites/${x.slug}/">${esc(x.name)}</a> <span class="muted">${esc(x.trConnections.filter((y) => y.type === 'visited').map((y) => (y.first || '').slice(0, 4)).filter((v, i, a) => v && a.indexOf(v) === i).join(', '))}</span></li>`).join('')}</ul></section>` : ''; })()}
  ${groupHTML('visited', 'T.R. was here', 'Places where Roosevelt’s own record, compiled in <a href="https://daybyday.labs.trlibrary.com">Theodore Roosevelt Day by Day</a>, puts him on the ground, plus visits confirmed by the Library’s historical accuracy review.')}
  ${groupHTML('protected', 'Protected by T.R.', 'Parks, monuments, forest reserves, bird reservations and game preserves he created as President, from <a href="https://publiclands.labs.trlibrary.com">Roosevelt’s Public Lands</a>. Many have new names today.')}
  ${groupHTML('executive-action', 'His proclamations and orders', 'Places that trace to one of his proclamations or executive orders, from <a href="https://executiveactions.labs.trlibrary.com/then-and-now.html">Theodore Roosevelt’s Executive Orders and Proclamations</a>.')}
  ${groupHTML('lived', 'Where T.R. lived and worked', '')}
  </div>
  <script>
  (function init(){ if(!window.L) return setTimeout(init,100);
    const el=document.getElementById('trmap'), pts=JSON.parse(el.dataset.points);
    const map=L.map(el,{preferCanvas:true}).setView([39.5,-98.5],4);
    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'USGS The National Map'}).addTo(map);
    const col=(t)=>t.includes('visited')?'#E7805D':t.includes('protected')?'#1B4532':'#87BB41';
    pts.forEach(p=>L.circleMarker([p.lat,p.lon],{radius:6,weight:1,color:'#fff',fillColor:col(p.t),fillOpacity:.95}).bindPopup('<a href="/sites/'+p.s+'/#roosevelt"><strong>'+p.n.replace(/</g,'&lt;')+'</strong></a>').addTo(map));
    const lg=L.control({position:'bottomright'});lg.onAdd=()=>{const d=L.DomUtil.create('div');d.style.cssText='background:#fff;padding:6px 9px;font:12px Arial;border-radius:4px';d.innerHTML='<span style="color:#E7805D">●</span> T.R. was here<br><span style="color:#1B4532">●</span> Protected by T.R.<br><span style="color:#87BB41">●</span> His proclamations and orders';return d};lg.addTo(map);
  })();
  </script>`;
  // ---- National map: every boundary in one simplified file, zoom and click ----
  await writeJSON(join(DIST, 'map', 'boundaries.json'), await nationalMap(sites, DATA), false);
  await writeText(join(DIST, 'map', 'index.html'), layout({
    title: 'Map of America\u2019s public lands | Public Lands Directory',
    description: 'Every national park, forest, grassland, wildlife refuge, monument and conservation area in one map. Zoom in and click any place to open its page.',
    path: '/map/',
    head: `<link rel="stylesheet" href="${LEAFLET_CSS}"><script defer src="${LEAFLET_JS}"></script><script defer src="/assets/national-map.js"></script>`,
    body: `<section class="natmap">
  <div class="natmap-bar">
    <h1>America\u2019s public lands, all on one map</h1>
    <div class="natmap-controls">
      <input id="nm-q" type="search" placeholder="Find a place" aria-label="Find a place" list="nm-names">
      <datalist id="nm-names"></datalist>
      ${Object.entries(AGENCIES).map(([k, v]) => `<label class="check nm-ag"><input type="checkbox" value="${k}" checked> <span class="swatch" style="background:${MAPCOLORS[k]}"></span> ${esc({ NPS: 'National Park Service', FWS: 'Fish and Wildlife Service', USFS: 'Forest Service', BLM: 'Bureau of Land Management' }[k] || v.name)}</label>`).join('')}
      <label class="check"><input type="checkbox" id="nm-tr"> <span>Only Roosevelt connections</span></label>
    </div>
  </div>
  <div id="natmap" role="application" aria-label="Map of public lands"></div>
  <p class="muted small natmap-note">Boundaries are simplified for the national view; each site\u2019s page has the detailed boundary. Small sites show as dots. Dashed outlines are wildlife refuge program areas, where the U.S. Fish and Wildlife Service may acquire land or easements; most of the land inside them is private. Sources: National Park Service, U.S. Fish and Wildlife Service, USDA Forest Service and Bureau of Land Management.</p>
</section>`,
  }));

  await writeText(join(DIST, 'roosevelt', 'index.html'), layout({ title: 'Theodore Roosevelt’s public lands | Public Lands Directory', description: 'Public lands Theodore Roosevelt protected as President, places that trace to his proclamations and orders, and places his own record shows he visited.', path: '/roosevelt/', body, head: `<link rel="stylesheet" href="${LEAFLET_CSS}"><script defer src="${LEAFLET_JS}"></script>` }));
}

// ---------- cover review sheet (unlisted, noindex) ----------
{
  const coverData = await readJSON(join(DATA, 'reference', 'cover-images.json'), { sites: {}, missing: [] });
  const rows = sites.map((x) => ({ x, c: coverData.sites[x.slug] }));
  const order = (r) => (!r.c ? 0 : r.c.review ? 1 : r.c.tier === 3 ? 2 : 3);
  rows.sort((a, b) => order(a) - order(b) || a.x.name.localeCompare(b.x.name));
  const TIER = { 0: 'Library pick', 1: 'U.S. government', 2: 'Public domain / CC0', 3: 'CC BY or BY-SA 4.0' };
  const cards = rows.map(({ x, c }) => `<figure class="cv${c ? '' : ' none'}" data-flag="${!c ? 'missing' : c.review ? 'check' : c.tier === 3 ? 'credit' : 'ok'}">${c ? `<a href="${esc(c.filePage || '#')}"><img loading="lazy" src="${esc(c.url)}" alt=""></a>` : '<div class="ph">No cover yet</div>'}<figcaption><a href="/sites/${x.slug}/"><strong>${esc(x.name)}</strong></a><br>${c ? `${esc(TIER[c.tier] || '')} · ${esc(c.license || '')}${c.review ? ' · <b>check</b>' : ''}<br><span class="muted">${esc((c.credit || '').slice(0, 60))}</span>` : ''}<br><code>${x.slug}</code></figcaption></figure>`).join('');
  const counts = rows.reduce((m, r) => { const k = !r.c ? 'missing' : r.c.review ? 'check' : 'ok'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const body = `<div class="wrap prose" style="max-width:1400px"><h1>Cover images</h1>
  <p>Every site\u2019s cover, picked automatically under the Library\u2019s image-rights standard. <strong>Check</strong> marks picks from a Commons category, which are the least certain; they are listed first, after sites with no cover. To replace a cover, add it to <code>data/editorial/_cover-overrides.json</code> under <code>sites</code>; to drop one, add the slug to <code>reject</code>.</p>
  <p>${counts.missing || 0} without a cover · ${counts.check || 0} to check · ${counts.ok || 0} from agency photos or Wikidata</p>
  <p><label><input type="checkbox" id="onlycheck"> Show only covers to check and sites without one</label></p>
  <div class="cvgrid">${cards}</div></div>
  <style>.cvgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.cv{margin:0;font:12px/1.35 var(--ui)}.cv img,.cv .ph{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:4px;background:var(--sand-l)}.cv .ph{display:flex;align-items:center;justify-content:center;color:#888}.cv[data-flag=check] img{outline:3px solid var(--sun-orange)}.cv code{font-size:10px;color:#777}body.only .cv[data-flag=ok],body.only .cv[data-flag=credit]{display:none}</style>
  <script>document.getElementById('onlycheck').onchange=(e)=>document.body.classList.toggle('only',e.target.checked)</script>`;
  await writeText(join(DIST, 'covers', 'index.html'), layout({ title: 'Cover images | Public Lands Directory', description: 'Review sheet for cover images.', path: '/covers/', body, head: '<meta name="robots" content="noindex">' }));
}

// ---------- about + api docs ----------
const about = `<div class="wrap prose">
<h1>About the data</h1>
<p>This directory brings together every unit managed by the four federal land agencies into one guide. Facts, boundaries and photos come straight from the agencies and refresh every night. Alerts refresh every hour. Guide text and designation histories are written and checked by the Theodore Roosevelt Presidential Library.</p>
<h2>Where each piece comes from</h2>
<table><thead><tr><th>Data</th><th>Source</th><th>Refreshed</th></tr></thead><tbody>
<tr><td>National Park System units, descriptions, photos, hours, fees, visitor centers, campgrounds, things to do</td><td><a href="https://www.nps.gov/subjects/developer/">NPS Data API</a></td><td>Nightly</td></tr>
<tr><td>National Park boundaries</td><td>NPS Land Resources Division</td><td>Nightly</td></tr>
<tr><td>National wildlife refuges and wetland management districts</td><td>U.S. Fish and Wildlife Service approved acquisition boundaries</td><td>Nightly</td></tr>
<tr><td>National forests, grasslands, Forest Service monuments, recreation and scenic areas</td><td>USDA Forest Service Enterprise Data Warehouse</td><td>Nightly</td></tr>
<tr><td>BLM national monuments and conservation areas</td><td>Bureau of Land Management National Conservation Lands</td><td>Nightly</td></tr>
<tr><td>Designated wilderness areas and their boundaries</td><td><a href="https://wilderness.net">Wilderness Connect (wilderness.net)</a>, University of Montana</td><td>Nightly</td></tr>
<tr><td>Annual recreation visits (National Park System)</td><td><a href="https://irma.nps.gov/Stats/">NPS Visitor Use Statistics</a></td><td>Weekly</td></tr>
<tr><td>Reservation pages for camping, tours and permits</td><td><a href="https://www.recreation.gov">Recreation.gov</a></td><td>Weekly</td></tr>
<tr><td>Park alerts and closures</td><td>NPS Data API</td><td>Hourly</td></tr>
<tr><td>Weather watches, warnings and advisories</td><td><a href="https://www.weather.gov/documentation/services-web-api">National Weather Service</a></td><td>Hourly</td></tr>
<tr><td>Active wildfire perimeters</td><td><a href="https://data-nifc.opendata.arcgis.com/">National Interagency Fire Center (WFIGS)</a></td><td>Hourly</td></tr>
<tr><td>State lines</td><td>U.S. Census Bureau TIGERweb</td><td>As needed</td></tr>
<tr><td>Cover photos</td><td>Agency photos; Wikidata and Wikimedia Commons, license-checked</td><td>Weekly</td></tr>
<tr><td>Designation history, guide text, Roosevelt connections</td><td>Theodore Roosevelt Presidential Library, reviewed by its historians</td><td>As written</td></tr>
</tbody></table>
<h2>How designation history works</h2>
<p>Each site\u2019s history lists every change in its status: the date, the designation, the legal authority (an act of Congress, a presidential proclamation, an executive order or a secretarial order) and the administration in office. For acts of Congress, the entry names the President who signed the law. Each history appears here once the Library’s historians have checked it against primary sources.</p>
<h2>Boundaries and acreage</h2>
<p>Boundaries are simplified to about 200 meters so pages load quickly. They are for trip planning, not navigation or legal use; follow each source link for official full-resolution data. Refuge acreage reflects the approved acquisition boundary, which can be larger than the land the Fish and Wildlife Service actually manages. Acreage marked \u201cestimate\u201d is computed from the simplified boundary.</p>
<h2>Places managed by more than one agency</h2>
<p>When agencies share a place, such as a national monument split between the Forest Service and BLM, it appears once and lists every managing agency.</p>
<h2>Photos</h2>
<p>Every photo is free to use, chosen in this order: the managing agency\u2019s own photos (U.S. government works in the public domain), then public domain or CC0 images from Wikimedia Commons, then images under CC BY 4.0 or CC BY-SA 4.0, which carry the photographer\u2019s name and a link to the license. Images under older or more restrictive licenses (CC 3.0 and earlier, NonCommercial, NoDerivatives) are never used. Agency photos credited to outside photographers are left out. If you reuse a photo, keep its credit line.</p>
</div>`;
await writeText(join(DIST, 'about', 'index.html'), layout({ title: 'About the data | Public Lands Directory', description: 'Sources, refresh schedule and methods for the Public Lands Directory.', path: '/about/', body: about }));

const api = `<div class="wrap prose"><h1>Open data</h1>
<p>Everything in this directory is free to use. Government data is in the public domain; Library-written guide text is shared under CC BY 4.0 with credit to the Theodore Roosevelt Presidential Library.</p>
<table><tbody>
<tr><td><a href="/api/index.json">/api/index.json</a></td><td>Compact list of every site for search and maps</td></tr>
<tr><td><a href="/api/directory.json">/api/directory.json</a></td><td>Every field for every site</td></tr>
<tr><td><code>/api/sites/{slug}.json</code></td><td>One site, including its current alerts. Example: <a href="/api/sites/theodore-roosevelt-national-park.json">Theodore Roosevelt National Park</a></td></tr>
<tr><td><a href="/api/alerts.json">/api/alerts.json</a></td><td>Current alerts for every site (hourly)</td></tr>
<tr><td><code>/boundaries/{slug}.geojson</code> and <code>.kml</code></td><td>Simplified boundary for one site</td></tr>
<tr><td><code>/wilderness/{slug}.geojson</code></td><td>Designated wilderness inside one site (only where the site has wilderness)</td></tr>
<tr><td><a href="/api/directory.csv">/api/directory.csv</a></td><td>Spreadsheet of key facts</td></tr>
</tbody></table></div>`;
await writeText(join(DIST, 'api', 'index.html'), layout({ title: 'Open data | Public Lands Directory', description: 'JSON, CSV and GeoJSON downloads for the Public Lands Directory.', path: '/api/', body: api }));

await writeText(join(DIST, '404.html'), layout({ title: 'Not found | Public Lands Directory', description: 'Page not found', path: '/404.html', body: '<div class="wrap prose"><h1>Trail ends here</h1><p>That page does not exist. <a href="/">Back to the directory</a>.</p></div>' }));
await writeText(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await writeText(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/roosevelt/', '/about/', '/api/', '/embed/', ...sites.map((s) => `/sites/${s.slug}/`)].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
await writeText(join(DIST, 'llms.txt'), `# Public Lands Directory\n\n> A guide to ${sites.length} U.S. federal public lands (national parks, forests, grasslands, wildlife refuges, monuments and more) from the Theodore Roosevelt Presidential Library. Facts sync nightly from NPS, USFWS, USFS and BLM; alerts hourly from NPS, NWS and NIFC.\n\n- [All sites as JSON](${SITE}/api/directory.json)\n- [Current alerts](${SITE}/api/alerts.json)\n- [About the data](${SITE}/about/)\n`);

console.log(`Built ${sites.length} site pages into dist/`);
