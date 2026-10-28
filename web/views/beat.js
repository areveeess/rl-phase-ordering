/* web/views/beat.js — "Beat the agent": the Live run tab's second mode (#/live/beat).
 * The reader picks up to 15 passes, the live server applies them in CompilerGym (POST /api/sequence),
 * and the standings set that measured count against the agent's stored greedy result and LLVM's
 * pipelines, all read from web/data.json. Nothing here is a typed figure.
 * Uses App.liveServer (exported by live.js) for the server base, status and probe.
 */
(function () {
  'use strict';

  var h = App.h;
  var MAX = 15;

  var beat = {
    program: '',
    opponent: '',
    passes: [],
    status: 'idle', // 'idle' | 'running' | 'done' | 'error' | 'busy' | 'bad_request' | 'lost'
    ran: null,      // { program, opponent, passes, o0, steps: [{pass, count, no_effect}], final, seconds }
    error: '',
    startTime: 0,
    timer: null
  };

  var root = null;

  function server() { return App.liveServer || { state: { status: 'offline' } }; }

  function actions() {
    var st = server().state;
    if (st.availableActions && st.availableActions.length) return st.availableActions;
    var c = (window.DATA && window.DATA.constants) || {};
    return (c.passes || []).concat(c.noop ? [c.noop] : []);
  }

  function splitPrograms() {
    var sp = (window.DATA && window.DATA.split) || {};
    return { test: sp.test || [], val: sp.val || [], train: sp.train || [] };
  }

  function agentRow(runId, program) {
    var rows = App.q.evalRows({ run: runId, benchmark: program });
    return rows.length ? rows[0] : null;
  }

  function opponents(program) {
    return App.q.runs().filter(function (r) { return agentRow(r.id, program); });
  }

  function ensureDefaults() {
    var sp = splitPrograms();
    if (!beat.program) beat.program = server().state.selectedProgram || sp.test[0] || sp.val[0] || sp.train[0] || '';
    var opp = opponents(beat.program);
    var ids = opp.map(function (r) { return r.id; });
    if (ids.indexOf(beat.opponent) === -1) {
      var sparse = opp.filter(function (r) { return r.group === 'main' && r.reward === 'sparse'; });
      beat.opponent = (sparse[0] || opp[0] || {}).id || '';
    }
  }

  /* ---- server call: stream NDJSON from POST /api/sequence ---- */
  function runSequence() {
    if (beat.status === 'running' || !beat.passes.length) return;
    var st = server().state;
    if (st.status === 'offline' || st.status === 'checking' || st.status === 'running') return;

    beat.status = 'running';
    beat.error = '';
    beat.ran = { program: beat.program, opponent: beat.opponent, passes: beat.passes.slice(), o0: null, steps: [], final: null, seconds: 0 };
    beat.startTime = Date.now();
    clearInterval(beat.timer);
    beat.timer = setInterval(function () {
      var el = document.getElementById('beat-timer');
      if (el) el.textContent = 'Elapsed: ' + Math.floor((Date.now() - beat.startTime) / 1000) + 's';
    }, 500);
    redraw();

    var base = st.serverBase;
    var url = base ? (base.replace(/\/$/, '') + '/api/sequence') : 'api/sequence';
    var finished = false;

    function stop(status) {
      clearInterval(beat.timer);
      if (status) beat.status = status;
      redraw();
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program: beat.ran.program, passes: beat.ran.passes })
    }).then(function (res) {
      if (res.status === 409) return stop('busy');
      if (res.status === 400 || res.status === 404) return stop('bad_request');
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      function pump() {
        reader.read().then(function (chunk) {
          if (chunk.done) {
            if (!finished && beat.status === 'running') stop('lost');
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var ev;
            try { ev = JSON.parse(line); } catch (e) { return; }
            if (ev.type === 'done' || ev.type === 'error') finished = true;
            onEvent(ev);
          });
          pump();
        }).catch(function () {
          if (beat.status === 'running') stop('lost');
        });
      }
      pump();
    }).catch(function () {
      stop('lost');
      if (typeof server().probe === 'function') server().probe();
    });
  }

  function onEvent(ev) {
    if (!ev || typeof ev.type !== 'string' || !beat.ran) return;
    if (ev.type === 'start') {
      beat.ran.o0 = typeof ev.o0 === 'number' ? ev.o0 : null;
    } else if (ev.type === 'step') {
      beat.ran.steps.push({ pass: String(ev.pass || ''), count: Number(ev.count), no_effect: !!ev.no_effect });
      App.announce('Stop ' + beat.ran.steps.length + ' of ' + beat.ran.passes.length + ': ' + ev.pass + ', ' + ev.count + ' instructions.');
    } else if (ev.type === 'done') {
      clearInterval(beat.timer);
      beat.ran.final = typeof ev.final === 'number' ? ev.final : null;
      beat.ran.seconds = Math.floor((Date.now() - beat.startTime) / 1000);
      beat.status = 'done';
      var verdict = standings().headline;
      if (verdict) App.announce(verdict);
    } else if (ev.type === 'error') {
      clearInterval(beat.timer);
      beat.status = 'error';
      beat.error = String(ev.message || 'Unknown error').slice(0, 200);
    }
    redraw();
  }

  /* ---- standings: every row comes from web/data.json except "Your route" (measured now) ---- */
  function standings() {
    var prog = App.q.program(beat.ran && beat.status === 'done' ? beat.ran.program : beat.program);
    var oppId = beat.ran && beat.status === 'done' ? beat.ran.opponent : beat.opponent;
    var rows = [];
    if (!prog) return { rows: rows, headline: '' };
    var ag = agentRow(oppId, prog.name);
    if (ag && typeof ag.final === 'number') rows.push({ key: 'agent', label: 'The agent: ' + App.q.runLabel(oppId), count: ag.final, src: 'stored' });
    rows.push({ key: 'Oz', label: '-Oz (LLVM, full pipeline)', count: prog.Oz, src: 'stored' });
    rows.push({ key: 'O2', label: '-O2 (LLVM)', count: prog.O2, src: 'stored' });
    rows.push({ key: 'O3', label: '-O3 (LLVM)', count: prog.O3, src: 'stored' });
    if (typeof prog.best_fixed === 'number') rows.push({ key: 'best', label: 'Best fixed sequence', count: prog.best_fixed, src: 'stored' });
    rows.push({ key: 'O0', label: '-O0 (no optimisation)', count: prog.O0, src: 'stored' });

    var you = null;
    if (beat.status === 'done' && beat.ran && typeof beat.ran.final === 'number') {
      you = { key: 'you', label: 'Your route', count: beat.ran.final, src: 'live' };
      rows.push(you);
    }
    rows = rows.filter(function (r) { return typeof r.count === 'number'; });
    rows.sort(function (a, b) { return a.count - b.count || (a.key === 'you' ? -1 : b.key === 'you' ? 1 : 0); });

    var headline = '';
    var detail = '';
    if (you) {
      var agentCount = ag ? ag.final : null;
      if (agentCount !== null) {
        var d = agentCount - you.count;
        headline = d > 0 ? 'You beat the agent by ' + App.fmt.int(d) + ' instructions.'
          : d < 0 ? 'The agent wins by ' + App.fmt.int(-d) + ' instructions.'
          : 'A tie with the agent: both end at ' + App.fmt.int(you.count) + ' instructions.';
      }
      var oz = prog.Oz - you.count;
      detail = oz > 0 ? 'You also beat -Oz, by ' + App.fmt.int(oz) + '.'
        : oz < 0 ? '-Oz is still ' + App.fmt.int(-oz) + ' lower.'
        : 'You match -Oz exactly.';
    }
    return { rows: rows, you: you, headline: headline, detail: detail };
  }

  /* ---- drawing ---- */
  function redraw() {
    if (!root || !root.isConnected) return;
    var focusKey = document.activeElement && document.activeElement.getAttribute
      ? document.activeElement.getAttribute('data-focus') : null;
    var next = build();
    root.replaceWith(next);
    root = next;
    if (focusKey) {
      var el = root.querySelector('[data-focus="' + focusKey + '"]');
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  function setPasses(list) {
    beat.passes = list.slice(0, MAX);
    if (beat.status !== 'running') { beat.status = 'idle'; beat.ran = null; }
    redraw();
  }

  function routeSlots(running) {
    var showRan = beat.ran && (beat.status === 'running' || beat.status === 'done' || beat.status === 'error' || beat.status === 'lost');
    var list = showRan ? beat.ran.passes : beat.passes;
    var cells = [];
    for (var i = 0; i < MAX; i++) {
      var pass = list[i];
      var cls = 'strip-cell beat-slot';
      var kids = [h('code', null, pass ? pass.replace(/^-/, '') : '')];
      var props = { class: cls };
      if (!pass) {
        props.class += ' strip-cell-live-empty';
        cells.push(h('div', props, kids));
        continue;
      }
      if (showRan) {
        var st = beat.ran.steps[i];
        if (!st) props.class += beat.status === 'running' ? ' beat-slot-pending' : ' strip-cell-live-empty';
        else if (st.pass === 'NOOP') props.class += ' strip-cell-noop';
        else if (st.no_effect) props.class += ' strip-cell-unchanged';
        else props.class += ' strip-cell-changed-rl';
        if (beat.status === 'error' && i === beat.ran.steps.length) props.class += ' strip-cell-fail';
        if (st) kids.push(h('span', { class: 'beat-slot-count' }, App.fmt.int(st.count)));
        props.title = pass + (st ? ' (' + App.fmt.int(st.count) + ' instructions' + (st.no_effect ? ', no effect' : '') + ')' : '');
        cells.push(h('div', props, kids));
      } else {
        props.class += ' beat-slot-planned';
        props.type = 'button';
        props['data-focus'] = 'slot-' + i;
        props['aria-label'] = 'Stop ' + (i + 1) + ': ' + pass + '. Remove it';
        props.title = 'Remove ' + pass + (passText(pass) ? '. ' + passText(pass) : '');
        props.disabled = running;
        (function (idx) {
          props.on = { click: function () {
            var next = beat.passes.slice();
            next.splice(idx, 1);
            setPasses(next);
          } };
        })(i);
        cells.push(h('button', props, kids));
      }
    }
    return h('div', { class: 'strip-live beat-route' },
      h('div', { class: 'strip-grid', role: 'list', 'aria-label': 'Your route, ' + list.length + ' of ' + MAX + ' stops' },
        cells.map(function (c) { c.setAttribute('role', 'listitem'); return c; })));
  }

  function passText(name) {
    return (App.passText && App.passText[name]) || '';
  }

  // description line and tooltips for a select (kind: 'program' | 'run'); a no-op if reference.js is missing
  function describe(selectWrap, kind) {
    return App.describe ? App.describe.attach(selectWrap, App.describe[kind]) : selectWrap;
  }

  /* hovering or focusing a pass names what it does in the readout under the palette */
  var PASS_IDLE = 'Point at or focus a pass to read what it does. Every description is also on the Passes and programs page.';

  function palette(running) {
    var full = beat.passes.length >= MAX;
    var readout = h('p', { class: 'beat-pass-readout', id: 'beat-pass-readout', 'aria-live': 'polite' },
      beat.hover ? [h('code', null, beat.hover), ' ' + passText(beat.hover)] : PASS_IDLE);
    function show(name) {
      beat.hover = name;
      while (readout.firstChild) readout.removeChild(readout.firstChild);
      if (name) {
        readout.appendChild(h('code', null, name));
        readout.appendChild(document.createTextNode(' ' + passText(name)));
      } else {
        readout.textContent = PASS_IDLE;
      }
    }
    var buttons = actions().map(function (name) {
      return h('button', {
        type: 'button',
        class: 'beat-pass' + (name === 'NOOP' ? ' beat-pass-noop' : ''),
        'data-focus': 'pass-' + name,
        disabled: running || full,
        title: passText(name),
        'aria-label': 'Add ' + name,
        'aria-describedby': 'beat-pass-readout',
        on: {
          click: function () { setPasses(beat.passes.concat([name])); },
          mouseenter: function () { show(name); },
          focus: function () { show(name); },
          mouseleave: function () { show(null); },
          blur: function () { show(null); }
        }
      }, name);
    });
    return [h('div', { class: 'beat-palette', role: 'group', 'aria-label': 'Passes to add' }, buttons), readout];
  }

  function build() {
    ensureDefaults();
    var st = server().state;
    var online = !(st.status === 'offline' || st.status === 'checking');
    var running = beat.status === 'running';
    var progRow = App.q.program(beat.program);

    /* controls: program and opponent */
    var sp = splitPrograms();
    var progGroups = [['test', 'Test (held out)'], ['val', 'Validation'], ['train', 'Train']]
      .filter(function (g) { return sp[g[0]].length; })
      .map(function (g) { return { label: g[1], options: sp[g[0]] }; });
    var oppRuns = opponents(beat.program);
    var oppGroups = [
      { label: 'Main runs (320 episodes)', options: oppRuns.filter(function (r) { return r.group === 'main'; }) },
      { label: 'Added after the main results, one seed', options: oppRuns.filter(function (r) { return r.group === 'long'; }) }
    ].filter(function (g) { return g.options.length; }).map(function (g) {
      return { label: g.label, options: g.options.map(function (r) { return { value: r.id, label: App.q.runLabel(r) }; }) };
    });

    var controls = h('div', { class: 'live-controls-row' },
      h('div', { class: 'live-control-group' },
        h('span', { class: 'live-control-label' }, 'Program'),
        describe(App.ui.select({ value: beat.program, disabled: running, groups: progGroups,
          onChange: function (v) { beat.program = v; beat.ran = null; beat.status = 'idle'; redraw(); } }), 'program')),
      h('div', { class: 'live-control-group' },
        h('span', { class: 'live-control-label' }, 'Agent to beat'),
        describe(App.ui.select({ value: beat.opponent, disabled: running, groups: oppGroups,
          onChange: function (v) { beat.opponent = v; if (beat.status !== 'running') { beat.ran = null; beat.status = 'idle'; } redraw(); } }), 'run'))
    );

    /* route builder */
    var ag = agentRow(beat.opponent, beat.program);
    var best = (window.DATA && window.DATA.best_fixed_sequence) || [];
    var tools = h('div', { class: 'beat-tools' },
      App.ui.button({ label: 'Remove last', disabled: running || !beat.passes.length,
        onClick: function () { setPasses(beat.passes.slice(0, -1)); } }),
      App.ui.button({ label: 'Clear', disabled: running || !beat.passes.length,
        onClick: function () { setPasses([]); } }),
      App.ui.button({ kind: 'text', label: "Copy the agent's route", disabled: running || !ag,
        onClick: function () { setPasses(ag.sequence); } }),
      App.ui.button({ kind: 'text', label: 'Copy the best fixed sequence', disabled: running || !best.length,
        onClick: function () { setPasses(best); } })
    );

    var runBtn = App.ui.button({
      kind: 'primary',
      label: running ? 'Running...' : 'Run my route',
      disabled: running || !online || !beat.passes.length || st.status === 'running'
    });
    runBtn.setAttribute('data-focus', 'run');
    runBtn.addEventListener('click', runSequence);

    var counter = h('span', { class: 'beat-counter' }, beat.passes.length + ' of ' + MAX + ' stops');
    var routeCard = App.ui.card({
      title: 'Your route',
      sub: 'Add passes in order. Click a stop to take it out. Fewer than ' + MAX + ' stops is allowed.',
      span: 8,
      body: [
        routeSlots(running),
        h('div', { class: 'beat-run-row' }, runBtn, counter),
        tools,
        h('h3', { class: 'beat-palette-title' }, 'The agent\'s ' + actions().length + ' actions')
      ].concat(palette(running), [
        h('p', { class: 'beat-note' },
          'These are the same actions the agent chooses from. -Oz is not a single action: it runs LLVM\'s whole size pipeline.')
      ])
    });

    /* standings */
    var s = standings();
    var resultKids = [];
    if (st.status === 'checking') {
      resultKids.push(h('p', { class: 'live-status-msg' }, 'Checking for the live server...'));
    } else if (!online) {
      resultKids.push(
        h('p', { class: 'live-offline-title' }, "The live server isn't running"),
        h('p', { class: 'live-offline-text' }, 'You can build a route now. To run it, start the server in WSL with python web/server.py and open http://localhost:' + (App.liveServer ? App.liveServer.port() : '8765') + '/#/live/beat.'),
        App.ui.button({ label: 'Check for the server', onClick: function () { if (App.liveServer) App.liveServer.probe(); } })
      );
    } else if (running) {
      var done = beat.ran.steps.length;
      var last = done ? beat.ran.steps[done - 1].count : beat.ran.o0;
      resultKids.push(
        h('p', { class: 'live-status-msg' }, 'Running your route on ' + beat.ran.program + ': stop ' + done + ' of ' + beat.ran.passes.length),
        h('div', { class: 'live-final-count' }, last === null ? '…' : App.fmt.int(last)),
        h('p', { id: 'beat-timer', class: 'live-running-timer' }, 'Elapsed: ' + Math.floor((Date.now() - beat.startTime) / 1000) + 's')
      );
    } else if (beat.status === 'done' && s.headline) {
      var agentWon = s.headline.indexOf('The agent wins') === 0;
      resultKids.push(
        h('p', { class: 'beat-headline' + (agentWon ? ' beat-headline-loss' : '') }, s.headline),
        h('p', { class: 'beat-detail' }, s.detail)
      );
    } else if (beat.status === 'busy') {
      resultKids.push(App.ui.notice({ text: 'Another run is in progress. The server runs one at a time. Try again in a few seconds.' }));
    } else if (beat.status === 'bad_request') {
      resultKids.push(h('p', { class: 'live-error-text' }, "The server refused this route: it doesn't know the program or one of the passes. Reload the page."));
    } else if (beat.status === 'error') {
      resultKids.push(h('p', { class: 'live-error-text' }, 'The run stopped at stop ' + Math.max(1, beat.ran.steps.length + 1) + ': ' + beat.error + '. Nothing was saved.'));
    } else if (beat.status === 'lost') {
      resultKids.push(h('p', { class: 'live-error-text' }, 'Lost the connection to the server. Check the WSL terminal, then run again.'));
    } else {
      resultKids.push(h('p', { class: 'live-ready-prompt' }, 'Build a route and run it. Your measured count joins the table below.'));
    }

    var progLabel = progRow ? progRow.name + ' (' + App.q.splitNoun(progRow.split) + ')' : beat.program;
    var you = s.you;
    var table = App.ui.table({
      caption: 'Standings on ' + progLabel + ', fewest instructions first',
      columns: [
        { key: 'rank', label: '#', numeric: true },
        { key: 'label', label: 'Route' },
        { key: 'count', label: 'Instructions', numeric: true },
        { key: 'vs', label: you ? 'vs you' : '', numeric: true }
      ],
      rows: s.rows.map(function (r) {
        // tied counts share a rank
        var rank = 1 + s.rows.filter(function (o) { return o.count < r.count; }).length;
        var vs = '';
        if (you && r !== you) {
          var d = r.count - you.count;
          vs = d === 0 ? '0' : (d > 0 ? '+' : '−') + App.fmt.int(Math.abs(d));
        }
        return { rank: String(rank), label: r.label, count: App.fmt.int(r.count), vs: vs, _key: r.key };
      }),
      selected: function (row) { return row._key === 'you'; }
    });
    table.classList.add('beat-standings');
    resultKids.push(table);
    resultKids.push(h('p', { class: 'beat-source' },
      (you ? 'Your route: measured just now in CompilerGym (LLVM 10), ' + App.fmt.int(you.count) + ' instructions after ' + beat.ran.passes.length + ' stops' +
        (beat.ran.seconds ? ', in ' + beat.ran.seconds + 's' : '') + '. ' : '') +
      'The agent: its stored greedy result in results/eval.csv (replay-checked; Run a trained policy reproduces it live). ' +
      'LLVM and best fixed sequence: results/baselines.csv and results/sanity_baselines.csv.'));

    var resultCard = App.ui.card({ title: 'Standings', class: 'live-result-card', span: 4, body: resultKids });

    return h('div', { class: 'beat-root' }, controls, App.ui.grid(routeCard, resultCard));
  }

  window.Beat = {
    render: function () {
      root = build();
      return root;
    },
    refresh: redraw
  };
})();
