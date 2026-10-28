"""Unit tests for web/server.py (Task 2 of Plan 08-06).

Tests routing, validation, origin and host checks, path traversal protection,
concurrency lock (409), error recovery, and read-only invariants using a fake runner.
Runs on Windows Python 3.13 without CompilerGym.
"""
import http.client
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time
import unittest

# Import web/server.py via importlib
SERVER_PATH = Path(__file__).resolve().parent.parent / "web" / "server.py"
spec = importlib.util.spec_from_file_location("web_server", str(SERVER_PATH))
server_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_mod)


class FakeRunner:
    def __init__(self, root, meta, block_event=None, should_raise=False):
        self.root = root
        self.meta = meta
        self.block_event = block_event
        self.should_raise = should_raise
        self.closed = False

    def get_env_status(self):
        return "idle"

    def close(self):
        self.closed = True

    def run(self, run_meta, program, stored_final):
        yield {
            "type": "start",
            "run": run_meta["id"],
            "program": program,
            "o0": 3000,
            "stored_final": stored_final,
            "episode_len": 15
        }

        yield {
            "type": "step",
            "index": 1,
            "pass": "-sroa",
            "count": 2500,
            "no_effect": False
        }

        if self.should_raise:
            yield {
                "type": "error",
                "step": 2,
                "message": "RuntimeError: Simulated crash",
                "kind": "service"
            }
            return

        if self.block_event is not None:
            self.block_event.wait(timeout=10)

        for i in range(2, 16):
            yield {
                "type": "step",
                "index": i,
                "pass": "-sroa",
                "count": 2500,
                "no_effect": True
            }

        yield {
            "type": "done",
            "final": 2500,
            "stored_final": stored_final,
            "match": (2500 == stored_final) if stored_final is not None else None,
            "no_effect": 14,
            "seconds": 0.05
        }

    def run_sequence(self, program, passes):
        self.last_sequence = (program, list(passes))
        yield {"type": "start", "program": program, "o0": 3000, "passes": list(passes), "episode_len": len(passes)}
        if self.block_event is not None:
            self.block_event.wait(timeout=10)
        count = 3000
        for i, name in enumerate(passes, start=1):
            changed = name != "NOOP"
            if changed:
                count -= 100
            yield {"type": "step", "index": i, "pass": name, "count": count, "no_effect": not changed}
        yield {"type": "done", "final": count, "no_effect": passes.count("NOOP"), "seconds": 0.01}


class ServerTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create fixture directory
        cls.tmp_dir = tempfile.mkdtemp(prefix="test_server_fixture_")
        cls.root = Path(cls.tmp_dir)

        # 1. web/
        web = cls.root / "web"
        web.mkdir()
        (web / "index.html").write_text("<!doctype html><html><body>Test</body></html>", encoding="utf-8")
        (web / "test.js").write_text("console.log('test');", encoding="utf-8")
        (web / "server.py").write_text("# Should never be served", encoding="utf-8")
        (web / ".hidden").write_text("secret", encoding="utf-8")

        # 2. splits/
        splits = cls.root / "splits"
        splits.mkdir()
        (splits / "split.json").write_text(json.dumps({
            "test": ["blowfish"],
            "val": ["patricia"],
            "train": ["crc32"]
        }), encoding="utf-8")

        # 3. results/
        results = cls.root / "results"
        results.mkdir()
        (results / "eval.csv").write_text(
            "run,reward,seed,split,benchmark,O0,final,sequence,noop_count,no_effect,replay_final,replay_ok,error\n"
            "dense_s0,dense,0,test,blowfish,3000,2500,-sroa,0,14,2500,True,\n",
            encoding="utf-8"
        )

        # 4. rlpo/env.py (the server reads PASSES and NOOP from it without importing it)
        rlpo = cls.root / "rlpo"
        rlpo.mkdir()
        (rlpo / "env.py").write_text(
            'import compiler_gym\nPASSES = ["-sroa", "-gvn", "-dce"]\nNOOP = "NOOP"\nACTIONS = PASSES + [NOOP]\n',
            encoding="utf-8"
        )

        # 5. runs/
        run_dir = cls.root / "runs" / "dense_s0"
        run_dir.mkdir(parents=True)
        (run_dir / "policy.pt").write_bytes(b"FAKE_POLICY_WEIGHTS")
        (run_dir / "run.json").write_text(json.dumps({
            "id": "dense_s0",
            "reward": "dense",
            "seed": 0,
            "episodes": 320
        }), encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp_dir, ignore_errors=True)

    def setUp(self):
        self.block_event = None
        self.should_raise = False

        def factory(root, meta):
            return FakeRunner(root, meta, self.block_event, self.should_raise)

        # Port 0 selects an ephemeral free port
        self.server = server_mod.make_server(self.root, 0, runner_factory=factory)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def request(self, method, path, headers=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        req_headers = {"Host": f"127.0.0.1:{self.port}"}
        if headers:
            req_headers.update(headers)
        conn.request(method, path, body=body, headers=req_headers)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, resp.headers, data

    def test_01_health(self):
        """GET /api/health returns 200 JSON with ok true."""
        status, headers, data = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(headers.get("Content-Type", "").startswith("application/json"))
        d = json.loads(data.decode("utf-8"))
        self.assertTrue(d.get("ok"))
        self.assertEqual(d.get("service"), "phase-ordering-live")
        self.assertFalse(d.get("busy"))
        self.assertEqual(d.get("env"), "idle")

    def test_02_runs(self):
        """GET /api/runs lists allow-listed runs and split programs."""
        status, headers, data = self.request("GET", "/api/runs")
        self.assertEqual(status, 200)
        d = json.loads(data.decode("utf-8"))
        self.assertEqual(d.get("episode_len"), 15)
        run_ids = [r["id"] for r in d.get("runs", [])]
        self.assertIn("dense_s0", run_ids)
        self.assertEqual(d["programs"]["test"], ["blowfish"])

    def test_03_post_run_success(self):
        """POST /api/run streams valid NDJSON events with final match."""
        status, headers, data = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status, 200)
        self.assertTrue(headers.get("Content-Type", "").startswith("application/x-ndjson"))
        lines = [json.loads(line) for line in data.decode("utf-8").strip().splitlines() if line]
        self.assertGreaterEqual(len(lines), 17)  # 1 start + 15 steps + 1 done
        self.assertEqual(lines[0]["type"], "start")
        self.assertEqual(lines[-1]["type"], "done")
        self.assertTrue(lines[-1]["match"])
        self.assertEqual(lines[-1]["final"], 2500)

    def test_04_unknown_run_or_program_404(self):
        """POST /api/run with unknown run or program returns 404."""
        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "unknown_run", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status, 404)

        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "unknown_prog"}).encode("utf-8")
        )
        self.assertEqual(status, 404)

    def test_05_malformed_json_or_missing_fields_400(self):
        """POST /api/run with malformed JSON or missing fields returns 400."""
        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=b"not json"
        )
        self.assertEqual(status, 400)

        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0"}).encode("utf-8")  # missing program
        )
        self.assertEqual(status, 400)

    def test_06_unsupported_media_type_415(self):
        """POST /api/run with text/plain body returns 415."""
        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "text/plain"},
            body=b"hello"
        )
        self.assertEqual(status, 415)

    def test_07_payload_too_large_413(self):
        """POST /api/run with body > 1024 bytes returns 413."""
        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json", "Content-Length": "2000"},
            body=b" " * 2000
        )
        self.assertEqual(status, 413)

    def test_08_host_header_protection_403(self):
        """Host header other than localhost/127.0.0.1 on the server port returns 403."""
        status, _, _ = self.request("GET", "/api/health", headers={"Host": "attacker.com"})
        self.assertEqual(status, 403)

        status, _, _ = self.request("POST", "/api/run", headers={"Host": "attacker.com"})
        self.assertEqual(status, 403)

        status, _, _ = self.request("GET", "/index.html", headers={"Host": f"localhost:{self.port + 1}"})
        self.assertEqual(status, 403)

    def test_09_origin_and_cors(self):
        """Non-loopback Origin returns 403; loopback origin gets CORS echoed."""
        status, _, _ = self.request(
            "POST",
            "/api/run",
            headers={"Origin": "https://example.org", "Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status, 403)

        # OPTIONS with loopback origin
        status, headers, _ = self.request(
            "OPTIONS",
            "/api/run",
            headers={"Origin": "http://127.0.0.1:8000"}
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:8000")

        # GET /api/health with Origin null -> no CORS header
        status, headers, _ = self.request("GET", "/api/health", headers={"Origin": "null"})
        self.assertEqual(status, 200)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_10_static_path_traversal_protection(self):
        """Directory traversal and protected files return 404."""
        status, _, _ = self.request("GET", "/../results/eval.csv")
        self.assertEqual(status, 404)

        status, _, _ = self.request("GET", "/%2e%2e/results/eval.csv")
        self.assertEqual(status, 404)

        status, _, _ = self.request("GET", "/server.py")
        self.assertEqual(status, 404)

        status, _, _ = self.request("GET", "/.hidden")
        self.assertEqual(status, 404)

        # Valid index.html returns 200
        status, _, data = self.request("GET", "/index.html")
        self.assertEqual(status, 200)
        self.assertIn(b"Test", data)

    def test_11_busy_concurrency_lock_409(self):
        """While runner holds the lock, second POST /api/run returns 409 busy."""
        self.server.runner.block_event = threading.Event()
        first_resp = []

        def worker1():
            status, _, data = self.request(
                "POST",
                "/api/run",
                headers={"Content-Type": "application/json"},
                body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
            )
            first_resp.append((status, data))

        t = threading.Thread(target=worker1)
        t.start()
        time.sleep(0.2)

        # Second request should get 409
        status2, _, data2 = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status2, 409)
        d2 = json.loads(data2.decode("utf-8"))
        self.assertEqual(d2.get("error"), "busy")

        # Release first worker
        self.server.runner.block_event.set()
        t.join(timeout=10)
        self.assertEqual(first_resp[0][0], 200)

    def test_12_error_recovery_and_next_run(self):
        """Runner raising mid-run yields error event and next run succeeds."""
        self.server.runner.should_raise = True
        status, _, data = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status, 200)
        lines = [json.loads(line) for line in data.decode("utf-8").strip().splitlines() if line]
        error_ev = [ev for ev in lines if ev.get("type") == "error"]
        self.assertEqual(len(error_ev), 1)
        self.assertEqual(error_ev[0]["step"], 2)

        # Next run succeeds
        self.server.runner.should_raise = False
        status2, _, data2 = self.request(
            "POST",
            "/api/run",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8")
        )
        self.assertEqual(status2, 200)
        lines2 = [json.loads(line) for line in data2.decode("utf-8").strip().splitlines() if line]
        self.assertEqual(lines2[-1]["type"], "done")

    def post_sequence(self, body, headers=None):
        hdrs = {"Content-Type": "application/json"}
        if headers:
            hdrs.update(headers)
        return self.request("POST", "/api/sequence", headers=hdrs, body=json.dumps(body).encode("utf-8"))

    def test_13_runs_lists_actions(self):
        """GET /api/runs lists the pass names read from rlpo/env.py, NOOP last."""
        _, _, data = self.request("GET", "/api/runs")
        d = json.loads(data.decode("utf-8"))
        self.assertEqual(d.get("actions"), ["-sroa", "-gvn", "-dce", "NOOP"])

    def test_14_post_sequence_success(self):
        """POST /api/sequence streams start, one step per pass, then done."""
        passes = ["-sroa", "NOOP", "-gvn"]
        status, headers, data = self.post_sequence({"program": "crc32", "passes": passes})
        self.assertEqual(status, 200)
        self.assertTrue(headers.get("Content-Type", "").startswith("application/x-ndjson"))
        lines = [json.loads(line) for line in data.decode("utf-8").strip().splitlines() if line]
        self.assertEqual([ev["type"] for ev in lines], ["start", "step", "step", "step", "done"])
        self.assertEqual([ev["pass"] for ev in lines if ev["type"] == "step"], passes)
        self.assertEqual(lines[-1]["final"], 2800)
        self.assertEqual(self.server.runner.last_sequence, ("crc32", passes))

    def test_15_post_sequence_validation(self):
        """Bad sequences are refused before the runner starts."""
        for body in (
            {"program": "crc32", "passes": []},                  # empty
            {"program": "crc32", "passes": ["-sroa"] * 16},      # longer than an episode
            {"program": "crc32", "passes": "-sroa"},             # not a list
            {"program": "crc32", "passes": ["-sroa", 3]},        # not all strings
            {"passes": ["-sroa"]},                               # no program
        ):
            status, _, _ = self.post_sequence(body)
            self.assertEqual(status, 400, body)

        for body in (
            {"program": "crc32", "passes": ["-O3"]},             # not in the action list
            {"program": "crc32", "passes": ["-sroa; rm -rf /"]},
            {"program": "unknown_prog", "passes": ["-sroa"]},
        ):
            status, _, _ = self.post_sequence(body)
            self.assertEqual(status, 404, body)

        status, _, _ = self.post_sequence({"program": "crc32", "passes": ["-sroa"]},
                                          headers={"Origin": "https://example.org"})
        self.assertEqual(status, 403)
        self.assertFalse(hasattr(self.server.runner, "last_sequence"))

    def test_16_sequence_shares_the_run_lock(self):
        """A sequence run holds the same one-at-a-time lock as a policy run."""
        self.server.runner.block_event = threading.Event()
        first = []
        t = threading.Thread(target=lambda: first.append(self.post_sequence({"program": "crc32", "passes": ["-sroa"]})))
        t.start()
        time.sleep(0.2)
        status, _, _ = self.request("POST", "/api/run", headers={"Content-Type": "application/json"},
                                    body=json.dumps({"run": "dense_s0", "program": "blowfish"}).encode("utf-8"))
        self.assertEqual(status, 409)
        status, _, _ = self.post_sequence({"program": "crc32", "passes": ["-gvn"]})
        self.assertEqual(status, 409)
        self.server.runner.block_event.set()
        t.join(timeout=10)
        self.assertEqual(first[0][0], 200)


if __name__ == "__main__":
    unittest.main()
