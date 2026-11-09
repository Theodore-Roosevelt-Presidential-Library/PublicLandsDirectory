/*! Public Lands Directory embed — Theodore Roosevelt Presidential Library
 * <script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
 * <public-lands-card site="theodore-roosevelt-national-park" view="card"></public-lands-card>
 * views: card (default) | alerts | history | map | compact
 * options: theme="light|dark", photo="false", width via CSS
 */
(function () {
  if (customElements.get('public-lands-card')) return;
  const me = document.currentScript;
  const BASE = (me && me.src ? new URL(me.src).origin : 'https://directory.labs.trlibrary.com');
  const cache = {};
  const get = (slug) => (cache[slug] ||= fetch(`${BASE}/api/sites/${encodeURIComponent(slug)}.json`).then((r) => { if (!r.ok) throw new Error('not found'); return r.json(); }));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
  const AUTH = { 'act-of-congress': 'Act of Congress', 'presidential-proclamation': 'Proclamation', 'executive-order': 'Executive order', 'secretarial-order': 'Secretarial order' };

  const CSS = `:host{display:block;max-width:440px;font:15px/1.45 "Frutiger Next","Segoe UI",Arial,sans-serif;color:#25282A}
  .c{border:1px solid #e3dfd3;border-radius:8px;overflow:hidden;background:#fff}
  :host([theme=dark]) .c{background:#092A4D;color:#fff;border-color:#092A4D} :host([theme=dark]) a{color:#F9D635} :host([theme=dark]) h3{color:#fff}
  .img{aspect-ratio:16/9;background:#1B4532 center/cover no-repeat}
  .b{padding:12px 14px 14px} h3{margin:0 0 2px;font:700 1.45rem/1.05 "Dharma Gothic E",Oswald,Impact,"Arial Narrow",sans-serif;text-transform:uppercase;color:#1B4532}
  .m{font-size:.8rem;color:#6b7075;margin:0 0 8px} :host([theme=dark]) .m{color:#C9D3E0}
  p{margin:.4em 0} a{color:#1B4532;font-weight:600}
  .f{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:.85rem;margin:8px 0}
  .f b{text-transform:uppercase;font-size:.68rem;letter-spacing:.06em;color:#1B4532;padding-top:2px} :host([theme=dark]) .f b{color:#8FC895}
  .al{border-left:4px solid #E7805D;background:#FBF3EE;padding:6px 9px;margin:6px 0;font-size:.85rem;color:#25282A}
  .ok{font-size:.85rem;color:#3c5a46} .pend{font-size:.68rem;background:#fff4d6;color:#7a5a00;padding:1px 5px;border-radius:3px}
  ol{margin:6px 0;padding-left:18px;font-size:.88rem} li{margin-bottom:4px}
  .ft{display:flex;justify-content:space-between;align-items:center;font-size:.72rem;color:#6b7075;margin-top:10px;gap:8px}
  .ft a{font-weight:600;font-size:.8rem} iframe{border:0;width:100%;height:300px;display:block}`;

  class PublicLandsCard extends HTMLElement {
    static get observedAttributes() { return ['site', 'view', 'theme', 'photo']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    async render() {
      const slug = this.getAttribute('site'), view = this.getAttribute('view') || 'card';
      const root = this.shadowRoot;
      if (!slug) { root.innerHTML = '<p>Missing site attribute.</p>'; return; }
      root.innerHTML = `<style>${CSS}</style><div class="c"><div class="b">Loading…</div></div>`;
      let s;
      try { s = await get(slug); } catch { root.innerHTML = `<style>${CSS}</style><div class="c"><div class="b">Site not found.</div></div>`; return; }
      const url = s.url;
      const img = this.getAttribute('photo') !== 'false' && s.images && s.images[0];
      const alerts = (s.alerts || []).slice(0, 4);
      const alertsHTML = alerts.length ? alerts.map((a) => `<div class="al"><strong>${esc(a.source === 'NWS' ? 'Weather' : a.source === 'NIFC' ? 'Wildfire' : a.kind || 'Alert')}:</strong> ${esc(a.title)}</div>`).join('') + ((s.alerts.length > 4) ? `<p><a href="${url}#alerts" target="_blank" rel="noopener">${s.alerts.length - 4} more alerts</a></p>` : '') : '<p class="ok">No current alerts.</p>';
      const est = s.established;
      const estHTML = est ? `<b>${esc(est.designation)} since</b><span>${fmt(est.date)} · ${esc(AUTH[est.authority?.type] || '')}${est.authority?.signedBy ? `, ${esc(est.authority.signedBy)}` : ''}${est.reviewed ? '' : ' <span class="pend">pending review</span>'}</span>` : '';
      const head = `${img && view !== 'compact' && view !== 'map' ? `<div class="img" style="background-image:url('${esc(img.url)}')" role="img" aria-label="${esc(img.alt || s.name)}"></div>` : ''}<div class="b"><h3>${esc(s.name)}</h3><p class="m">${esc(s.categoryLabel)} · ${esc(s.managedBy.map((m) => m.name).join(' & '))} · ${esc(s.stateNames.join(', '))}</p>`;
      const foot = `<div class="ft"><span>Theodore Roosevelt Presidential Library</span><a href="${url}" target="_blank" rel="noopener">Full guide →</a></div></div>`;
      let body = '';
      if (view === 'alerts') body = alertsHTML;
      else if (view === 'history') body = s.designationHistory.length ? `<ol>${s.designationHistory.map((h) => `<li><strong>${fmt(h.date)}</strong>: ${esc(h.name || h.designation)} — ${esc(AUTH[h.authority?.type] || '')}${h.authority?.signedBy ? `, ${esc(h.authority.signedBy)}` : ''}${h.reviewed ? '' : ' <span class="pend">pending review</span>'}</li>`).join('')}</ol>` : '<p>Designation history is being researched.</p>';
      else if (view === 'map') body = `<iframe title="Map of ${esc(s.name)}" loading="lazy" src="${BASE}/embed/map.html?site=${encodeURIComponent(slug)}"></iframe>`;
      else if (view === 'compact') body = `<div class="f">${estHTML}</div>${alerts.length ? `<div class="al">${alerts.length} current alert${alerts.length > 1 ? 's' : ''}</div>` : ''}`;
      else body = `${s.summary ? `<p>${esc(s.summary.length > 260 ? s.summary.slice(0, 257).replace(/\s+\S*$/, '') + '…' : s.summary)}</p>` : ''}<div class="f">${estHTML}${s.acres ? `<b>Size</b><span>${Math.round(s.acres.value).toLocaleString('en-US')} acres</span>` : ''}</div>${alertsHTML}`;
      root.innerHTML = `<style>${CSS}</style><div class="c" part="card">${head}${body}${foot}</div>`;
    }
  }
  customElements.define('public-lands-card', PublicLandsCard);
})();
