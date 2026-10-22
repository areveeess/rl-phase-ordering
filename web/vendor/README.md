# web/vendor

These third-party files are copied into the repository so the explorer works offline and on GitHub Pages with nothing fetched from a CDN or from the gitignored `.agents/` folder at runtime (D-06).

| path | source | version | licence | sha256 |
|------|--------|---------|---------|--------|
| web/vendor/app.css | taste-skill assets/ (Leonxlnx/taste-skill via skills-lock.json) | 65049e1890f5fedf8f8e1144848f07bcda788e51c22bac78afbd073aeb486725 | see skill README | a7ae6a5f4efb53f0eaf944d05b85cace394d4c985cc37d919d609776d8660a52 |
| web/vendor/charts.js | taste-skill assets/ (Leonxlnx/taste-skill via skills-lock.json) | 65049e1890f5fedf8f8e1144848f07bcda788e51c22bac78afbd073aeb486725 | see skill README | 0cf969306a1a2036aabdd12f98646451d504a351cdd8328e8f80bbfb8bca5a31 |
| web/vendor/fonts/Geist-Regular.woff2 | npm geist | 1.8.2 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 47855d1c577de88e8528a628130e210be0939216f3b5383fe87b62d4295eb9de |
| web/vendor/fonts/Geist-Medium.woff2 | npm geist | 1.8.2 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 865f5097d2abcee4f83bd5eb5da193437644421606d28358cd2a45e5fff0cb16 |
| web/vendor/fonts/GeistMono-Regular.woff2 | npm geist | 1.8.2 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 982d848655b7b0f089531e63b322361be64c143ea5532bc5304ce072f7992909 |
| web/vendor/fonts/OFL.txt | npm geist (package/LICENSE.txt) | 1.8.2 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 930853ee1daa68554d9e35c8a9175affb74f699fad9a5da6ee5ebe76379d9137 |

The taste-skill README states no licence for its asset files; the entry above records that. The registry integrity for geist 1.8.2 was `sha512-fRF4sbJ9qcCxPb35cVtKBAwYlTt1IbU9nkbPi0a+xyZqPIjCJ2BY8ekGhx6/SGSZKrR7/UuL57r/eeDQ1Xy11g==`.

Do not edit these files; overrides go in `web/app.css` and `web/charts-ext.js`. To re-check them, run `python scripts/check_vendor.py` (it exits 1 on any hash mismatch, missing row or unlisted file). `.gitattributes` marks `web/vendor/` as `-text` so line-ending conversion on Windows cannot change the hashes.
