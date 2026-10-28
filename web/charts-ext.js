/* charts-ext.js — Chart extensions (marks and method bar list).
   Provides:
     ChartsExt.MARKS            // { O2, O3, Oz, best_fixed, random, dense, sparse, long_dense, long_sparse }
     ChartsExt.legend(keys)     // Element: swatches built from the same style objects as the marks
     ChartsExt.methodBars(el, rows, opts) -> { legend }
*/
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var patternCounter = 0;

  function s(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v !== null && v !== undefined && v !== false) {
          el.setAttribute(k, v === true ? '' : String(v));
        }
      });
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function parseColor(str, fallback) {
    if (!str) return fallback;
    str = str.trim();
    if (str.charAt(0) === '#') {
      var hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(function (c) { return c + c; }).join('');
      }
      var num = parseInt(hex, 16);
      if (!isNaN(num)) {
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
      }
    }
    var m = str.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) {
      return [parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10)];
    }
    return fallback;
  }

  function mixRgb(c1, c2, t) {
    var r = Math.round(c1[0] * t + c2[0] * (1 - t));
    var g = Math.round(c1[1] * t + c2[1] * (1 - t));
    var b = Math.round(c1[2] * t + c2[2] * (1 - t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function getThemeTokens(el) {
    var root = el || document.documentElement;
    var cs = window.getComputedStyle(root);
    var docTheme = document.documentElement.getAttribute('data-theme');
    var isDark = docTheme === 'dark' || (!docTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    var hue = cs.getPropertyValue('--hue').trim() || (isDark ? '#5b9bff' : '#1d5fbf');
    var refInk = cs.getPropertyValue('--ref-ink').trim() || (isDark ? '#f2f2f2' : '#141414');
    var surface = cs.getPropertyValue('--surface').trim() || (isDark ? '#111111' : '#ffffff');
    var ground = cs.getPropertyValue('--ground').trim() || (isDark ? '#000000' : '#f2f4f7');
    var text = cs.getPropertyValue('--text').trim() || (isDark ? '#ffffff' : '#0a0a0a');
    var muted = cs.getPropertyValue('--muted').trim() || (isDark ? '#b4b4b4' : '#666666');
    var grid = cs.getPropertyValue('--grid').trim() || (isDark ? '#2b2b2b' : '#e5e5e5');
    var negative = cs.getPropertyValue('--negative').trim() || (isDark ? '#e5566f' : '#c4242a');
    var control = cs.getPropertyValue('--control').trim() || (isDark ? '#444444' : '#d4d4d4');
    var o2Grey = cs.getPropertyValue('--o2-grey').trim() || '#8a8a8a';

    return {
      isDark: isDark,
      hue: hue,
      refInk: refInk,
      surface: surface,
      ground: ground,
      text: text,
      muted: muted,
      grid: grid,
      negative: negative,
      control: control,
      o2Grey: o2Grey
    };
  }

  function createHatchPattern(svgEl, id, tokens) {
    var defs = svgEl.querySelector('defs');
    if (!defs) {
      defs = s('defs', null, svgEl);
    }
    var pat = s('pattern', {
      id: id,
      width: '4',
      height: '4',
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)'
    }, defs);

    s('rect', {
      width: '4',
      height: '4',
      fill: tokens.surface
    }, pat);

    s('line', {
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '4',
      stroke: tokens.refInk,
      'stroke-width': '1.5'
    }, pat);
  }

  function getMarkStyle(key, tokens, patternId) {
    var surfaceRgb = parseColor(tokens.surface, tokens.isDark ? [17, 17, 17] : [255, 255, 255]);
    var o2GreyRgb = parseColor(tokens.o2Grey, [138, 138, 138]);
    var hueRgb = parseColor(tokens.hue, tokens.isDark ? [91, 155, 255] : [29, 95, 191]);

    switch (key) {
      case 'O2':
        return {
          fill: tokens.o2Grey,
          stroke: 'none',
          strokeWidth: 0
        };
      case 'O3':
        var o3Pct = tokens.isDark ? 0.35 : 0.40;
        return {
          fill: mixRgb(o2GreyRgb, surfaceRgb, o3Pct),
          stroke: tokens.o2Grey,
          strokeWidth: 1
        };
      case 'Oz':
        return {
          fill: tokens.refInk,
          stroke: 'none',
          strokeWidth: 0
        };
      case 'best_fixed':
        return {
          pattern: true,
          fill: patternId ? 'url(#' + patternId + ')' : tokens.refInk,
          stroke: tokens.refInk,
          strokeWidth: 1
        };
      case 'random':
        return {
          fill: 'none',
          stroke: tokens.o2Grey,
          strokeWidth: 1
        };
      case 'dense':
        return {
          fill: tokens.hue,
          stroke: 'none',
          strokeWidth: 0
        };
      case 'sparse':
        return {
          fill: mixRgb(hueRgb, surfaceRgb, 0.40),
          stroke: tokens.hue,
          strokeWidth: 1.5
        };
      case 'long_dense':
        return {
          fill: 'none',
          stroke: tokens.hue,
          strokeWidth: 2
        };
      case 'long_sparse':
        return {
          fill: 'none',
          stroke: tokens.hue,
          strokeWidth: 2,
          strokeDasharray: '4 3'
        };
      default:
        return {
          fill: tokens.muted,
          stroke: 'none',
          strokeWidth: 0
        };
    }
  }

  var MARKS = {
    O2: { key: 'O2', label: '-O2' },
    O3: { key: 'O3', label: '-O3' },
    Oz: { key: 'Oz', label: '-Oz' },
    best_fixed: { key: 'best_fixed', label: 'Best fixed sequence' },
    random: { key: 'random', label: 'Random sequence' },
    dense: { key: 'dense', label: 'RL dense' },
    sparse: { key: 'sparse', label: 'RL sparse' },
    long_dense: { key: 'long_dense', label: 'RL dense, 2000 episodes' },
    long_sparse: { key: 'long_sparse', label: 'RL sparse, 2000 episodes' }
  };

  function createSwatch(key, tokens) {
    patternCounter++;
    var patId = 'swatch-hatch-' + patternCounter;
    var style = getMarkStyle(key, tokens, patId);

    var svgEl = s('svg', {
      class: 'chart-swatch',
      width: '14',
      height: '12',
      viewBox: '0 0 14 12',
      style: 'display:inline-block;vertical-align:middle;flex-shrink:0;'
    });

    if (style.pattern) {
      createHatchPattern(svgEl, patId, tokens);
    }

    var rectAttrs = {
      x: '0.5',
      y: '0.5',
      width: '13',
      height: '11',
      rx: '2',
      fill: style.fill,
      stroke: style.stroke,
      'stroke-width': style.strokeWidth || 0
    };
    if (style.strokeDasharray) {
      rectAttrs['stroke-dasharray'] = style.strokeDasharray;
    }

    s('rect', rectAttrs, svgEl);
    return svgEl;
  }

  function legend(keys) {
    var tokens = getThemeTokens();
    var wrap = document.createElement('div');
    wrap.className = 'chart-legend';
    wrap.setAttribute('role', 'list');

    (keys || []).forEach(function (k) {
      var item = MARKS[k];
      if (!item) return;

      var row = document.createElement('div');
      row.className = 'chart-legend-item';
      row.setAttribute('role', 'listitem');

      var swatch = createSwatch(k, tokens);
      var label = document.createElement('span');
      label.className = 'chart-legend-label';
      label.textContent = item.label;

      row.appendChild(swatch);
      row.appendChild(label);
      wrap.appendChild(row);
    });

    return wrap;
  }

  function methodBars(el, rows, opts) {
    opts = opts || {};
    // The chart is often drawn into a container that is not in the page yet (clientWidth 0),
    // which would fix the viewBox at 600 and shrink the labels on a phone. Remember the
    // arguments and redraw once the container has its real width, and whenever it changes.
    el._mbArgs = [rows, opts];
    if (!el._mbObserved && typeof ResizeObserver === 'function') {
      el._mbObserved = true;
      el._mbWidth = 0;
      new ResizeObserver(function () {
        var cw = el.clientWidth;
        if (cw > 0 && Math.abs(cw - el._mbWidth) > 1) {
          methodBars(el, el._mbArgs[0], el._mbArgs[1]);
        }
      }).observe(el);
    }
    el._mbWidth = el.clientWidth;
    var mode = opts.mode || 'pct';
    rows = rows || [];

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    var tokens = getThemeTokens(el);
    patternCounter++;
    var patId = 'bar-hatch-' + patternCounter;

    var w = Math.max(260, el.clientWidth || 600);
    var pitch = 44;
    var subH = opts.subheader ? 28 : 0;
    var axisH = 26;
    var padT = (opts.reference && opts.reference.label) ? 22 : 8;
    var padB = 8;
    var totalH = padT + (rows.length * pitch) + subH + axisH + padB;

    var svgEl = s('svg', {
      viewBox: '0 0 ' + w + ' ' + totalH,
      width: '100%',
      height: String(totalH),
      role: 'img',
      'aria-label': opts.ariaLabel || 'Size reduction by method',
      style: 'display:block;overflow:visible;font-variant-numeric:tabular-nums;'
    }, el);

    createHatchPattern(svgEl, patId, tokens);

    var maxVal = 0;
    rows.forEach(function (r) {
      if (r.value !== null && r.value !== undefined && r.value > maxVal) {
        maxVal = r.value;
      }
      if (r.seeds && r.seeds.length) {
        r.seeds.forEach(function (sv) {
          if (sv !== null && sv !== undefined && sv > maxVal) maxVal = sv;
        });
      }
    });
    if (opts.reference && opts.reference.value > maxVal) {
      maxVal = opts.reference.value;
    }

    var ticks = opts.ticks;
    if (w < 450 && ticks && ticks.length > 5) {
      ticks = ticks.filter(function (v, idx) { return idx % 2 === 0; });
    }
    if (!ticks || !ticks.length) {
      if (window.Charts && typeof window.Charts.ticks === 'function') {
        ticks = window.Charts.ticks(0, Math.max(mode === 'pct' ? 0.1 : 100, maxVal), w < 450 ? 3 : 4);
      } else {
        ticks = mode === 'pct' ? (w < 450 ? [0, 0.2, 0.4, 0.6] : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) : [0, 1000, 2000, 3000, 4000];
      }
    }
    var tickMax = ticks[ticks.length - 1] || 1;

    var lw = w < 520 ? 156 : 180;  // fits the longest label ("RL sparse, 2000 episodes")
    var hasRightNote = rows.some(function (r) { return !!r.note; });
    var barX0 = lw + 12;
    var barX1 = w - (hasRightNote ? 96 : 88);
    if (barX1 <= barX0 + 40) barX1 = barX0 + 40;

    function scale(val) {
      if (val === null || val === undefined || isNaN(val)) return barX0;
      var ratio = val / tickMax;
      if (ratio < 0) ratio = 0;
      return barX0 + ratio * (barX1 - barX0);
    }

    function formatVal(v) {
      if (v === null || v === undefined) return '-';
      if (mode === 'pct') {
        return (window.App && window.App.fmt) ? window.App.fmt.pct(v) : (v * 100).toFixed(1) + '%';
      }
      return (window.App && window.App.fmt) ? window.App.fmt.int(v) : String(Math.round(v));
    }

    var axisY = padT + (rows.length * pitch) + subH + 4;

    ticks.forEach(function (tVal) {
      var tx = scale(tVal);
      s('line', {
        x1: tx.toFixed(1),
        x2: tx.toFixed(1),
        y1: String(padT),
        y2: String(axisY),
        stroke: tokens.grid,
        'stroke-width': '1',
        'shape-rendering': 'crispEdges'
      }, svgEl);

      var tickTxt = s('text', {
        x: tx.toFixed(1),
        y: String(axisY + 16),
        'text-anchor': 'middle',
        'font-size': '12',
        fill: tokens.muted
      }, svgEl);
      tickTxt.textContent = mode === 'pct' ? Math.round(tVal * 100) + '%' : formatVal(tVal);
    });

    if (opts.reference && opts.reference.value !== null && opts.reference.value !== undefined) {
      var rx = scale(opts.reference.value);
      s('line', {
        x1: rx.toFixed(1),
        x2: rx.toFixed(1),
        y1: String(padT),
        y2: String(axisY),
        stroke: tokens.muted,
        'stroke-width': '1',
        'stroke-dasharray': '4 3'
      }, svgEl);

      if (opts.reference.label) {
        var refTxt = s('text', {
          x: rx.toFixed(1),
          y: String(padT - 6),
          'text-anchor': 'middle',
          'font-size': '11',
          fill: tokens.muted
        }, svgEl);
        refTxt.textContent = opts.reference.label;
      }
    }

    var curY = padT;
    rows.forEach(function (r) {
      if (opts.subheader && opts.subheader.beforeKey === r.key) {
        var subTxt = s('text', {
          x: '0',
          y: String(curY + 18),
          'font-size': '12',
          fill: tokens.muted
        }, svgEl);
        subTxt.textContent = opts.subheader.text;
        curY += 28;
      }

      var cy = curY + pitch / 2;
      var grp = s('g', {
        tabindex: '0',
        role: 'group'
      }, svgEl);

      var labelEl = s('text', {
        x: '0',
        y: String(cy + 4),
        'font-size': '13',
        'font-weight': '400',
        fill: tokens.text
      }, grp);
      var markDef = MARKS[r.key] || {};
      labelEl.textContent = r.label || markDef.label || r.key;

      var style = getMarkStyle(r.key, tokens, patId);

      var maxEndVal = r.value || 0;
      if (r.seeds && r.seeds.length) {
        r.seeds.forEach(function (sv) {
          if (sv !== null && sv !== undefined && sv > maxEndVal) maxEndVal = sv;
        });
      }
      var valEnd = scale(r.value);
      var textEnd = scale(maxEndVal);
      var barW = valEnd - barX0;
      if (r.value !== null && r.value !== undefined && barW > 0) {
        var barAttrs = {
          x: String(barX0),
          y: String(cy - 6),
          width: barW.toFixed(1),
          height: '12',
          rx: '2',
          fill: style.fill,
          stroke: style.stroke,
          'stroke-width': style.strokeWidth || 0
        };
        if (style.strokeDasharray) {
          barAttrs['stroke-dasharray'] = style.strokeDasharray;
        }
        s('rect', barAttrs, grp);
      }

      var seedsDiffer = false;
      if (r.seeds && r.seeds.length > 1) {
        var firstSeed = r.seeds[0];
        seedsDiffer = r.seeds.some(function (sv) {
          return Math.abs(sv - firstSeed) > 1e-5;
        });
        if (seedsDiffer) {
          r.seeds.forEach(function (sv) {
            var sx = scale(sv);
            s('line', {
              x1: sx.toFixed(1),
              x2: sx.toFixed(1),
              y1: String(cy - 7),
              y2: String(cy + 7),
              stroke: tokens.refInk,
              'stroke-width': '1'
            }, grp);
          });
        }
      }

      if (r.value !== null && r.value !== undefined) {
        var valText = r.valueText || formatVal(r.value);
        var valEl = s('text', {
          x: (textEnd + 8).toFixed(1),
          y: String(cy + 4),
          'font-size': '12',
          'font-weight': '500',
          fill: tokens.text
        }, grp);
        valEl.textContent = valText;
      } else {
        var dashEl = s('text', {
          x: (barX0 + 8).toFixed(1),
          y: String(cy + 4),
          'font-size': '12',
          'font-weight': '400',
          fill: tokens.muted
        }, grp);
        dashEl.textContent = '-';
      }

      if (r.note) {
        var noteEl = s('text', {
          x: String(w),
          y: String(cy + 4),
          'text-anchor': 'end',
          'font-size': '12',
          fill: r.negativeNote ? tokens.negative : tokens.muted
        }, grp);
        noteEl.textContent = r.note;
      }

      var tip = s('title', null, grp);
      var tipVal = r.valueText || formatVal(r.value);
      var rowName = r.label || markDef.label || r.key;
      if (r.seeds && r.seeds.length > 1) {
        if (!seedsDiffer) {
          tip.textContent = rowName + ': ' + tipVal + ' (' + r.seeds.length + ' seeds, same result)';
        } else {
          tip.textContent = rowName + ': ' + tipVal + ' (seeds: ' + r.seeds.map(formatVal).join(', ') + ')';
        }
      } else {
        tip.textContent = rowName + ': ' + tipVal;
      }

      curY += pitch;
    });

    var keysUsed = rows.map(function (r) { return r.key; });
    return {
      legend: legend(keysUsed)
    };
  }

  window.ChartsExt = {
    MARKS: MARKS,
    legend: legend,
    methodBars: methodBars
  };
})();
