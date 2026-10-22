/* web/views/method.js — Split and method view ("What was it trained and tested on, and what is the decision problem?")
 * Plan 08-08: Full implementation with dynamic figures from window.DATA.
 */
(function () {
  'use strict';

  var h = App.h;

  function render(main, ctx) {
    var d = window.DATA;
    if (!d || !d.split || !d.constants) {
      return h('div', { class: 'empty' }, 'Method and split data is not available.');
    }

    var split = d.split;
    var consts = d.constants;
    var trainProgs = split.train || [];
    var valProgs = split.val || [];
    var testProgs = split.test || [];
    var totalProgs = (d.programs || []).length;
    var passCount = (consts.passes || []).length;
    var epLength = consts.episode_len || 15;

    // Subline computed
    var sublineText = totalProgs + ' cBench programs, grouped by family so similar programs stay on one side of the split. ' +
      'Each episode applies ' + epLength + ' passes chosen from ' + passCount + ', plus ' + consts.noop + '.';

    var title = App.ui.titleRow({
      h1: 'Split and method',
      finding: sublineText
    });

    // --- Helper to render 32px program rows ---
    function renderSplitList(names) {
      var rows = names.map(function (name) {
        var p = App.q.program(name);
        var o0Str = (p && p.O0 !== undefined) ? App.fmt.int(p.O0) : '-';
        return h('div', { class: 'split-prog-row' },
          h('a', { href: '#/programs/' + name, class: 'split-prog-name' }, name),
          h('span', { class: 'split-prog-o0 num-col n' }, o0Str)
        );
      });
      return h('div', { class: 'split-prog-list' }, rows);
    }

    // 3 columns: Train, Validation, Test
    var trainCard = App.ui.card({
      title: 'Train (' + trainProgs.length + ')',
      sub: 'Initial -O0 instructions',
      span: 4,
      body: renderSplitList(trainProgs)
    });

    var valCard = App.ui.card({
      title: 'Validation (' + valProgs.length + ')',
      sub: 'Initial -O0 instructions',
      span: 4,
      body: renderSplitList(valProgs)
    });

    var testCard = App.ui.card({
      title: 'Test (' + testProgs.length + ')',
      sub: 'Initial -O0 instructions',
      span: 4,
      body: renderSplitList(testProgs)
    });

    // --- Excluded programs card (full width) ---
    var excluded = split.excluded || {};
    var excludedNames = Object.keys(excluded);
    var excludedTrs = excludedNames.map(function (name) {
      return h('tr', null,
        h('td', { class: 'excluded-name-td' }, h('code', null, name)),
        h('td', { class: 'excluded-reason-td' }, excluded[name])
      );
    });

    var excludedTable = h('div', { class: 'table-frame' },
      h('table', { class: 'excluded-table' },
        h('thead', null,
          h('tr', null,
            h('th', { scope: 'col', style: 'width: 200px;' }, 'Excluded program'),
            h('th', { scope: 'col' }, 'Reason dropped before split')
          )
        ),
        h('tbody', null, excludedTrs)
      )
    );

    var excludedCard = App.ui.card({
      title: 'Excluded programs',
      sub: 'Programs in cBench-v1 omitted before split assignment due to runtime instability',
      span: 12,
      body: excludedTable
    });

    // --- Card: The decision problem ---
    var runs = d.runs || [];
    var mainRuns = runs.filter(function (r) { return r.group === 'main'; });
    var longRuns = runs.filter(function (r) { return r.group === 'long'; });
    var sampleMain = mainRuns[0] || {};
    var mainEp = sampleMain.episodes || 320;
    var mainBatch = sampleMain.batch || 16;
    var mainCkpt = sampleMain.checkpoints || 3;

    var mainDenseCount = mainRuns.filter(function (r) { return r.reward === 'dense'; }).length;
    var longDenseCount = longRuns.filter(function (r) { return r.reward === 'dense'; }).length;
    var seedsDesc = mainDenseCount + ' per reward in the main runs, ' + longDenseCount + ' per reward in the 2000-episode runs';

    var passChips = (consts.passes || []).map(function (p) {
      return h('code', { class: 'pass-chip' }, p);
    });
    passChips.push(h('code', { class: 'pass-chip pass-chip-noop' }, consts.noop));

    var actionsVal = h('div', { class: 'actions-container' },
      h('div', { class: 'actions-summary-line' },
        passCount + ' passes plus ' + consts.noop + ' (' + consts.n_actions + ' total)'
      ),
      h('div', { class: 'pass-chips-cloud' }, passChips)
    );

    var gammaStr = (consts.gamma !== undefined) ? consts.gamma.toFixed(1) : '1.0';

    var decisionKv = App.ui.kv([
      ['State', 'IR2Vec flow-aware ' + consts.emb_dim + '-dimensional program vector, L2-normalised, plus ' + (consts.state_dim - consts.emb_dim) + ' size and progress features'],
      ['Actions', actionsVal],
      ['Reward', 'Dense: per-step drop in instruction count over the -O0 count; sparse: the whole-episode drop at the last step; discount \u03B3 = ' + gammaStr],
      ['Episode length', epLength + ' steps'],
      ['Learner', 'REINFORCE with a learned value baseline, hidden size ' + consts.hidden + ', entropy bonus ' + consts.entropy_coef],
      ['Budget', mainEp + ' episodes per main run, batch ' + mainBatch + ', ' + mainCkpt + ' checkpoints chosen on validation'],
      ['Seeds', seedsDesc]
    ]);

    var decisionCard = App.ui.card({
      title: 'The decision problem',
      sub: 'MDP specification and training hyper-parameters',
      span: 6,
      body: decisionKv
    });

    // --- Card: Where to read more ---
    var readItems = [
      {
        name: 'README.md',
        url: 'https://github.com/areveeess/rl-phase-ordering/blob/master/README.md',
        desc: 'Project overview, key results summary, and reproduction commands.'
      },
      {
        name: 'DESIGN.md',
        url: 'https://github.com/areveeess/rl-phase-ordering/blob/master/DESIGN.md',
        desc: 'The MDP specification, action space curation, split design, and evaluation methodology.'
      },
      {
        name: 'SETUP.md',
        url: 'https://github.com/areveeess/rl-phase-ordering/blob/master/SETUP.md',
        desc: 'Environment requirements, WSL configuration, CompilerGym setup, and test runner instructions.'
      },
      {
        name: 'report/Assessment10_RL_Phase_Ordering.docx',
        url: 'https://github.com/areveeess/rl-phase-ordering/raw/master/report/Assessment10_RL_Phase_Ordering.docx',
        desc: 'Complete project report with literature review, empirical analysis, and threat discussions.'
      },
      {
        name: 'Repository (GitHub)',
        url: 'https://github.com/areveeess/rl-phase-ordering',
        desc: 'Source code, reproducible seeds, training logs, verification tests, and static web explorer.'
      }
    ];

    var linkRows = readItems.map(function (item) {
      return h('a', {
        href: item.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'doc-link-card'
      },
        h('div', { class: 'doc-link-title' },
          h('span', { class: 'doc-link-name' }, item.name),
          h('span', { class: 'doc-link-arrow', 'aria-hidden': 'true' }, '\u2197')
        ),
        h('div', { class: 'doc-link-desc' }, item.desc)
      );
    });

    var readMoreCard = App.ui.card({
      title: 'Where to read more',
      sub: 'Project documentation and source code repository',
      span: 6,
      body: h('div', { class: 'doc-links-list' }, linkRows)
    });

    var viewWrap = h('div', { class: 'view-method' },
      title,
      App.ui.grid(trainCard, valCard, testCard),
      App.ui.grid(excludedCard),
      App.ui.grid(decisionCard, readMoreCard)
    );

    return viewWrap;
  }

  App.register('method', {
    title: 'Split and method',
    styles: true,
    render: render
  });
})();
