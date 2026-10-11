"use strict";

/*
 * Audit actual cmap character coverage of locally available fonts
 * against the exhaustive Unicode 18.0 Script + General_Category data.
 *
 * Run: npm install
 *      node scripts/audit-unicode18-fonts.js
 *      node scripts/audit-unicode18-fonts.js /path/to/extra-font.ttf
 * Automatically includes every supported font file recursively in fonts/.
 *
 * WARNING: cmap coverage != legible glyph, shaping support, color emoji,
 *          variation sequence support, or compatibility on all browsers.
 *
 * This script never edits the site's conversion, lottery, or daily.json.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fontkit = require("@cantoo/fontkit");

const ROOT = path.resolve(__dirname, "..");
const OFFICIAL = path.join(ROOT, "data/unicode18_all_ranges.json");
const MANIFEST = path.join(ROOT, "data/unicode18_font_audit_manifest.json");
const OUTPUT = path.join(ROOT, "data/unicode18_font_cmap_audit.json");

const EXCLUDE = new Set(["Cn", "Co", "Cs", "Cc"]);
const FONT_EXTENSION = /\.(ttf|otf|woff|woff2)$/i;
const hex = n => n.toString(16).toUpperCase().padStart(4, "0");

function encodeRanges(numbers) {
  if (numbers.length === 0) return [];
  const list = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const ranges = [];
  let a = list[0], b = a;
  for (let i = 1; i < list.length; i++) {
    if (list[i] === b + 1) { b = list[i]; continue; }
    ranges.push({ start: hex(a), end: hex(b) });
    a = b = list[i];
  }
  ranges.push({ start: hex(a), end: hex(b) });
  return ranges;
}

function codePointRangeSize(r) {
  return parseInt(r.end, 16) - parseInt(r.start, 16) + 1;
}

function assertUnicodePartition(records, expectedCount) {
  let next = 0;
  for (const record of records) {
    const start = parseInt(record.start, 16);
    const end = parseInt(record.end, 16);
    if (start !== next || end < start) {
      throw new Error("Unicode partition has gap or overlap at " + hex(next));
    }
    next = end + 1;
  }
  if (next !== 0x110000 || expectedCount !== 1114112) {
    throw new Error("Unexpected Unicode codepoint universe");
  }
}

function findRecord(records, codePoint) {
  let lo = 0, hi = records.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = records[mid];
    const a = parseInt(r.start, 16);
    const b = parseInt(r.end, 16);
    if (codePoint < a) hi = mid - 1;
    else if (codePoint > b) lo = mid + 1;
    else return r;
  }
  throw new Error("Unknown codepoint: " + hex(codePoint));
}

/* Find newly uploaded site fonts automatically; no manifest edit required. */
function inferFamily(filename) {
  const stem = filename.replace(FONT_EXTENSION, "").replace(/-(Regular|Medium|Bold|Light|Black|Thin|SemiBold|ExtraBold)$/i, "");
  if (/^NotoSansCJKjp$/i.test(stem)) return "Noto Sans CJK JP";
  if (/^NotoSansCJKkr$/i.test(stem)) return "Noto Sans CJK KR";
  if (/^unifont_upper/i.test(stem)) return "GNU Unifont Upper";
  if (/^unifont(-|_)/i.test(stem)) return "GNU Unifont";
  if (/^KaiyuanSmallSeal$/i.test(stem)) return "Kaiyuan Small Seal";
  if (/^LXGWSeal$/i.test(stem)) return "LXGW Seal";
  if (/^BabelStoneHan$/i.test(stem)) return "BabelStone Han";
  if (/^WenJinMinchoP3$/i.test(stem)) return "WenJin Mincho P3";
  if (/^NotoSansSignWriting$/i.test(stem)) return "Noto Sans SignWriting";
  if (/^NotoZnamennyMusicalNotation$/i.test(stem)) return "Noto Znamenny Musical Notation";
  if (/^NotoSans/.test(stem)) {
    const tail = stem.slice("NotoSans".length)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d+)/g, "$1 $2")
      .replace(/([A-Za-z])([0-9]+)/g, "$1 $2")
      .replace(/\bjp\b/ig, "JP").replace(/\bkr\b/ig, "KR");
    return "Noto Sans " + tail;
  }
  if (/^NotoSerif/.test(stem)) {
    return "Noto Serif " + stem.slice("NotoSerif".length)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  }
  return stem.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}
function walkFontFiles(folder) {
  if (!fs.existsSync(folder)) return [];
  const result = [];
  for (const ent of fs.readdirSync(folder, {withFileTypes:true})) {
    const target = path.join(folder, ent.name);
    if (ent.isDirectory()) result.push(...walkFontFiles(target));
    else if (ent.isFile() && FONT_EXTENSION.test(ent.name)) result.push(target);
  }
  return result.sort();
}
function resolveFonts(manifest, extraPaths) {
  const issues = [], sources = [];
  const named = new Map(manifest.fonts
    .filter(item => item.site_served !== false && item.path)
    .map(item => [item.path.replace(/\\/g, "/"), item.family]));
  const seen = new Set();
  // Every real font under fonts/ is considered. Missing manifest entries
  // cannot prevent user-uploaded fonts from being analyzed.
  const allFiles = walkFontFiles(path.join(ROOT, "fonts"));
  for (const item of extraPaths) {
    const full = path.resolve(ROOT, item);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) allFiles.push(...walkFontFiles(full));
    else if (fs.existsSync(full) && fs.statSync(full).isFile() && FONT_EXTENSION.test(full)) allFiles.push(full);
    else issues.push({location:item,error:"extra_font_path_missing"});
  }
  for (const absolute of allFiles) {
    const rel = path.relative(ROOT, absolute).split(path.sep).join("/");
    if (seen.has(rel)) continue;
    seen.add(rel);
    const family = named.get(rel) || inferFamily(path.basename(absolute));
    sources.push({family, path:rel, absolute});
  }
  for (const item of manifest.fonts) {
    if (item.site_served === false || !item.path || seen.has(item.path)) continue;
    issues.push({family:item.family,location:item.path,error:"manifest_font_missing"});
  }
  if (sources.length === 0) issues.push({error:"no_valid_fonts_in_fonts_directory"});
  return {sources,issues};
}

function main() {
  const partition = JSON.parse(fs.readFileSync(OFFICIAL, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (partition.unicode_version !== "18.0.0") {
    throw new Error("Unexpected Unicode version");
  }
  assertUnicodePartition(partition.ranges, partition.counts.all_code_points);
  const expected = new Map(), targets = new Map();
  for (const record of partition.ranges) {
    if (EXCLUDE.has(record.category)) continue;
    for (let cp = parseInt(record.start, 16); cp <= parseInt(record.end, 16); cp++) {
      expected.set(cp, record.script);
      if (!targets.has(record.script)) targets.set(record.script, []);
      targets.get(record.script).push(cp);
    }
  }
  if (expected.size !== 172808 || expected.size !== partition.counts.encoded_characters) {
    throw new Error("Assigned character count does not match Unicode 18.0");
  }

  const resolved = resolveFonts(manifest, process.argv.slice(2));
  const issues = resolved.issues;
  if (!resolved.sources.length) {
    throw new Error("No available font binaries to inspect; see " + MANIFEST);
  }
  const records = [], union = new Map();
  for (const item of resolved.sources) {
    try {
      const bytes = fs.readFileSync(item.absolute);
      const font = fontkit.openSync(item.absolute);
      const sets = new Map();
      for (const cp of new Set(font.characterSet)) {
        const script = expected.get(cp);
        if (script === undefined) continue;
        if (!sets.has(script)) sets.set(script, []);
        sets.get(script).push(cp);
        if (!union.has(script)) union.set(script, new Set());
        union.get(script).add(cp);
      }
      const scriptCoverage = {};
      for (const [script, cps] of sets) {
        scriptCoverage[script] = {
          count: cps.length,
          codepoint_ranges: encodeRanges(cps)
        };
      }
      records.push({
        id: records.length,
        family: item.family,
        file: item.path,
        file_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        file_bytes: bytes.length,
        cmap_characters_within_unicode18: [...sets.values()].reduce((sum, a) => sum + a.length, 0),
        per_script: scriptCoverage
      });
      process.stdout.write("Audited: " + item.path + "\n");
    } catch (e) {
      issues.push({ family: item.family, location: item.path, error: "font_parse_failed", detail: String(e) });
    }
  }
  if (!records.length) throw new Error("No font binaries could be parsed");

  const scripts = [];
  for (const [script, cps] of targets) {
    const covered = union.get(script) || new Set();
    const missing = cps.filter(cp => !covered.has(cp));
    const fontRanking = records.map(f => ({
      font_id: f.id,
      family: f.family,
      file: f.file,
      cmap_codepoints: f.per_script[script]?.count || 0
    })).filter(x => x.cmap_codepoints > 0).sort((a, b) =>
      b.cmap_codepoints - a.cmap_codepoints || a.font_id - b.font_id
    );
    scripts.push({
      script,
      unicode18_assigned_codepoints: cps.length,
      available_in_at_least_one_tested_cmap: covered.size,
      cmap_coverage_percent: Number((100 * covered.size / cps.length).toFixed(3)),
      missing_codepoints: missing.length,
      missing_ranges: encodeRanges(missing),
      font_rank_by_cmap_count: fontRanking
    });
  }
  scripts.sort((a, b) => a.script.localeCompare(b.script));
  const totalMatched = scripts.reduce((sum, s) => sum + s.available_in_at_least_one_tested_cmap, 0);
  const result = {
    schema_version: 1,
    unicode_version: partition.unicode_version,
    generated_at_utc: new Date().toISOString(),
    meaning: "CMAP mappings in the locally inspected font binaries only; NOT tested browser rendering or correct glyph shapes.",
    method: "Read actual fontkit characterSet from each binary, intersect with assigned Unicode 18.0 Script + General_Category, union by Script.",
    excluded_categories: [...EXCLUDE],
    critical_limitations: [
      "Presence in cmap does NOT guarantee valid outline, legibility, correct shaping, colored emoji, or ZWJ/variation sequences.",
      "Absent mappings in audited local files do NOT imply missing from every available font.",
      "This is a static build-time font audit. It does not install fonts or change website font selection.",
      "Common (Zyyy) and Inherited (Zinh) include symbols and contextual marks; renderability needs separate verification.",
      "No font license redistribution rights are implied by this report."
    ],
    summary: {
      unicode18_assigned_codepoints: expected.size,
      cmap_covered_union: totalMatched,
      cmap_uncovered_union: expected.size - totalMatched,
      fonts_inspected: records.length,
      source_issues: issues.length
    },
    font_sources: records,
    issues,
    scripts
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log("Wrote " + path.relative(ROOT, OUTPUT) + " (" + records.length + " fonts inspected).");
  console.log("Cmap union: " + totalMatched + " / " + expected.size +
    "; NOT a guarantee of visible or correctly-shaped glyphs.");
}

main();
