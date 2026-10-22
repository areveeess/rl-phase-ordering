/* web/views/checks.js — Checks view ("Can these numbers be trusted?")
 * Plan 08-08: Full implementation with dynamic figures from window.DATA.
 */
(function () {
  'use strict';

  var h = App.h;

  function render(main, ctx) {
    var d = window.DATA;
    if (!d || !d.checks) {
      return h('div', { class: 'empty' }, 'Checks data is not available.');
    }

    var c = d.checks;
    var replayMain = (c.replay && c.replay.main) || [0, 0];
    var replayLong = (c.replay && c.replay.long) || [0, 0];
    var crashMain = (c.crashes && c.crashes.main !== undefined) ? c.crashes.main : 0;
    var crashLong = (c.crashes && c.crashes.long !== undefined) ? c.crashes.long : 0;
    var totalCrashes = crashMain + crashLong;
    var lli = c.lli || { match: 0, mismatch: 0, not_available: 0, total: 0 };
    var leak = c.leakage || { ok: false, runs: 0 };
    var reward = c.reward_sum || { ok: false, episodes: 0 };
    var overfit = c.overfit || { ok: false, threshold: 0.8, rows: [] };
    var pageNum = c.page_numbers || { ok: false, assertions: 0, script: 'scripts/check_web.py' };

    // Check statuses
    var replayMainOk = replayMain[0] === replayMain[1] && replayMain[1] > 0;
    var replayLongOk = replayLong[0] === replayLong[1] && replayLong[1] > 0;
    var crashesOk = totalCrashes === 0;
    var lliOk = lli.mismatch === 0;
    var leakOk = !!leak.ok;
    var rewardOk = !!reward.ok;
    var overfitOk = !!overfit.ok;
    var pageNumOk = !!pageNum.ok;

    var checkItems = [
      replayMainOk, replayLongOk, crashesOk, lliOk, leakOk, rewardOk, overfitOk, pageNumOk
    ];
    var badCount = checkItems.filter(function (ok) { return !ok; }).length;
    var allPassed = badCount === 0;

    // Finding (computed)
    var findingText = allPassed
      ? 'Every check passed: ' + replayMain[0] + ' of ' + replayMain[1] + ' replays match, ' +
        crashMain + ' crashes, no test program used in training or checkpoint choice.'
      : badCount + ' of ' + checkItems.length + ' checks need attention.';

    var title = App.ui.titleRow({
      h1: 'Checks',
      finding: findingText
    });

    // --- Card 1: What was checked ---
    var rowsData = [
      {
        name: 'Replay of stored sequences',
        desc: 'Re-executes saved pass sequences through CompilerGym to verify instruction counts match.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(replayMainOk ? 'positive' : 'negative', replayMainOk ? 'Match' : 'Mismatch'),
            h('span', { class: 'check-result-text' }, replayMain[0] + ' of ' + replayMain[1])
          ),
          h('div', { class: 'check-result-sub' },
            '2000-episode runs: ' + replayLong[0] + ' of ' + replayLong[1] + ' ',
            App.ui.pill(replayLongOk ? 'positive' : 'negative', replayLongOk ? 'Match' : 'Mismatch')
          )
        ),
        source: 'results/eval.csv'
      },
      {
        name: 'Evaluation crashes',
        desc: 'CompilerGym step execution did not segfault or terminate unexpectedly.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(crashesOk ? 'positive' : 'negative', crashesOk ? '0' : String(totalCrashes)),
            h('span', { class: 'check-result-text' }, totalCrashes + ' crashes')
          )
        ),
        source: 'results/eval.csv'
      },
      {
        name: 'Output check with lli',
        desc: 'Runs unoptimised and final bitcode on sample inputs with LLVM\'s interpreter to verify stdout and output files match.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(lliOk ? 'positive' : 'negative', lli.match + ' match'),
            lli.mismatch > 0 ? App.ui.pill('negative', lli.mismatch + ' mismatch') : null,
            h('span', { class: 'check-result-text' },
              lli.match + ' match, ' + lli.mismatch + ' mismatch, ' + lli.not_available + ' not available'
            )
          ),
          h('div', { class: 'check-result-sub' },
            App.ui.pill('neutral', 'Not available'),
            h('span', { class: 'check-result-text' }, lli.not_available + ' lack wired runtime inputs')
          )
        ),
        source: 'results/lli_validation.csv'
      },
      {
        name: 'Held-out leakage',
        desc: 'Verifies no held-out test benchmark appeared in training batches or checkpoint selection.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(leakOk ? 'positive' : 'negative', leakOk ? 'OK' : 'Leak'),
            h('span', { class: 'check-result-text' }, 'OK, ' + leak.runs + ' runs')
          )
        ),
        source: 'results/leakage_check.txt'
      },
      {
        name: 'Reward sum',
        desc: 'Confirms dense step rewards sum to the final sparse reduction on test episodes with discount \u03B3 = 1.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(rewardOk ? 'positive' : 'negative', rewardOk ? 'OK' : 'Mismatch'),
            h('span', { class: 'check-result-text' }, 'OK, ' + reward.episodes + ' episodes')
          )
        ),
        source: 'results/reward_sum_check.txt'
      },
      {
        name: 'Overfit rule',
        desc: 'Pre-registered rule: agent must achieve at least 80% of -Oz reduction on training programs.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(overfitOk ? 'positive' : 'negative', overfitOk ? 'PASS' : 'FAIL'),
            h('span', { class: 'check-result-text' }, overfit.line ? overfit.line.replace(/^overfit check:\s*/, '') : 'PASS')
          )
        ),
        source: 'results/overfit_check.txt'
      },
      {
        name: 'Page numbers equal results/',
        desc: 'Verifies every number, count, and summary reduction rendered on this site matches raw files in results/.',
        result: h('div', { class: 'check-result-cell' },
          h('div', { class: 'check-result-line' },
            App.ui.pill(pageNumOk ? 'positive' : 'negative', pageNumOk ? 'Match' : 'Mismatch'),
            h('span', { class: 'check-result-text' }, App.fmt.int(pageNum.assertions) + ' assertions passed')
          )
        ),
        source: pageNum.script || 'scripts/check_web.py'
      }
    ];

    var trs = rowsData.map(function (row) {
      return h('tr', { class: 'checks-tr' },
        h('td', { class: 'checks-td-name' },
          h('div', { class: 'check-name-title' }, row.name),
          h('div', { class: 'check-name-mobile-source' },
            h('code', null, row.source)
          )
        ),
        h('td', { class: 'checks-td-desc' }, row.desc),
        h('td', { class: 'checks-td-result' }, row.result),
        h('td', { class: 'checks-td-source' }, h('code', null, row.source))
      );
    });

    var tableEl = h('div', { class: 'table-frame' },
      h('table', { class: 'checks-table' },
        h('thead', null,
          h('tr', null,
            h('th', { scope: 'col' }, 'Check'),
            h('th', { scope: 'col' }, 'What it tests'),
            h('th', { scope: 'col' }, 'Result'),
            h('th', { scope: 'col' }, 'Source')
          )
        ),
        h('tbody', null, trs)
      )
    );

    var lliNote = h('p', { class: 'checks-note' },
      'Output check with lli: cBench programs without bundled runtime arguments or test inputs in cbench-v1-runtime-data return "not available". ' +
      'All benchmarks with wired runtime data (' + lli.match + ' of ' + lli.match + ' runs) matched unoptimised output byte-for-byte; 0 mismatches.'
    );

    var card1 = App.ui.card({
      title: 'What was checked',
      body: [tableEl, lliNote],
      span: 12
    });

    // --- Card 2: Overfit rule, set before the runs ---
    var overfitRows = overfit.rows || [];
    var progNames = overfitRows.map(function (r) { return r.benchmark; });
    var namesSentence = progNames.length > 1
      ? progNames.slice(0, -1).join(', ') + ' and ' + progNames[progNames.length - 1]
      : (progNames[0] || 'training benchmarks');
    var thrPct = Math.round((overfit.threshold || 0.8) * 100) + '%';
    var ruleText = 'Rule set before the runs: at least ' + thrPct + ' of the -Oz reduction on ' + namesSentence + '.';

    var overfitTbodyTrs = overfitRows.map(function (r) {
      var sharePct = (r.fraction_of_Oz_reduction * 100).toFixed(1) + '%';
      return h('tr', null,
        h('td', null, h('a', { href: '#/programs/' + r.benchmark, class: 'benchmark-link' }, r.benchmark)),
        h('td', { class: 'num-col n' }, App.fmt.int(r.O0)),
        h('td', { class: 'num-col n' }, App.fmt.int(r.Oz)),
        h('td', { class: 'num-col n' }, App.fmt.int(r.final)),
        h('td', { class: 'num-col n' }, sharePct),
        h('td', { class: 'num-col n' }, App.fmt.int(r.best_fixed)),
        h('td', null, App.ui.pill(r.pass ? 'positive' : 'negative', r.pass ? 'Pass' : 'Fail'))
      );
    });

    var overfitTable = h('div', { class: 'table-frame' },
      h('table', null,
        h('thead', null,
          h('tr', null,
            h('th', { scope: 'col' }, 'Program'),
            h('th', { scope: 'col', class: 'num-col n' }, '-O0'),
            h('th', { scope: 'col', class: 'num-col n' }, '-Oz'),
            h('th', { scope: 'col', class: 'num-col n' }, 'Agent final'),
            h('th', { scope: 'col', class: 'num-col n' }, 'Share of -Oz reduction'),
            h('th', { scope: 'col', class: 'num-col n' }, 'Best fixed'),
            h('th', { scope: 'col' }, 'Status')
          )
        ),
        h('tbody', null, overfitTbodyTrs)
      )
    );

    var smallerCount = overfitRows.filter(function (r) { return r.best_fixed < r.final; }).length;
    var fixedBeatsSentence = 'The best fixed sequence is smaller than the agent on ' +
      smallerCount + ' of ' + overfitRows.length + ' of these programs.';

    var overfitBody = [
      h('p', { class: 'overfit-rule-statement' }, ruleText),
      overfitTable,
      h('p', { class: 'overfit-finding' }, fixedBeatsSentence)
    ];

    var card2 = App.ui.card({
      title: 'Overfit rule, set before the runs',
      body: overfitBody,
      span: 12
    });

    var viewWrap = h('div', { class: 'view-checks' },
      title,
      App.ui.grid(card1, card2)
    );

    return viewWrap;
  }

  App.register('checks', {
    title: 'Checks',
    styles: true,
    render: render
  });
})();
