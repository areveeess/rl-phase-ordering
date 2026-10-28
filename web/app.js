/* app.js — Router, data loading, DOM helpers, formatters, queries, and UI components.
   Plan 08-03. Plain JS, no build step (CONTEXT D-06, D-07).
   All DOM is built with createElement and textContent; no HTML-string injection.

   Public API (window.App):
   - App.register(name, view)
   - App.navigate(hash)
   - App.data()
   - App.h(tag, props, ...kids)
   - App.s(tag, props, ...kids)
   - App.fmt = { int, pct, signedPct, dec, range, wtl, date }
   - App.q = { programs, program, runs, run, evalRows, median, geomean, reduction, wtlRange, splitNoun, runLabel }
   - App.ui = { titleRow, filterRow, card, grid, table, kv, pill, segmented, tabs, select, button, emptyBox, skeleton, notice, sub }
   - App.setLiveStatus(state)
   - App.announce(text)
   - App.isPhone()
   - App.onLayout(fn)
*/
(function () {
  'use strict';

  var TITLE_SUFFIX = ' - Phase ordering';
  var DEFAULT_ROUTE = 'overview';
  var views = {};
  var bootedViews = {};
  var registeredStyles = {};
  var dataPromise = null;
  var renderToken = 0;

  /* ---- DOM helper: App.h(tag, props, ...children) ---- */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var val = props[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'class' || key === 'className') el.className = val;
        else if (key === 'id') el.id = val;
        else if (key === 'text') el.textContent = val;
        else if (key === 'style') el.style.cssText = val;
        else if (key === 'attrs' && typeof val === 'object') {
          Object.keys(val).forEach(function (ak) {
            if (val[ak] !== null && val[ak] !== undefined && val[ak] !== false) {
              el.setAttribute(ak, val[ak] === true ? '' : String(val[ak]));
            }
          });
        }
        else if (key === 'on' && typeof val === 'object') {
          Object.keys(val).forEach(function (ek) {
            if (typeof val[ek] === 'function') el.addEventListener(ek, val[ek]);
          });
        }
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), val);
        }
        else if (key === 'disabled') {
          if (val) { el.disabled = true; el.setAttribute('disabled', ''); }
        }
        else {
          el.setAttribute(key, val === true ? '' : String(val));
        }
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  /* ---- SVG helper: App.s(tag, props, ...children) ---- */
  function s(tag, props) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var val = props[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'class' || key === 'className') el.setAttribute('class', val);
        else if (key === 'style') el.style.cssText = val;
        else if (key === 'text') el.textContent = val;
        else if (key === 'on' && typeof val === 'object') {
          Object.keys(val).forEach(function (ek) {
            if (typeof val[ek] === 'function') el.addEventListener(ek, val[ek]);
          });
        }
        else {
          el.setAttribute(key, String(val));
        }
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(el, c); });
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  /* ---- Number formatters (App.fmt) ---- */
  var nfCache = {};
  function nf(key, opts) {
    return nfCache[key] || (nfCache[key] = new Intl.NumberFormat('en', opts));
  }

  var fmt = {
    int: function (x) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      return nf('int', { maximumFractionDigits: 0 }).format(x);
    },
    pct: function (x, digits) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      var d = digits === undefined ? 1 : digits;
      return nf('pct' + d, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    },
    signedPct: function (x, digits) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      var d = digits === undefined ? 1 : digits;
      var val = x * 100;
      var formatted = Math.abs(val).toFixed(d) + '%';
      var zeroTarget = (0).toFixed(d) + '%';
      if (formatted === zeroTarget || Math.abs(val) < 1e-9) return zeroTarget;
      if (x < 0) return '\u2212' + formatted; // true minus U+2212
      return '+' + formatted;
    },
    dec: function (x, digits) {
      if (x === null || x === undefined || !isFinite(x)) return '-';
      var d = digits === undefined ? 2 : digits;
      return nf('dec' + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    },
    range: function (lo, hi, f) {
      var l = typeof f === 'function' ? f(lo) : String(lo);
      var h = typeof f === 'function' ? f(hi) : String(hi);
      if (l === h) return l;
      return l + ' to ' + h;
    },
    wtl: function (arr) {
      if (!arr || !arr.length) return '-';
      var w = arr[0] || 0;
      var t = arr[1] || 0;
      var l = arr[2] || 0;
      return w + ' / ' + t + ' / ' + l;
    },
    date: function (iso) {
      if (!iso) return '-';
      return String(iso).slice(0, 10);
    }
  };

  /* ---- Data queries (App.q) ---- */
  var q = {
    programs: function (split) {
      var d = window.DATA;
      if (!d || !d.programs) return [];
      if (!split) return d.programs;
      return d.programs.filter(function (p) { return p.split === split; });
    },
    program: function (name) {
      var d = window.DATA;
      if (!d || !d.programs) return null;
      for (var i = 0; i < d.programs.length; i++) {
        if (d.programs[i].name === name) return d.programs[i];
      }
      return null;
    },
    runs: function (group) {
      var d = window.DATA;
      if (!d || !d.runs) return [];
      if (!group) return d.runs;
      return d.runs.filter(function (r) { return r.group === group; });
    },
    run: function (id) {
      var d = window.DATA;
      if (!d || !d.runs) return null;
      for (var i = 0; i < d.runs.length; i++) {
        if (d.runs[i].id === id) return d.runs[i];
      }
      return null;
    },
    evalRows: function (filter) {
      var d = window.DATA;
      if (!d || !d.eval) return [];
      if (!filter) return d.eval;
      return d.eval.filter(function (row) {
        if (filter.run && row.run !== filter.run) return false;
        if (filter.group && row.group !== filter.group) return false;
        if (filter.reward && row.reward !== filter.reward) return false;
        if (filter.split && row.split !== filter.split) return false;
        if (filter.benchmark && row.benchmark !== filter.benchmark) return false;
        return true;
      });
    },
    median: function (xs) {
      if (!xs || !xs.length) return 0;
      var sorted = xs.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) return sorted[mid];
      return (sorted[mid - 1] + sorted[mid]) / 2;
    },
    geomean: function (xs) {
      if (!xs || !xs.length) return 0;
      var sum = 0;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] <= 0) return 0;
        sum += Math.log(xs[i]);
      }
      return Math.exp(sum / xs.length);
    },
    reduction: function (finals, o0s) {
      if (!finals || !o0s || !finals.length || finals.length !== o0s.length) return 0;
      var ratios = [];
      for (var i = 0; i < finals.length; i++) {
        var f = finals[i];
        var o = o0s[i];
        if (f === null || f === undefined) ratios.push(1.0);
        else ratios.push(f / o);
      }
      return 1 - q.geomean(ratios);
    },
    wtlRange: function (split, refKey, group) {
      var grp = group || 'main';
      var d = window.DATA;
      if (!d || !d.wtl) return { lo: 0, hi: 0, n: 0, loLoss: 0, hiLoss: 0 };
      var matching = d.wtl.filter(function (w) {
        return w.split === split && (grp ? w.group === grp : true);
      });
      if (!matching.length) return { lo: 0, hi: 0, n: 0, loLoss: 0, hiLoss: 0 };
      var wins = [];
      var losses = [];
      var n = 0;
      matching.forEach(function (row) {
        var triple = row[refKey];
        if (triple && triple.length === 3) {
          wins.push(triple[0]);
          losses.push(triple[2]);
          n = triple[0] + triple[1] + triple[2];
        }
      });
      if (!wins.length) return { lo: 0, hi: 0, n: 0, loLoss: 0, hiLoss: 0 };
      var minW = Math.min.apply(null, wins);
      var maxW = Math.max.apply(null, wins);
      var minL = Math.min.apply(null, losses);
      var maxL = Math.max.apply(null, losses);
      return { lo: minW, hi: maxW, n: n, loLoss: minL, hiLoss: maxL };
    },
    splitNoun: function (split) {
      if (split === 'test') return 'held-out';
      if (split === 'val') return 'validation';
      if (split === 'train') return 'training';
      return split || '';
    },
    runLabel: function (run) {
      if (!run) return '';
      var obj = typeof run === 'string' ? q.run(run) : run;
      if (!obj) return String(run);
      if (obj.group === 'long') {
        return 'RL ' + obj.reward + ', ' + obj.episodes + ' episodes';
      }
      return 'RL ' + obj.reward + ', seed ' + obj.seed;
    }
  };

  /* ---- UI Components (App.ui) ---- */
  var ui = {
    titleRow: function (opts) {
      var left = [h('h1', { tabindex: -1 }, opts.h1 || '')];
      if (opts.finding) left.push(h('p', { class: 'finding' }, opts.finding));
      var kids = [h('div', { class: 'title-heading-block' }, left)];
      if (opts.actions) kids.push(h('div', { class: 'title-actions' }, opts.actions));
      return h('div', { class: 'title-row' }, kids);
    },

    filterRow: function () {
      var kids = Array.prototype.slice.call(arguments);
      return h('div', { class: 'filter-row' }, kids);
    },

    card: function (opts) {
      opts = opts || {};
      var headerKids = [];
      if (opts.title) {
        var titleBlock = [h('h2', { class: 'card-title' }, opts.title)];
        if (opts.sub) titleBlock.push(h('div', { class: 'card-sub' }, opts.sub));
        headerKids.push(h('div', null, titleBlock));
      }
      if (opts.headerExtra) headerKids.push(opts.headerExtra);

      var cardKids = [];
      if (headerKids.length) {
        cardKids.push(h('header', { class: 'card-header' }, headerKids));
      }
      if (opts.body) {
        if (Array.isArray(opts.body)) cardKids = cardKids.concat(opts.body);
        else cardKids.push(opts.body);
      }

      var cls = 'panel card' + (opts.span ? ' span-' + opts.span : '') + (opts.class ? ' ' + opts.class : '');
      return h('div', { class: cls }, cardKids);
    },

    grid: function () {
      var kids = Array.prototype.slice.call(arguments);
      return h('div', { class: 'grid' }, kids);
    },

    table: function (opts) {
      opts = opts || {};
      var cols = opts.columns || [];
      var rows = opts.rows || [];

      var ths = cols.map(function (col) {
        var kids = [];
        if (col.swatch) kids.push(col.swatch);
        kids.push(col.label);
        var cls = col.numeric ? 'num-col n' : '';
        return h('th', { scope: 'col', class: cls }, kids);
      });

      var trs = rows.map(function (row) {
        var isSelected = typeof opts.selected === 'function' ? opts.selected(row) : false;
        var tds = cols.map(function (col) {
          var val = row[col.key];
          var cls = col.numeric ? 'num-col n' : '';
          return h('td', { class: cls }, val !== undefined ? val : '-');
        });
        var trProps = isSelected ? { 'aria-selected': 'true' } : null;
        return h('tr', trProps, tds);
      });

      var tblKids = [];
      if (opts.caption) {
        tblKids.push(h('caption', { class: 'table-caption' }, opts.caption));
      }
      tblKids.push(h('thead', null, h('tr', null, ths)));
      tblKids.push(h('tbody', null, trs));

      var tbl = h('table', null, tblKids);
      return h('div', { class: 'table-frame' }, tbl);
    },

    kv: function (rows) {
      var items = (rows || []).map(function (pair) {
        return h('div', { class: 'kv-row' },
          h('dt', { class: 'kv-label' }, pair[0]),
          h('dd', { class: 'kv-value' }, pair[1])
        );
      });
      return h('dl', { class: 'kv-list' }, items);
    },

    pill: function (kind, text) {
      var k = kind || 'neutral';
      var extra = '';
      if (k === 'positive') extra = ' pill-positive pos';
      else if (k === 'negative') extra = ' pill-negative neg';
      else if (k === 'notice') extra = ' pill-notice warn';
      else extra = ' pill-neutral';
      return h('span', { class: 'pill' + extra }, text);
    },

    segmented: function (opts) {
      opts = opts || {};
      var options = opts.options || [];
      var currentVal = opts.value;
      var buttons = [];

      options.forEach(function (opt, idx) {
        var val = typeof opt === 'object' ? opt.value : opt;
        var lbl = typeof opt === 'object' ? opt.label : opt;
        var isCurrent = val === currentVal;

        var btn = h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': isCurrent ? 'true' : 'false',
          'aria-pressed': isCurrent ? 'true' : 'false',
          tabindex: isCurrent ? 0 : -1,
          on: {
            click: function () {
              if (val !== currentVal && typeof opts.onChange === 'function') {
                opts.onChange(val);
              }
            }
          }
        }, lbl);
        buttons.push(btn);
      });

      var container = h('div', {
        class: 'segmented',
        role: 'radiogroup',
        'aria-label': opts.label || 'Segmented control',
        on: {
          keydown: function (e) {
            var idx = -1;
            for (var i = 0; i < buttons.length; i++) {
              if (buttons[i] === document.activeElement) { idx = i; break; }
            }
            if (idx === -1) return;

            var next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              next = (idx + 1) % buttons.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              next = (idx - 1 + buttons.length) % buttons.length;
            } else if (e.key === 'Home') {
              next = 0;
            } else if (e.key === 'End') {
              next = buttons.length - 1;
            }

            if (next !== -1) {
              e.preventDefault();
              buttons[next].focus();
              buttons[next].click();
            }
          }
        }
      }, buttons);

      if (opts.label) {
        return h('div', { class: 'segmented-wrap' },
          h('span', { class: 'segmented-label' }, opts.label),
          container);
      }
      return container;
    },

    tabs: function (opts) {
      opts = opts || {};
      var options = opts.options || [];
      var currentVal = opts.value;
      var buttons = [];

      options.forEach(function (opt) {
        var val = typeof opt === 'object' ? opt.value : opt;
        var lbl = typeof opt === 'object' ? opt.label : opt;
        var isCurrent = val === currentVal;

        var btn = h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': isCurrent ? 'true' : 'false',
          tabindex: isCurrent ? 0 : -1,
          on: {
            click: function () {
              if (val !== currentVal && typeof opts.onChange === 'function') {
                opts.onChange(val);
              }
            }
          }
        }, lbl);
        buttons.push(btn);
      });

      var container = h('div', {
        class: 'tabs',
        role: 'tablist',
        'aria-label': opts.label || 'Tabs',
        on: {
          keydown: function (e) {
            var idx = -1;
            for (var i = 0; i < buttons.length; i++) {
              if (buttons[i] === document.activeElement) { idx = i; break; }
            }
            if (idx === -1) return;

            var next = -1;
            if (e.key === 'ArrowRight') next = (idx + 1) % buttons.length;
            else if (e.key === 'ArrowLeft') next = (idx - 1 + buttons.length) % buttons.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = buttons.length - 1;

            if (next !== -1) {
              e.preventDefault();
              buttons[next].focus();
              buttons[next].click();
            }
          }
        }
      }, buttons);

      if (opts.label) {
        return h('div', { class: 'tabs-wrap' },
          h('span', { class: 'tabs-label' }, opts.label),
          container);
      }
      return container;
    },

    select: function (opts) {
      opts = opts || {};
      var selProps = {
        class: 'input',
        on: {
          change: function (e) {
            if (typeof opts.onChange === 'function') {
              opts.onChange(e.target.value);
            }
          }
        }
      };
      if (opts.disabled) selProps.disabled = true;

      var sel = h('select', selProps);
      if (opts.groups) {
        opts.groups.forEach(function (g) {
          var og = h('optgroup', { label: g.label });
          (g.options || []).forEach(function (o) {
            var val = typeof o === 'object' ? o.value : o;
            var lbl = typeof o === 'object' ? o.label : o;
            var optEl = h('option', { value: val }, lbl);
            if (val === opts.value) optEl.selected = true;
            og.appendChild(optEl);
          });
          sel.appendChild(og);
        });
      } else if (opts.options) {
        opts.options.forEach(function (o) {
          var val = typeof o === 'object' ? o.value : o;
          var lbl = typeof o === 'object' ? o.label : o;
          var optEl = h('option', { value: val }, lbl);
          if (val === opts.value) optEl.selected = true;
          sel.appendChild(optEl);
        });
      }

      var wrapKids = [];
      if (opts.label) wrapKids.push(h('label', null, opts.label));
      wrapKids.push(sel);
      return h('div', { class: 'select-wrap' }, wrapKids);
    },

    button: function (opts) {
      opts = opts || {};
      var kind = opts.kind || opts.variant || 'secondary';
      var cls = 'btn btn-' + kind;
      var label = opts.label || opts.text || '';
      if (opts.href) {
        var aProps = { class: cls, href: opts.href, role: 'button' };
        if (opts.disabled) aProps['aria-disabled'] = 'true';
        return h('a', aProps, label);
      }
      var btnProps = {
        type: 'button',
        class: cls,
        disabled: Boolean(opts.disabled)
      };
      if (typeof opts.onClick === 'function') {
        btnProps.on = { click: opts.onClick };
      }
      return h('button', btnProps, label);
    },

    emptyBox: function (text) {
      return h('div', { class: 'empty-box empty' }, text);
    },

    skeleton: function (widthPx) {
      var w = widthPx || 120;
      return h('div', { class: 'skel skeleton', style: 'width:' + w + 'px;height:16px;' });
    },

    notice: function (opts) {
      if (typeof opts === 'string') opts = { text: opts };
      opts = opts || {};
      var kids = [h('span', null, opts.text || '')];
      if (opts.action) kids.push(opts.action);
      return h('div', { class: 'notice' }, kids);
    },

    sub: function (text) {
      return h('div', { class: 'sub sub-text' }, text);
    }
  };

  /* ---- Data loading ---- */
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

  /* ---- Error state element ---- */
  function errorBlock(title, detail) {
    var built = window.DATA && window.DATA.built ? window.DATA.built : 'unknown';
    return h('div', null,
      h('h1', null, title),
      h('div', { 'data-state': 'error', role: 'alert' },
        h('p', null,
          detail || "Couldn't load the results data. Reload the page. If it keeps failing, rebuild it with ",
          detail ? null : h('code', null, 'python scripts/export_web.py'),
          detail ? null : '. Last built: ' + built + '.'),
        h('button', {
          type: 'button',
          class: 'btn btn-secondary',
          on: { click: function () { dataPromise = null; location.reload(); } }
        }, 'Reload data')));
  }

  /* ---- Loading skeleton placeholder ---- */
  function loadingBlock(title) {
    return h('div', null,
      h('h1', null, title || 'Loading...'),
      h('div', { class: 'card panel span-12' },
        ui.skeleton(240),
        h('div', { style: 'margin-top:16px;' }, ui.skeleton(480)),
        h('div', { style: 'margin-top:8px;' }, ui.skeleton(360))
      ));
  }

  /* ---- Router: #/name or #/name/arg ---- */
  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean);
    var name = parts[0] || DEFAULT_ROUTE;
    var arg = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null;
    return { name: name, arg: arg };
  }

  function updateNav(activeRoute) {
    var links = document.querySelectorAll('.nav-link');
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var routeName = href.replace(/^#\/?/, '').split('/')[0];
      if (routeName === activeRoute) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  function updateScope(d) {
    var count = d && d.programs ? d.programs.length : 20;
    var text = 'cBench-v1 · ' + count + ' programs';
    var el1 = document.getElementById('sidebar-scope');
    if (el1) el1.textContent = text;
    var el2 = document.getElementById('sheet-scope');
    if (el2) el2.textContent = text;
  }

  function render() {
    var route = parseHash();
    var main = document.getElementById('main');
    if (!main) return;

    updateNav(route.name);

    var view = views[route.name];
    if (!view) {
      if (route.name === DEFAULT_ROUTE) {
        main.replaceChildren(errorBlock('Overview', 'The overview view did not load.'));
        return;
      }
      history.replaceState(null, '', '#/' + DEFAULT_ROUTE);
      route = { name: DEFAULT_ROUTE, arg: null };
      updateNav(DEFAULT_ROUTE);
      view = views[DEFAULT_ROUTE];
      if (!view) {
        main.replaceChildren(errorBlock('Overview', 'The overview view did not load.'));
        return;
      }
    }

    var token = ++renderToken;

    // Show loading skeleton if data not ready yet
    if (!window.DATA) {
      main.replaceChildren(loadingBlock(view.title));
    }

    data().then(function (d) {
      if (token !== renderToken) return;
      document.title = view.title + TITLE_SUFFIX;

      if (!d) {
        main.replaceChildren(errorBlock(view.title));
        return;
      }

      updateScope(d);

      // Boot views once
      Object.keys(views).forEach(function (vName) {
        var v = views[vName];
        if (v && typeof v.boot === 'function' && !bootedViews[vName]) {
          bootedViews[vName] = true;
          try { v.boot(); } catch (e) { /* ignore */ }
        }
      });

      var ctx = { arg: route.arg, data: d };

      // Optional enter hook
      if (typeof view.enter === 'function') {
        try { view.enter(ctx); } catch (e) { /* ignore */ }
      }

      var node;
      try {
        node = view.render(d, route.arg);
      } catch (err) {
        node = errorBlock(view.title, 'This view failed to draw: ' + err.message);
      }

      if (node instanceof Node) {
        main.replaceChildren(node);
      }

      focusHeading(main, token);
      window.scrollTo(0, 0);
    });
  }

  // Move focus to the view's h1. Some views add their h1 after an async step, so retry for a
  // short while (about 2 s) as long as this render is still the current one.
  // Move focus to the view's h1 on every route change. Some views add or rebuild their h1 after
  // an async step (Live replaces it when its server probe resolves, which can take seconds), so
  // keep watching the view: whenever it changes and focus has been lost (it sits on body or on
  // a node that left the page), focus the current h1 again. The watch ends at the next route
  // change, at the user's first click or key press, or after 10 s, so focus the user moved is
  // never taken away.
  var headingWatch = null;
  function focusHeading(main, token) {
    if (headingWatch) headingWatch();
    function focusNow() {
      if (token !== renderToken) return stop();
      var heading = main.querySelector('h1');
      var active = document.activeElement;
      var lost = !active || active === document.body || active === main || !document.contains(active);
      if (heading && (lost || active === heading)) {
        heading.setAttribute('tabindex', '-1');
        if (active !== heading) heading.focus({ preventScroll: true });
      }
    }
    var observer = typeof MutationObserver === 'function' ? new MutationObserver(focusNow) : null;
    var timer = setTimeout(stop, 10000);
    function stop() {
      if (observer) observer.disconnect();
      clearTimeout(timer);
      document.removeEventListener('pointerdown', stop, true);
      document.removeEventListener('keydown', stop, true);
      if (headingWatch === stop) headingWatch = null;
    }
    headingWatch = stop;
    if (observer) observer.observe(main, { childList: true, subtree: true });
    document.addEventListener('pointerdown', stop, true);
    document.addEventListener('keydown', stop, true);
    var first = main.querySelector('h1');
    if (first) {
      first.setAttribute('tabindex', '-1');
      first.focus({ preventScroll: true });
    }
  }

  /* ---- Public App methods ---- */
  function register(name, view) {
    if (view && view.styles && !registeredStyles[name]) {
      registeredStyles[name] = true;
      var link = h('link', {
        rel: 'stylesheet',
        href: 'views/' + name + '.css'
      });
      document.head.appendChild(link);
    }
    views[name] = view;

    // If data is already available and view has boot(), call it
    if (window.DATA && view && typeof view.boot === 'function' && !bootedViews[name]) {
      bootedViews[name] = true;
      try { view.boot(); } catch (e) { /* ignore */ }
    }
  }

  function navigate(hash) {
    var h = String(hash);
    if (h.charAt(0) !== '#') h = '#/' + h;
    location.hash = h;
  }

  function setLiveStatus(state) {
    var labels = { checking: 'Checking', offline: 'Offline', ready: 'Ready' };
    var text = labels[state] || 'Offline';
    var isReady = state === 'ready';
    var cls = 'status-pill pill' + (isReady ? ' pill-positive pos' : ' pill-neutral');
    ['sidebar-live-status', 'sheet-live-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.textContent = text;
        el.className = cls;
      }
    });
  }

  function announce(text) {
    var el = document.getElementById('live-region');
    if (el) el.textContent = text;
  }

  function isPhone() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function onLayout(fn) {
    if (window.matchMedia && typeof fn === 'function') {
      window.matchMedia('(max-width: 640px)').addEventListener('change', fn);
    }
  }

  /* ---- Phone Menu / Sheet Interactivity ---- */
  function initPhoneSheet() {
    var menuBtn = document.getElementById('menu-btn');
    var menuLabel = document.getElementById('menu-btn-label');
    var sheet = document.getElementById('phone-sheet');
    var closeBtn = document.getElementById('sheet-close-btn');

    if (!menuBtn || !sheet) return;

    function openSheet() {
      sheet.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
      if (menuLabel) menuLabel.textContent = 'Close';
      if (closeBtn) closeBtn.focus();
    }

    function closeSheet() {
      sheet.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (menuLabel) menuLabel.textContent = 'Menu';
      menuBtn.focus();
    }

    menuBtn.addEventListener('click', function () {
      if (sheet.classList.contains('open')) closeSheet();
      else openSheet();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('open')) {
        closeSheet();
      }
    });

    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        closeSheet();
      });
    });
  }

  /* ---- Set data-fonts on html after fonts are ready ---- */
  function initFonts() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        document.documentElement.setAttribute('data-fonts', 'Archivo, Source Serif 4');
      });
    } else {
      document.documentElement.setAttribute('data-fonts', 'Archivo, Source Serif 4');
    }
  }

  /* ---- Export public namespace ---- */
  window.App = {
    data: data,
    h: h,
    s: s,
    fmt: fmt,
    q: q,
    ui: ui,
    register: register,
    navigate: navigate,
    render: render,
    setLiveStatus: setLiveStatus,
    announce: announce,
    isPhone: isPhone,
    onLayout: onLayout
  };

  /* ---- Init lifecycle ---- */
  window.addEventListener('hashchange', render);

  function start() {
    initPhoneSheet();
    initFonts();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
