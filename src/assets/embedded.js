/*! Embedded mode for the Public Lands Directory.
 * A page is embedded when its window is named "pld-embed:<frame id>" (set by <public-lands-directory>) or the URL has
 * ?embed=1. The name survives navigation inside the frame, so every page reached from the search stays embedded.
 * Embedded pages drop the masthead, home banner and footer, open other sites in a new tab, report their height
 * and current page to the host, and show a way back to the search on site pages. */
(function () {
  var m = /^pld-embed:(\w+)/.exec(window.name || '');
  var q = new URLSearchParams(location.search);
  if (!m && q.get('embed') !== '1') return;
  var frame = m ? m[1] : (q.get('frame') || '');
  if (!m) window.name = 'pld-embed:' + (frame || 'x');
  document.documentElement.classList.add('embedded');
  var post = function (msg) { if (window.parent !== window) { msg.frame = frame; window.parent.postMessage(msg, '*'); } };
  var nav = function () {
    var u = new URL(location.href); u.searchParams.delete('embed'); u.searchParams.delete('frame');
    post({ type: 'pld:nav', path: u.pathname + u.search + u.hash, title: document.title.replace(/ \| Public Lands Directory$/, '') });
  };
  // Filter changes on the search page use replaceState; report those too.
  ['pushState', 'replaceState'].forEach(function (k) { var o = history[k]; history[k] = function () { var r = o.apply(this, arguments); nav(); return r; }; });
  // Height is measured from the body (the content), not the document, which never shrinks below the frame.
  document.addEventListener('DOMContentLoaded', function () {
    // Remember the last search so "All public lands" returns to it.
    if (location.pathname === '/' || location.pathname === '/index.html') { try { sessionStorage.setItem('pld-last-search', location.search); } catch (e) {} }
    else {
      var last = ''; try { last = sessionStorage.getItem('pld-last-search') || ''; } catch (e) {}
      var bar = document.createElement('nav'); bar.className = 'embed-back';
      bar.innerHTML = '<a href="/' + last.replace(/"/g, '') + '">← All public lands</a>';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    // Links to other sites open in a new tab instead of inside the frame.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin || /^\/(api|embed)\//.test(u.pathname) || a.hasAttribute('download')) { a.target = '_blank'; a.rel = 'noopener'; }
    }, true);
    nav();
    var lastH = 0, send = function () { var cs = getComputedStyle(document.body); var h = Math.ceil(document.body.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)); if (h !== lastH) { lastH = h; post({ type: 'pld:height', height: h }); } };
    if (window.ResizeObserver) new ResizeObserver(send).observe(document.body); else setInterval(send, 500);
    window.addEventListener('load', send); send();
  });
})();
