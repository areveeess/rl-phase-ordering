"""Live-run HTTP server for RL-Guided Compiler Phase Ordering (phase 8).

Runs inside WSL, binds 127.0.0.1, serves web/, and runs one trained policy at a time
greedily on a chosen cBench program, streaming NDJSON step events.

Endpoints:
  GET  /api/health -> 200 {"ok": true, "service": "phase-ordering-live", "busy": bool, "env": "not started"|"idle"|"running"}
  GET  /api/runs   -> 200 {"runs": [...], "programs": {"test": [...], "val": [...], "train": [...]}, "episode_len": 15}
  POST /api/run    -> 200 NDJSON stream (start, 15 steps, done)
  OPTIONS /api/run -> 204 CORS preflight for loopback origins
  GET  /*          -> static web/ files (.woff2, .js, .json, .css, .html)
"""
import argparse
import csv
import http.server
import json
import os
from pathlib import Path
import re
import socketserver
import sys
import threading
import time

DEFAULT_PORT = 8765
HOST_BIND = "127.0.0.1"
ROOT_DIR = Path(__file__).resolve().parent.parent

# Loopback Origin pattern: http://localhost:<port> or http://127.0.0.1:<port>
LOOPBACK_ORIGIN_RE = re.compile(r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$")


def load_metadata(root):
    """Load splits, allowed runs, and stored final counts from CSV files."""
    root = Path(root)

    # 1. Splits & programs
    split_file = root / "splits" / "split.json"
    programs_by_split = {"test": [], "val": [], "train": []}
    all_programs = set()
    if split_file.is_file():
        try:
            with open(split_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                for s in ("test", "val", "train"):
                    progs = data.get(s, [])
                    programs_by_split[s] = progs
                    all_programs.update(progs)
        except Exception as e:
            sys.stderr.write(f"Warning: failed to read {split_file}: {e}\n")

    # 2. Stored final instruction counts: {(run_id, program): final_count}
    stored_finals = {}
    for csv_rel in ("results/eval.csv", "results/long_eval.csv"):
        csv_path = root / csv_rel
        if csv_path.is_file():
            try:
                with open(csv_path, "r", encoding="utf-8", newline="") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        r_id = row.get("run")
                        b_mark = row.get("benchmark")
                        final_str = row.get("final")
                        if r_id and b_mark and final_str not in (None, "", "None"):
                            try:
                                stored_finals[(r_id, b_mark)] = int(final_str)
                            except ValueError:
                                pass
            except Exception as e:
                sys.stderr.write(f"Warning: failed to read {csv_path}: {e}\n")

    # 3. Allowed runs
    runs_dir = root / "runs"
    allowed_runs = []
    allowed_run_ids = set()
    if runs_dir.is_dir():
        for entry in sorted(runs_dir.iterdir()):
            if not entry.is_dir():
                continue
            r_id = entry.name
            policy_pt = entry / "policy.pt"
            run_json = entry / "run.json"
            if not (policy_pt.is_file() and run_json.is_file()):
                continue

            # Must have at least one stored row in eval.csv or long_eval.csv
            has_row = any(k[0] == r_id for k in stored_finals.keys())
            if not has_row:
                continue

            try:
                with open(run_json, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                continue

            reward = meta.get("reward", "dense")
            seed = meta.get("seed", 0)
            episodes = meta.get("episodes", 320)
            group = "long" if episodes > 1000 or r_id.startswith("long_") else "main"

            if group == "long":
                label = f"RL {reward}, {episodes} episodes"
            else:
                label = f"RL {reward}, seed {seed}"

            allowed_runs.append({
                "id": r_id,
                "label": label,
                "group": group,
                "reward": reward,
                "seed": seed,
                "episodes": episodes,
                "path": str(policy_pt)
            })
            allowed_run_ids.add(r_id)

    return {
        "programs_by_split": programs_by_split,
        "all_programs": all_programs,
        "allowed_runs": allowed_runs,
        "allowed_run_ids": allowed_run_ids,
        "stored_finals": stored_finals
    }


class RealCompilerGymRunner:
    """Lazy CompilerGym runner for greedy live evaluation."""

    def __init__(self, root):
        self.root = Path(root)
        self.env = None
        self._env_started = False
        self._lock = threading.Lock()

    def get_env_status(self):
        if not self._env_started:
            return "not started"
        return "idle"

    def _ensure_env(self):
        with self._lock:
            if self.env is None:
                sys.path.insert(0, str(self.root))
                from rlpo.env import PhaseOrderingEnv
                self.env = PhaseOrderingEnv()
                self._env_started = True
            return self.env

    def close(self):
        with self._lock:
            if self.env is not None:
                try:
                    self.env.close()
                except Exception as e:
                    sys.stderr.write(f"Error closing environment: {e}\n")
                self.env = None

    def run(self, run_meta, program, stored_final):
        t0 = time.time()
        current_step = 0
        try:
            env = self._ensure_env()

            # Import agent & torch lazily
            import torch
            from rlpo.agent import PolicyValueNet
            from rlpo.env import ACTIONS, STATE_DIM

            policy_path = run_meta["path"]
            net = PolicyValueNet(STATE_DIM, len(ACTIONS))
            net.load_state_dict(torch.load(policy_path, map_location="cpu", weights_only=True))
            net.eval()

            s = env.reset(program)
            yield {
                "type": "start",
                "run": run_meta["id"],
                "program": program,
                "o0": env.o0,
                "stored_final": stored_final,
                "episode_len": env.T
            }

            for index in range(1, env.T + 1):
                current_step = index
                a = net.act(s, greedy=True)
                before_no_effect = env.no_effect
                s, _, _ = env.step(a)
                step_no_effect = env.no_effect > before_no_effect
                yield {
                    "type": "step",
                    "index": index,
                    "pass": ACTIONS[a],
                    "count": env.count,
                    "no_effect": bool(step_no_effect)
                }
                time.sleep(0.35)

            elapsed = round(time.time() - t0, 3)
            yield {
                "type": "done",
                "final": env.count,
                "stored_final": stored_final,
                "match": (env.count == stored_final) if stored_final is not None else None,
                "no_effect": env.no_effect,
                "seconds": elapsed
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            err_msg = f"{type(e).__name__}: {str(e)}"
            err_kind = "service" if ("compiler_gym" in type(e).__module__ or "service" in str(e).lower()) else "other"
            yield {
                "type": "error",
                "step": current_step,
                "message": err_msg,
                "kind": err_kind
            }
            # Close and discard environment so next run starts fresh
            self.close()


def create_handler_class(root, meta, runner_factory, run_lock):
    web_dir = (Path(root) / "web").resolve()

    class LiveHandler(http.server.SimpleHTTPRequestHandler):
        server_version = "PhaseOrderingLive/1.0"

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(web_dir), **kwargs)

        def log_message(self, format, *args):
            # Keep stderr output quiet for normal status, log to stderr
            sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))

        def _is_host_allowed(self):
            host = self.headers.get("Host", "")
            port = self.server.server_port
            allowed = {f"localhost:{port}", f"127.0.0.1:{port}"}
            if port == 80:
                allowed.update({"localhost", "127.0.0.1"})
            return host in allowed

        def _get_origin(self):
            return self.headers.get("Origin")

        def _is_loopback_origin(self, origin):
            if not origin:
                return False
            return bool(LOOPBACK_ORIGIN_RE.match(origin))

        def _send_cors_headers(self, origin):
            if origin and self._is_loopback_origin(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Vary", "Origin")

        def _send_json(self, status_code, data, origin=None):
            body = json.dumps(data).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self._send_cors_headers(origin)
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()

        def do_OPTIONS(self):
            if not self._is_host_allowed():
                self._send_json(403, {"error": "forbidden"})
                return

            origin = self._get_origin()
            if origin and not self._is_loopback_origin(origin):
                self._send_json(403, {"error": "forbidden"})
                return

            if self.path in ("/api/run", "/api/health", "/api/runs"):
                self.send_response(204)
                self._send_cors_headers(origin)
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self._send_json(404, {"error": "not found"})

        def do_GET(self):
            if not self._is_host_allowed():
                self._send_json(403, {"error": "forbidden"})
                return

            origin = self._get_origin()
            # Clean path from query and hash
            clean_path = self.path.split("?")[0].split("#")[0]

            if clean_path == "/api/health":
                is_busy = run_lock.locked()
                runner = self.server.runner
                env_status = "running" if is_busy else runner.get_env_status()
                self._send_json(200, {
                    "ok": True,
                    "service": "phase-ordering-live",
                    "busy": is_busy,
                    "env": env_status
                }, origin=origin)
                return

            if clean_path == "/api/runs":
                clean_runs = [
                    {
                        "id": r["id"],
                        "label": r["label"],
                        "group": r["group"],
                        "reward": r["reward"],
                        "seed": r["seed"],
                        "episodes": r["episodes"]
                    }
                    for r in meta["allowed_runs"]
                ]
                self._send_json(200, {
                    "runs": clean_runs,
                    "programs": meta["programs_by_split"],
                    "episode_len": 15
                }, origin=origin)
                return

            # Static file serving: protect against traversal and forbidden files
            rel_path = clean_path.lstrip("/")
            if not rel_path:
                rel_path = "index.html"

            # Forbid dotfiles, python files, directories
            target_path = (web_dir / rel_path).resolve()
            try:
                target_path.relative_to(web_dir)
            except ValueError:
                self._send_json(404, {"error": "not found"})
                return

            if target_path.name.startswith(".") or target_path.suffix == ".py":
                self._send_json(404, {"error": "not found"})
                return

            if target_path.is_dir():
                index_cand = target_path / "index.html"
                if index_cand.is_file():
                    target_path = index_cand
                else:
                    # Disable directory listing
                    self._send_json(404, {"error": "not found"})
                    return

            if not target_path.is_file():
                self._send_json(404, {"error": "not found"})
                return

            # Explicit MIME types
            mime_map = {
                ".woff2": "font/woff2",
                ".js": "application/javascript",
                ".json": "application/json",
                ".css": "text/css",
                ".html": "text/html",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".svg": "image/svg+xml"
            }
            content_type = mime_map.get(target_path.suffix, "application/octet-stream")

            try:
                data = target_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Connection", "close")
                self._send_cors_headers(origin)
                self.end_headers()
                self.wfile.write(data)
                self.wfile.flush()
            except Exception:
                self._send_json(404, {"error": "not found"})

        def do_POST(self):
            if not self._is_host_allowed():
                self._send_json(403, {"error": "forbidden"})
                return

            origin = self._get_origin()
            if origin and not self._is_loopback_origin(origin):
                self._send_json(403, {"error": "forbidden"})
                return

            clean_path = self.path.split("?")[0].split("#")[0]
            if clean_path != "/api/run":
                self._send_json(404, {"error": "not found"}, origin=origin)
                return

            # Check Content-Type
            ctype = self.headers.get("Content-Type", "").split(";")[0].strip()
            if ctype != "application/json":
                self._send_json(415, {"error": "unsupported media type"}, origin=origin)
                return

            # Check Content-Length (max 1024 bytes)
            clength = self.headers.get("Content-Length")
            try:
                clength_int = int(clength) if clength else 0
            except ValueError:
                self._send_json(400, {"error": "bad request", "detail": "invalid Content-Length"}, origin=origin)
                return

            if clength_int > 1024:
                self._send_json(413, {"error": "too large"}, origin=origin)
                return

            raw_body = self.rfile.read(clength_int)
            try:
                req_json = json.loads(raw_body.decode("utf-8"))
            except Exception:
                self._send_json(400, {"error": "bad request", "detail": "malformed JSON"}, origin=origin)
                return

            if not isinstance(req_json, dict):
                self._send_json(400, {"error": "bad request", "detail": "JSON body must be an object"}, origin=origin)
                return

            run_id = req_json.get("run")
            program = req_json.get("program")

            if not isinstance(run_id, str) or not isinstance(program, str) or not run_id or not program:
                self._send_json(400, {"error": "bad request", "detail": "run and program must be non-empty strings"}, origin=origin)
                return

            if run_id not in meta["allowed_run_ids"] or program not in meta["all_programs"]:
                self._send_json(404, {"error": "unknown run or program"}, origin=origin)
                return

            # Find matching run metadata
            matching_run = next(r for r in meta["allowed_runs"] if r["id"] == run_id)
            stored_final = meta["stored_finals"].get((run_id, program))

            # Acquire non-blocking lock
            acquired = run_lock.acquire(blocking=False)
            if not acquired:
                self._send_json(409, {
                    "error": "busy",
                    "message": "Another run is already in progress. The server runs one at a time."
                }, origin=origin)
                return

            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Connection", "close")
                self._send_cors_headers(origin)
                self.end_headers()

                runner = self.server.runner
                gen = runner.run(matching_run, program, stored_final)
                for event in gen:
                    line = (json.dumps(event) + "\n").encode("utf-8")
                    self.wfile.write(line)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                sys.stderr.write("Client disconnected during run\n")
            finally:
                run_lock.release()

    return LiveHandler


class ThreadedLiveServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(root, port, runner_factory=None):
    root = Path(root).resolve()
    meta = load_metadata(root)
    run_lock = threading.Lock()

    if runner_factory is None:
        runner = RealCompilerGymRunner(root)
    else:
        runner = runner_factory(root, meta)

    handler_cls = create_handler_class(root, meta, runner_factory, run_lock)
    server = ThreadedLiveServer((HOST_BIND, port), handler_cls)
    server.runner = runner
    server.root = root
    server.run_lock = run_lock
    return server


def main():
    parser = argparse.ArgumentParser(description="Live RL phase-ordering runner server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on (default 8765)")
    parser.add_argument("--root", type=str, default=str(ROOT_DIR), help="Repo root directory")
    parser.add_argument("--daemon", action="store_true", help="Daemonize process into background")
    parser.add_argument("--pidfile", type=str, default="/tmp/phase-ordering-live.pid", help="Path to PID file")
    parser.add_argument("--logfile", type=str, default="/tmp/phase-ordering-live.log", help="Path to log file")
    args = parser.parse_args()

    if args.daemon and hasattr(os, "fork"):
        pid = os.fork()
        if pid > 0:
            sys.exit(0)
        os.setsid()
        pid = os.fork()
        if pid > 0:
            sys.exit(0)
        sys.stdout.flush()
        sys.stderr.flush()
        log_f = open(args.logfile, "a+", encoding="utf-8")
        os.dup2(log_f.fileno(), sys.stdout.fileno())
        os.dup2(log_f.fileno(), sys.stderr.fileno())

    if args.pidfile:
        with open(args.pidfile, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))

    server = make_server(args.root, args.port)
    port = server.server_port
    print(f"Phase ordering live server listening on http://localhost:{port}/", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...", flush=True)
    finally:
        server.server_close()
        server.runner.close()
        if args.pidfile and os.path.exists(args.pidfile):
            try:
                os.remove(args.pidfile)
            except OSError:
                pass
        print("Server shutdown complete.", flush=True)
        os._exit(0)


if __name__ == "__main__":
    main()
