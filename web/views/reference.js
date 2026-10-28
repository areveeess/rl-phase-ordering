/* web/views/reference.js — Passes and programs (#/reference): what each of the agent's actions does,
 * and what each cBench program is. The descriptions are prose; every count on the page (split,
 * -O0 size, how often the agent picked a pass) is computed from web/data.json.
 */
(function () {
  'use strict';

  var h = App.h;

  // LLVM 10 legacy pass manager, as CompilerGym's llvm-v0 runs them.
  var PASS_TEXT = {
    '-mem2reg': 'Promotes stack variables (allocas) into SSA registers and inserts phi nodes, so the loads and stores that went through memory disappear.',
    '-sroa': 'Scalar replacement of aggregates: splits structs and arrays on the stack into separate scalars, then promotes them to registers. It does everything -mem2reg does and more.',
    '-instcombine': 'Combines and simplifies instructions with algebraic rules: folds constants, removes redundant casts, rewrites x * 2 as x << 1, and so on.',
    '-simplifycfg': 'Cleans up the control-flow graph: merges straight-line blocks, deletes unreachable blocks, and turns small if/else diamonds into selects.',
    '-early-cse': 'Early common-subexpression elimination: a cheap walk over the dominator tree that removes computations and loads already done earlier.',
    '-gvn': 'Global value numbering: finds values that are provably equal across the whole function and removes the redundant computations and loads.',
    '-dce': 'Dead code elimination: deletes instructions whose results are never used and that have no side effects.',
    '-adce': 'Aggressive dead code elimination: assumes everything is dead until shown to be live, so it also removes dead loops of computation and dead branches.',
    '-dse': 'Dead store elimination: removes stores to memory that are overwritten before anything reads them.',
    '-licm': 'Loop-invariant code motion: moves computations that do not change inside a loop out to before the loop. Speeds code up but can add instructions.',
    '-loop-rotate': 'Rewrites a loop so its exit test is at the bottom (do-while form), which helps other loop passes. Usually adds a few instructions.',
    '-loop-deletion': 'Deletes loops that always finish and whose results nothing uses.',
    '-indvars': 'Induction variable simplification: puts loop counters in a standard form and computes their final values directly where possible.',
    '-sccp': 'Sparse conditional constant propagation: works out which values are constants and which branches can never be taken, then removes them.',
    '-ipsccp': 'The interprocedural version of -sccp: also propagates constants through function arguments and return values.',
    '-globalopt': 'Optimises global variables: deletes globals that are never read, marks never-written ones constant, and turns some into locals.',
    '-globaldce': 'Deletes internal functions and global variables that nothing can reach.',
    '-deadargelim': 'Removes unused arguments and unused return values from internal functions.',
    '-inline': 'Copies the body of called functions into their callers. Removes call overhead and exposes more to other passes; can grow or shrink the program.',
    '-reassociate': 'Reorders chains of commutative operations (for example, gathers constants together) so later passes can fold more of them.',
    '-jump-threading': 'When a branch outcome is already known along one incoming path, jumps straight to the right target, duplicating blocks if needed. Can grow code.',
    '-correlated-propagation': 'Uses facts learned from earlier comparisons and branches (value ranges, non-null pointers) to simplify later comparisons and operations.',
    '-tailcallelim': 'Turns a function calling itself as its last step into a loop, and marks other calls in tail position.',
    '-mergefunc': 'Finds functions with identical bodies and keeps only one of them.',
    'NOOP': 'Does nothing. It lets the agent spend a step without changing the program, in effect stopping early.'
  };

  // cBench-v1 programs (most come from the MiBench suite); domain in brackets.
  var PROGRAM_TEXT = {
    'adpcm': ['Telecom', 'Adaptive differential pulse-code modulation: encodes and decodes audio samples.'],
    'bitcount': ['Automotive', 'Counts the set bits in integers using several different bit-counting methods.'],
    'blowfish': ['Security', 'The Blowfish block cipher: encrypts and decrypts data with a symmetric key.'],
    'bzip2': ['Utility', 'The bzip2 file compressor (Burrows-Wheeler block sorting plus Huffman coding).'],
    'crc32': ['Telecom', 'Computes a 32-bit cyclic redundancy check of a file.'],
    'dijkstra': ['Network', 'Shortest paths in a graph with Dijkstra\'s algorithm over an adjacency matrix.'],
    'ghostscript': ['Office', 'The Ghostscript PostScript and PDF interpreter.'],
    'gsm': ['Telecom', 'The GSM 06.10 full-rate speech codec used in mobile phones.'],
    'ispell': ['Office', 'The ispell interactive spell checker.'],
    'jpeg-c': ['Consumer', 'JPEG image compression (cjpeg from the IJG library).'],
    'jpeg-d': ['Consumer', 'JPEG image decompression (djpeg from the IJG library).'],
    'lame': ['Consumer', 'The LAME MP3 audio encoder.'],
    'patricia': ['Network', 'A Patricia trie, as used for IP routing-table lookups.'],
    'qsort': ['Automotive', 'Sorts a list of strings with quicksort.'],
    'rijndael': ['Security', 'The Rijndael (AES) block cipher: encrypts and decrypts data.'],
    'sha': ['Security', 'The SHA-1 secure hash of a file.'],
    'stringsearch': ['Office', 'Case-insensitive search for words in text (Boyer-Moore-Horspool style).'],
    'stringsearch2': ['Office', 'A second version of the string-search benchmark with its own search code; same family as stringsearch.'],
    'susan': ['Automotive', 'SUSAN image processing: smoothing, edge detection and corner detection.'],
    'tiff2bw': ['Consumer', 'Converts a colour TIFF image to greyscale (libtiff tools).'],
    'tiff2rgba': ['Consumer', 'Converts a TIFF image to 8-bit RGBA (libtiff tools).'],
    'tiffdither': ['Consumer', 'Dithers a greyscale TIFF image to black and white (libtiff tools).'],
    'tiffmedian': ['Consumer', 'Reduces a colour TIFF image to a small palette with the median-cut algorithm (libtiff tools).']
  };

  // shared with views/beat.js (the pass readout under the palette)
  App.passText = PASS_TEXT;

  function familyOf(name, families) {
    var fams = Object.keys(families || {});
    for (var i = 0; i < fams.length; i++) {
      if (families[fams[i]].indexOf(name) !== -1) return fams[i];
    }
    return name;
  }

  function render(d) {
    var consts = d.constants || {};
    var split = d.split || {};
    var actions = (consts.passes || []).concat(consts.noop ? [consts.noop] : []);

    // how often the main runs' greedy routes picked each action on the held-out programs
    var heldOut = App.q.evalRows({ group: 'main', split: 'test' });
    var used = {};
    var stops = 0;
    heldOut.forEach(function (row) {
      (row.sequence || []).forEach(function (p) { used[p] = (used[p] || 0) + 1; stops += 1; });
    });

    var passTable = App.ui.table({
      caption: 'The ' + actions.length + ' actions, in the order the agent\'s output layer lists them',
      columns: [
        { key: 'name', label: 'Pass' },
        { key: 'text', label: 'What it does', cls: 'ref-desc' },
        { key: 'used', label: 'Agent\'s held-out stops', numeric: true }
      ],
      rows: actions.map(function (a) {
        var n = used[a] || 0;
        return {
          name: h('code', { class: 'ref-pass' }, a),
          text: PASS_TEXT[a] || 'No description.',
          used: n ? App.fmt.int(n) : h('span', { class: 'ref-zero' }, '0')
        };
      })
    });

    var programs = [];
    ['test', 'val', 'train'].forEach(function (s) {
      (split[s] || []).forEach(function (name) { programs.push({ name: name, split: s }); });
    });
    Object.keys(split.excluded || {}).forEach(function (name) { programs.push({ name: name, split: 'excluded' }); });

    var progTable = App.ui.table({
      caption: 'Every cBench-v1 program considered, held-out programs first',
      columns: [
        { key: 'name', label: 'Program' },
        { key: 'split', label: 'Split' },
        { key: 'family', label: 'Family' },
        { key: 'domain', label: 'Domain' },
        { key: 'text', label: 'What it is', cls: 'ref-desc' },
        { key: 'o0', label: '-O0 size', numeric: true }
      ],
      rows: programs.map(function (p) {
        var meta = PROGRAM_TEXT[p.name] || ['', 'No description.'];
        var row = App.q.program(p.name);
        var excluded = p.split === 'excluded';
        return {
          name: excluded ? h('span', { class: 'ref-excluded-name' }, p.name)
            : h('a', { href: '#/programs/' + encodeURIComponent(p.name) }, p.name),
          split: excluded ? h('span', { class: 'ref-excluded' }, 'Excluded') : App.q.splitNoun(p.split),
          family: familyOf(p.name, split.families),
          domain: meta[0],
          text: excluded ? [meta[1], h('span', { class: 'ref-why' }, ' Not used: ' + split.excluded[p.name] + '.')] : meta[1],
          o0: row ? App.fmt.int(row.O0) : '-'
        };
      })
    });

    return h('div', { class: 'view-reference' },
      App.ui.titleRow({
        h1: 'Passes and programs',
        finding: 'What each of the agent\'s ' + actions.length + ' actions does to a program, and what each of the ' +
          (d.programs || []).length + ' cBench programs is (plus the ' + Object.keys(split.excluded || {}).length + ' left out, and why).'
      }),
      h('section', { class: 'ref-section', 'aria-labelledby': 'ref-passes' },
        h('h2', { id: 'ref-passes', class: 'ref-heading' }, 'The passes'),
        h('p', { class: 'ref-lede' },
          'Each step, the agent picks one of these LLVM 10 optimisation passes (or NOOP). All of them also run inside -Oz. ' +
          'The last column counts how often the main runs\' greedy routes picked each one on the held-out programs (' +
          App.fmt.int(stops) + ' stops in all), which is where the -sroa collapse shows.'),
        passTable),
      h('section', { class: 'ref-section', 'aria-labelledby': 'ref-programs' },
        h('h2', { id: 'ref-programs', class: 'ref-heading' }, 'The programs'),
        h('p', { class: 'ref-lede' },
          'cBench-v1 programs, most from the MiBench embedded suite. Programs in the same family stay on one side of the split. ',
          h('span', { class: 'ref-nowrap' }, '-O0'),
          ' size is the LLVM IR instruction count before any optimisation. Select a program to see every route on it.'),
        progTable)
    );
  }

  App.register('reference', {
    title: 'Passes and programs',
    styles: true,
    render: render
  });
})();
