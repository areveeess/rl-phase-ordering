/* strip.js — Pass-sequence strip component (15 steps per run).
   Provides:
     Strip.row(el, opts)       // Full two-line strip with header and 44px cells
     Strip.mini(el, opts)      // Text-less 24px cells for compact cards (e.g. Overview evidence)
     Strip.stepTable(el, opts) // Accessible tabular view of every step
     Strip.key(changedLabel)   // Swatch legend for strip states
     Strip.live(el, opts)      // Dynamic streaming strip for live runs
*/
(function () {
  'use strict';

  function fmtInt(n) {
    if (window.App && window.App.fmt && typeof window.App.fmt.int === 'function') {
      return window.App.fmt.int(n);
    }
    return String(n);
  }

  function validateTrace(sequence, steps, final) {
    if (!steps || !Array.isArray(steps) || !steps.length) return false;
    if (sequence && steps.length !== sequence.length) return false;
    if (sequence) {
      for (var i = 0; i < sequence.length; i++) {
        if (steps[i].pass !== sequence[i]) return false;
      }
    }
    if (final !== undefined && final !== null) {
      var last = steps[steps.length - 1];
      if (last && last.after !== final) return false;
    }
    return true;
  }

  function formatAriaLabel(label, program, sequence, noEffectCount, final) {
    var T = sequence ? sequence.length : 15;
    var finalStr = final !== undefined && final !== null ? fmtInt(final) : '';
    var progStr = program ? (' on ' + program) : '';

    var allSame = sequence && sequence.length > 0 && sequence.every(function (p) {
      return p === sequence[0];
    });

    if (allSame) {
      var passName = sequence[0];
      return label + progStr + ': ' + T + ' steps, ' + passName + ' ' + T + ' times, ' +
        noEffectCount + ' had no effect, ends at ' + finalStr + ' instructions';
    }

    var seqStr = sequence ? sequence.join(', ') : '';
    return label + progStr + ': ' + T + ' steps, ' + seqStr + ', ' +
      noEffectCount + ' had no effect, ends at ' + finalStr + ' instructions';
  }

  /* Signature interaction: hover a stop, or focus the route and use the arrow keys, and the
     readout under the line names the step, the pass and what it did to the instruction count. */
  function stopReadout(i, pass, step, before) {
    var head = 'Stop ' + (i + 1) + ': ' + (pass || 'unknown pass');
    if (!step) return head + '. Step effects were not recorded.';
    if (pass === 'NOOP') return head + '. Does nothing (NOOP).';
    if (!step.changed) return head + '. Ran through: no effect, ' + fmtInt(step.after) + ' instructions.';
    if (before === undefined || before === null) return head + '. Changed the program: ' + fmtInt(step.after) + ' instructions.';
    var d = step.after - before;
    return head + '. Changed the program: ' + fmtInt(before) + ' → ' + fmtInt(step.after) + ' instructions (' +
      (d > 0 ? '+' : d < 0 ? '−' : '') + fmtInt(Math.abs(d)) + ').';
  }

  function attachReadout(container, grid) {
    var cells = Array.prototype.slice.call(grid.querySelectorAll('.strip-cell'));
    if (!cells.length) return;
    var readout = document.createElement('p');
    readout.className = 'strip-readout';
    readout.setAttribute('aria-live', 'polite');
    var idle = 'Point at or tap a stop, or focus this route and use the arrow keys, to read each step.';
    readout.textContent = idle;
    container.appendChild(readout);
    var active = -1;
    function show(i) {
      if (active >= 0) cells[active].classList.remove('is-active');
      active = i;
      if (i < 0) { readout.textContent = idle; return; }
      cells[i].classList.add('is-active');
      readout.textContent = cells[i].getAttribute('data-readout') || '';
    }
    cells.forEach(function (c, i) {
      c.addEventListener('mouseenter', function () { show(i); });
      c.addEventListener('click', function () { show(i); });
    });
    grid.addEventListener('mouseleave', function () { if (document.activeElement !== container) show(-1); });
    container.addEventListener('keydown', function (e) {
      var n = cells.length, next = -1;
      if (e.key === 'ArrowRight') next = active < 0 ? 0 : Math.min(n - 1, active + 1);
      else if (e.key === 'ArrowLeft') next = active < 0 ? 0 : Math.max(0, active - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next >= 0) { e.preventDefault(); show(next); }
    });
    container.addEventListener('focus', function () { if (active < 0) show(0); });
    container.addEventListener('blur', function () { show(-1); });
  }

  function row(el, opts) {
    opts = opts || {};
    var label = opts.label || '';
    var kind = opts.kind || 'rl';
    var program = opts.program || '';
    var sequence = opts.sequence || [];
    var steps = opts.steps || null;
    var final = opts.final;
    var o0 = opts.o0;

    var traceValid = validateTrace(sequence, steps, final);
    var episodeLen = sequence.length || (steps ? steps.length : 15);

    var noEffectCount = 0;
    if (traceValid) {
      noEffectCount = steps.filter(function (s) { return !s.changed; }).length;
    } else if (opts.no_effect !== undefined) {
      noEffectCount = opts.no_effect;
    }

    var container = document.createElement('div');
    container.className = 'strip-row';
    container.setAttribute('data-ui', 'true');
    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', formatAriaLabel(label, program, sequence, noEffectCount, final));

    // Line 1: Header line
    var head = document.createElement('div');
    head.className = 'strip-row-head';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'strip-row-title';
    titleSpan.textContent = label;

    var metaSpan = document.createElement('span');
    metaSpan.className = 'strip-row-meta';

    var finalSpan = document.createElement('span');
    finalSpan.className = 'strip-row-final';
    finalSpan.textContent = final !== undefined && final !== null ? fmtInt(final) : '';

    var noEffSpan = document.createElement('span');
    noEffSpan.className = 'strip-row-noeff';
    noEffSpan.textContent = noEffectCount + ' of ' + episodeLen + ' no effect';

    metaSpan.appendChild(finalSpan);
    metaSpan.appendChild(noEffSpan);
    head.appendChild(titleSpan);
    head.appendChild(metaSpan);
    container.appendChild(head);

    // Line 2: Grid of cells
    var grid = document.createElement('div');
    grid.className = 'strip-grid';

    for (var i = 0; i < episodeLen; i++) {
      var pass = sequence[i] || (steps && steps[i] ? steps[i].pass : '');
      var step = traceValid ? steps[i] : null;

      var cell = document.createElement('div');
      cell.className = 'strip-cell';

      var cleanName = pass ? pass.replace(/^-/, '') : '';
      var code = document.createElement('code');
      code.textContent = cleanName;
      cell.appendChild(code);

      if (!traceValid) {
        cell.className += ' strip-cell-notrace';
        cell.title = pass || 'Step ' + (i + 1);
      } else {
        var prevAfter = i === 0 ? o0 : steps[i - 1].after;
        var effectText = '';

        if (pass === 'NOOP') {
          cell.className += ' strip-cell-noop';
          effectText = 'NOOP';
        } else if (step && step.changed) {
          if (kind === 'fixed') {
            cell.className += ' strip-cell-changed-fixed';
          } else {
            cell.className += ' strip-cell-changed-rl';
          }
          if (prevAfter !== undefined && step.after === prevAfter) {
            effectText = 'changed the program, count unchanged';
          } else {
            effectText = fmtInt(step.after) + ' instructions';
          }
        } else {
          cell.className += ' strip-cell-unchanged';
          effectText = 'no effect';
        }

        cell.title = (pass || ('Step ' + (i + 1))) + ' (' + effectText + ')';
      }

      cell.setAttribute('data-readout', stopReadout(i, pass, step, traceValid ? (i === 0 ? o0 : steps[i - 1].after) : undefined));
      grid.appendChild(cell);
    }
    container.appendChild(grid);
    attachReadout(container, grid);

    if (!traceValid && steps !== null) {
      var guardNotice = document.createElement('div');
      guardNotice.className = 'strip-no-trace';
      guardNotice.textContent = 'Step-by-step effects were not recorded for this run. The full sequence is shown.';
      container.appendChild(guardNotice);
    }

    if (el) el.appendChild(container);
    return container;
  }

  function mini(el, opts) {
    opts = opts || {};
    var label = opts.label || '';
    var kind = opts.kind || 'rl';
    var program = opts.program || '';
    var sequence = opts.sequence || [];
    var steps = opts.steps || null;
    var final = opts.final;
    var o0 = opts.o0;

    var traceValid = validateTrace(sequence, steps, final);
    var episodeLen = sequence.length || (steps ? steps.length : 15);

    var noEffectCount = 0;
    if (traceValid) {
      noEffectCount = steps.filter(function (s) { return !s.changed; }).length;
    } else if (opts.no_effect !== undefined) {
      noEffectCount = opts.no_effect;
    }

    var wrap = document.createElement('div');
    wrap.className = 'strip-mini';

    var grid = document.createElement('div');
    grid.className = 'strip-mini-grid';
    grid.setAttribute('tabindex', '0');
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', formatAriaLabel(label, program, sequence, noEffectCount, final));

    for (var i = 0; i < episodeLen; i++) {
      var pass = sequence[i] || (steps && steps[i] ? steps[i].pass : '');
      var step = traceValid ? steps[i] : null;

      var cell = document.createElement('div');
      cell.className = 'strip-mini-cell';

      if (!traceValid) {
        cell.className += ' strip-cell-notrace';
        cell.title = pass || 'Step ' + (i + 1);
      } else {
        var prevAfter = i === 0 ? o0 : steps[i - 1].after;
        var effectText = '';

        if (pass === 'NOOP') {
          cell.className += ' strip-cell-noop';
          effectText = 'NOOP';
        } else if (step && step.changed) {
          if (kind === 'fixed') {
            cell.className += ' strip-cell-changed-fixed';
          } else {
            cell.className += ' strip-cell-changed-rl';
          }
          if (prevAfter !== undefined && step.after === prevAfter) {
            effectText = 'changed the program, count unchanged';
          } else {
            effectText = fmtInt(step.after) + ' instructions';
          }
        } else {
          cell.className += ' strip-cell-unchanged';
          effectText = 'no effect';
        }

        cell.title = (pass || ('Step ' + (i + 1))) + ' (' + effectText + ')';
      }

      grid.appendChild(cell);
    }
    wrap.appendChild(grid);

    if (opts.caption) {
      var captionEl;
      if (typeof opts.caption === 'string') {
        captionEl = document.createElement('div');
        captionEl.className = 'strip-caption';
        captionEl.textContent = opts.caption;
      } else {
        captionEl = opts.caption;
      }
      wrap.appendChild(captionEl);
    }

    if (el) el.appendChild(wrap);
    return wrap;
  }

  function stepTable(el, opts) {
    opts = opts || {};
    var sequence = opts.sequence || [];
    var steps = opts.steps || [];
    var o0 = opts.o0;
    var final = opts.final;

    var frame = document.createElement('div');
    frame.className = 'table-frame';

    var tbl = document.createElement('table');
    tbl.className = 'strip-step-table';

    var thead = document.createElement('thead');
    var htr = document.createElement('tr');

    ['Step', 'Pass', 'Count after', 'Effect'].forEach(function (hText, idx) {
      var th = document.createElement('th');
      th.scope = 'col';
      if (idx === 0 || idx === 2) th.className = 'num-col n';
      th.textContent = hText;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);

    var tbody = document.createElement('tbody');
    var n = steps.length || sequence.length;

    for (var i = 0; i < n; i++) {
      var step = steps[i];
      var pass = step ? step.pass : (sequence[i] || '');
      var tr = document.createElement('tr');

      var tdStep = document.createElement('td');
      tdStep.className = 'num-col n';
      tdStep.textContent = String(i + 1);
      tr.appendChild(tdStep);

      var tdPass = document.createElement('td');
      var code = document.createElement('code');
      code.textContent = pass;
      tdPass.appendChild(code);
      tr.appendChild(tdPass);

      var tdAfter = document.createElement('td');
      tdAfter.className = 'num-col n';
      tdAfter.textContent = step ? fmtInt(step.after) : '-';
      tr.appendChild(tdAfter);

      var tdEffect = document.createElement('td');
      if (step) {
        var prevAfter = i === 0 ? o0 : steps[i - 1].after;
        if (!step.changed) {
          tdEffect.textContent = 'no effect';
          tdEffect.className = 'strip-effect-muted';
          tr.className = 'strip-row-muted';
        } else if (prevAfter !== undefined && step.after === prevAfter) {
          tdEffect.textContent = 'changed the program, count unchanged';
        } else {
          tdEffect.textContent = 'changed';
        }
      } else {
        tdEffect.textContent = '-';
      }
      tr.appendChild(tdEffect);
      tbody.appendChild(tr);
    }

    tbl.appendChild(tbody);
    frame.appendChild(tbl);
    if (el) el.appendChild(frame);
    return frame;
  }

  function key(changedLabel) {
    var wrap = document.createElement('div');
    wrap.className = 'strip-key';

    var items = [
      { label: changedLabel || 'Changed the program', cls: 'strip-cell-changed-rl' },
      { label: 'No effect', cls: 'strip-cell-unchanged' },
      { label: 'NOOP', cls: 'strip-cell-noop' }
    ];

    items.forEach(function (it) {
      var itemEl = document.createElement('span');
      itemEl.className = 'strip-key-item';

      var swatch = document.createElement('span');
      swatch.className = 'strip-key-swatch ' + it.cls;

      var lbl = document.createElement('span');
      lbl.className = 'strip-key-label';
      lbl.textContent = it.label;

      itemEl.appendChild(swatch);
      itemEl.appendChild(lbl);
      wrap.appendChild(itemEl);
    });

    return wrap;
  }

  function live(el, opts) {
    opts = opts || {};
    var total = opts.total || 15;
    var container = document.createElement('div');
    container.className = 'strip-live';

    var grid = document.createElement('div');
    grid.className = 'strip-grid strip-grid-live';

    var cells = [];
    for (var i = 0; i < total; i++) {
      var cell = document.createElement('div');
      cell.className = 'strip-cell strip-cell-live-empty';
      var code = document.createElement('code');
      cell.appendChild(code);
      grid.appendChild(cell);
      cells.push(cell);
    }
    container.appendChild(grid);
    if (el) el.appendChild(container);

    return {
      push: function (step) {
        if (!step || step.index < 0 || step.index >= cells.length) return;
        var cell = cells[step.index];
        cell.className = 'strip-cell';

        var code = cell.querySelector('code');
        if (code) {
          var clean = step.pass ? step.pass.replace(/^-/, '') : '';
          code.textContent = clean;
        }

        if (step.pass === 'NOOP') {
          cell.className += ' strip-cell-noop';
        } else if (step.changed) {
          cell.className += ' strip-cell-changed-rl';
        } else {
          cell.className += ' strip-cell-unchanged';
        }

        cell.title = step.pass + ' (' + fmtInt(step.count || step.after) + ' instructions)';
      },
      fail: function (k) {
        if (k >= 0 && k < cells.length) {
          cells[k].className += ' strip-cell-fail';
        }
      },
      reset: function () {
        cells.forEach(function (c) {
          c.className = 'strip-cell strip-cell-live-empty';
          var code = c.querySelector('code');
          if (code) code.textContent = '';
          c.removeAttribute('title');
        });
      }
    };
  }

  window.Strip = {
    row: row,
    mini: mini,
    stepTable: stepTable,
    key: key,
    live: live
  };
})();
