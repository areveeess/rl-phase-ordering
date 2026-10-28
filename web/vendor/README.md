# web/vendor

These third-party files are copied into the repository so the explorer works offline and on GitHub Pages with nothing fetched from a CDN or from the gitignored `.agents/` folder at runtime (D-06).

| path | source | version | licence | sha256 |
|------|--------|---------|---------|--------|
| web/vendor/charts.js | taste-skill assets/ (Leonxlnx/taste-skill via skills-lock.json) | 65049e1890f5fedf8f8e1144848f07bcda788e51c22bac78afbd073aeb486725 | see skill README | 0cf969306a1a2036aabdd12f98646451d504a351cdd8328e8f80bbfb8bca5a31 |
| web/vendor/fonts/Archivo-wdth-wght.woff2 | npm @fontsource-variable/archivo (files/archivo-latin-wdth-normal.woff2) | 5.3.0 (tarball sha512 verified against the registry) | SIL OFL 1.1 | e3a28eade21a900c7155a247757f4b2834c07bb7ef07ad7efa55cebaac1e8f5e |
| web/vendor/fonts/SourceSerif4-opsz-wght.woff2 | npm @fontsource-variable/source-serif-4 (files/source-serif-4-latin-opsz-normal.woff2) | 5.3.1 (tarball sha512 verified against the registry) | SIL OFL 1.1 | f2ea9c12d2fe9bd3a9589b02ad2c0909da88f30938c91adc838c4f4098f9f9e0 |
| web/vendor/fonts/SourceSerif4-opsz-wght-italic.woff2 | npm @fontsource-variable/source-serif-4 (files/source-serif-4-latin-opsz-italic.woff2) | 5.3.1 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 96e6393209728ab93c334ae739af8a040cd2006c82e8614d6465a8084db88f89 |
| web/vendor/fonts/OFL-Archivo.txt | npm @fontsource-variable/archivo (package/LICENSE) | 5.3.0 (tarball sha512 verified against the registry) | SIL OFL 1.1 | c3c8402eec0e31dc9a76851235b1c02a0bb821488b2db8e35bcc2ab60ca8fc2b |
| web/vendor/fonts/OFL-SourceSerif4.txt | npm @fontsource-variable/source-serif-4 (package/LICENSE) | 5.3.1 (tarball sha512 verified against the registry) | SIL OFL 1.1 | 18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3 |

The taste-skill README states no licence for its asset files; the entry above records that. The fonts come from the npm tarballs of @fontsource-variable/archivo 5.3.0 and @fontsource-variable/source-serif-4 5.3.1, each verified against the registry's sha512 integrity before extraction. Code is set in the system monospace stack, so no mono face is vendored.

Do not edit these files; overrides go in `web/app.css` and `web/charts-ext.js`. To re-check them, run `python scripts/check_vendor.py` (it exits 1 on any hash mismatch, missing row or unlisted file). `.gitattributes` marks `web/vendor/` as `-text` so line-ending conversion on Windows cannot change the hashes.
