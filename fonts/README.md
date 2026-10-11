# Unicode Converter — font library

The Unicode 18 font coverage builder recursively scans all supported files in `fonts/`. **Adding a font normally requires no manual CSS, JS or manifest edit.** On the next font-coverage GitHub Action it is inspected and added to the codepoint-level font index.

## Directory conventions

| Directory | Purpose |
|---|---|
| `han/` | Han ideographs and CJK fonts |
| `seal/` | Unicode 18.0 Seal (small seal script) |
| `hieroglyphs/` | Egyptian hieroglyphs |
| `ancient/` | Historical scripts: Avestan, Brahmi, Old Turkic, Phoenician, cuneiform, Linear A/B etc. |
| `scripts/` | Current and specialist language scripts (including Tulu Tigalari / Mallige) |\n| `east-asian/` | Tangut and Khitan Small Script dedicated outline fonts |\n| `numbers/` | Specialist numeric notation such as Ottoman Siyaq |\n| `emoji/` | Color emoji font fallback (prefer native device emoji when available) |
| `symbols/` | Symbols, mathematics and historic computing symbols |
| `music/` | Music symbols and attribution |
| `phonetics/` | IPA / phonetics and attribution |

## How to add a font

1. Place the actual **TTF, OTF, WOFF, or WOFF2** binary in the appropriate folder. Use the upstream original filename, preferably `*-Regular.*`. No ZIP or compressed `.gz` files.
2. Include the license/attribution file when required; avoid copying fonts with ambiguous redistribution terms.
3. Commit to main. The `Unicode 18 Font Coverage Build` action scans **all subdirectories**, reads font `cmap`, generates `data/unicode18_font_cmap_audit.json`, and constructs `data/unicode18_font_coverage_index.json`.
4. Test a codepoint using the Unicode → Character converter on iOS and Windows. Presence in a font `cmap` is **not** proof the glyph is visually correct or that advanced shaping works.

A font can cover several scripts, so **assignment is by exact character codepoint, not folder name**. When multiple verified files cover one character, an ordered fallback list is generated automatically. The web client loads only a matching font when requested using the `FontFace` API, rather than requesting all font files when the page opens.

## Quality-first selections for uploaded fonts

The build-time ranker in `../scripts/build-unicode18-font-index.js` prefers **BabelStone Han for supplementary Han characters if its cmap contains the code point**, **Noto Serif Hentaigana** for Hentaigana, and dedicated Noto fonts for other scripts (including Avestan, Znamenny Musical Notation, and SignWriting). It never assumes that a font supports an entire Script property: ranking operates only on actual cmap matches.

The site's existing Unicode 18 index is regenerated automatically by GitHub Actions when these files move. Source-level raster/outline, OpenType shaping, and Windows/iPhone browser rendering can still vary.

## Existing assets are preserved

All formerly root-level font binaries were moved without changing blob contents. The original `music/` and `phonetics/` folders, including their licenses, were preserved.

## Coverage limits

The build-time audit excludes unassigned, surrogate, control and private-use codepoints from the standard character tally. Emoji ZWJ sequences, regional-indicator flags, color rendering, GSUB/GPOS shaping and actual browser testing are separate matters. Current reports use Unicode 18.0 (172,808 encoded characters). Official UCD classification remains in `../data/unicode18_all_ranges.json`.

The pixel-like GNU Unifont Upper was removed in favor of font-specific vector outlines. This reduces the number of Unicode 18 codepoints covered by on-site fonts, but the existing CSS, browser, and remote-font fallback paths remain available. The Avestan block uses `fonts/ancient/NotoSansAvestan-Regular.ttf`.

## October 2026 font expansion

55 newly uploaded fonts are sorted into purpose-based subdirectories without modifying binary contents. The index should identify **100 local fonts** and cover **168,821 Unicode 18.0 characters** after the successful rebuild. Files can support multiple scripts; script-level rankings only select fonts whose exact cmap contains the codepoint.

`Mallige_Unicode_v2.ttf` is a Tulu Tigalari source; complex scripts may need browser-specific shaping tests beyond cmap coverage. `NotoColorEmoji.ttf` is a color emoji font and must not be assumed to offer smooth vector outlines; the browser normally prefers its native color emoji renderer. The dedicated Tangut and Khitan fonts are preferred over generic coverage fonts where their cmaps overlap. Some recently added Unicode 18.0 characters (such as certain Khitan Small Script codepoints) remain without a verified local glyph.

Review upstream redistribution permissions and attribution for every added family before distributing the site. Noto families originate from the Noto projects; Mallige from its separate upstream project. Do not infer licenses from filenames alone.

GitHub Pages source: `../.github/workflows/font-coverage.yml` — publish is performed only if all tests pass.
