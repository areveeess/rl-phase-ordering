/* Overview route. Task-1 slice: the "Summary by split" table, every figure read from DATA.summary. */
(function () {
  'use strict';
  var h = App.h;
  var fmt = App.fmt;

  var SPLIT_ORDER = ['test', 'val', 'train'];
  var SPLIT_LABEL = { test: 'Test', val: 'Validation', train: 'Train' };
  var NUM = 'text-align:right;font-variant-numeric:tabular-nums';

  function th(text, numeric) {
    return h('th', { scope: 'col', style: numeric ? NUM : null }, text);
  }

  function summaryTable(summary) {
    var rows = SPLIT_ORDER
      .map(function (s) { return summary.filter(function (e) { return e.split === s; })[0]; })
      .filter(Boolean);
    var head = h('tr', null,
      th('Split'), th('Programs', true), th('-O2', true), th('-O3', true), th('-Oz', true),
      th('Random', true), th('Best fixed', true), th('RL dense', true), th('RL sparse', true));
    var body = rows.map(function (e) {
      function num(x) { return h('td', { style: NUM }, fmt.pct(x)); }
      function rl(mean, sd) { return h('td', { style: NUM }, fmt.pct(mean) + ' ± ' + fmt.pct(sd)); }
      return h('tr', null,
        h('th', { scope: 'row', style: 'text-align:left' }, SPLIT_LABEL[e.split] || e.split),
        h('td', { style: NUM }, fmt.int(e.programs)),
        num(e.O2), num(e.O3), num(e.Oz), num(e.random), num(e.best_fixed),
        rl(e.dense_mean, e.dense_sd), rl(e.sparse_mean, e.sparse_sd));
    });
    return h('div', { class: 'table-frame' },
      h('table', null,
        h('caption', null, 'Size reduction versus -O0 (geometric mean of final over -O0 instruction counts); higher is better. RL columns are the mean ± standard deviation over seeds.'),
        h('thead', null, head),
        h('tbody', null, body)));
  }

  App.register('overview', {
    title: 'Overview',
    render: function (data) {
      return h('div', null,
        h('h1', null, 'Overview'),
        h('section', { 'aria-labelledby': 'summary-heading' },
          h('h2', { id: 'summary-heading' }, 'Summary by split'),
          summaryTable(data.summary)));
    }
  });
})();
