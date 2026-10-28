"""Render web/index.html in headless Chrome or Edge from file:// and check the resulting DOM (phase 8).

Usage:  python scripts/render_check.py ROUTE [--theme light|dark] [--width 1440]
            [--expect TEXT ...] [--offline] [--fonts] [--allow-error-state]

An expected text that starts with a dash is passed as --expect=TEXT. Exit 0 and
"render_check: OK <route> (<n> expectations)" when every check holds; exit 1 when one fails; exit 2
when no browser is installed. Stdlib only.
"""
import argparse
import html
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def find_browser():
    env = os.environ.get("CHROME_PATH")
    if env and Path(env).is_file():
        return env
    pf, pf86, local = (os.environ.get(k, "") for k in ("ProgramFiles", "ProgramFiles(x86)", "LocalAppData"))
    candidates = [Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe" for base in (pf, pf86, local) if base]
    candidates += [Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe" for base in (pf86, pf) if base]
    candidates += [Path(p) for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser")]
    for p in candidates:
        if p.is_file():
            return str(p)
    return None


def dom_text(dom):
    """Visible text of a DOM dump: scripts and styles dropped, tags stripped, entities decoded, whitespace collapsed."""
    dom = re.sub(r"(?is)<(script|style)\b.*?</\1\s*>", " ", dom)
    dom = re.sub(r"(?s)<!--.*?-->", " ", dom)
    dom = re.sub(r"(?s)<[^>]+>", " ", dom)
    return re.sub(r"\s+", " ", html.unescape(dom)).strip()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("route", help="route name or path after #/, e.g. overview or programs/blowfish")
    ap.add_argument("--theme", choices=["light", "dark"])
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--expect", action="append", default=[], metavar="TEXT", help="text the DOM must contain (repeatable)")
    ap.add_argument("--offline", action="store_true", help="map every host to NOTFOUND (no network)")
    ap.add_argument("--fonts", action="store_true", help="require data-fonts on <html> to list Archivo and Source Serif 4")
    ap.add_argument("--allow-error-state", action="store_true", help="do not fail on data-state=\"error\"")
    args = ap.parse_args(argv)

    browser = find_browser()
    if not browser:
        print("render_check: no Chrome or Edge found; set CHROME_PATH to a browser executable", file=sys.stderr)
        return 2
    page = (ROOT / "web" / "index.html").resolve().as_uri()
    url = page + (f"?theme={args.theme}" if args.theme else "") + "#/" + args.route.lstrip("/")

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        cmd = [browser, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}",
               f"--window-size={args.width},900", "--enable-logging=stderr", "--v=0",
               "--virtual-time-budget=10000", "--dump-dom"]
        if args.offline:
            cmd.append("--host-resolver-rules=MAP * ~NOTFOUND")
        cmd.append(url)
        try:
            run = subprocess.run(cmd, capture_output=True, timeout=90)
        except subprocess.TimeoutExpired:
            print("FAIL: browser timed out after 90 s")
            return 1
    dom = run.stdout.decode("utf-8", errors="replace")
    err = run.stderr.decode("utf-8", errors="replace")
    text = dom_text(dom)

    failed = 0

    def report(ok, label):
        nonlocal failed
        print(("ok:      " if ok else "FAIL:    ") + label)
        failed += 0 if ok else 1

    report(run.returncode == 0, f"browser exit code {run.returncode}")
    report(bool(re.search(r"<h1[\s>]", dom)), "DOM has an h1 element")
    for want in args.expect:
        found = html.unescape(want) in text
        report(found, f"DOM text contains {want!r}")
        if not found:
            print(f"MISSING: {want}")
    uncaught = [ln.strip() for ln in err.splitlines() if "CONSOLE" in ln and "Uncaught" in ln]
    report(not uncaught, "no Uncaught error in the console")
    for ln in uncaught:
        print(f"Uncaught: {ln}")
    if not args.allow_error_state:
        report(not re.search(r"""data-state\s*=\s*["']error["']""", dom), 'no element with data-state="error"')
    if args.fonts:
        m = re.search(r"""<html\b[^>]*\bdata-fonts\s*=\s*["']([^"']*)["']""", dom)
        tokens = {t.strip() for t in re.split(r"[,;|]", m.group(1))} if m else set()
        report({"Archivo", "Source Serif 4"} <= tokens, f"html data-fonts lists Archivo and Source Serif 4 (got {sorted(tokens)})")

    if failed:
        return 1
    print(f"render_check: OK {args.route} ({len(args.expect)} expectations)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
