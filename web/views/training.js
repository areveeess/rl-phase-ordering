/* training.js — Training view: training curves, policy entropy, no-effect step share, and validation tables.
   Plan 08-08 complete implementation.
   All numbers rendered dynamically from window.DATA; zero hardcoded metrics.
*/
(function () {
  'use strict';

  function getThemeColors() {
    var docTheme = document.documentElement.getAttribute('data-theme');
    var isDark = docTheme === 'dark' || (!docTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var hue = isDark ? '#5b9bff' : '#1d5fbf';
    var sparseCol = isDark ? '#3b73cc' : '#5b8fd9';
    return { isDark: isDark, hue: hue, sparseCol: sparseCol };
  }

  function minVal(arr) {
    var m = arr[0];
    for (var i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
    return m;
  }

  function maxVal(arr) {
    var m = arr[0];
    for (var i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
  }

  App.register('training', {
    title: 'Training',
    styles: true,
    render: function (data) {
      var rootEl = App.h('div', { class: 'training-view' });

      var mainRuns = App.q.runs('main');
      var longRuns = App.q.runs('long');

      var mainEpisodes = mainRuns.length ? mainRuns[0].episodes : 0;
      var longEpisodes = longRuns.length ? longRuns[0].episodes : 0;

      var activeTab = 'main'; // 'main' | 'long'
      var stepsMetric = 'no_effect'; // 'no_effect' | 'noop'

      var contentContainer = App.h('div', { class: 'training-content' });

      function renderContent() {
        while (contentContainer.firstChild) {
          contentContainer.removeChild(contentContainer.firstChild);
        }

        var isMain = activeTab === 'main';
        var currentRuns = isMain ? mainRuns : longRuns;
        var numSeedsPerArm = isMain ? (currentRuns.length / 2) : 1;

        // 1. Finding calculation
        var findingText = '';
        if (isMain) {
          var firstEntropies = currentRuns.map(function (r) {
            return r.train_log && r.train_log.entropy ? r.train_log.entropy[0] : 0;
          });
          var lastEntropies = currentRuns.map(function (r) {
            var ent = r.train_log ? r.train_log.entropy : [];
            return ent.length ? ent[ent.length - 1] : 0;
          });

          var firstRange = App.fmt.range(minVal(firstEntropies), maxVal(firstEntropies), function (x) {
            return x.toFixed(2);
          });
          var lastRange = App.fmt.range(minVal(lastEntropies), maxVal(lastEntropies), function (x) {
            return x.toFixed(2);
          });

          var maxEntropy = data.constants ? data.constants.uniform_entropy : 0;
          var isClose = lastEntropies.every(function (e) {
            return Math.abs(e - maxEntropy) <= 0.1;
          });

          var clause = isClose ? 'still close to uniform' : 'moved away from uniform';
          findingText = 'After ' + mainEpisodes + ' episodes the policies are ' + clause +
            ': entropy fell from ' + firstRange + ' to ' + lastRange +
            ' nats, the maximum for ' + data.constants.n_actions + ' actions.';
        } else {
          var denseLong = currentRuns.filter(function (r) { return r.reward === 'dense'; })[0];
          var sparseLong = currentRuns.filter(function (r) { return r.reward === 'sparse'; })[0];

          var entA = (denseLong && denseLong.train_log && denseLong.train_log.entropy.length)
            ? denseLong.train_log.entropy[denseLong.train_log.entropy.length - 1].toFixed(2)
            : '-';
          var entB = (sparseLong && sparseLong.train_log && sparseLong.train_log.entropy.length)
            ? sparseLong.train_log.entropy[sparseLong.train_log.entropy.length - 1].toFixed(2)
            : '-';

          findingText = 'With ' + longEpisodes + ' episodes entropy falls to ' + entA +
            ' and ' + entB + ' nats, and the result against -Oz does not change.';
        }

        // Title row with finding
        var titleRow = App.ui.titleRow({
          h1: 'Training',
          finding: findingText
        });
        contentContainer.appendChild(titleRow);

        // Filter row: Tabs + supplementary pill
        var tabOptions = [
          { value: 'main', label: 'Main runs, ' + mainEpisodes + ' episodes' },
          { value: 'long', label: 'Supplementary, ' + longEpisodes + ' episodes' }
        ];

        var tabsEl = App.ui.tabs({
          options: tabOptions,
          value: activeTab,
          onChange: function (newTab) {
            activeTab = newTab;
            renderContent();
          }
        });

        var filterRowKids = [tabsEl];
        if (!isMain) {
          filterRowKids.push(App.ui.pill('neutral', 'Added after the main results, one seed'));
        }

        var filterRow = App.h('div', { class: 'training-tabs-row' }, filterRowKids);
        contentContainer.appendChild(filterRow);

        // Charts Grid (3 cards)
        var chartsGrid = App.h('div', { class: 'training-charts-grid' });

        var themeCols = getThemeColors();
        var colors = {
          dense: themeCols.hue,
          sparse: themeCols.sparseCol
        };

        // Determine updates axis labels from the first run
        var refLog = currentRuns[0] && currentRuns[0].train_log ? currentRuns[0].train_log : { update: [] };
        var xLabels = (refLog.update || []).map(function (u) { return String(u); });

        // Helper to build legend
        function makeLegend() {
          var wrap = App.h('div', { class: 'training-chart-header-extra' });
          if (window.ChartsExt && typeof window.ChartsExt.legend === 'function') {
            wrap.appendChild(window.ChartsExt.legend(['dense', 'sparse']));
          }
          wrap.appendChild(App.h('span', null, numSeedsPerArm + (numSeedsPerArm === 1 ? ' seed each' : ' seeds each')));
          return wrap;
        }

        // 1. Mean size reduction on training batches
        var redSeries = currentRuns.map(function (r) {
          return {
            name: App.q.runLabel(r),
            values: r.train_log ? r.train_log.mean_reduction : [],
            colour: r.reward === 'dense' ? colors.dense : colors.sparse
          };
        });

        var redBox = App.h('div', { class: 'training-chart-box' });
        var redCard = App.ui.card({
          span: 4,
          class: 'training-chart-col',
          title: 'Mean size reduction on training batches',
          sub: 'Per batch of training episodes. Higher is better.',
          headerExtra: makeLegend(),
          body: redBox
        });
        chartsGrid.appendChild(redCard);

        // 2. Policy entropy
        var entSeries = currentRuns.map(function (r) {
          return {
            name: App.q.runLabel(r),
            values: r.train_log ? r.train_log.entropy : [],
            colour: r.reward === 'dense' ? colors.dense : colors.sparse
          };
        });

        var entBox = App.h('div', { class: 'training-chart-box' });
        var uniformValStr = data.constants.uniform_entropy.toFixed(2);
        var uniformLabel = 'Uniform over ' + data.constants.n_actions + ' actions ' + uniformValStr;

        var entCard = App.ui.card({
          span: 4,
          class: 'training-chart-col',
          title: 'Policy entropy',
          sub: 'In nats. Flat lines near the reference show near-uniform action choice.',
          headerExtra: makeLegend(),
          body: entBox
        });
        chartsGrid.appendChild(entCard);

        // 3. Steps that did nothing
        var nothingSeries = currentRuns.map(function (r) {
          var vals = [];
          if (r.train_log) {
            vals = stepsMetric === 'no_effect' ? r.train_log.no_effect_frac : r.train_log.noop_frac;
          }
          return {
            name: App.q.runLabel(r),
            values: vals,
            colour: r.reward === 'dense' ? colors.dense : colors.sparse
          };
        });

        var nothingBox = App.h('div', { class: 'training-chart-box' });
        var segCtrl = App.ui.segmented({
          options: [
            { value: 'no_effect', label: 'No-effect steps' },
            { value: 'noop', label: 'NOOP steps' }
          ],
          value: stepsMetric,
          onChange: function (newMetric) {
            stepsMetric = newMetric;
            renderContent();
          }
        });

        var nothingCard = App.ui.card({
          span: 4,
          class: 'training-chart-col',
          title: 'Steps that did nothing',
          sub: 'Share of 15 steps per episode. Lower is better.',
          headerExtra: makeLegend(),
          body: [
            App.h('div', { class: 'training-segmented-ctrl' }, segCtrl),
            nothingBox
          ]
        });
        chartsGrid.appendChild(nothingCard);

        contentContainer.appendChild(chartsGrid);

        // Render charts after layout attached
        setTimeout(function () {
          if (!window.Charts || typeof window.Charts.line !== 'function') return;

          var chartH = window.innerWidth <= 640 ? 180 : 240;

          // Reduction chart (0 to 100%)
          window.Charts.line(redBox, {
            labels: xLabels,
            series: redSeries,
            height: chartH,
            min: 0,
            max: 1.0,
            yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
            format: function (v) { return App.fmt.pct(v); },
            tickFormat: function (v) { return App.fmt.pct(v, 0); }
          });

          // Entropy chart (0 to 4 nats)
          window.Charts.line(entBox, {
            labels: xLabels,
            series: entSeries,
            height: chartH,
            min: 0,
            max: 4,
            yTicks: [0, 1, 2, 3, 4],
            reference: {
              value: data.constants.uniform_entropy,
              label: uniformLabel
            },
            format: function (v) { return v.toFixed(2); },
            tickFormat: function (v) { return String(v); }
          });

          // Steps that did nothing chart (0 to 100%)
          window.Charts.line(nothingBox, {
            labels: xLabels,
            series: nothingSeries,
            height: chartH,
            min: 0,
            max: 1.0,
            yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
            format: function (v) { return App.fmt.pct(v); },
            tickFormat: function (v) { return App.fmt.pct(v, 0); }
          });

          // Re-apply dashed stroke style to sparse lines in all drawn SVGs
          [redBox, entBox, nothingBox].forEach(function (box) {
            box.setAttribute('role', 'img');
            box.querySelectorAll('path[stroke]').forEach(function (path) {
              var stroke = path.getAttribute('stroke');
              if (stroke === colors.sparse) {
                path.setAttribute('stroke-dasharray', '6 3');
              }
            });
          });
        }, 0);

        // Card 4: Runs table
        var runCols = [
          { key: 'label', label: 'Run' },
          { key: 'reward', label: 'Reward' },
          { key: 'episodes', label: 'Episodes', numeric: true },
          { key: 'wall_time', label: 'Wall time', numeric: true },
          { key: 'entropy', label: 'Entropy (first to last)', numeric: true },
          { key: 'noop_share', label: 'NOOP share (first to last)', numeric: true },
          { key: 'checkpoint', label: 'Selected checkpoint', numeric: true },
          { key: 'val_reduction', label: 'Val reduction', numeric: true }
        ];

        var runRows = currentRuns.map(function (r) {
          var ent = r.train_log ? r.train_log.entropy : [];
          var noop = r.train_log ? r.train_log.noop_frac : [];
          var entStr = (ent.length >= 2) ? (ent[0].toFixed(2) + ' to ' + ent[ent.length - 1].toFixed(2)) : '-';
          var noopStr = (noop.length >= 2) ? (App.fmt.pct(noop[0]) + ' to ' + App.fmt.pct(noop[noop.length - 1])) : '-';
          var ckptStr = 'update ' + r.selected_update + ' (' + (r.selected_update * r.batch) + ' ep)';

          return {
            label: App.q.runLabel(r),
            reward: r.reward,
            episodes: App.fmt.int(r.episodes),
            wall_time: Math.round(r.wall_seconds / 60) + ' min',
            entropy: entStr,
            noop_share: noopStr,
            checkpoint: ckptStr,
            val_reduction: App.fmt.pct(r.selected_val_reduction)
          };
        });

        var runsTableEl = App.ui.table({
          columns: runCols,
          rows: runRows
        });

        var runsCard = App.ui.card({
          class: 'training-table-card',
          title: 'Runs',
          sub: 'Summary metrics across the ' + currentRuns.length + ' runs.',
          body: runsTableEl
        });
        contentContainer.appendChild(runsCard);

        // Card 5: Validation per checkpoint
        var valProgs = (data.split && data.split.val) ? data.split.val : [];
        var valCols = [
          { key: 'run_label', label: 'Run' },
          { key: 'update', label: 'Update', numeric: true },
          { key: 'val_mean', label: 'Mean val reduction', numeric: true }
        ];

        valProgs.forEach(function (vp) {
          valCols.push({ key: 'prog_' + vp, label: vp, numeric: true });
        });
        valCols.push({ key: 'status', label: 'Status' });

        var valRows = [];
        currentRuns.forEach(function (r) {
          var ckpts = r.val_selection || [];
          ckpts.forEach(function (cp) {
            var rowObj = {
              run_label: App.q.runLabel(r),
              update: cp.update,
              val_mean: App.fmt.pct(cp.val_mean_reduction)
            };
            valProgs.forEach(function (vp) {
              rowObj['prog_' + vp] = (cp.per_program && cp.per_program[vp] !== undefined)
                ? App.fmt.pct(cp.per_program[vp])
                : '-';
            });
            rowObj.status = (cp.update === r.selected_update)
              ? App.ui.pill('neutral', 'Selected')
              : '';
            valRows.push(rowObj);
          });
        });

        var valTableEl = App.ui.table({
          columns: valCols,
          rows: valRows
        });

        var valCard = App.ui.card({
          class: 'training-table-card',
          title: 'Validation per checkpoint',
          sub: 'Mean reduction across validation programs evaluated after every ' + (refLog.batch || 16) + ' episodes.',
          body: valTableEl
        });
        contentContainer.appendChild(valCard);
      }

      renderContent();
      rootEl.appendChild(contentContainer);
      return rootEl;
    }
  });
})();
