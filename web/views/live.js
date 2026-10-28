/* web/views/live.js — Live tab ("Run a trained policy on one program in WSL")
 * Plan 08-09: Complete implementation with probing, streaming, strip, line chart, and result states.
 */
(function () {
  'use strict';

  var h = App.h;
  var s = App.s;

  // State management
  var liveState = {
    status: 'offline', // 'offline' | 'checking' | 'ready' | 'running' | 'busy' | 'done' | 'error' | 'lost'
    serverBase: '',    // Answering base: '' (same-origin) or window.CONFIG.LIVE_BASE
    lastChecked: null,
    selectedRun: '',
    selectedProgram: '',
    availableRuns: [],
    availablePrograms: {},
    episodeLen: 15,
    // Current run telemetry
    runStartTime: 0,
    elapsedSeconds: 0,
    elapsedTimer: null,
    currentRunId: '',
    currentProgram: '',
    o0: 0,
    storedFinal: null,
    steps: [],
    finalCount: null,
    matchStatus: null,
    errorMessage: '',
    errorKind: '',
    errorStep: 0,
    stripComponent: null
  };

  // Helper to get port from CONFIG.LIVE_BASE
  function getLivePort() {
    var base = (window.CONFIG && window.CONFIG.LIVE_BASE) || 'http://127.0.0.1:8765';
    var match = base.match(/:(\d+)/);
    return match ? match[1] : '8765';
  }

  // Probe server health
  function probe(onComplete) {
    liveState.status = 'checking';
    App.setLiveStatus('checking');
    App.announce('Checking for the live server...');

    var defaultBase = (window.CONFIG && window.CONFIG.LIVE_BASE) || 'http://127.0.0.1:8765';

    function tryBase(base, next) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 1500);
      var healthUrl = base ? (base.replace(/\/$/, '') + '/api/health') : 'api/health';

      fetch(healthUrl, { signal: controller.signal })
        .then(function (res) {
          clearTimeout(timer);
          if (res.ok && res.status === 200) {
            return res.json();
          }
          throw new Error('Not 200');
        })
        .then(function (json) {
          if (json && json.service === 'phase-ordering-live') {
            // Keep base and fetch metadata
            liveState.serverBase = base;
            fetchRuns(base, onComplete);
          } else {
            next();
          }
        })
        .catch(function () {
          clearTimeout(timer);
          next();
        });
    }

    // Try same-origin first, then CONFIG.LIVE_BASE
    tryBase('', function () {
      tryBase(defaultBase, function () {
        liveState.status = 'offline';
        liveState.lastChecked = new Date();
        App.setLiveStatus('offline');
        renderView();
        if (typeof onComplete === 'function') onComplete(false);
      });
    });
  }

  function fetchRuns(base, onComplete) {
    var runsUrl = base ? (base.replace(/\/$/, '') + '/api/runs') : 'api/runs';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 1500);

    fetch(runsUrl, { signal: controller.signal })
      .then(function (res) {
        clearTimeout(timer);
        if (res.ok && res.status === 200) return res.json();
        throw new Error('Runs not 200');
      })
      .then(function (json) {
        liveState.status = 'ready';
        liveState.lastChecked = new Date();
        liveState.availableRuns = json.runs || [];
        liveState.availablePrograms = json.programs || {};
        liveState.episodeLen = json.episode_len || 15;

        // Default selections
        if (!liveState.selectedRun && liveState.availableRuns.length) {
          liveState.selectedRun = liveState.availableRuns[0].id;
        }
        if (!liveState.selectedProgram && liveState.availablePrograms.test && liveState.availablePrograms.test.length) {
          liveState.selectedProgram = liveState.availablePrograms.test[0];
        }

        App.setLiveStatus('ready');
        renderView();
        if (typeof onComplete === 'function') onComplete(true);
      })
      .catch(function () {
        clearTimeout(timer);
        liveState.status = 'offline';
        liveState.lastChecked = new Date();
        App.setLiveStatus('offline');
        renderView();
        if (typeof onComplete === 'function') onComplete(false);
      });
  }

  // Active view container ref
  var viewContainer = null;

  function formatTime(d) {
    if (!d) return '--:--:--';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // Execute policy run streaming
  function startRun() {
    if (liveState.status !== 'ready' && liveState.status !== 'done' && liveState.status !== 'busy' && liveState.status !== 'error') return;

    var runId = liveState.selectedRun;
    var prog = liveState.selectedProgram;
    if (!runId || !prog) return;

    liveState.status = 'running';
    liveState.currentRunId = runId;
    liveState.currentProgram = prog;
    liveState.steps = [];
    liveState.finalCount = null;
    liveState.matchStatus = null;
    liveState.errorMessage = '';
    liveState.errorKind = '';
    liveState.errorStep = 0;
    liveState.runStartTime = Date.now();
    liveState.elapsedSeconds = 0;

    if (liveState.elapsedTimer) clearInterval(liveState.elapsedTimer);
    liveState.elapsedTimer = setInterval(function () {
      liveState.elapsedSeconds = Math.floor((Date.now() - liveState.runStartTime) / 1000);
      updateRunningTime();
    }, 500);

    renderView();

    if (liveState.stripComponent) {
      liveState.stripComponent.reset();
    }

    var base = liveState.serverBase;
    var runUrl = base ? (base.replace(/\/$/, '') + '/api/run') : 'api/run';

    fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run: runId, program: prog })
    })
      .then(function (res) {
        console.log('[live] run fetch response status:', res.status);
        if (res.status === 409) {
          liveState.status = 'busy';
          clearInterval(liveState.elapsedTimer);
          renderView();
          return;
        }
        if (res.status === 400 || res.status === 404) {
          liveState.status = 'bad_request';
          clearInterval(liveState.elapsedTimer);
          renderView();
          return;
        }
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var buffer = '';
        var finishedNormally = false;

        function readStream() {
          reader.read().then(function (chunk) {
            if (chunk.done) {
              clearInterval(liveState.elapsedTimer);
              if (!finishedNormally && liveState.status === 'running') {
                liveState.status = 'lost';
                liveState.errorStep = liveState.steps.length;
                App.setLiveStatus('offline');
                renderView();
              }
              return;
            }

            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop(); // keep remainder

            lines.forEach(function (line) {
              line = line.trim();
              if (!line) return;
              try {
                var ev = JSON.parse(line);
                handleStreamEvent(ev);
                if (ev.type === 'done' || ev.type === 'error') {
                  finishedNormally = true;
                }
              } catch (e) {
                /* parse error */
              }
            });

            readStream();
          }).catch(function () {
            clearInterval(liveState.elapsedTimer);
            if (liveState.status === 'running') {
              liveState.status = 'lost';
              liveState.errorStep = liveState.steps.length;
              App.setLiveStatus('offline');
              renderView();
            }
          });
        }

        readStream();
      })
      .catch(function (err) {
        console.log('[live] run network failure:', err && err.message);
        clearInterval(liveState.elapsedTimer);
        liveState.status = 'offline';
        renderView();
        probe();
      });
  }

  function handleStreamEvent(ev) {
    if (!ev || typeof ev.type !== 'string') return;

    if (ev.type === 'start') {
      liveState.o0 = typeof ev.o0 === 'number' ? ev.o0 : 0;
      liveState.storedFinal = typeof ev.stored_final === 'number' ? ev.stored_final : null;
      liveState.episodeLen = typeof ev.episode_len === 'number' ? ev.episode_len : 15;
      updateChart();
    } else if (ev.type === 'step') {
      var stepIdx = typeof ev.index === 'number' ? ev.index : (liveState.steps.length + 1);
      var passName = typeof ev.pass === 'string' ? ev.pass : '';
      var count = typeof ev.count === 'number' ? ev.count : 0;
      var noEffect = !!ev.no_effect;

      var stepObj = {
        index: stepIdx,
        pass: passName,
        count: count,
        no_effect: noEffect
      };
      liveState.steps.push(stepObj);

      if (liveState.stripComponent) {
        liveState.stripComponent.push({
          index: stepIdx - 1,
          pass: passName,
          count: count,
          changed: !noEffect
        });
      }

      updateChart();
      App.announce('Step ' + stepIdx + ' of ' + liveState.episodeLen + ': ' + passName + ', ' + count + ' instructions.');
    } else if (ev.type === 'done') {
      liveState.status = 'done';
      liveState.finalCount = typeof ev.final === 'number' ? ev.final : null;
      liveState.storedFinal = typeof ev.stored_final === 'number' ? ev.stored_final : liveState.storedFinal;
      liveState.matchStatus = ev.match;
      renderView();
    } else if (ev.type === 'error') {
      liveState.status = 'error';
      liveState.errorStep = typeof ev.step === 'number' ? ev.step : liveState.steps.length;
      var rawMsg = typeof ev.message === 'string' ? ev.message : 'Unknown error';
      liveState.errorMessage = rawMsg.slice(0, 200);
      liveState.errorKind = typeof ev.kind === 'string' ? ev.kind : 'other';
      if (liveState.stripComponent && liveState.errorStep > 0) {
        liveState.stripComponent.fail(liveState.errorStep - 1);
      }
      renderView();
    }
  }

  function updateRunningTime() {
    var timerEl = document.getElementById('live-running-timer');
    if (timerEl) {
      timerEl.textContent = 'Elapsed: ' + liveState.elapsedSeconds + 's';
    }
  }

  // Draw instruction count chart
  function updateChart() {
    var container = document.getElementById('live-chart-container');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    var o0 = liveState.o0;
    var stored = liveState.storedFinal;
    var steps = liveState.steps;
    var T = liveState.episodeLen || 15;

    if (!o0) return;

    var counts = [o0];
    for (var i = 0; i < steps.length; i++) {
      counts.push(steps[i].count);
    }

    var minVal = Math.min.apply(null, counts);
    if (stored !== null && stored < minVal) minVal = stored;
    var maxVal = Math.max.apply(null, counts);

    // Padding for chart bounds
    var yMin = Math.floor(minVal * 0.95);
    var yMax = Math.ceil(maxVal * 1.05);
    if (yMin === yMax) yMax += 10;

    var width = 640;
    var height = 180;
    var padL = 60;
    var padR = 20;
    var padT = 20;
    var padB = 30;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;

    function getX(stepIdx) {
      return padL + (stepIdx / T) * plotW;
    }
    function getY(val) {
      return padT + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
    }

    var svgKids = [];

    // Gridlines and Y ticks (3 ticks)
    var ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
    ticks.forEach(function (tVal) {
      var y = getY(tVal);
      svgKids.push(s('line', {
        x1: padL, y1: y, x2: padL + plotW, y2: y,
        stroke: 'var(--grid)', 'stroke-width': 1
      }));
      svgKids.push(s('text', {
        x: padL - 8, y: y + 4,
        'text-anchor': 'end', fill: 'var(--muted)', 'font-size': '11px',
        class: 'chart-tick'
      }, App.fmt.int(tVal)));
    });

    // Reference line at stored_final
    if (stored !== null) {
      var refY = getY(stored);
      svgKids.push(s('line', {
        x1: padL, y1: refY, x2: padL + plotW, y2: refY,
        stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '4 4'
      }));
      svgKids.push(s('text', {
        x: padL + plotW - 4, y: refY - 4,
        'text-anchor': 'end', fill: 'var(--accent)', 'font-size': '11px',
        class: 'chart-tick'
      }, 'Stored final ' + App.fmt.int(stored)));
    }

    // Step 0 to T X labels
    [0, 5, 10, T].forEach(function (st) {
      var x = getX(st);
      svgKids.push(s('text', {
        x: x, y: height - 8,
        'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': '11px',
        class: 'chart-tick'
      }, String(st)));
    });

    // Path connecting counts
    if (counts.length > 1) {
      var pathParts = [];
      counts.forEach(function (cVal, idx) {
        var x = getX(idx);
        var y = getY(cVal);
        pathParts.push((idx === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1));
      });

      svgKids.push(s('path', {
        d: pathParts.join(' '),
        fill: 'none',
        stroke: 'var(--hue)',
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      }));

      // Current point dot
      var lastIdx = counts.length - 1;
      var lastX = getX(lastIdx);
      var lastY = getY(counts[lastIdx]);
      svgKids.push(s('circle', {
        cx: lastX, cy: lastY, r: 3.5,
        fill: 'var(--hue)'
      }));
    }

    var svg = s('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'live-chart-svg',
      role: 'img',
      'aria-label': 'Instruction count by step'
    }, svgKids);

    container.appendChild(svg);
  }

  // --- Render View UI ---
  function renderView() {
    if (!viewContainer) return;
    while (viewContainer.firstChild) viewContainer.removeChild(viewContainer.firstChild);

    var isReady = liveState.status === 'ready' || liveState.status === 'done' || liveState.status === 'busy';
    var isChecking = liveState.status === 'checking';
    var isOffline = liveState.status === 'offline';
    var isRunning = liveState.status === 'running';

    // Title Row
    var runBtn = App.ui.button({
      label: isRunning ? 'Running...' : 'Run policy',
      primary: true,
      disabled: !isReady || isRunning,
      onClick: startRun
    });

    var title = App.ui.titleRow({
      h1: 'Live run',
      finding: 'Run a trained policy on one program in WSL and compare the result with the stored one.',
      actions: runBtn
    });

    // Controls Row (Policy and Program selects)
    var controlsBlock;
    if (isChecking) {
      controlsBlock = h('div', { class: 'live-controls-row' },
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Policy'),
          App.ui.skeleton(220)
        ),
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Program'),
          App.ui.skeleton(220)
        )
      );
    } else if (isOffline) {
      controlsBlock = h('div', { class: 'live-controls-row' },
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Policy'),
          App.ui.select({
            value: 'unavailable',
            disabled: true,
            options: [{ value: 'unavailable', label: 'Unavailable' }]
          })
        ),
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Program'),
          App.ui.select({
            value: 'unavailable',
            disabled: true,
            options: [{ value: 'unavailable', label: 'Unavailable' }]
          })
        )
      );
    } else {
      // Ready / Running / Done: populate options
      var mainRuns = liveState.availableRuns.filter(function (r) { return r.group === 'main'; });
      var longRuns = liveState.availableRuns.filter(function (r) { return r.group === 'long'; });

      var policyGroups = [];
      if (mainRuns.length) {
        policyGroups.push({
          label: 'Main runs (320 episodes)',
          options: mainRuns.map(function (r) { return { value: r.id, label: r.label }; })
        });
      }
      if (longRuns.length) {
        policyGroups.push({
          label: 'Added after the main results, one seed',
          options: longRuns.map(function (r) { return { value: r.id, label: r.label }; })
        });
      }

      var progGroups = [];
      var pSplit = liveState.availablePrograms;
      ['test', 'val', 'train'].forEach(function (sk) {
        if (pSplit[sk] && pSplit[sk].length) {
          var sLabel = sk === 'test' ? 'Test' : (sk === 'val' ? 'Validation' : 'Train');
          progGroups.push({
            label: sLabel,
            options: pSplit[sk].map(function (p) { return { value: p, label: p }; })
          });
        }
      });

      var policySelect = App.ui.select({
        value: liveState.selectedRun,
        disabled: isRunning,
        groups: policyGroups,
        onChange: function (val) {
          liveState.selectedRun = val;
        }
      });

      var progSelect = App.ui.select({
        value: liveState.selectedProgram,
        disabled: isRunning,
        groups: progGroups,
        onChange: function (val) {
          liveState.selectedProgram = val;
        }
      });

      controlsBlock = h('div', { class: 'live-controls-row' },
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Policy'),
          policySelect
        ),
        h('div', { class: 'live-control-group' },
          h('span', { class: 'live-control-label' }, 'Program'),
          progSelect
        )
      );
    }

    // Card 1: Steps (span 8)
    var stripEl = h('div', { class: 'live-strip-wrap' });
    liveState.stripComponent = window.Strip.live(stripEl, { total: liveState.episodeLen || 15 });

    // Pre-populate if steps already exist (e.g. error or done re-render)
    if (liveState.steps.length) {
      liveState.steps.forEach(function (st) {
        liveState.stripComponent.push({
          index: st.index - 1,
          pass: st.pass,
          count: st.count,
          changed: !st.no_effect
        });
      });
      if (liveState.status === 'error' && liveState.errorStep > 0) {
        liveState.stripComponent.fail(liveState.errorStep - 1);
      }
    }

    var chartBox = h('div', { class: 'live-chart-box' },
      h('div', { class: 'live-chart-title' }, 'Instruction count by step'),
      h('div', { id: 'live-chart-container', class: 'live-chart-frame' })
    );

    var stepsPrompt = null;
    if (liveState.status === 'ready' && !liveState.steps.length) {
      stepsPrompt = h('p', { class: 'live-empty-prompt' },
        'Choose a policy and a program, then run it. The ' + (liveState.episodeLen || 15) + ' steps appear here as they finish.'
      );
    }

    var stepsCard = App.ui.card({
      title: 'Steps',
      sub: 'Greedy pass sequence (' + (liveState.episodeLen || 15) + ' steps)',
      span: 8,
      body: [stepsPrompt, stripEl, chartBox].filter(Boolean)
    });

    // Card 2: Result (span 4)
    var resultBody = [];

    if (isOffline) {
      var port = getLivePort();
      resultBody.push(
        h('h3', { class: 'live-offline-title' }, "The live server isn't running"),
        h('p', { class: 'live-offline-text' },
          'The static explorer works offline; the live tab needs the Python server inside WSL.'
        ),
        h('div', { class: 'live-code-block' },
          h('pre', null, h('code', null, 'python web/server.py')),
          h('button', {
            type: 'button',
            class: 'btn btn-secondary live-copy-btn',
            on: {
              click: function (e) {
                var btn = e.target;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText('python web/server.py').then(function () {
                    btn.textContent = 'Copied!';
                    setTimeout(function () { btn.textContent = 'Copy command'; }, 2000);
                  });
                } else {
                  btn.textContent = 'python web/server.py';
                }
              }
            }
          }, 'Copy command')
        ),
        h('p', { class: 'live-offline-hint' },
          'Open http://localhost:' + port + '/ and this tab turns on.'
        ),
        h('div', { class: 'live-offline-actions' },
          App.ui.button({
            label: 'Check for the server',
            onClick: function () { probe(); }
          }),
          h('span', { class: 'live-last-checked' },
            'Last checked ' + formatTime(liveState.lastChecked)
          )
        )
      );
    } else if (isChecking) {
      resultBody.push(
        h('p', { class: 'live-status-msg' }, 'Checking for the live server...'),
        App.ui.skeleton(160)
      );
    } else if (isRunning) {
      resultBody.push(
        h('div', { class: 'live-running-block' },
          h('p', { class: 'live-status-msg' }, 'Running ' + liveState.currentRunId + ' on ' + liveState.currentProgram + '...'),
          h('p', { id: 'live-running-timer', class: 'live-running-timer' }, 'Elapsed: ' + liveState.elapsedSeconds + 's')
        )
      );
    } else if (liveState.status === 'busy') {
      resultBody.push(
        App.ui.notice({
          text: 'Another run is already in progress. The server runs one at a time. Try again in a few seconds.'
        }),
        h('div', { style: 'margin-top: 14px;' },
          App.ui.button({
            label: 'Try the run again',
            onClick: startRun
          })
        )
      );
    } else if (liveState.status === 'bad_request') {
      resultBody.push(
        h('p', { class: 'live-error-text' },
          "The server doesn't know that policy or program. Reload the page to refresh the list."
        ),
        h('div', { style: 'margin-top: 14px;' },
          App.ui.button({
            label: 'Reload data',
            onClick: function () { location.reload(); }
          })
        )
      );
    } else if (liveState.status === 'done') {
      var isLong = liveState.currentRunId.indexOf('long') !== -1;
      var evalCsv = isLong ? 'results/long_eval.csv' : 'results/eval.csv';
      var matchPill = null;
      var matchDetail = '';

      if (liveState.matchStatus === true) {
        matchPill = App.ui.pill('positive', 'Matches the stored result');
        matchDetail = App.fmt.int(liveState.finalCount) + ' instructions, the same as ' + evalCsv + '.';
      } else if (liveState.matchStatus === false) {
        matchPill = App.ui.pill('negative', 'Differs from the stored result');
        var diff = liveState.finalCount - liveState.storedFinal;
        var diffStr = (diff > 0 ? '+' : '') + App.fmt.int(diff);
        matchDetail = 'Live run: ' + App.fmt.int(liveState.finalCount) + '. Stored: ' +
          App.fmt.int(liveState.storedFinal) + '. Difference: ' + diffStr + '. The stored numbers are unchanged.';
      } else {
        matchPill = App.ui.pill('neutral', 'No stored result');
        matchDetail = 'No stored result for this policy and program.';
      }

      var noEffCount = liveState.steps.filter(function (s) { return s.no_effect; }).length;

      resultBody.push(
        h('div', { class: 'live-done-block' },
          h('div', { class: 'live-final-heading' }, 'Final count'),
          h('div', { class: 'live-final-count' }, App.fmt.int(liveState.finalCount)),
          h('div', { class: 'live-match-pill-wrap' }, matchPill),
          h('p', { class: 'live-match-detail' }, matchDetail),
          h('div', { class: 'live-run-meta' },
            noEffCount + ' of ' + liveState.episodeLen + ' no effect · Elapsed: ' + liveState.elapsedSeconds + 's'
          )
        )
      );
    } else if (liveState.status === 'error') {
      var errHeader = liveState.errorKind === 'service'
        ? 'The compiler service stopped responding. Check the WSL terminal, then run again.'
        : 'The run stopped at step ' + liveState.errorStep + ': ' + liveState.errorMessage + '. ' +
          (liveState.errorStep > 1 ? (liveState.errorStep - 1) + ' steps finished and nothing was saved.' : 'Nothing was saved.');

      resultBody.push(
        h('div', { class: 'live-error-block' },
          h('div', { class: 'live-error-glyph', 'aria-hidden': 'true' }, '\u2715'),
          h('p', { class: 'live-error-msg' }, errHeader),
          h('div', { style: 'margin-top: 14px;' },
            App.ui.button({
              label: 'Try the run again',
              onClick: startRun
            })
          )
        )
      );
    } else if (liveState.status === 'lost') {
      resultBody.push(
        h('div', { class: 'live-lost-block' },
          h('p', { class: 'live-error-msg' },
            'Lost the connection after step ' + liveState.errorStep + '. The run may still be finishing in WSL. Check again in a moment.'
          ),
          h('div', { style: 'margin-top: 14px;' },
            App.ui.button({
              label: 'Check for the server',
              onClick: function () { probe(); }
            })
          )
        )
      );
    } else {
      // Ready, before run
      resultBody.push(
        h('p', { class: 'live-ready-prompt' }, 'Choose a policy and a program, then run it.')
      );
    }

    var resultCard = App.ui.card({
      title: 'Result',
      class: 'live-result-card',
      span: 4,
      body: resultBody
    });

    viewContainer.appendChild(title);
    viewContainer.appendChild(controlsBlock);
    viewContainer.appendChild(App.ui.grid(stepsCard, resultCard));

    // Render chart if data exists
    if (liveState.o0) {
      updateChart();
    }
  }

  // View lifecycle
  function render(main, ctx) {
    viewContainer = h('div', { class: 'view-live' });
    renderView();
    return viewContainer;
  }

  function enter(ctx) {
    probe();
  }

  function boot() {
    probe();
  }

  App.register('live', {
    title: 'Live run',
    styles: true,
    render: render,
    enter: enter,
    boot: boot
  });
})();
