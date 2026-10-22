/* Data loading, hash router and DOM helpers. Plain JS, no build step (CONTEXT D-06, D-07).
   Nodes are always built with createElement and textContent: no HTML-string injection anywhere in web/. */
(function () {
  'use strict';

  var TITLE_SUFFIX = ' - Phase ordering';
  var DEFAULT_ROUTE = 'overview';
  var views = {};
  var dataPromise = null;
  var renderToken = 0;

  /* ---- DOM helper: App.h(tag, props, ...children) ---- */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var val = props[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'class') el.className = val;
        else if (key === 'text') el.textContent = val;
        else if (key === 'style') el.style.cssText = val;
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') el.addEventListener(key.slice(2), val);
        else el.setAttribute(key, val === true ? '' : String(val));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }

  /* ---- number formats: one place, so every view prints figures the same way ---- */
  var nfCache = {};
  function nf(key, opts) { return nfCache[key] || (nfCache[key] = new Intl.NumberFormat('en', opts)); }
  var fmt = {
    pct: function (x, digits) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      var d = digits === undefined ? 1 : digits;
      return nf('pct' + d, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    },
    int: function (x) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      return nf('int', { maximumFractionDigits: 0 }).format(x);
    }
  };

  /* ---- data ---- */
  function loadData() {
    if (window.DATA) return Promise.resolve(window.DATA);
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return fetch('data.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) window.DATA = d; return d; })
        .catch(function () { return null; });
    }
    return Promise.resolve(null);
  }
  function data() {
    if (!dataPromise) dataPromise = loadData();
    return dataPromise;
  }

  function errorBlock(title, detail) {
    var built = window.DATA && window.DATA.built ? window.DATA.built : 'unknown';
    return h('div', null,
      h('h1', null, title),
      h('div', { 'data-state': 'error', role: 'alert' },
        h('p', null,
          detail || "Couldn't load the results data. Reload the page. If it keeps failing, rebuild it with ",
          detail ? null : h('code', null, 'python scripts/export_web.py'),
          detail ? null : '. Last built: ' + built + '.'),
        h('button', { type: 'button', onclick: function () { dataPromise = null; location.reload(); } }, 'Reload data')));
  }

  /* ---- router: #/name or #/name/arg ---- */
  function parseHash() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || DEFAULT_ROUTE, arg: parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null };
  }

  function render() {
    var route = parseHash();
    var main = document.getElementById('main');
    var view = views[route.name];
    if (!view) {
      if (route.name === DEFAULT_ROUTE) { main.replaceChildren(errorBlock('Overview', 'The overview view did not load.')); return; }
      history.replaceState(null, '', '#/' + DEFAULT_ROUTE);
      route = { name: DEFAULT_ROUTE, arg: null };
      view = views[DEFAULT_ROUTE];
      if (!view) { main.replaceChildren(errorBlock('Overview', 'The overview view did not load.')); return; }
    }
    var token = ++renderToken;
    data().then(function (d) {
      if (token !== renderToken) return;
      document.title = view.title + TITLE_SUFFIX;
      var node;
      if (!d) node = errorBlock(view.title);
      else {
        try { node = view.render(d, route.arg); }
        catch (err) { node = errorBlock(view.title, 'This view failed to draw: ' + err.message); }
      }
      main.replaceChildren(node);
      var heading = main.querySelector('h1');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    });
  }

  function register(name, view) { views[name] = view; }

  window.App = { data: data, h: h, register: register, fmt: fmt, render: render };

  window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
