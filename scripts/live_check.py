"""Client verification script for live CompilerGym runner server (phase 8).

Validates:
  1. POST /api/run streams valid NDJSON events (start, 15 steps, done)
  2. Final counts match results/eval.csv and web/data.json
  3. --busy option verifies 409 response during concurrent execution
  4. --no-writes option verifies results/ and runs/ files are never modified

Usage:
  python scripts/live_check.py [--base URL] [--pairs run:program ...] [--busy] [--no-writes]
"""
import argparse
import json
import os
from pathlib import Path
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def scan_tree(dirs):
    """Record (path, size, mtime_ns) for every file under given directories."""
    tree = {}
    for d in dirs:
        p_dir = ROOT / d
        if not p_dir.is_dir():
            continue
        for root_path, _, files in os.walk(p_dir):
            for f in files:
                full = Path(root_path) / f
                rel = full.relative_to(ROOT).as_posix()
                try:
                    st = full.stat()
                    tree[rel] = (st.st_size, st.st_mtime_ns)
                except OSError:
                    pass
    return tree


def make_request(base_url, path, data=None, method="GET"):
    """Build urllib Request with Host header, resolving localhost to 127.0.0.1 on Windows."""
    parsed = urllib.parse.urlparse(base_url)
    host_header = parsed.netloc
    netloc_ip = parsed.netloc.replace("localhost", "127.0.0.1")
    target_url = urllib.parse.urlunparse((parsed.scheme, netloc_ip, path, "", "", ""))
    headers = {"Host": host_header}
    if data is not None:
        headers["Content-Type"] = "application/json"
    return urllib.request.Request(
        target_url,
        data=data,
        headers=headers,
        method=method
    )


def run_request(base_url, run_id, program, timeout=120):
    """POST /api/run and return list of parsed JSON event dictionaries."""
    payload = json.dumps({"run": run_id, "program": program}).encode("utf-8")
    req = make_request(base_url, "/api/run", data=payload, method="POST")

    events = []
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Expected HTTP 200, got {resp.status}")
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if line:
                events.append(json.loads(line))
    return events


def test_busy(base_url, run_id, program):
    """Start one run in a thread and send a second request while the first is active, expecting 409."""
    result = {"second_status": None, "second_body": None}
    started_event = threading.Event()

    def first_worker():
        try:
            payload = json.dumps({"run": run_id, "program": program}).encode("utf-8")
            req = make_request(base_url, "/api/run", data=payload, method="POST")
            with urllib.request.urlopen(req, timeout=90) as resp:
                first_line = resp.readline()
                if first_line:
                    started_event.set()
                for _ in resp:
                    pass
        except Exception as e:
            sys.stderr.write(f"First worker error: {e}\n")
            started_event.set()

    t1 = threading.Thread(target=first_worker)
    t1.start()

    if not started_event.wait(timeout=30):
        raise RuntimeError("First worker did not receive start line within 30s")

    # Second request while the first worker's stream is actively executing steps
    payload = json.dumps({"run": run_id, "program": program}).encode("utf-8")
    req = make_request(base_url, "/api/run", data=payload, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result["second_status"] = resp.status
    except urllib.error.HTTPError as e:
        result["second_status"] = e.code
        result["second_body"] = e.read().decode("utf-8")
    except Exception as e:
        result["second_error"] = str(e)

    t1.join(timeout=120)

    if result["second_status"] != 409:
        raise RuntimeError(f"Expected HTTP 409 on concurrent request, got {result['second_status']} ({result})")

    body_json = json.loads(result["second_body"] or "{}")
    if body_json.get("error") != "busy":
        raise RuntimeError(f"Expected error 'busy' in 409 body, got {body_json}")

    print("Concurrent request check: OK (HTTP 409 busy received)")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default="http://localhost:8765", help="Base URL of live server")
    ap.add_argument("--pairs", nargs="*", default=["dense_s0:blowfish"], help="run:program pairs")
    ap.add_argument("--busy", action="store_true", help="Test concurrent request 409 behavior")
    ap.add_argument("--no-writes", action="store_true", help="Assert results/ and runs/ files are unmodified")
    args = ap.parse_args(argv)

    # 1. Load data.json reference if available
    data_json_path = ROOT / "web" / "data.json"
    data_eval_map = {}
    if data_json_path.is_file():
        try:
            with open(data_json_path, "r", encoding="utf-8") as f:
                d = json.load(f)
                for e in d.get("eval", []):
                    data_eval_map[(e["run"], e["benchmark"])] = e.get("final")
        except Exception as e:
            sys.stderr.write(f"Warning: could not read {data_json_path}: {e}\n")

    # 2. Pre-scan for --no-writes
    before_tree = None
    if args.no_writes:
        before_tree = scan_tree(["results", "runs"])

    # 3. Test pairs
    for pair in args.pairs:
        parts = pair.split(":")
        if len(parts) != 2:
            print(f"ERROR: Invalid pair '{pair}', expected run:program", file=sys.stderr)
            return 1
        run_id, program = parts[0], parts[1]

        t0 = time.time()
        try:
            events = run_request(args.base, run_id, program)
        except Exception as e:
            print(f"FAIL: request for {pair} failed: {e}", file=sys.stderr)
            return 1

        # Assert events
        if not events:
            print(f"FAIL: {pair}: no events received", file=sys.stderr)
            return 1

        start_event = events[0]
        if start_event.get("type") != "start":
            print(f"FAIL: {pair}: first event is not start: {start_event}", file=sys.stderr)
            return 1
        if start_event.get("episode_len") != 15:
            print(f"FAIL: {pair}: episode_len is not 15: {start_event}", file=sys.stderr)
            return 1

        step_events = [ev for ev in events if ev.get("type") == "step"]
        if len(step_events) != 15:
            print(f"FAIL: {pair}: expected 15 step events, got {len(step_events)}", file=sys.stderr)
            return 1

        for i, ev in enumerate(step_events, 1):
            if ev.get("index") != i:
                print(f"FAIL: {pair}: step {i} has index {ev.get('index')}", file=sys.stderr)
                return 1
            if not ev.get("pass"):
                print(f"FAIL: {pair}: step {i} missing pass", file=sys.stderr)
                return 1
            if ev.get("count") is None or ev.get("count") <= 0:
                print(f"FAIL: {pair}: step {i} invalid count {ev.get('count')}", file=sys.stderr)
                return 1

        done_event = events[-1]
        if done_event.get("type") != "done":
            print(f"FAIL: {pair}: last event is not done: {done_event}", file=sys.stderr)
            return 1

        final = done_event.get("final")
        stored_final = done_event.get("stored_final")
        match = done_event.get("match")

        if stored_final is not None:
            if not match:
                print(f"FAIL: {pair}: match is False (final={final}, stored={stored_final})", file=sys.stderr)
                return 1
            if final != stored_final:
                print(f"FAIL: {pair}: final {final} != stored_final {stored_final}", file=sys.stderr)
                return 1

            ref_final = data_eval_map.get((run_id, program))
            if ref_final is not None and final != ref_final:
                print(f"FAIL: {pair}: final {final} != data.json final {ref_final}", file=sys.stderr)
                return 1

        elapsed = done_event.get("seconds", round(time.time() - t0, 3))
        print(f"  {run_id}:{program:<14} final={final} stored={stored_final} match={match} ({elapsed}s)")

    # 4. Test --busy if requested
    if args.busy:
        test_pair = args.pairs[0] if args.pairs else "dense_s0:blowfish"
        r_id, prog = test_pair.split(":")
        test_busy(args.base, r_id, prog)

    # 5. Check --no-writes
    if args.no_writes and before_tree is not None:
        after_tree = scan_tree(["results", "runs"])
        modified = []
        for path, meta in after_tree.items():
            if path not in before_tree:
                modified.append(f"new file: {path}")
            elif meta != before_tree[path]:
                modified.append(f"modified file: {path}")
        for path in before_tree:
            if path not in after_tree:
                modified.append(f"deleted file: {path}")

        if modified:
            print("FAIL: files in results/ or runs/ were modified:", file=sys.stderr)
            for m in modified:
                print(f"  {m}", file=sys.stderr)
            return 1
        print("Write check: OK (no files modified in results/ or runs/)")

    print(f"live_check: OK ({len(args.pairs)} pairs verified)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
