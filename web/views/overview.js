/* Overview route: "Does the learned policy beat LLVM on code size for programs it never saw?"
   Plan 08-05 complete Overview implementation.
   All figures rendered dynamically from window.DATA; no typed results.
*/
(function () {
  'use strict';

  var SPLIT_ORDER = ['test', 'val', 'train'];
  var SPLIT_TITLE = { test: 'Test', val: 'Validation', train: 'Train' };

  var REF_ROWS = [
    { key: 'vs_O2', label: '-O2' },
    { key: 'vs_O3', label: '-O3' },
    { key: 'vs_Oz', label: '-Oz' },
    { key: 'vs_best_fixed', label: 'Best fixed sequence' }
  ];

  function avg(arr) {
    if (!arr || !arr.length) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  }

  function minMaxRange(arr, decimals) {
    if (!arr || !arr.length) return '0';
    var min = arr[0];
    var max = arr[0];
    for (var i = 1; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    var d = decimals !== undefined ? decimals : 0;
    var minStr = d > 0 ? min.toFixed(d) : String(min);
    var maxStr = d > 0 ? max.toFixed(d) : String(max);
    if (minStr === maxStr) return minStr;
    return minStr + ' to ' + maxStr;
  }

  App.register('overview', {
    title: 'Overview',
    styles: true,
    render: function (data, ctx) {
      var rawArg = typeof ctx === 'string' ? ctx : (ctx && ctx.arg ? ctx.arg : null);
      var activeSplit = rawArg ? rawArg.toLowerCase() : 'test';
      if (SPLIT_ORDER.indexOf(activeSplit) === -1) {
        activeSplit = 'test';
      }

      var mainContainer = App.h('div', { class: 'overview-view' });

      function renderContent() {
        while (mainContainer.firstChild) {
          mainContainer.removeChild(mainContainer.firstChild);
        }

        var programsInSplit = App.q.programs(activeSplit);
        var n = programsInSplit.length;
        var noun = App.q.splitNoun(activeSplit);
        var mainRuns = App.q.runs('main');
        var kMain = mainRuns.length;

        var splitSummary = (data.summary || []).filter(function (s) {
          return s.split === activeSplit;
        })[0] || {};

        // 1. Title row
        var w3 = App.q.wtlRange(activeSplit, 'vs_O3', 'main');
        var w2 = App.q.wtlRange(activeSplit, 'vs_O2', 'main');
        var wOz = App.q.wtlRange(activeSplit, 'vs_Oz', 'main');
        var wBf = App.q.wtlRange(activeSplit, 'vs_best_fixed', 'main');

        var w3Str = w3.lo === w3.hi ? String(w3.lo) : (w3.lo + ' to ' + w3.hi);
        var w2Str = w2.lo === w2.hi ? String(w2.lo) : (w2.lo + ' to ' + w2.hi);

        var losesOz = wOz.hi < wOz.loLoss &&
          splitSummary.dense_mean < splitSummary.Oz &&
          splitSummary.sparse_mean < splitSummary.Oz;
        var losesBf = wBf.hi < wBf.loLoss &&
          splitSummary.dense_mean < splitSummary.best_fixed &&
          splitSummary.sparse_mean < splitSummary.best_fixed;

        var lossClause = '';
        if (losesOz && losesBf) {
          lossClause = ', but loses to -Oz and the best fixed sequence.';
        } else if (losesOz) {
          lossClause = ', but loses to -Oz.';
        } else if (losesBf) {
          lossClause = ', but loses to the best fixed sequence.';
        } else {
          lossClause = '.';
        }

        var findingText = 'On ' + n + ' ' + noun + ' programs the agent beats -O3 on ' +
          w3Str + ' and -O2 on ' + w2Str + lossClause;

        var headerEl = App.h('div', { class: 'overview-header' },
          App.h('div', { class: 'overview-header-left' },
            App.h('h1', { class: 'overview-h1' }, 'Overview'),
            App.h('p', { class: 'overview-finding' }, findingText)
          ),
          App.h('div', { class: 'overview-header-action' },
            App.ui.button({
              label: 'Explore programs',
              href: '#/programs',
              kind: 'primary'
            })
          )
        );

        // 2. Filter row
        var segmentedOptions = SPLIT_ORDER.map(function (s) {
          var count = App.q.programs(s).length;
          return {
            key: s,
            label: SPLIT_TITLE[s] + ' (' + count + ')'
          };
        });

        var segControl = App.ui.segmented({
          name: 'overview-split',
          options: segmentedOptions,
          selected: activeSplit,
          onChange: function (newSplit) {
            activeSplit = newSplit;
            try {
              window.history.replaceState(null, '', '#/overview/' + newSplit);
            } catch (e) {}
            renderContent();
          }
        });

        var filterRowEl = App.h('div', { class: 'overview-filters' },
          segControl,
          App.h('div', { class: 'overview-built' }, 'Data built ' + (data.built || ''))
        );

        // 3. KPI Strip
        var lOzStr = wOz.loLoss === wOz.hiLoss ? String(wOz.loLoss) : (wOz.loLoss + ' to ' + wOz.hiLoss);
        var lBfStr = wBf.loLoss === wBf.hiLoss ? String(wBf.loLoss) : (wBf.loLoss + ' to ' + wBf.hiLoss);

        var kpiItems = [
          { label: 'Beats -O3', val: w3Str + ' of ' + n },
          { label: 'Beats -O2', val: w2Str + ' of ' + n },
          { label: 'Loses to -Oz', val: lOzStr + ' of ' + n },
          { label: 'Loses to best fixed sequence', val: lBfStr + ' of ' + n }
        ];

        var kpisEl = App.h('div', { class: 'overview-kpis' },
          kpiItems.map(function (kpi) {
            return App.h('div', { class: 'overview-kpi-cell' },
              App.h('div', { class: 'overview-kpi-label' }, kpi.label),
              App.h('div', { class: 'overview-kpi-val-row' },
                App.h('span', { class: 'overview-kpi-val' }, kpi.val),
                App.h('span', { class: 'overview-kpi-suffix' }, 'programs')
              ),
              App.h('div', { class: 'overview-kpi-sub' }, 'range over ' + kMain + ' runs')
            );
          })
        );

        // 4. Row 2: Chart card (span 7) & Evidence card (span 5)
        var progO0 = {};
        (data.programs || []).forEach(function (p) { progO0[p.name] = p.O0; });

        function getRunRed(runId) {
          var evals = App.q.evalRows({ run: runId, split: activeSplit });
          var finals = evals.map(function (e) { return e.final; });
          var o0s = evals.map(function (e) { return progO0[e.benchmark]; });
          return App.q.reduction(finals, o0s);
        }

        var denseSeeds = ['dense_s0', 'dense_s1', 'dense_s2'].map(getRunRed);
        var sparseSeeds = ['sparse_s0', 'sparse_s1', 'sparse_s2'].map(getRunRed);

        var sevenMethods = [
          { key: 'Oz', label: '-Oz', value: splitSummary.Oz },
          { key: 'best_fixed', label: 'Best fixed sequence', value: splitSummary.best_fixed },
          {
            key: 'dense',
            label: 'RL dense',
            value: splitSummary.dense_mean,
            seeds: denseSeeds,
            valueText: App.fmt.pct(splitSummary.dense_mean) + ' \u00b1 ' + App.fmt.pct(splitSummary.dense_sd)
          },
          {
            key: 'sparse',
            label: 'RL sparse',
            value: splitSummary.sparse_mean,
            seeds: sparseSeeds,
            valueText: App.fmt.pct(splitSummary.sparse_mean) + ' \u00b1 ' + App.fmt.pct(splitSummary.sparse_sd)
          },
          { key: 'O2', label: '-O2', value: splitSummary.O2 },
          { key: 'O3', label: '-O3', value: splitSummary.O3 },
          { key: 'random', label: 'Random sequence', value: splitSummary.random }
        ];

        sevenMethods.sort(function (a, b) {
          return (b.value || 0) - (a.value || 0);
        });

        var chartRows = sevenMethods.concat([
          { key: 'long_dense', label: 'RL dense, 2000 episodes', value: splitSummary.long_dense },
          { key: 'long_sparse', label: 'RL sparse, 2000 episodes', value: splitSummary.long_sparse }
        ]);

        var chartContainer = App.h('div', { class: 'overview-chart-container' });
        if (window.ChartsExt && typeof window.ChartsExt.methodBars === 'function') {
          window.ChartsExt.methodBars(chartContainer, chartRows, {
            mode: 'pct',
            ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            subheader: {
              beforeKey: 'long_dense',
              text: 'Added after the main results, one seed'
            },
            ariaLabel: 'Size reduction on the ' + n + ' ' + noun + ' programs'
          });
        }

        var chartCard = App.ui.card({
          title: 'Size reduction on the ' + n + ' ' + noun + ' programs',
          sub: 'Versus -O0, geometric mean of final over -O0 counts. Higher is better.',
          body: chartContainer,
          span: 7
        });

        // Evidence card (span 5)
        var allPrograms = data.programs || [];
        var totalProgs = allPrograms.length;
        var T = (data.constants && data.constants.episode_len) || 15;
        var nActions = (data.constants && data.constants.n_actions) || 25;
        var uniformEntropy = (data.constants && data.constants.uniform_entropy) || 0;

        var denseS0Evals = App.q.evalRows({ run: 'dense_s0' });
        var noEffCounts = {};
        denseS0Evals.forEach(function (e) {
          noEffCounts[e.no_effect] = (noEffCounts[e.no_effect] || 0) + 1;
        });
        var mostCommonNoEff = 0;
        var maxFreq = 0;
        Object.keys(noEffCounts).forEach(function (k) {
          if (noEffCounts[k] > maxFreq) {
            maxFreq = noEffCounts[k];
            mostCommonNoEff = parseInt(k, 10);
          }
        });

        var testProgs = App.q.programs('test');
        var repProg = null;
        for (var pi = 0; pi < testProgs.length; pi++) {
          var matchRow = denseS0Evals.filter(function (e) {
            return e.benchmark === testProgs[pi].name;
          })[0];
          if (matchRow && matchRow.no_effect === mostCommonNoEff) {
            repProg = testProgs[pi];
            break;
          }
        }
        if (!repProg && testProgs.length) repProg = testProgs[0];

        var repEval = repProg ? denseS0Evals.filter(function (e) {
          return e.benchmark === repProg.name;
        })[0] : null;

        var repPass = (repEval && repEval.sequence && repEval.sequence.length) ? repEval.sequence[0] : '';
        var repSeqAllSame = repEval && repEval.sequence && repEval.sequence.every(function (p) {
          return p === repPass;
        });
        var captionText = repProg ? ('Greedy sequence for ' + repProg.name + ': ' +
          (repSeqAllSame ? (repPass + ' ' + T + ' times') : (repEval.sequence || []).join(', '))) : '';

        var miniStripEl = App.h('div', { class: 'evidence-strip-wrap' });
        if (window.Strip && typeof window.Strip.mini === 'function' && repEval) {
          window.Strip.mini(miniStripEl, {
            label: App.q.runLabel('dense_s0'),
            kind: 'rl',
            program: repProg.name,
            sequence: repEval.sequence,
            steps: repEval.steps,
            final: repEval.final,
            o0: repProg.O0,
            caption: captionText
          });
        }

        var collapsedRunCount = 0;
        var cCounts = [];
        mainRuns.forEach(function (r) {
          var evals = App.q.evalRows({ run: r.id });
          var seqMap = {};
          evals.forEach(function (e) {
            seqMap[(e.sequence || []).join(',')] = true;
          });
          if (Object.keys(seqMap).length === 1) {
            collapsedRunCount++;
            var c = evals.filter(function (e) { return e.no_effect === T - 1; }).length;
            cCounts.push(c);
          }
        });
        var cRange = minMaxRange(cCounts);

        var denseMainEvals = App.q.evalRows({ group: 'main', reward: 'dense' });
        var sparseMainEvals = App.q.evalRows({ group: 'main', reward: 'sparse' });
        var denseNoEffMean = avg(denseMainEvals.map(function (e) { return e.no_effect; })).toFixed(1);
        var sparseNoEffMean = avg(sparseMainEvals.map(function (e) { return e.no_effect; })).toFixed(1);

        var firstEnts = [];
        var lastEnts = [];
        mainRuns.forEach(function (r) {
          var ent = r.train_log && r.train_log.entropy;
          if (ent && ent.length) {
            firstEnts.push(ent[0]);
            lastEnts.push(ent[ent.length - 1]);
          }
        });
        var firstEntStr = minMaxRange(firstEnts, 2);
        var lastEntStr = minMaxRange(lastEnts, 2);

        var fact1 = collapsedRunCount + ' of ' + kMain + ' policies give the same sequence for every one of the ' +
          totalProgs + ' programs; on ' + cRange + ' of ' + totalProgs + ' programs only its first step changes anything.';
        var fact2 = 'On average ' + denseNoEffMean + ' of ' + T + ' steps changed nothing (dense), ' +
          sparseNoEffMean + ' (sparse).';
        var fact3 = 'Policy entropy went from ' + firstEntStr + ' to ' + lastEntStr +
          ' nats; the maximum for ' + nActions + ' actions is ' + uniformEntropy.toFixed(2) + '.';

        var evidenceBody = App.h('div', { class: 'evidence-card-body' },
          miniStripEl,
          App.h('div', { class: 'evidence-facts' },
            App.h('p', { class: 'evidence-fact-item' }, fact1),
            App.h('p', { class: 'evidence-fact-item' }, fact2),
            App.h('p', { class: 'evidence-fact-item' }, fact3)
          ),
          App.h('a', { href: '#/training', class: 'evidence-link' }, 'See training curves')
        );

        var evidenceCard = App.ui.card({
          title: 'What the policies learned',
          body: evidenceBody,
          span: 5,
          class: 'overview-evidence-card'
        });

        // 5. Row 3: Wins, ties and losses card (full width, span 12)
        var allRuns = (data.runs || []);
        var wtlMap = {};
        (data.wtl || []).forEach(function (w) {
          if (w.split === activeSplit) {
            wtlMap[w.run] = w;
          }
        });

        var wtlColumns = [
          { key: 'ref', label: 'Reference', numeric: false },
          { key: 'dense_s0', label: 'RL dense seed 0', numeric: true },
          { key: 'dense_s1', label: 'RL dense seed 1', numeric: true },
          { key: 'dense_s2', label: 'RL dense seed 2', numeric: true },
          { key: 'sparse_s0', label: 'RL sparse seed 0', numeric: true },
          { key: 'sparse_s1', label: 'RL sparse seed 1', numeric: true },
          { key: 'sparse_s2', label: 'RL sparse seed 2', numeric: true },
          { key: 'long_dense_s0', label: 'Dense, 2000 episodes', numeric: true },
          { key: 'long_sparse_s0', label: 'Sparse, 2000 episodes', numeric: true }
        ];

        var wtlRows = REF_ROWS.map(function (ref) {
          var rowObj = { ref: ref.label };
          allRuns.forEach(function (r) {
            var w = wtlMap[r.id];
            var triple = w ? w[ref.key] : null;
            rowObj[r.id] = triple ? App.fmt.wtl(triple) : '-';
          });
          return rowObj;
        });

        var wtlDesktopTable = App.ui.table({
          columns: wtlColumns,
          rows: wtlRows,
          phone: 'scroll'
        });

        // Add supplementary badge to header
        var supplBadge = App.h('span', { class: 'pill pill-neutral wtl-header-pill' },
          'Added after the main results, one seed');

        // Phone variant for WTL: Reference select + Key-Value list
        var selectedRefKey = 'vs_O2';
        var wtlPhoneWrap = App.h('div', { class: 'wtl-phone-wrap' });

        function updatePhoneWtl() {
          while (wtlPhoneWrap.firstChild) {
            wtlPhoneWrap.removeChild(wtlPhoneWrap.firstChild);
          }

          var selectEl = App.h('select', {
            class: 'select wtl-phone-select',
            'aria-label': 'Reference',
            onchange: function (e) {
              selectedRefKey = e.target.value;
              updatePhoneWtl();
            }
          }, REF_ROWS.map(function (rf) {
            var optAttrs = { value: rf.key };
            if (rf.key === selectedRefKey) optAttrs.selected = 'selected';
            return App.h('option', optAttrs, rf.label);
          }));

          var refLabelEl = App.h('div', { class: 'wtl-phone-select-row' },
            App.h('label', { class: 'field-label' }, 'Reference'),
            selectEl
          );
          wtlPhoneWrap.appendChild(refLabelEl);

          var kvItems = allRuns.map(function (r) {
            var w = wtlMap[r.id];
            var triple = w ? w[selectedRefKey] : null;
            var rLabel = App.q.runLabel(r);
            if (r.group === 'long') {
              rLabel += ' (Added after the main results, one seed)';
            }
            return {
              key: rLabel,
              value: triple ? App.fmt.wtl(triple) : '-'
            };
          });

          wtlPhoneWrap.appendChild(App.ui.kv(kvItems));
        }
        updatePhoneWtl();

        var isPhoneMode = App.isPhone();
        var wtlCardBody = App.h('div', { class: 'wtl-card-container' },
          isPhoneMode ? wtlPhoneWrap : App.h('div', null,
            App.h('div', { style: 'margin-bottom:8px;display:flex;justify-content:flex-end;' }, supplBadge),
            wtlDesktopTable
          )
        );

        var wtlCard = App.ui.card({
          title: 'Wins, ties and losses against each reference',
          body: wtlCardBody,
          span: 12
        });

        // 6. Row 4: Summary by split card (full width, span 12)
        var summaryTableRows = SPLIT_ORDER.map(function (s) {
          return (data.summary || []).filter(function (e) { return e.split === s; })[0];
        }).filter(Boolean);

        function getSwatch(key) {
          if (window.ChartsExt && window.ChartsExt.MARKS && window.ChartsExt.MARKS[key]) {
            var wrap = document.createElement('span');
            wrap.style.cssText = 'display:inline-block;margin-right:6px;vertical-align:middle;';
            var leg = window.ChartsExt.legend([key]);
            var sw = leg.querySelector('.chart-swatch');
            if (sw) wrap.appendChild(sw);
            return wrap;
          }
          return null;
        }

        var summaryColumns = [
          { key: 'split', label: 'Split', numeric: false },
          { key: 'programs', label: 'Programs', numeric: true },
          { key: 'O2', label: '-O2', numeric: true, swatch: getSwatch('O2') },
          { key: 'O3', label: '-O3', numeric: true, swatch: getSwatch('O3') },
          { key: 'Oz', label: '-Oz', numeric: true, swatch: getSwatch('Oz') },
          { key: 'random', label: 'Random', numeric: true, swatch: getSwatch('random') },
          { key: 'best_fixed', label: 'Best fixed', numeric: true, swatch: getSwatch('best_fixed') },
          { key: 'dense', label: 'RL dense', numeric: true, swatch: getSwatch('dense') },
          { key: 'sparse', label: 'RL sparse', numeric: true, swatch: getSwatch('sparse') },
          { key: 'long_dense', label: 'RL dense 2000', numeric: true, swatch: getSwatch('long_dense') },
          { key: 'long_sparse', label: 'RL sparse 2000', numeric: true, swatch: getSwatch('long_sparse') }
        ];

        var formattedSummaryRows = summaryTableRows.map(function (e) {
          return {
            _splitKey: e.split,
            split: SPLIT_TITLE[e.split] || e.split,
            programs: App.fmt.int(e.programs),
            O2: App.fmt.pct(e.O2),
            O3: App.fmt.pct(e.O3),
            Oz: App.fmt.pct(e.Oz),
            random: App.fmt.pct(e.random),
            best_fixed: App.fmt.pct(e.best_fixed),
            dense: App.fmt.pct(e.dense_mean) + ' \u00b1 ' + App.fmt.pct(e.dense_sd),
            sparse: App.fmt.pct(e.sparse_mean) + ' \u00b1 ' + App.fmt.pct(e.sparse_sd),
            long_dense: e.long_dense !== null && e.long_dense !== undefined ? App.fmt.pct(e.long_dense) : '-',
            long_sparse: e.long_sparse !== null && e.long_sparse !== undefined ? App.fmt.pct(e.long_sparse) : '-'
          };
        });

        var summaryDesktopTable = App.ui.table({
          caption: 'Size reduction versus -O0 (geometric mean of final over -O0 instruction counts); higher is better. RL columns are the mean \u00b1 standard deviation over seeds.',
          columns: summaryColumns,
          rows: formattedSummaryRows,
          selected: function (r) {
            return r._splitKey === activeSplit;
          },
          phone: 'scroll'
        });

        var currentSummaryRow = formattedSummaryRows.filter(function (r) {
          return r._splitKey === activeSplit;
        })[0] || {};

        var summaryPhoneKv = App.ui.kv([
          { key: 'Split', value: currentSummaryRow.split || '-' },
          { key: 'Programs', value: currentSummaryRow.programs || '-' },
          { key: '-O2', value: currentSummaryRow.O2 || '-' },
          { key: '-O3', value: currentSummaryRow.O3 || '-' },
          { key: '-Oz', value: currentSummaryRow.Oz || '-' },
          { key: 'Random', value: currentSummaryRow.random || '-' },
          { key: 'Best fixed', value: currentSummaryRow.best_fixed || '-' },
          { key: 'RL dense', value: currentSummaryRow.dense || '-' },
          { key: 'RL sparse', value: currentSummaryRow.sparse || '-' },
          { key: 'RL dense 2000', value: currentSummaryRow.long_dense || '-' },
          { key: 'RL sparse 2000', value: currentSummaryRow.long_sparse || '-' }
        ]);

        var summaryCardBody = App.h('div', { class: 'summary-card-container' },
          isPhoneMode ? summaryPhoneKv : summaryDesktopTable
        );

        var summaryCard = App.ui.card({
          title: 'Summary by split',
          body: summaryCardBody,
          span: 12
        });

        // Assemble view
        mainContainer.appendChild(headerEl);
        mainContainer.appendChild(filterRowEl);
        mainContainer.appendChild(kpisEl);
        mainContainer.appendChild(App.ui.grid(chartCard, evidenceCard, wtlCard, summaryCard));
      }

      renderContent();

      App.onLayout(function () {
        renderContent();
      });

      return mainContainer;
    }
  });
})();
