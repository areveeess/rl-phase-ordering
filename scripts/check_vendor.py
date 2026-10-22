"""Re-hash gate for web/vendor/ (UI-SPEC Registry Safety).

web/vendor/README.md holds a provenance table (path | source | version | licence |
sha256). This script re-hashes every file under web/vendor/ and compares it with
the recorded value. It reports every failure, not only the first, and exits 1 on:

  FAIL: sha256 mismatch: <path>   the bytes changed
  FAIL: not recorded: <path>      a file exists under web/vendor/ but has no row
  FAIL: missing file: <path>      a row names a file that does not exist
  FAIL: bad row: <text>           a table row without a usable path or sha256

Usage:  python scripts/check_vendor.py [--root DIR]
--root is the directory that contains web/ (default: the repository root).
"""
import argparse
import hashlib
import pathlib
import re
import sys

VENDOR = "web/vendor"
README = "README.md"
HEX64 = re.compile(r"[0-9a-f]{64}")


def parse_table(text):
    """Return ({repo-relative path: sha256}, [problems]) from the markdown table."""
    recorded, problems = {}, []
    path_col, sha_col = None, None
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", c) for c in cells if c):
            continue  # separator row
        low = [c.lower() for c in cells]
        if "path" in low and "sha256" in low:
            path_col, sha_col = low.index("path"), low.index("sha256")
            continue
        if path_col is None:
            continue
        if len(cells) <= max(path_col, sha_col):
            problems.append("FAIL: bad row: " + s)
            continue
        raw = cells[path_col].strip("`").replace("\\", "/")
        sha = cells[sha_col].strip("`").lower()
        if not raw or not HEX64.fullmatch(sha):
            problems.append("FAIL: bad row: " + s)
            continue
        path = raw if raw.startswith(VENDOR + "/") else VENDOR + "/" + raw.lstrip("/")
        recorded[path] = sha
    return recorded, problems


def main(argv=None):
    here = pathlib.Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(here.parent),
                    help="directory containing web/ (default: repository root)")
    root = pathlib.Path(ap.parse_args(argv).root)
    vendor = root / VENDOR
    readme = vendor / README
    if not readme.is_file():
        print("FAIL: missing file: %s/%s" % (VENDOR, README))
        return 1

    recorded, failures = parse_table(readme.read_text(encoding="utf-8"))
    on_disk = {}
    for p in sorted(vendor.rglob("*")):
        if p.is_file() and not (p.parent == vendor and p.name == README):
            on_disk[p.relative_to(root).as_posix()] = p

    for path in sorted(on_disk):
        if path not in recorded:
            failures.append("FAIL: not recorded: " + path)
    for path, sha in sorted(recorded.items()):
        f = on_disk.get(path)
        if f is None:
            failures.append("FAIL: missing file: " + path)
        elif hashlib.sha256(f.read_bytes()).hexdigest() != sha:
            failures.append("FAIL: sha256 mismatch: " + path)

    if failures:
        print("\n".join(failures))
        return 1
    print("check_vendor: OK (%d files)" % len(recorded))
    return 0


if __name__ == "__main__":
    sys.exit(main())
