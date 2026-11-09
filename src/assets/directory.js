// Directory home: search, filters, list and map views. URL keeps filter state so searches can be shared.
(async function () {
  const $ = (id) => document.getElementById(id);
  const data = await (await fetch('/api/index.json')).json();
  const sites = data.sites;
  const CAT = data.categories;
  const STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',AS:'American Samoa',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',VI:'U.S. Virgin Islands' };

  const stateSet = [...new Set(sites.flatMap((s) => s.st))].sort((a, b) => (STATES[a] || a).localeCompare(STATES[b] || b));
  $('state').insertAdjacentHTML('beforeend', stateSet.map((s) => `<option value="${s}">${STATES[s] || s}</option>`).join(''));
  const admins = [...new Set(sites.flatMap((s) => s.p))];
  $('admin').insertAdjacentHTML('beforeend', admins.sort().map((a) => `<option>${a}</option>`).join(''));
  if (!admins.length) $('admin').closest('label').hidden = true;

  const params = new URLSearchParams(location.search);
  for (const k of ['q', 'cat', 'agency', 'state', 'admin', 'tr']) if (params.get(k)) $(k).value = params.get(k);
  if (params.get('alerts')) $('alerts').checked = true;

  const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  sites.forEach((s) => (s._t = norm([s.n, ...s.st.map((x) => STATES[x] || x), ...s.act, CAT[s.c]].join(' '))));

  let shown = 0, filtered = [], view = params.get('view') || 'list', map, layer;
  const PAGE = 48;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function apply() {
    const tr = $('tr').value, q = norm($('q').value.trim()), c = $('cat').value, a = $('agency').value, st = $('state').value, ad = $('admin').value, al = $('alerts').checked;
    const terms = q.split(/\s+/).filter(Boolean);
    filtered = sites.filter((s) => (!c || s.c === c) && (!a || s.a.includes(a)) && (!st || s.st.includes(st)) && (!ad || s.p.includes(ad)) && (!al || s.al) && (!tr || (tr === 'any' ? s.tr.length : s.tr.includes(tr))) && terms.every((t) => s._t.includes(t)));
    const p = new URLSearchParams();
    for (const k of ['q', 'cat', 'agency', 'state', 'admin', 'tr']) if ($(k).value) p.set(k, $(k).value);
    if (al) p.set('alerts', '1'); if (view !== 'list') p.set('view', view);
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    $('count').textContent = `${filtered.length.toLocaleString()} place${filtered.length === 1 ? '' : 's'}`;
    $('results').innerHTML = ''; shown = 0; more();
    if (view === 'map') drawMap();
  }
  function card(s) {
    const meta = [CAT[s.c], s.a.join(' / '), s.st.join(', ')].filter(Boolean).join(' · ');
    return `<li><a href="/sites/${s.s}/"><div class="thumb${s.img ? '' : ' none'}"${s.img ? ` style="background-image:url('${esc(s.img)}?width=480')"` : ''}><span class="badge">${esc(s.a[0])}</span>${s.tr.length ? `<span class="badge tr">T.R.</span>` : ''}${s.al ? `<span class="badge alert">${s.al} alert${s.al > 1 ? 's' : ''}</span>` : ''}</div><div class="txt"><h3>${esc(s.n)}</h3><p>${esc(meta)}${s.y ? ` · Since ${s.y}` : ''}</p></div></a></li>`;
  }
  function more() {
    const next = filtered.slice(shown, shown + PAGE);
    $('results').insertAdjacentHTML('beforeend', next.map(card).join(''));
    shown += next.length;
    $('more').hidden = shown >= filtered.length || view === 'map';
  }
  const COLORS = { NPS: '#1B4532', FWS: '#E7805D', USFS: '#87BB41', BLM: '#092A4D' };
  function drawMap() {
    if (!window.L) return setTimeout(drawMap, 100);
    if (!map) {
      map = L.map('map', { preferCanvas: true }).setView([39.5, -98.5], 4);
      L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' }).addTo(map);
    }
    if (layer) layer.remove();
    layer = L.layerGroup(filtered.filter((s) => s.lat != null).map((s) => L.circleMarker([s.lat, s.lon], { radius: 5, weight: 1, color: '#fff', fillColor: COLORS[s.a[0]] || '#555', fillOpacity: .9 }).bindPopup(`<a href="/sites/${s.s}/"><strong>${esc(s.n)}</strong></a><br>${esc(CAT[s.c])} · ${esc(s.a.join(' / '))}`))).addTo(map);
    setTimeout(() => map.invalidateSize(), 50);
  }
  function setView(v) {
    view = v;
    document.querySelectorAll('.toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    $('map').hidden = v !== 'map'; $('results').hidden = v === 'map';
    apply();
  }
  document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  let t; $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 120); });
  ['cat', 'agency', 'state', 'admin', 'tr', 'alerts'].forEach((k) => $(k).addEventListener('change', apply));
  $('more').addEventListener('click', more);
  setView(view);
})();
