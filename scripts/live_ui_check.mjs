#!/usr/bin/env node
// scripts/live_ui_check.mjs — End-to-end browser test for the Live tab.
// Drives Chrome/Edge headless via CDP over native WebSocket (Node 22+).
// Tests scenarios: match, busy, lost, offline.
// Usage: node scripts/live_ui_check.mjs [--base http://localhost:8765]

import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bashCmd = process.platform === 'win32' && existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
  ? '"C:\\Program Files\\Git\\bin\\bash.exe"'
  : 'bash';

// Parse CLI flags
let base = 'http://127.0.0.1:8765';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--base' && process.argv[i + 1]) {
    base = process.argv[i + 1];
    i++;
  }
}
// Normalize localhost to 127.0.0.1 to avoid Windows IPv6 ::1 loopback stalls
base = base.replace('localhost', '127.0.0.1');

function findChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    join(pf, 'Google/Chrome/Application/chrome.exe'),
    join(pf86, 'Google/Chrome/Application/chrome.exe'),
    join(local, 'Google/Chrome/Application/chrome.exe'),
    join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

class Browser {
  static async launch({ width = 1440, height = 900 } = {}) {
    if (typeof WebSocket === 'undefined') {
      throw new Error('Node 22+ is required (built-in WebSocket missing). Current: ' + process.version);
    }
    const exe = findChrome();
    if (!exe) {
      throw new Error('No Chrome/Edge/Chromium found. Set CHROME_PATH to its executable.');
    }

    const dir = mkdtempSync(join(tmpdir(), 'live-ui-check-'));

    let pid = 0;
    const drop = () => {
      try {
        if (pid) {
          if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
          else process.kill(pid, 'SIGKILL');
        }
      } catch {}
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
    };
    process.once('exit', drop);

    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      `--window-size=${width},${height}`,
      'about:blank'
    ];

    const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    pid = proc.pid;

    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('Chrome did not start within 20s')), 20000);
      proc.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(t);
          resolve(m[1]);
        }
      });
      proc.on('exit', (code) => {
        clearTimeout(t);
        reject(new Error('Chrome exited early, code ' + code + '\n' + buf.slice(-600)));
      });
    });

    const b = new Browser();
    b.proc = proc;
    b.dir = dir;
    b.nextId = 1;
    b.pending = new Map();
    b.listeners = new Map();
    b.ws = new WebSocket(wsUrl);

    await new Promise((res, rej) => {
      b.ws.onopen = res;
      b.ws.onerror = () => rej(new Error('CDP socket connection failed'));
    });

    b.ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && b.pending.has(msg.id)) {
        const { resolve, reject, timer } = b.pending.get(msg.id);
        clearTimeout(timer);
        b.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const fns = b.listeners.get((msg.sessionId || '') + '|' + msg.method);
        if (fns) {
          for (const fn of [...fns]) fn(msg.params);
        }
      }
    };

    return b;
  }

  send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(sessionId, method, fn) {
    const k = (sessionId || '') + '|' + method;
    if (!this.listeners.has(k)) this.listeners.set(k, new Set());
    this.listeners.get(k).add(fn);
    return () => this.listeners.get(k)?.delete(fn);
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(this, targetId, sessionId);
    this.on(sessionId, 'Runtime.consoleAPICalled', (params) => {
      const args = (params.args || []).map((a) => a.value || a.description || '').join(' ');
      console.log('  [browser-console]', params.type, args);
    });
    this.on(sessionId, 'Runtime.exceptionThrown', (params) => {
      console.error('  [browser-error]', params.exceptionDetails?.text, params.exceptionDetails?.exception?.description);
    });
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    return p;
  }

  async close() {
    try { await this.send('Browser.close', {}, undefined, 3000); } catch {}
    try { this.ws.close(); } catch {}
    try { this.proc.kill(); } catch {}
    await sleep(200);
    try { rmSync(this.dir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
}

class Page {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  send(method, params = {}, timeoutMs = 30000) {
    return this.browser.send(method, params, this.sessionId, timeoutMs);
  }

  async goto(url, { timeoutMs = 25000, settleMs = 1000 } = {}) {
    let off;
    const loaded = new Promise((resolve) => {
      off = this.browser.on(this.sessionId, 'Page.loadEventFired', () => resolve('load'));
    });
    const nav = await this.send('Page.navigate', { url }, timeoutMs).catch((e) => ({ errorText: e.message }));
    if (nav.errorText && !/ERR_ABORTED/.test(nav.errorText)) {
      off();
      throw new Error('navigate: ' + nav.errorText);
    }
    const how = await Promise.race([loaded, sleep(timeoutMs).then(() => 'timeout')]);
    off();
    await sleep(settleMs);
    return how;
  }

  async eval(fnOrExpr, arg) {
    const expression = typeof fnOrExpr === 'function'
      ? `(${fnOrExpr.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`
      : fnOrExpr;
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 30000);
    if (r.exceptionDetails) {
      throw new Error('page eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result?.value;
  }
}

async function waitFor(fn, timeoutMs = 30000, intervalMs = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error('Timeout after ' + timeoutMs + 'ms');
}

// -------------------------------------------------------------
// Scenario 1: match
// -------------------------------------------------------------
async function scenarioMatch(page, baseUrl) {
  const targetUrl = baseUrl.replace(/\/$/, '') + '/index.html#/live';
  await page.goto(targetUrl);
  await sleep(1000);

  // Wait for Ready pill in nav
  await waitFor(async () => {
    const text = await page.eval(`
      (function() {
        var el = document.getElementById('sidebar-live-status');
        return el ? el.textContent.trim() : '';
      })()
    `);
    return text === 'Ready';
  }, 30000);

  // Set selects: Policy = dense_s0, Program = bzip2
  await page.eval(`
    (function() {
      var selects = document.querySelectorAll('.live-controls-row select');
      if (selects.length >= 2) {
        selects[0].value = 'dense_s0';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        selects[1].value = 'bzip2';
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
  await sleep(200);

  // Click 'Run policy'
  const clickRes = await page.eval(`
    (function() {
      var btns = Array.from(document.querySelectorAll('button'));
      var runBtn = btns.find(b => b.textContent.trim() === 'Run policy');
      if (!runBtn) return 'not found';
      if (runBtn.disabled) return 'disabled';
      runBtn.click();
      return 'clicked';
    })()
  `);
  if (clickRes !== 'clicked') {
    throw new Error('Run policy button was ' + clickRes);
  }

  // Wait for "Matches the stored result" in Result card (up to 180s)
  let lastText = '';
  await waitFor(async () => {
    const text = await page.eval(`
      (function() {
        var card = document.querySelector('.view-live .span-4');
        return card ? (card.innerText || card.textContent || '') : '';
      })()
    `);
    lastText = text;
    return text.includes('Matches the stored result');
  }, 180000, 500).catch((err) => {
    throw new Error(err.message + ' (last card text: ' + JSON.stringify(lastText.slice(0, 200)) + ')');
  });

  // Assert strip shows 15 filled cells
  const cellCount = await page.eval(`
    (function() {
      var cells = document.querySelectorAll('.strip-grid-live .strip-cell:not(.strip-cell-live-empty)');
      return cells.length;
    })()
  `);

  if (cellCount !== 15) {
    throw new Error('Expected 15 filled cells in strip, got ' + cellCount);
  }
}

// -------------------------------------------------------------
// Scenario 2: busy
// -------------------------------------------------------------
async function scenarioBusy(page, baseUrl) {
  // Start a concurrent long run from Node
  const runUrl = baseUrl.replace(/\/$/, '') + '/api/run';
  const controller = new AbortController();

  let nodeStatus = null;
  const nodeFetchPromise = fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run: 'long_dense_s0', program: 'tiff2bw' }),
    signal: controller.signal
  }).then((r) => {
    nodeStatus = r.status;
    console.log('  [node-fetch-bg] response status:', r.status);
    return r;
  }).catch((e) => {
    console.log('  [node-fetch-bg] caught:', e.message);
  });

  // Wait 1500ms for server to receive request and acquire run_lock
  await sleep(1500);

  // Click 'Run policy' in browser while server is busy
  const clickStatus = await page.eval(`
    (function() {
      var btns = Array.from(document.querySelectorAll('button'));
      var runBtn = btns.find(b => b.textContent.trim() === 'Run policy');
      if (!runBtn) return 'not found';
      if (runBtn.disabled) return 'disabled';
      runBtn.click();
      return 'clicked';
    })()
  `);
  console.log('  [scenarioBusy] Run policy click returned:', clickStatus);
  if (clickStatus !== 'clicked') {
    throw new Error('Run policy button in busy scenario was ' + clickStatus);
  }

  // Wait for busy notice in Result card
  let busyText = '';
  await waitFor(async () => {
    const text = await page.eval(`
      (function() {
        var card = document.querySelector('.view-live .span-4');
        return card ? (card.innerText || card.textContent || '') : '';
      })()
    `);
    busyText = text;
    return text.includes('Another run is already in progress');
  }, 15000).catch((err) => {
    throw new Error(err.message + ' (current card text: ' + JSON.stringify(busyText.slice(0, 300)) + ')');
  });

  // Clean up Node fetch and wait for server to release lock
  controller.abort();
  await nodeFetchPromise;
  await waitFor(async () => {
    try {
      const res = await fetch(baseUrl + '/api/health');
      if (res.ok) {
        const j = await res.json();
        return j.busy === false;
      }
    } catch {}
    return false;
  }, 60000, 500);
  await sleep(500);
}

// -------------------------------------------------------------
// Scenario 3: lost
// -------------------------------------------------------------
async function scenarioLost(page, baseUrl) {
  // Select sparse_s2, tiffmedian
  await page.eval(`
    (function() {
      var selects = document.querySelectorAll('.live-controls-row select');
      if (selects.length >= 2) {
        selects[0].value = 'sparse_s2';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        selects[1].value = 'tiffmedian';
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
  await sleep(200);

  // Click 'Run policy'
  const clickStatus = await page.eval(`
    (function() {
      var btns = Array.from(document.querySelectorAll('button'));
      var runBtn = btns.find(b => b.textContent.trim() === 'Run policy' || b.textContent.trim() === 'Try the run again');
      if (!runBtn) return 'not found';
      if (runBtn.disabled) return 'disabled';
      runBtn.click();
      return 'clicked';
    })()
  `);
  if (clickStatus !== 'clicked') {
    throw new Error('Run button in lost scenario was ' + clickStatus);
  }

  // Wait until at least 1 cell is filled (up to 90s for CompilerGym reset)
  await waitFor(async () => {
    const count = await page.eval(`
      (function() {
        var cells = document.querySelectorAll('.strip-grid-live .strip-cell:not(.strip-cell-live-empty)');
        return cells.length;
      })()
    `);
    return count >= 1;
  }, 90000);

  // Stop the server
  execSync(`${bashCmd} scripts/live_e2e.sh stop 8765`, { stdio: 'inherit' });

  // Assert "Lost the connection after step" or "The run stopped at step"
  let lostText = '';
  await waitFor(async () => {
    const text = await page.eval(`
      (function() {
        var card = document.querySelector('.view-live .span-4');
        return card ? (card.innerText || card.textContent || '') : '';
      })()
    `);
    lostText = text;
    return text.includes('Lost the connection after step') || text.includes('The run stopped at step');
  }, 30000).catch((err) => {
    throw new Error(err.message + ' (current card text: ' + JSON.stringify(lostText.slice(0, 300)) + ')');
  });
}

// -------------------------------------------------------------
// Scenario 4: offline
// -------------------------------------------------------------
async function scenarioOffline(page) {
  // Click 'Check for the server'
  const clickRes = await page.eval(`
    (function() {
      var btns = Array.from(document.querySelectorAll('button'));
      var checkBtn = btns.find(b => b.textContent.trim() === 'Check for the server');
      if (!checkBtn) return 'not found';
      checkBtn.click();
      return 'clicked';
    })()
  `);
  console.log('  [scenarioOffline] Check for server click returned:', clickRes);

  // Assert "The live server isn't running" and pill Offline
  let offCard = '';
  let offPill = '';
  await waitFor(async () => {
    const res = await page.eval(`
      (function() {
        var card = document.querySelector('.view-live .span-4');
        var pill = document.getElementById('sidebar-live-status');
        var cardText = card ? (card.innerText || card.textContent || '') : '';
        var pillText = pill ? (pill.innerText || pill.textContent || '').trim() : '';
        return { cardText: cardText, pillText: pillText };
      })()
    `);
    offCard = res.cardText;
    offPill = res.pillText;
    return offCard.includes("The live server isn't running") && offPill === 'Offline';
  }, 10000).catch((err) => {
    throw new Error(err.message + ' (card: ' + JSON.stringify(offCard.slice(0, 200)) + ', pill: ' + JSON.stringify(offPill) + ')');
  });
}

// -------------------------------------------------------------
// Ensure server is running for tests
// -------------------------------------------------------------
async function ensureServerRunning(baseUrl) {
  try {
    const res = await fetch(baseUrl + '/api/health');
    if (res.ok) {
      const j = await res.json();
      if (j.service === 'phase-ordering-live') return null;
    }
  } catch {}

  console.log('==> Starting live server in WSL on port 8765...');
  const repoPath = '/mnt/c/Users/rvsre/Documents/compiler project';
  const proc = spawn('wsl', [
    '-d', 'Ubuntu',
    '--exec', 'bash', '-c',
    `cd '${repoPath}' && source ~/venvs/rlphase/bin/activate && python web/server.py --port 8765 --pidfile /tmp/phase-ordering-live.pid --logfile /tmp/phase-ordering-live.log`
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const res = await fetch(baseUrl + '/api/health');
      if (res.ok) {
        const j = await res.json();
        if (j.service === 'phase-ordering-live') {
          console.log('==> Live server ready on ' + baseUrl);
          return proc;
        }
      }
    } catch {}
  }
  throw new Error('Failed to start live server within 60s');
}

// -------------------------------------------------------------
// Main execution
// -------------------------------------------------------------
async function main() {
  let serverProc = null;
  let browser;
  let exitCode = 0;

  try {
    serverProc = await ensureServerRunning(base);
    console.log('==> Launching Chrome for live UI checks against ' + base + '...');
    browser = await Browser.launch();
    const page = await browser.newPage();

    // 1. match
    process.stdout.write('scenario match: ');
    try {
      await scenarioMatch(page, base);
      console.log('PASS');
    } catch (e) {
      console.log('FAIL (' + e.message + ')');
      exitCode = 1;
    }

    // 2. busy
    if (exitCode === 0) {
      process.stdout.write('scenario busy: ');
      try {
        await scenarioBusy(page, base);
        console.log('PASS');
      } catch (e) {
        console.log('FAIL (' + e.message + ')');
        exitCode = 1;
      }
    }

    // 3. lost
    if (exitCode === 0) {
      process.stdout.write('scenario lost: ');
      try {
        await scenarioLost(page, base);
        console.log('PASS');
      } catch (e) {
        console.log('FAIL (' + e.message + ')');
        exitCode = 1;
      }
    }

    // 4. offline
    if (exitCode === 0) {
      process.stdout.write('scenario offline: ');
      try {
        await scenarioOffline(page);
        console.log('PASS');
      } catch (e) {
        console.log('FAIL (' + e.message + ')');
        exitCode = 1;
      }
    }
  } catch (err) {
    console.error('ERROR:', err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (serverProc) {
      try { serverProc.kill(); } catch {}
    }
  }

  process.exit(exitCode);
}

main();
