/* Results route (#/overview): the story-first opening.
   Answers "Did the agent beat LLVM on code size, and can I trust that?" in three numbered
   steps beside the timetable of the chosen split, then the reduction chart, wins/ties/losses,
   the per-split summary and a footnote band. Every figure is computed from window.DATA. */
(function () {
  'use strict';

  var SPLIT_ORDER = ['test', 'val', 'train'];
  var SPLIT_TITLE = { test: 'Held-out test', val: 'Validation', train: 'Training' };
  var REF_ROWS = [
    { key: 'vs_O2', label: '-O2' },
    { key: 'vs_O3', label: '-O3' },
    { key: 'vs_Oz', label: '-Oz' },
    { key: 'vs_best_fixed', label: 'Best fixed sequence' }
  ];
  var h;

  function avg(arr) {
    if (!arr || !arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function span(lo, hi, d) {
    var a = d ? lo.toFixed(d) : String(lo);
    var b = d ? hi.toFixed(d) : String(hi);
    return a === b ? a : a + ' to ' + b;
  }

  function minMax(arr, d) {
    if (!arr || !arr.length) return '0';
    return span(Math.min.apply(null, arr), Math.max.apply(null, arr), d);
  }

  function median(xs) { return App.q.median(xs); }

  App.register('overview', {
    title: 'Results',
    styles: true,
    render: function (data, ctx) {
      h = App.h;
      var rawArg = typeof ctx === 'string' ? ctx : (ctx && ctx.arg ? ctx.arg : null);
      var activeSplit = rawArg ? rawArg.toLowerCase() : 'test';
      if (SPLIT_ORDER.indexOf(activeSplit) === -1) activeSplit = 'test';

      var root = h('div', { class: 'results-view' });

      function draw() {
        while (root.firstChild) root.removeChild(root.firstChild);

        var programs = App.q.programs(activeSplit);
        var n = programs.length;
        var noun = App.q.splitNoun(activeSplit);
        var mainRuns = App.q.runs('main');
        var kMain = mainRuns.length;
        var T = (data.constants && data.constants.episode_len) || 15;
        var nActions = (data.constants && data.constants.n_actions) || 25;
        var uniformEntropy = (data.constants && data.constants.uniform_entropy) || 0;
        var allPrograms = data.programs || [];
        var summary = (data.summary || []).filter(function (s) { return s.split === activeSplit; })[0] || {};

        var w3 = App.q.wtlRange(activeSplit, 'vs_O3', 'main');
        var w2 = App.q.wtlRange(activeSplit, 'vs_O2', 'main');
        var wOz = App.q.wtlRange(activeSplit, 'vs_Oz', 'main');
        var wBf = App.q.wtlRange(activeSplit, 'vs_best_fixed', 'main');
        var losesOz = wOz.hi < wOz.loLoss && summary.dense_mean < summary.Oz && summary.sparse_mean < summary.Oz;
        var losesBf = wBf.hi < wBf.loLoss && summary.dense_mean < summary.best_fixed && summary.sparse_mean < summary.best_fixed;

        /* ---- question and split ---- */
        var head = h('header', { class: 'results-head' },
          h('h1', { class: 'results-question' }, 'Did the agent beat LLVM on code size?'),
          h('p', { class: 'results-standfirst' },
            'A reinforcement-learning agent picks ' + T + ' LLVM passes per program from ' + (nActions - 1) +
            ' size passes. These are its results against LLVM’s fixed pipelines on ' + allPrograms.length +
            ' cBench programs, ' + App.q.programs('test').length + ' of which it never saw in training.')
        );

        var splitControl = App.ui.segmented({
          name: 'results-split',
          label: 'Programs shown',
          options: SPLIT_ORDER.map(function (s) {
            return { value: s, label: SPLIT_TITLE[s] + ' (' + App.q.programs(s).length + ')' };
          }),
          value: activeSplit,
          onChange: function (next) {
            activeSplit = next;
            try { window.history.replaceState(null, '', '#/overview/' + next); } catch (e) {}
            draw();
          }
        });

        /* ---- step 1: the result ---- */
        var resultP = h('p', null,
          'On ' + n + ' ' + noun + ' programs the agent beats -O3 on ' + span(w3.lo, w3.hi) + ' and -O2 on ' +
          span(w2.lo, w2.hi) + (losesOz || losesBf ? ', ' : '.'),
          losesOz || losesBf ? h('strong', { class: 'loss' },
            'but loses to ' + (losesOz && losesBf ? '-Oz and to the best fixed sequence' : losesOz ? '-Oz' : 'the best fixed sequence') +
            ' on ' + span(Math.min(wOz.loLoss, wBf.loLoss), Math.max(wOz.hiLoss, wBf.hiLoss)) + ' of ' + n + '.') : null
        );

        /* ---- step 2: why ---- */
        var collapsed = 0, firstOnly = [];
        mainRuns.forEach(function (r) {
          var ev = App.q.evalRows({ run: r.id });
          var seqs = {};
          ev.forEach(function (e) { seqs[(e.sequence || []).join(',')] = true; });
          if (Object.keys(seqs).length === 1) {
            collapsed++;
            firstOnly.push(ev.filter(function (e) { return e.no_effect === T - 1; }).length);
          }
        });
        var collapsedPass = '';
        var anyCollapsed = mainRuns.filter(function (r) {
          var ev = App.q.evalRows({ run: r.id });
          return ev.length && ev.every(function (e) { return (e.sequence || []).join(',') === (ev[0].sequence || []).join(','); });
        })[0];
        if (anyCollapsed) {
          var s0 = App.q.evalRows({ run: anyCollapsed.id })[0].sequence || [];
          var allSame = s0.every(function (p) { return p === s0[0]; });
          collapsedPass = allSame ? s0[0] : s0.join(' ');
        }
        var firstEnt = [], lastEnt = [];
        mainRuns.forEach(function (r) {
          var ent = r.train_log && r.train_log.entropy;
          if (ent && ent.length) { firstEnt.push(ent[0]); lastEnt.push(ent[ent.length - 1]); }
        });
        var whyP = h('p', null,
          collapsed + ' of ' + kMain + ' policies give the same sequence for every program' +
          (collapsedPass ? ' (' + collapsedPass + ' repeated ' + T + ' times)' : '') + '; on ' + minMax(firstOnly) + ' of ' +
          allPrograms.length + ' programs only the first step changes anything. After ' + App.fmt.int(mainRuns[0] ? mainRuns[0].episodes : 0) +
          ' training episodes the policy is still close to random: entropy went from ' + minMax(firstEnt, 2) + ' to ' + minMax(lastEnt, 2) +
          ' nats, against ' + uniformEntropy.toFixed(2) + ' for a uniform choice.');

        /* ---- step 3: the evidence ---- */
        var ck = data.checks || {};
        var rp = (ck.replay && ck.replay.main) || [0, 0];
        var lli = ck.lli || {};
        var evidP = h('p', null,
          rp[0] + ' of ' + rp[1] + ' greedy sequences replay to the same instruction count from a fresh start; ' +
          'the lli output check matched ' + (lli.match || 0) + ' of the ' + ((lli.match || 0) + (lli.mismatch || 0)) +
          ' it could run' + ((lli.mismatch || 0) ? '' : ', with no mismatch') + '; ' +
          (ck.leakage && ck.leakage.ok ? 'no held-out program was used in training or checkpoint choice; ' : '') +
          'every figure on this page is generated from the result files and checked by ' +
          App.fmt.int(ck.page_numbers ? ck.page_numbers.assertions : 0) + ' assertions.',
          ' ', h('a', { href: '#/checks' }, 'See the checks'));

        var steps = h('ol', { class: 'story-steps' },
          h('li', null, h('h2', null, 'The result'), resultP),
          h('li', null, h('h2', null, 'Why'), whyP, h('a', { href: '#/training' }, 'See the training curves')),
          h('li', null, h('h2', null, 'The evidence'), evidP)
        );

        /* ---- the timetable for this split ---- */
        var medFinal = function (prog, reward) {
          return median(App.q.evalRows({ group: 'main', reward: reward, benchmark: prog }).map(function (e) { return e.final; }));
        };
        var cols = [
          { key: 'name', label: 'Program' },
          { key: 'O0', label: '-O0', numeric: true },
          { key: 'O2', label: '-O2', numeric: true },
          { key: 'O3', label: '-O3', numeric: true },
          { key: 'Oz', label: '-Oz', numeric: true },
          { key: 'best_fixed', label: 'Best fixed', numeric: true },
          { key: 'dense', label: 'RL dense', numeric: true },
          { key: 'sparse', label: 'RL sparse', numeric: true }
        ];
        var rows = programs.map(function (p) {
          var vals = { O2: p.O2, O3: p.O3, Oz: p.Oz, best_fixed: p.best_fixed, dense: medFinal(p.name, 'dense'), sparse: medFinal(p.name, 'sparse') };
          var best = Math.min(vals.O2, vals.O3, vals.Oz, vals.best_fixed, vals.dense, vals.sparse);
          var row = { name: h('a', { href: '#/programs/' + encodeURIComponent(p.name) }, p.name), O0: App.fmt.int(p.O0) };
          Object.keys(vals).forEach(function (k) {
            var cls = [];
            if (vals[k] === best) cls.push('tt-best');
            if ((k === 'dense' || k === 'sparse')) {
              cls.push('tt-rl');
              if (vals[k] > p.Oz) cls.push('tt-loss');
            }
            row[k] = h('span', { class: cls.join(' ') || null }, App.fmt.int(vals[k]));
          });
          return row;
        });
        var timetable = h('section', { class: 'timetable', 'aria-labelledby': 'tt-title' },
          h('div', { class: 'tt-caption' },
            h('div', { class: 'tt-caption-row' },
              h('h2', { id: 'tt-title' }, SPLIT_TITLE[activeSplit] + ' programs: instructions after each method'),
              splitControl),
            h('p', null, 'Fewer is better. Bold is the smallest in each row; red RL figures are larger than -Oz. RL is the median of ' +
              (kMain / 2) + ' seeds.')),
          App.ui.table({ columns: cols, rows: rows, phone: 'scroll' })
        );

        /* ---- one route line under the timetable ---- */
        var denseS0 = App.q.evalRows({ run: 'dense_s0' });
        var counts = {};
        denseS0.forEach(function (e) { counts[e.no_effect] = (counts[e.no_effect] || 0) + 1; });
        var common = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
        var rep = programs.filter(function (p) {
          var e = denseS0.filter(function (x) { return x.benchmark === p.name; })[0];
          return e && String(e.no_effect) === String(common);
        })[0] || programs[0];
        var routeEl = h('div', { class: 'tt-route' });
        var repEval = rep ? denseS0.filter(function (e) { return e.benchmark === rep.name; })[0] : null;
        if (repEval && window.Strip) {
          routeEl.appendChild(h('p', { class: 'tt-route-caption' },
            'Route of ' + App.q.runLabel('dense_s0') + ' on ' + rep.name + ': a filled stop changed the program, a struck one ran through doing nothing.'));
          window.Strip.row(routeEl, {
            label: App.q.runLabel('dense_s0') + ' · ' + rep.name, kind: 'rl', program: rep.name,
            sequence: repEval.sequence, steps: repEval.steps, final: repEval.final, o0: rep.O0, no_effect: repEval.no_effect
          });
          routeEl.appendChild(h('a', { href: '#/programs/' + encodeURIComponent(rep.name) }, 'Open every route for ' + rep.name));
        }

        var opening = h('div', { class: 'results-opening' },
          h('div', { class: 'results-story' }, steps),
          h('div', { class: 'results-table' }, timetable, routeEl));

        /* ---- reduction by method ---- */
        var o0 = {};
        allPrograms.forEach(function (p) { o0[p.name] = p.O0; });
        function runRed(id) {
          var ev = App.q.evalRows({ run: id, split: activeSplit });
          return App.q.reduction(ev.map(function (e) { return e.final; }), ev.map(function (e) { return o0[e.benchmark]; }));
        }
        var methods = [
          { key: 'Oz', label: '-Oz', value: summary.Oz },
          { key: 'best_fixed', label: 'Best fixed sequence', value: summary.best_fixed },
          { key: 'dense', label: 'RL dense', value: summary.dense_mean, seeds: ['dense_s0', 'dense_s1', 'dense_s2'].map(runRed),
            valueText: App.fmt.pct(summary.dense_mean) + ' ± ' + App.fmt.pct(summary.dense_sd) },
          { key: 'sparse', label: 'RL sparse', value: summary.sparse_mean, seeds: ['sparse_s0', 'sparse_s1', 'sparse_s2'].map(runRed),
            valueText: App.fmt.pct(summary.sparse_mean) + ' ± ' + App.fmt.pct(summary.sparse_sd) },
          { key: 'O2', label: '-O2', value: summary.O2 },
          { key: 'O3', label: '-O3', value: summary.O3 },
          { key: 'random', label: 'Random sequence', value: summary.random }
        ].sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
        var chartRows = methods.concat([
          { key: 'long_dense', label: 'RL dense, 2000 episodes', value: summary.long_dense },
          { key: 'long_sparse', label: 'RL sparse, 2000 episodes', value: summary.long_sparse }
        ]);
        var chartEl = h('div', { class: 'results-chart' });
        if (window.ChartsExt && window.ChartsExt.methodBars) {
          window.ChartsExt.methodBars(chartEl, chartRows, {
            mode: 'pct', ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            subheader: { beforeKey: 'long_dense', text: 'Added after the main results, one seed' },
            ariaLabel: 'Size reduction on the ' + n + ' ' + noun + ' programs'
          });
        }
        var chartCard = App.ui.card({
          title: 'Size reduction by method',
          sub: 'Versus -O0: one minus the geometric mean of final over -O0 counts, on the ' + n + ' ' + noun + ' programs. Higher is better; ticks mark each seed.',
          body: chartEl, span: 7
        });

        /* ---- wins, ties, losses ---- */
        var wtlMap = {};
        (data.wtl || []).forEach(function (w) { if (w.split === activeSplit) wtlMap[w.run] = w; });
        var runsAll = data.runs || [];
        var wtlCols = [{ key: 'run', label: 'Run' }].concat(REF_ROWS.map(function (ref) {
          return { key: ref.key, label: 'vs ' + ref.label, numeric: true };
        }));
        var wtlRows = runsAll.map(function (r) {
          var w = wtlMap[r.id];
          var o = { run: App.q.runLabel(r) + (r.group === 'long' ? ' *' : '') };
          REF_ROWS.forEach(function (ref) {
            var t = w ? w[ref.key] : null;
            o[ref.key] = t ? App.fmt.wtl(t) : '-';
          });
          return o;
        });
        var wtlCard = App.ui.card({
          title: 'Wins / ties / losses per program',
          sub: 'Each cell counts programs where the run is smaller / equal / larger than the reference. * Added after the main results, one seed.',
          body: App.ui.table({ columns: wtlCols, rows: wtlRows, phone: 'scroll' }), span: 5
        });

        /* ---- summary by split ---- */
        var sumRows = SPLIT_ORDER.map(function (s) {
          return (data.summary || []).filter(function (e) { return e.split === s; })[0];
        }).filter(Boolean).map(function (e) {
          var opt = function (v) { return v !== null && v !== undefined ? App.fmt.pct(v) : '-'; };
          return {
            _split: e.split, split: SPLIT_TITLE[e.split], programs: App.fmt.int(e.programs),
            O2: App.fmt.pct(e.O2), O3: App.fmt.pct(e.O3), Oz: App.fmt.pct(e.Oz), random: App.fmt.pct(e.random),
            best_fixed: App.fmt.pct(e.best_fixed),
            dense: App.fmt.pct(e.dense_mean) + ' ± ' + App.fmt.pct(e.dense_sd),
            sparse: App.fmt.pct(e.sparse_mean) + ' ± ' + App.fmt.pct(e.sparse_sd),
            long_dense: opt(e.long_dense), long_sparse: opt(e.long_sparse)
          };
        });
        var sumCard = App.ui.card({
          title: 'Size reduction by split',
          sub: 'RL columns are the mean ± standard deviation over seeds; 2000-episode runs were added after the main results, one seed each.',
          body: App.ui.table({
            columns: [
              { key: 'split', label: 'Split' }, { key: 'programs', label: 'Programs', numeric: true },
              { key: 'O2', label: '-O2', numeric: true }, { key: 'O3', label: '-O3', numeric: true },
              { key: 'Oz', label: '-Oz', numeric: true }, { key: 'random', label: 'Random', numeric: true },
              { key: 'best_fixed', label: 'Best fixed', numeric: true }, { key: 'dense', label: 'RL dense', numeric: true },
              { key: 'sparse', label: 'RL sparse', numeric: true }, { key: 'long_dense', label: 'Dense 2000', numeric: true },
              { key: 'long_sparse', label: 'Sparse 2000', numeric: true }
            ],
            rows: sumRows, selected: function (r) { return r._split === activeSplit; }, phone: 'scroll'
          }),
          span: 12
        });

        /* ---- footnote band ---- */
        var ov = ck.overfit || {};
        var longRuns = App.q.runs('long');
        var foot = h('footer', { class: 'results-foot' },
          h('p', null, h('strong', null, 'Budget. '), kMain + ' main runs (' + (kMain / 2) + ' seeds per reward), ' +
            App.fmt.int(mainRuns[0] ? mainRuns[0].episodes : 0) + ' episodes each; ' + longRuns.length + ' supplementary runs of ' +
            App.fmt.int(longRuns[0] ? longRuns[0].episodes : 0) + ' episodes, one seed, added after the main results.'),
          h('p', null, h('strong', null, 'Overfit rule, fixed before the runs. '), 'At least ' + App.fmt.pct(ov.threshold || 0) +
            ' of the -Oz reduction on ' + (ov.rows || []).map(function (r) { return r.benchmark; }).join(', ') + ': ' +
            (ov.ok ? 'passed' : 'failed') + ' (' + (ov.rows || []).map(function (r) { return r.fraction_of_Oz_reduction.toFixed(2); }).join(', ') +
            '). The overfit policy is also a single repeated pass, so the rule proved weak.'),
          h('p', null, h('strong', null, 'Source. '), 'Generated from results/ by scripts/export_web.py on ' + (data.built || '') +
            '; checked by ' + (ck.page_numbers ? ck.page_numbers.script : 'scripts/check_web.py') + '.')
        );

        root.appendChild(head);
        root.appendChild(opening);
        root.appendChild(App.ui.grid(chartCard, wtlCard, sumCard));
        root.appendChild(foot);
      }

      draw();
      App.onLayout(draw);
      return root;
    }
  });
})();
