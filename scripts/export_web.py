"""Build web/data.json and web/data.js from the project's result files (phase 8, D-03, D-05).

Every number on the web page is read here from results/*.csv, results/*_check.txt, splits/split.json
and runs/*/{run.json,train_log.csv,val_selection.csv}; nothing is typed by hand. The script writes
only web/data.json and web/data.js, never anything under results/ or runs/ (D-05). Before writing it
runs scripts/check_web.py's run_checks() on the finished data and aborts without writing when any
check fails.

Usage (repo root, Windows or WSL, stdlib + pandas):  python scripts/export_web.py
"""
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_web  # noqa: E402  (run_checks is shared with the standalone check)

SCHEMA = 1
SPLITS = ["train", "val", "test"]


class Reader:
    """Reads source files under ROOT and remembers every path it read, repo-relative."""

    def __init__(self, root):
        self.root = Path(root)
        self.sources = []

    def _note(self, rel):
        if rel not in self.sources:
            self.sources.append(rel)

    def csv(self, rel):
        """A CSV as a DataFrame of strings (no type guessing, no NaN conversion), so floats are parsed once, exactly."""
        self._note(rel)
        return pd.read_csv(self.root / rel, dtype=str, keep_default_na=False, encoding="utf-8")

    def text(self, rel):
        self._note(rel)
        return (self.root / rel).read_text(encoding="utf-8")

    def json(self, rel):
        self._note(rel)
        return json.loads((self.root / rel).read_text(encoding="utf-8"))


def git_commit(root):
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else None


def build_summary(rd):
    """One entry per split from summary_reduction.csv (reductions as fractions, exactly as in the CSV)."""
    rows = []
    for r in rd.csv("results/summary_reduction.csv").to_dict("records"):
        rows.append({
            "split": r["split"],
            "programs": int(r["programs"]),
            "O2": float(r["-O2"]),
            "O3": float(r["-O3"]),
            "Oz": float(r["-Oz"]),
            "random": float(r["random seq"]),
            "best_fixed": float(r["best fixed seq"]),
            "dense_mean": float(r["RL dense (mean)"]),
            "dense_sd": float(r["RL dense (sd)"]),
            "sparse_mean": float(r["RL sparse (mean)"]),
            "sparse_sd": float(r["RL sparse (sd)"]),
            "long_dense": None,
            "long_sparse": None,
        })
    return rows


def build_data(root=ROOT):
    """The page data as a dict. Reads only the D-03 sources."""
    rd = Reader(root)
    data = {
        "schema": SCHEMA,
        "built": datetime.date.today().isoformat(),
        "commit": git_commit(root),
        "sources": rd.sources,  # same list object, filled as files are read
        "split": rd.json("splits/split.json"),
        "summary": build_summary(rd),
    }
    return data


def atomic_write(path, text):
    """Write text through a tmp file and os.replace, so a crash never leaves a truncated file."""
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


def main():
    if not (ROOT / "runs").is_dir():
        print("runs/ not found: data.json is built from the local training runs; the committed web/data.json is still valid")
        return 1
    web = (ROOT / "web").resolve()
    outputs = [web / "data.json", web / "data.js"]
    for p in outputs:  # D-05: only ever write inside ROOT/web
        rp = p.resolve()
        if rp.parent != web or web.parent != ROOT.resolve():
            print(f"refusing to write outside web/: {rp}")
            return 1
    # Round-trip through JSON so the checks see exactly what the page will see.
    data = json.loads(json.dumps(build_data(ROOT), ensure_ascii=False, allow_nan=False))
    failures, n = check_web.run_checks(data, ROOT)
    if failures:
        for f in failures:
            print(f)
        print(f"export_web: {len(failures)} check(s) failed, nothing written")
        return 1
    pretty = json.dumps(data, indent=1, ensure_ascii=False, allow_nan=False) + "\n"
    compact = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    compact = compact.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    atomic_write(outputs[0], pretty)
    atomic_write(outputs[1], "window.DATA = " + compact + ";\n")
    for p in outputs:
        print(f"wrote {p.relative_to(ROOT).as_posix()} ({p.stat().st_size} bytes, {n} assertions passed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
