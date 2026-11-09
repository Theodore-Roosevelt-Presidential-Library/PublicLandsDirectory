/*! National map: every public-lands boundary in the directory, colored by agency. Zoom, hover, click to open. */
(function () {
  var COLORS = { NPS: '#1B4532', FWS: '#E7805D', USFS: '#87BB41', BLM: '#092A4D' };
  var NAMES = { NPS: 'National Park Service', FWS: 'U.S. Fish and Wildlife Service', USFS: 'USDA Forest Service', BLM: 'Bureau of Land Management' };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var q = new URLSearchParams(location.search);
  var map = L.map('natmap', { preferCanvas: true, worldCopyJump: true, minZoom: 2 }).setView([39.5, -98.5], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var renderer = L.canvas({ padding: 0.5, tolerance: 4 });
  var all = [], layer = L.layerGroup().addTo(map), byName = {};
  var style = function (f) { var c = COLORS[f.properties.a] || '#555'; return f.properties.o ? { renderer: renderer, color: c, weight: 1, opacity: 0.8, dashArray: '4 4', fillColor: c, fillOpacity: 0.04 } : { renderer: renderer, color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.35 }; };
  var popup = function (p) {
    return '<strong>' + esc(p.n) + '</strong><br><span style="color:#555">' + esc(NAMES[p.a] || p.a) + (p.tr ? ' · Roosevelt connection' : '') + '</span><br><a href="/sites/' + esc(p.s) + '/">Open the site page →</a>';
  };
  fetch('/map/boundaries.json').then(function (r) { return r.json(); }).then(function (fc) {
    // Draw big places first so small ones sit on top and stay clickable.
    var area = function (f) { var b = L.geoJSON(f).getBounds(); return (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth()); };
    fc.features.forEach(function (f) { f._area = f.geometry.type === 'Point' ? 0 : area(f); });
    fc.features.sort(function (a, b) { return b._area - a._area; });
    fc.features.forEach(function (f) {
      var p = f.properties, l;
      if (f.geometry.type === 'Point') l = L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { renderer: renderer, radius: 5, weight: 1, color: '#fff', fillColor: COLORS[p.a] || '#555', fillOpacity: 0.95 });
      else l = L.geoJSON(f, { style: style }).getLayers()[0];
      l.bindPopup(popup(p)).bindTooltip(esc(p.n), { sticky: true, direction: 'top' });
      l.on('mouseover', function () { if (l.setStyle) l.setStyle({ weight: 3, fillOpacity: f.properties.o ? 0.12 : 0.55 }); });
      l.on('mouseout', function () { if (l.setStyle) l.setStyle(f.geometry.type === 'Point' ? { weight: 1 } : style(f)); });
      all.push({ p: p, l: l });
      byName[p.n.toLowerCase()] = { p: p, l: l };
    });
    var dl = $('nm-names'); dl.innerHTML = fc.features.map(function (f) { return '<option value="' + esc(f.properties.n) + '">'; }).join('');
    draw();
    var start = q.get('site') && all.find(function (x) { return x.p.s === q.get('site'); });
    if (start) focus(start);
  });
  function draw() {
    var ag = [].slice.call(document.querySelectorAll('.nm-ag input:checked')).map(function (i) { return i.value; });
    var tr = $('nm-tr').checked;
    layer.clearLayers();
    all.forEach(function (x) { if (ag.indexOf(x.p.a) >= 0 && (!tr || x.p.tr)) layer.addLayer(x.l); });
  }
  function focus(x) {
    if (x.l.getBounds) map.fitBounds(x.l.getBounds(), { maxZoom: 10, padding: [30, 30] }); else map.setView(x.l.getLatLng(), 10);
    x.l.openPopup();
  }
  document.querySelectorAll('.nm-ag input').forEach(function (i) { i.addEventListener('change', draw); });
  $('nm-tr').addEventListener('change', draw);
  $('nm-q').addEventListener('change', function () { var x = byName[this.value.trim().toLowerCase()]; if (x) focus(x); });
})();
