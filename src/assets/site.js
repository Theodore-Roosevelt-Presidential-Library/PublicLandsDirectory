// Site page: boundary map + live alert refresh (alerts update hourly even between site rebuilds).
(function () {
  const el = document.getElementById('map');
  function initMap() {
    if (!el) return;
    if (!window.L) return setTimeout(initMap, 100);
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' }).addTo(map);
    const lat = parseFloat(el.dataset.lat), lon = parseFloat(el.dataset.lon);
    if (el.dataset.geojson) {
      fetch(el.dataset.geojson).then((r) => r.json()).then((f) => {
        const g = L.geoJSON(f, { style: { color: '#1B4532', weight: 2, fillColor: '#8FC895', fillOpacity: .3 } }).addTo(map);
        map.fitBounds(g.getBounds(), { padding: [10, 10] });
      });
    } else if (!isNaN(lat)) map.setView([lat, lon], 10);
    if (!isNaN(lat)) L.circleMarker([lat, lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#E7805D', fillOpacity: 1 }).addTo(map);
  }
  initMap();

  const art = document.querySelector('article.site');
  const list = document.querySelector('.alerts-list');
  if (!art || !list) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  fetch('/api/alerts.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => {
    if (!d.generated || d.generated <= (list.dataset.generated || '')) return;
    const a = d.sites[art.dataset.slug] || [];
    list.innerHTML = a.length ? a.map((x) => `<details class="alert alert-${esc((x.source + '-' + (x.severity || x.kind || '')).toLowerCase().replace(/[^a-z]+/g, '-'))}"><summary><span class="alert-src">${esc(x.source === 'NWS' ? 'Weather' : x.source === 'NIFC' ? 'Wildfire' : x.kind || 'Alert')}</span> ${esc(x.title)}</summary>${x.text ? `<div class="alert-body"><p>${esc(x.text)}</p></div>` : ''}${x.url ? `<p class="alert-link"><a href="${esc(x.url)}">Details</a></p>` : ''}</details>`).join('') : '<div class="alerts-empty">No current alerts from the managing agency, the National Weather Service or wildfire reporting.</div>';
  }).catch(() => {});
})();
