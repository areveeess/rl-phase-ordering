"""Source-hygiene gate for web/ (phase 8): every later plan's gate runs it.

Scans web/*.html, web/*.js, web/*.css and web/views/* (not web/vendor/, web/data.js, web/data.json,
web/traces.json, web/server.py) and fails on three kinds of hit, each printed as
"FAIL: <kind>: <file>:<line>: <text>":

  html-injection  the element inner/outer HTML setters, the adjacent-HTML insert method, document write
  remote-load     a script or link tag, a script/link built in JS, a CSS url() or @import that loads from
                  http:, https: or // (an ordinary <a href> to another site is a link, not a load)
  typed-figure    a result figure typed by hand: a figure that web/data.json carries, written as a literal
                  (every summary reduction as a one-decimal percent such as 12.3, every program count of
                  1000 or more with a thousands separator, every run's first and last entropy at two
                  decimals, every replay "k of n"). Matched as whole tokens, so 12.3 does not match 112.34.

The gate reads web/data.json only: that file is proven equal to results/ by scripts/check_web.py.

Usage:  python scripts/check_web_source.py [--root DIR]
Exit 0 and "check_web_source: OK (<n> files)" or exit 1.
"""
import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
SKIP_FILES = {"data.js", "data.json", "traces.json", "server.py"}
SUFFIXES = {".html", ".js", ".css"}

INJECTION = re.compile(r"\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\s*\.\s*write(?:ln)?\s*\(")
REMOTE_PATTERNS = [
    re.compile(r"""<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*(?:https?:|//)""", re.I),
    re.compile(r"""\burl\(\s*["']?\s*(?:https?:|//)""", re.I),
    re.compile(r"""@import\s+(?:url\(\s*)?["']?\s*(?:https?:|//)""", re.I),
    re.compile(r"""\.(?:src|href)\s*=\s*["']\s*(?:https?:|//)""", re.I),
    re.compile(r"""\(\s*["'](?:script|link)["']\s*,\s*\{[^}]*\b(?:src|href)\s*:\s*["']\s*(?:https?:|//)""", re.I),
]


def source_files(root):
    web = Path(root) / "web"
    files = [p for p in sorted(web.glob("*")) if p.is_file() and p.suffix in SUFFIXES]
    files += [p for p in sorted((web / "views").glob("*")) if p.is_file()]
    return [p for p in files if p.name not in SKIP_FILES]  # web/vendor/ is a subdirectory that is never globbed


def thousands(n):
    return f"{n:,}"


def typed_figure_patterns(root):
    """(label, regex) for every figure web/data.json carries that must never be typed into a source file."""
    path = Path(root) / "web" / "data.json"
    if not path.is_file():
        return []
    d = json.loads(path.read_text(encoding="utf-8"))
    pats = {}

    def add(literal, label, kind):
        if kind == "num":    # one-decimal or two-decimal number: not inside a longer number
            rx = r"(?<![\d.])" + re.escape(literal) + r"(?!\d)"
        elif kind == "count":  # number with a thousands separator
            rx = r"(?<![\d,.])" + re.escape(literal) + r"(?![\d,]|\.\d)"
        else:                  # "k of n"
            rx = r"(?<![\w])" + re.escape(literal) + r"(?![\w])"
        pats.setdefault(literal, (label, re.compile(rx)))

    for s in d.get("summary", []):
        for key in ("O2", "O3", "Oz", "random", "best_fixed", "dense_mean", "sparse_mean", "long_dense", "long_sparse"):
            if s.get(key) is not None:
                add(f"{s[key] * 100:.1f}", f"summary[{s['split']}].{key}", "num")
    counts = []
    for p in d.get("programs", []):
        counts += [p["O0"], p["O2"], p["O3"], p["Oz"], p["best_fixed"], p["random_best"]]
    counts += [e["final"] for e in d.get("eval", []) if e.get("final") is not None]
    for n in counts:
        if n >= 1000:
            add(thousands(n), f"program count {thousands(n)}", "count")
    for r in d.get("runs", []):
        ent = r["train_log"]["entropy"]
        if ent:
            add(f"{ent[0]:.2f}", f"runs[{r['id']}] entropy first", "num")
            add(f"{ent[-1]:.2f}", f"runs[{r['id']}] entropy last", "num")
    if d.get("constants", {}).get("uniform_entropy") is not None:
        add(f"{d['constants']['uniform_entropy']:.2f}", "uniform entropy", "num")
    for w in d.get("wtl", []):
        k, n = w["replay_ok"]
        add(f"{k} of {n}", f"wtl[{w['run']}/{w['split']}] replay", "of")
    for group, (k, n) in d.get("checks", {}).get("replay", {}).items():
        add(f"{k} of {n}", f"checks.replay.{group}", "of")
    return list(pats.values())


def scan(root):
    hits = []
    files = source_files(root)
    figures = typed_figure_patterns(root)
    for f in files:
        rel = f.relative_to(root).as_posix()
        for no, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            text = line.strip()[:160]
            if INJECTION.search(line):
                hits.append(f"FAIL: html-injection: {rel}:{no}: {text}")
            if any(p.search(line) for p in REMOTE_PATTERNS):
                hits.append(f"FAIL: remote-load: {rel}:{no}: {text}")
            for label, rx in figures:
                if rx.search(line):
                    hits.append(f"FAIL: typed-figure: {rel}:{no}: {text}  [{label}]")
                    break
    return files, hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(DEFAULT_ROOT), help="repo root (default: this repo)")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    files, hits = scan(root)
    if not files:
        print(f"FAIL: no web sources found under {root / 'web'}")
        return 1
    if hits:
        print("\n".join(hits))
        return 1
    print(f"check_web_source: OK ({len(files)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
