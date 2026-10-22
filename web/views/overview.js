/* Overview route. Shows the summary by split table built with App.ui.
   Plan 08-05 completes the full Overview view. */
(function () {
  'use strict';

  var SPLIT_ORDER = ['test', 'val', 'train'];
  var SPLIT_LABEL = { test: 'Test', val: 'Validation', train: 'Train' };

  App.register('overview', {
    title: 'Overview',
    render: function (data) {
      var rows = SPLIT_ORDER
        .map(function (s) {
          return data.summary.filter(function (e) { return e.split === s; })[0];
        })
        .filter(Boolean);

      var columns = [
        { key: 'split', label: 'Split', numeric: false },
        { key: 'programs', label: 'Programs', numeric: true },
        { key: 'O2', label: '-O2', numeric: true },
        { key: 'O3', label: '-O3', numeric: true },
        { key: 'Oz', label: '-Oz', numeric: true },
        { key: 'random', label: 'Random', numeric: true },
        { key: 'best_fixed', label: 'Best fixed', numeric: true },
        { key: 'dense', label: 'RL dense', numeric: true },
        { key: 'sparse', label: 'RL sparse', numeric: true }
      ];

      var formattedRows = rows.map(function (e) {
        return {
          split: SPLIT_LABEL[e.split] || e.split,
          programs: App.fmt.int(e.programs),
          O2: App.fmt.pct(e.O2),
          O3: App.fmt.pct(e.O3),
          Oz: App.fmt.pct(e.Oz),
          random: App.fmt.pct(e.random),
          best_fixed: App.fmt.pct(e.best_fixed),
          dense: App.fmt.pct(e.dense_mean) + ' \u00b1 ' + App.fmt.pct(e.dense_sd),
          sparse: App.fmt.pct(e.sparse_mean) + ' \u00b1 ' + App.fmt.pct(e.sparse_sd)
        };
      });

      var tableCard = App.ui.card({
        title: 'Summary by split',
        body: App.ui.table({
          caption: 'Size reduction versus -O0 (geometric mean of final over -O0 instruction counts); higher is better. RL columns are the mean \u00b1 standard deviation over seeds.',
          columns: columns,
          rows: formattedRows,
          phone: 'scroll'
        }),
        span: 12
      });

      return App.h('div', null,
        App.h('h1', null, 'Overview'),
        App.ui.grid(tableCard));
    }
  });
})();
