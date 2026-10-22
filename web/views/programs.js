/* programs.js — Programs view: per-program explorer with reference comparisons and pass sequences.
   Plan 08-07 complete implementation.
   All numbers rendered dynamically from window.DATA; zero hardcoded metrics.
*/
(function () {
  'use strict';

  var SPLIT_KEYS = ['test', 'val', 'train'];
  var SPLIT_LABELS = {
    test: 'Test, held out',
    val: 'Validation',
    train: 'Train'
  };

  App.register('programs', {
    title: 'Programs',
    styles: true,
    render: function (data, routeArg) {
      var rootEl = App.h('div', { class: 'programs-view' });

      // 1. Program resolution
      var rawArg = typeof routeArg === 'string' ? routeArg : (routeArg && routeArg.arg ? routeArg.arg : null);
      if (rawArg) {
        rawArg = rawArg.trim();
        if (rawArg.charAt(0) === '/') rawArg = rawArg.slice(1);
      }

      var defaultProgram = null;
      if (data.split && data.split.test && data.split.test.length) {
        defaultProgram = App.q.program(data.split.test[0]);
      }
      if (!defaultProgram && data.programs && data.programs.length) {
        defaultProgram = data.programs[0];
      }

      var activeProg = null;
      var notFoundName = null;

      if (!rawArg) {
        activeProg = defaultProgram;
      } else {
        var found = App.q.program(rawArg);
        if (found) {
          activeProg = found;
        } else {
          activeProg = defaultProgram;
          // Threat model T-08-20: cap at 64 chars
          notFoundName = rawArg.slice(0, 64);
        }
      }

      // Collect programs by split
      var splitGroups = {};
      SPLIT_KEYS.forEach(function (k) {
        splitGroups[k] = App.q.programs(k);
      });

      var allPrograms = [];
      SPLIT_KEYS.forEach(function (k) {
        allPrograms = allPrograms.concat(splitGroups[k]);
      });

      // 2. Title row
      var totalPrograms = data.programs ? data.programs.length : 0;
      var testCount = splitGroups.test ? splitGroups.test.length : 0;
      var valCount = splitGroups.val ? splitGroups.val.length : 0;
      var trainCount = splitGroups.train ? splitGroups.train.length : 0;

      var sublineText = totalPrograms + ' cBench programs: ' +
        testCount + ' held-out test, ' +
        valCount + ' validation, ' +
        trainCount + ' training. Counts are LLVM IR instructions.';

      var titleRowEl = App.ui.titleRow({
        h1: 'Programs',
        finding: sublineText
      });
      rootEl.appendChild(titleRowEl);

      // Main 12-column layout
      var layoutEl = App.h('div', { class: 'programs-layout' });

      // 3. Left sidebar program list (Desktop/Tablet)
      var navCol = App.h('nav', {
        class: 'programs-nav-col',
        role: 'listbox',
        'aria-label': 'Programs'
      });

      var listItems = [];

      SPLIT_KEYS.forEach(function (sk) {
        var progs = splitGroups[sk] || [];
        var headerText = SPLIT_LABELS[sk] + ' (' + progs.length + ')';
        navCol.appendChild(App.h('div', { class: 'programs-group-title' }, headerText));

        var listWrap = App.h('div', { class: 'programs-list', role: 'group', 'aria-label': SPLIT_LABELS[sk] });

        progs.forEach(function (p) {
          var isCurrent = activeProg && p.name === activeProg.name;
          var item = App.h('a', {
            href: '#/programs/' + p.name,
            class: 'programs-list-item' + (isCurrent ? ' is-selected' : ''),
            role: 'option',
            'aria-selected': isCurrent ? 'true' : 'false',
            tabindex: isCurrent ? '0' : '-1',
            on: {
              click: function (e) {
                e.preventDefault();
                App.navigate('#/programs/' + p.name);
              },
              keydown: function (e) {
                var idx = listItems.indexOf(item);
                if (idx === -1) return;
                var next = -1;
                if (e.key === 'ArrowDown') {
                  next = (idx + 1) % listItems.length;
                } else if (e.key === 'ArrowUp') {
                  next = (idx - 1 + listItems.length) % listItems.length;
                } else if (e.key === 'Home') {
                  next = 0;
                } else if (e.key === 'End') {
                  next = listItems.length - 1;
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  App.navigate('#/programs/' + p.name);
                  return;
                }

                if (next !== -1) {
                  e.preventDefault();
                  listItems[next].focus();
                }
              }
            }
          },
            App.h('span', { class: 'programs-item-name' }, p.name),
            App.h('span', { class: 'programs-item-o0' }, App.fmt.int(p.O0))
          );

          listItems.push(item);
          listWrap.appendChild(item);
        });

        navCol.appendChild(listWrap);
      });

      layoutEl.appendChild(navCol);

      // 4. Mobile Selector (<640px)
      var activeIdx = -1;
      for (var i = 0; i < allPrograms.length; i++) {
        if (activeProg && allPrograms[i].name === activeProg.name) {
          activeIdx = i;
          break;
        }
      }

      var prevProg = activeIdx > 0 ? allPrograms[activeIdx - 1] : allPrograms[allPrograms.length - 1];
      var nextProg = activeIdx < allPrograms.length - 1 ? allPrograms[activeIdx + 1] : allPrograms[0];

      var mobileSelectGroups = SPLIT_KEYS.map(function (sk) {
        return {
          label: SPLIT_LABELS[sk] + ' (' + (splitGroups[sk] || []).length + ')',
          options: (splitGroups[sk] || []).map(function (p) {
            return {
              value: p.name,
              label: p.name + ' (' + App.fmt.int(p.O0) + ')'
            };
          })
        };
      });

      var mobileChooser = App.h('div', { class: 'programs-mobile-chooser' },
        App.h('div', { class: 'programs-mobile-chooser-row' },
          App.ui.button({
            kind: 'secondary',
            text: 'Previous',
            onClick: function () {
              if (prevProg) App.navigate('#/programs/' + prevProg.name);
            }
          }),
          App.ui.select({
            groups: mobileSelectGroups,
            value: activeProg ? activeProg.name : '',
            onChange: function (val) {
              if (val) App.navigate('#/programs/' + val);
            }
          }),
          App.ui.button({
            kind: 'secondary',
            text: 'Next',
            onClick: function () {
              if (nextProg) App.navigate('#/programs/' + nextProg.name);
            }
          })
        )
      );
      layoutEl.appendChild(mobileChooser);

      // 5. Detail Column
      var detailCol = App.h('div', { class: 'programs-detail-col' });

      // Empty state notice if requested program did not exist
      if (notFoundName) {
        var emptyNotice = App.h('div', { class: 'empty-box programs-empty-notice' },
          App.h('h2', { style: 'font-size: 14px; font-weight: 500; margin: 0 0 4px 0;' }, 'No program called "' + notFoundName + '"'),
          App.h('p', { style: 'font-size: 13px; color: var(--muted); margin: 0;' }, 'Choose one from the list. Showing ' + (activeProg ? activeProg.name : 'first') + ' instead.')
        );
        detailCol.appendChild(emptyNotice);
      }

      if (activeProg) {
        var prog = activeProg;

        // Header: name, split pill, -O0 count
        var splitLabel = SPLIT_LABELS[prog.split] || prog.split;
        var detailHeader = App.h('div', { class: 'programs-detail-header' },
          App.h('h2', { class: 'programs-detail-title' }, prog.name),
          App.ui.pill('neutral', splitLabel),
          App.h('span', { class: 'programs-detail-o0' }, '-O0: ' + App.fmt.int(prog.O0) + ' instructions')
        );
        detailCol.appendChild(detailHeader);

        // Compute medians over main seeds
        var denseMainRows = App.q.evalRows({ benchmark: prog.name, reward: 'dense', group: 'main' });
        var sparseMainRows = App.q.evalRows({ benchmark: prog.name, reward: 'sparse', group: 'main' });
        var longDenseRows = App.q.evalRows({ benchmark: prog.name, run: 'long_dense_s0' });
        var longSparseRows = App.q.evalRows({ benchmark: prog.name, run: 'long_sparse_s0' });

        var longDenseRow = longDenseRows.length ? longDenseRows[0] : null;
        var longSparseRow = longSparseRows.length ? longSparseRows[0] : null;

        var denseMed = denseMainRows.length ? App.q.median(denseMainRows.map(function (r) { return r.final; })) : null;
        var sparseMed = sparseMainRows.length ? App.q.median(sparseMainRows.map(function (r) { return r.final; })) : null;

        // Program finding template
        if (denseMed !== null) {
          var pctO3 = (denseMed - prog.O3) / prog.O3 * 100;
          var pctOz = (denseMed - prog.Oz) / prog.Oz * 100;
          var pctBf = (denseMed - prog.best_fixed) / prog.best_fixed * 100;

          function cmpWord(pct) {
            if (Math.abs(pct) < 0.05) return 'the same as';
            if (pct > 0) return pct.toFixed(1) + '% larger than';
            return Math.abs(pct).toFixed(1) + '% smaller than';
          }

          var leadText = '';
          if (sparseMed !== null && denseMed === sparseMed) {
            leadText = 'RL dense and RL sparse both end at ' + App.fmt.int(denseMed) + ' instructions: ';
          } else {
            leadText = 'RL dense ends at ' + App.fmt.int(denseMed) + ' instructions: ';
          }

          var findingText = leadText +
            cmpWord(pctO3) + ' -O3, ' +
            cmpWord(pctOz) + ' -Oz, ' +
            cmpWord(pctBf) + ' the best fixed sequence.';

          detailCol.appendChild(App.h('p', { class: 'programs-finding' }, findingText));
        }

        // 6. Card: Instructions after each method
        function signedNote(val) {
          if (val === null || val === undefined || !prog.O0) return null;
          var diff = (val - prog.O0) / prog.O0;
          return App.fmt.signedPct(diff);
        }

        var barRows = [
          {
            key: 'O2',
            label: '-O2',
            value: prog.O2,
            note: signedNote(prog.O2),
            negativeNote: prog.O2 > prog.O0
          },
          {
            key: 'O3',
            label: '-O3',
            value: prog.O3,
            note: signedNote(prog.O3),
            negativeNote: prog.O3 > prog.O0
          },
          {
            key: 'Oz',
            label: '-Oz',
            value: prog.Oz,
            note: signedNote(prog.Oz),
            negativeNote: prog.Oz > prog.O0
          },
          {
            key: 'best_fixed',
            label: 'Best fixed sequence',
            value: prog.best_fixed,
            note: signedNote(prog.best_fixed),
            negativeNote: prog.best_fixed > prog.O0
          },
          {
            key: 'dense',
            label: 'RL dense',
            value: denseMed,
            seeds: denseMainRows.map(function (r) { return r.final; }),
            note: signedNote(denseMed),
            negativeNote: denseMed > prog.O0
          },
          {
            key: 'sparse',
            label: 'RL sparse',
            value: sparseMed,
            seeds: sparseMainRows.map(function (r) { return r.final; }),
            note: signedNote(sparseMed),
            negativeNote: sparseMed > prog.O0
          },
          {
            key: 'long_dense',
            label: 'RL dense, 2000 episodes',
            value: longDenseRow ? longDenseRow.final : null,
            note: longDenseRow ? signedNote(longDenseRow.final) : null,
            negativeNote: longDenseRow && longDenseRow.final > prog.O0
          },
          {
            key: 'long_sparse',
            label: 'RL sparse, 2000 episodes',
            value: longSparseRow ? longSparseRow.final : null,
            note: longSparseRow ? signedNote(longSparseRow.final) : null,
            negativeNote: longSparseRow && longSparseRow.final > prog.O0
          }
        ];

        var barChartWrap = App.h('div', { class: 'programs-bar-chart-wrap' });
        var barsCard = App.ui.card({
          title: 'Instructions after each method',
          sub: 'Fewer is better. The dashed line is -O0 (' + App.fmt.int(prog.O0) + ').',
          body: barChartWrap
        });
        detailCol.appendChild(barsCard);

        setTimeout(function () {
          if (window.ChartsExt && typeof window.ChartsExt.methodBars === 'function') {
            window.ChartsExt.methodBars(barChartWrap, barRows, {
              mode: 'count',
              ariaLabel: 'Instructions after each method on ' + prog.name,
              reference: {
                value: prog.O0,
                label: '-O0 (' + App.fmt.int(prog.O0) + ')'
              },
              subheader: {
                beforeKey: 'long_dense',
                text: 'Added after the main results, one seed'
              }
            });
          }
        }, 0);

        // 7. Card: Pass sequences chosen by each run
        var epLen = data.constants && data.constants.episode_len ? data.constants.episode_len : 15;
        var changedLabel = data.traces && data.traces.changed_label ? data.traces.changed_label : 'Changed the count';

        var stripListContainer = App.h('div', { class: 'programs-strip-list' });

        // Build list of runs in exact UI-SPEC order:
        // 1) Best fixed
        var runEntries = [];
        runEntries.push({
          id: 'best_fixed',
          label: 'Best fixed sequence',
          kind: 'fixed',
          sequence: data.best_fixed_sequence || (prog.best_fixed_steps ? prog.best_fixed_steps.map(function (s) { return s.pass; }) : []),
          steps: prog.best_fixed_steps,
          final: prog.best_fixed,
          o0: prog.O0,
          no_effect: prog.best_fixed_steps ? prog.best_fixed_steps.filter(function (s) { return !s.changed; }).length : 0
        });

        // 2-4) RL dense seed 0, 1, 2
        [0, 1, 2].forEach(function (s) {
          var r = denseMainRows.filter(function (x) { return x.seed === s; })[0];
          if (r) {
            runEntries.push({
              id: r.run,
              label: 'RL dense, seed ' + s,
              kind: 'rl',
              sequence: r.sequence,
              steps: r.steps,
              final: r.final,
              o0: prog.O0,
              no_effect: r.no_effect
            });
          }
        });

        // 5-7) RL sparse seed 0, 1, 2
        [0, 1, 2].forEach(function (s) {
          var r = sparseMainRows.filter(function (x) { return x.seed === s; })[0];
          if (r) {
            runEntries.push({
              id: r.run,
              label: 'RL sparse, seed ' + s,
              kind: 'rl',
              sequence: r.sequence,
              steps: r.steps,
              final: r.final,
              o0: prog.O0,
              no_effect: r.no_effect
            });
          }
        });

        // 8-9) Supplementary long runs
        var longEntries = [];
        if (longDenseRow) {
          longEntries.push({
            id: longDenseRow.run,
            label: 'RL dense, 2000 episodes',
            kind: 'rl',
            sequence: longDenseRow.sequence,
            steps: longDenseRow.steps,
            final: longDenseRow.final,
            o0: prog.O0,
            no_effect: longDenseRow.no_effect
          });
        }
        if (longSparseRow) {
          longEntries.push({
            id: longSparseRow.run,
            label: 'RL sparse, 2000 episodes',
            kind: 'rl',
            sequence: longSparseRow.sequence,
            steps: longSparseRow.steps,
            final: longSparseRow.final,
            o0: prog.O0,
            no_effect: longSparseRow.no_effect
          });
        }

        // Render desktop strips
        runEntries.forEach(function (entry) {
          if (window.Strip && typeof window.Strip.row === 'function') {
            window.Strip.row(stripListContainer, entry);
          }
        });

        if (longEntries.length) {
          stripListContainer.appendChild(App.h('div', { class: 'programs-strip-subheader' }, 'Added after the main results, one seed'));
          longEntries.forEach(function (entry) {
            if (window.Strip && typeof window.Strip.row === 'function') {
              window.Strip.row(stripListContainer, entry);
            }
          });
        }

        // Details element: "Show every step" table
        var allRunEntries = runEntries.concat(longEntries);
        var chosenRunId = allRunEntries.length ? allRunEntries[0].id : '';

        var detailsTableContainer = App.h('div', null);

        function updateDetailsTable(rId) {
          while (detailsTableContainer.firstChild) {
            detailsTableContainer.removeChild(detailsTableContainer.firstChild);
          }
          var entry = allRunEntries.filter(function (e) { return e.id === rId; })[0] || allRunEntries[0];
          if (entry && window.Strip && typeof window.Strip.stepTable === 'function') {
            window.Strip.stepTable(detailsTableContainer, {
              sequence: entry.sequence,
              steps: entry.steps,
              final: entry.final,
              o0: prog.O0
            });
          }
        }

        var runSelect = App.ui.select({
          options: allRunEntries.map(function (e) {
            return { value: e.id, label: e.label };
          }),
          value: chosenRunId,
          onChange: function (newId) {
            chosenRunId = newId;
            updateDetailsTable(newId);
          }
        });

        updateDetailsTable(chosenRunId);

        var detailsEl = App.h('details', { class: 'programs-strip-details' },
          App.h('summary', null, 'Show every step'),
          App.h('div', { class: 'programs-details-content' },
            App.h('div', { class: 'programs-details-ctrl' },
              App.h('label', { style: 'font-size: 13px; color: var(--muted);' }, 'Run:'),
              runSelect
            ),
            detailsTableContainer
          )
        );

        // Phone view (<640px): single run selector + 15-row step table
        var phoneTableContainer = App.h('div', null);
        var phoneChosenRunId = allRunEntries.length ? allRunEntries[0].id : '';

        function updatePhoneTable(rId) {
          while (phoneTableContainer.firstChild) {
            phoneTableContainer.removeChild(phoneTableContainer.firstChild);
          }
          var entry = allRunEntries.filter(function (e) { return e.id === rId; })[0] || allRunEntries[0];
          if (entry && window.Strip && typeof window.Strip.stepTable === 'function') {
            window.Strip.stepTable(phoneTableContainer, {
              sequence: entry.sequence,
              steps: entry.steps,
              final: entry.final,
              o0: prog.O0
            });
          }
        }

        var phoneRunSelect = App.ui.select({
          options: allRunEntries.map(function (e) {
            return { value: e.id, label: e.label };
          }),
          value: phoneChosenRunId,
          onChange: function (newId) {
            phoneChosenRunId = newId;
            updatePhoneTable(newId);
          }
        });

        updatePhoneTable(phoneChosenRunId);

        var phoneStripEl = App.h('div', { class: 'programs-phone-strip' },
          phoneRunSelect,
          phoneTableContainer
        );

        var isPhoneWidth = window.innerWidth <= 640;
        var stripBodyEl = App.h('div', null);

        if (isPhoneWidth) {
          stripBodyEl.appendChild(phoneStripEl);
        } else {
          stripBodyEl.appendChild(stripListContainer);
          stripBodyEl.appendChild(detailsEl);
        }

        // Layout change listener
        App.onLayout(function () {
          var nowPhone = window.innerWidth <= 640;
          if (nowPhone !== isPhoneWidth) {
            isPhoneWidth = nowPhone;
            while (stripBodyEl.firstChild) {
              stripBodyEl.removeChild(stripBodyEl.firstChild);
            }
            if (isPhoneWidth) {
              stripBodyEl.appendChild(phoneStripEl);
            } else {
              stripBodyEl.appendChild(stripListContainer);
              stripBodyEl.appendChild(detailsEl);
            }
          }
        });

        var stripCardHeaderExtra = (window.Strip && typeof window.Strip.key === 'function')
          ? window.Strip.key(changedLabel)
          : null;

        var stripCard = App.ui.card({
          title: 'Pass sequences chosen by each run',
          sub: epLen + ' greedy steps per run. Muted steps changed nothing.',
          headerExtra: stripCardHeaderExtra,
          body: stripBodyEl
        });
        detailCol.appendChild(stripCard);
      }

      layoutEl.appendChild(detailCol);
      rootEl.appendChild(layoutEl);

      return rootEl;
    }
  });
})();
