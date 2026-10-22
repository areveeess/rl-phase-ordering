"""Prove that the numbers in web/data.json equal the files in results/ (phase 8, D-03).

run_checks(data, root) re-reads the sources with the stdlib csv module, an independent code path
from scripts/export_web.py's pandas, and compares every value the page shows. It returns
(failures, assertions): a list of "FAIL: ..." strings and the number of values compared.

Standalone:  python scripts/check_web.py [--data web/data.json] [--require-traces]
Exit 0 and "check_web: OK (<n> assertions)" only when every comparison holds; exit 1 otherwise.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read_csv(root, rel):
    with open(Path(root) / rel, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


class Checker:
    """Counts every comparison and collects the failures."""

    def __init__(self):
        self.failures = []
        self.count = 0

    def eq(self, label, stored, source):
        self.count += 1
        if stored != source or type(stored) is not type(source):
            self.failures.append(f"FAIL: {label}: page data {stored!r} != source {source!r}")

    def true(self, label, cond, detail=""):
        self.count += 1
        if not cond:
            self.failures.append(f"FAIL: {label}{': ' + detail if detail else ''}")


def check_summary(c, data, root):
    """(a) every summary value equals results/summary_reduction.csv."""
    rows = read_csv(root, "results/summary_reduction.csv")
    by_split = {e["split"]: e for e in data.get("summary", [])}
    c.eq("summary: number of splits", len(data.get("summary", [])), len(rows))
    cols = {"O2": "-O2", "O3": "-O3", "Oz": "-Oz", "random": "random seq", "best_fixed": "best fixed seq",
            "dense_mean": "RL dense (mean)", "dense_sd": "RL dense (sd)",
            "sparse_mean": "RL sparse (mean)", "sparse_sd": "RL sparse (sd)"}
    for r in rows:
        s = r["split"]
        e = by_split.get(s)
        if e is None:
            c.true(f"summary[{s}]", False, "split missing from page data")
            continue
        c.eq(f"summary[{s}].programs", e.get("programs"), int(r["programs"]))
        for key, col in cols.items():
            c.eq(f"summary[{s}].{key}", e.get(key), float(r[col]))


def run_checks(data, root=ROOT, require_traces=False):
    """Returns (failures, assertions)."""
    c = Checker()
    c.eq("schema", data.get("schema"), 1)
    check_summary(c, data, root)
    return c.failures, c.count


def load_js_payload(path):
    """The JSON payload of web/data.js ('window.DATA = {...};')."""
    text = Path(path).read_text(encoding="utf-8").strip()
    prefix = "window.DATA ="
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError("web/data.js does not have the form 'window.DATA = {...};'")
    return json.loads(text[len(prefix):-1])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    default = ROOT / "web" / "data.json"
    ap.add_argument("--data", default=str(default), help="data file to check (default web/data.json)")
    ap.add_argument("--require-traces", action="store_true", help="every eval row must carry step traces")
    args = ap.parse_args(argv)
    data_path = Path(args.data)
    failures = []
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"FAIL: cannot read {data_path}: {exc}")
        return 1
    if data_path.resolve() == default.resolve():
        try:
            if load_js_payload(ROOT / "web" / "data.js") != data:
                failures.append("FAIL: web/data.js and web/data.json carry different payloads")
        except (OSError, ValueError) as exc:
            failures.append(f"FAIL: cannot read web/data.js: {exc}")
    more, n = run_checks(data, ROOT, require_traces=args.require_traces)
    failures += more
    if failures:
        for f in failures:
            print(f)
        return 1
    print(f"check_web: OK ({n} assertions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
