"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
const {createNormalizer} = require("../js/combining-normalization.js");
const DATA_PATH = path.join(ROOT, "data/combining-normalization.json");
const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const {normalize, unicodeVersion} = createNormalizer(data);
const forms = ["NFC", "NFD", "NFKC", "NFKD"];
const sequence = points => points.map(cp => String.fromCodePoint(cp)).join("");
const codes = value => Array.from(value, ch => ch.codePointAt(0).toString(16).toUpperCase()).join(" ");
let checks = 0;
function expect(value, expected, form = "NFC", context = "") {
  const actual = normalize(value, form);
  assert.equal(actual, expected, context + " " + form + "(" + codes(value) + ") expected " + codes(expected) + " got " + codes(actual));
  checks++;
}

// Goldens are codepoint-exact, including canonical order, composition blocking,
// compatibility mappings, supplementary characters, and Hangul Jamo.
expect("e\u0301", "\u00E9");
expect("\u00E9", "e\u0301", "NFD");
expect("a\u0315\u0300", "a\u0300\u0315", "NFD");
expect("a\u0301\u0300", "a\u0301\u0300", "NFD");
expect("A\u0305\u030A", "A\u0305\u030A"); // equal CCC blocks A + ring
expect("A\u0327\u030A", "\u00C5\u0327"); // lower CCC does not block
expect("\u0344", "\u0308\u0301"); // full composition exclusion
expect("\u0301\u0327", "\u0327\u0301", "NFD"); // no initial starter
expect("\uFF21\uFB03\u2460\u212B", "Affi1\u00C5", "NFKC");
expect("\uFF21\uFB03\u2460\u212B", "Affi1A\u030A", "NFKD");
expect("\uFF21", "\uFF21", "NFC");
expect("\u1100\u1161\u11A8", "\uAC01");
expect("\uAC01", "\u1100\u1161\u11A8", "NFD");
expect("\uAC00\u11A8", "\uAC01");
expect("\u1100\u0301\u1161", "\u1100\u0301\u1161");
expect("\u{1D400}\u{1F600}", "A\u{1F600}", "NFKC");
expect("\u{1D15E}", "\u{1D157}\u{1D165}", "NFD");
expect("\uD800a\uDC00", "\uD800a\uDC00"); // no replacement/loss of malformed UTF-16
for (const form of forms) expect("", "", form);
assert.equal(unicodeVersion, data.unicode_version);
assert.throws(() => normalize("a", "INVALID"), RangeError);
assert.throws(() => normalize(null), TypeError);
assert.throws(() => createNormalizer({}), TypeError);
assert.throws(() => createNormalizer({...data, combining_classes:[[0x301, 256]]}), TypeError);
assert.throws(() => createNormalizer({...data, compositions:[[0xD800,0x301,0xC1]]}), TypeError);

// Every algorithmic Hangul syllable has an exact reversible Jamo mapping.
for (let index = 0; index < 11172; index++) {
  const cp = 0xAC00 + index;
  const jamo = [0x1100 + Math.floor(index / 588), 0x1161 + Math.floor(index % 588 / 28)];
  if (index % 28) jamo.push(0x11A7 + index % 28);
  expect(String.fromCodePoint(cp), sequence(jamo), "NFD");
  expect(sequence(jamo), String.fromCodePoint(cp), "NFC");
}

// Verify every published table entry rather than sampling only Latin accents.
for (const entry of data.decompositions) {
  const input = String.fromCodePoint(entry[0]), raw = sequence(entry.slice(2));
  const decomposition = entry[1] ? "NFKD" : "NFD";
  expect(input, normalize(raw, decomposition), decomposition);
  for (const form of forms) {
    const once = normalize(input, form);
    expect(once, once, form);
  }
}
for (const [first, second, composite] of data.compositions)
  expect(sequence([first, second]), String.fromCodePoint(composite), "NFC");

// A long decreasing-CCC input checks canonical ordering, equal-class stability,
// and output assembly without quadratic insertion or function argument limits.
const longMarks = "\u0315\u0300\u0327".repeat(12000);
expect("a" + longMarks, "a" + "\u0327".repeat(12000) + "\u0300".repeat(12000) + "\u0315".repeat(12000), "NFD");

// Browser export uses the same versioned algorithm and never calls a device's
// String#normalize, which can have a different Unicode data version.
const browser = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/combining-normalization.js"), "utf8"), browser);
vm.runInNewContext("String.prototype.normalize = function () { throw Error('native normalization must not be used'); };", browser);
const browserNormalizer = browser.UnicodeCombiningNormalization.createNormalizer(data);
assert.equal(browserNormalizer.normalize("a\u0315\u0300", "NFC"), "\u00E0\u0315");
assert(Object.isFrozen(browser.UnicodeCombiningNormalization));

const ucdDirArg = process.argv.find(arg => arg.startsWith("--ucd-dir="));
const explicitFile = process.argv.find(arg => arg.startsWith("--normalization-test="));
const fixturePath = explicitFile ? path.resolve(explicitFile.slice("--normalization-test=".length))
  : ucdDirArg ? path.join(path.resolve(ucdDirArg.slice("--ucd-dir=".length)), "NormalizationTest.txt") : null;
let officialRows = 0;
if (fixturePath) {
  const bytes = fs.readFileSync(fixturePath);
  const text = bytes.toString("utf8");
  const version = text.match(/NormalizationTest-(\d+\.\d+\.\d+)\.txt/);
  assert.equal(version && version[1], data.unicode_version, "Official conformance fixture version must match runtime data");
  const expectedSource = (data.sources || []).find(source => source.file === "NormalizationTest.txt");
  if (expectedSource) assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedSource.sha256,
    "Official normalization fixture must match generated data provenance");
  for (const [lineIndex, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("@")) continue;
    const columns = line.split(";").slice(0, 5).map(column => sequence(column.trim().split(/\s+/).filter(Boolean).map(hex => parseInt(hex, 16))));
    assert.equal(columns.length, 5);
    const [c1, c2, c3, c4, c5] = columns;
    const context = "Official line " + (lineIndex + 1);
    for (const input of [c1, c2, c3]) { expect(input, c2, "NFC", context); expect(input, c3, "NFD", context); }
    for (const input of [c4, c5]) { expect(input, c4, "NFC", context); expect(input, c5, "NFD", context); }
    for (const input of columns) { expect(input, c4, "NFKC", context); expect(input, c5, "NFKD", context); }
    officialRows++;
  }
  assert(officialRows > 10000, "Do not silently accept an incomplete official conformance fixture");
}
console.log("PASS: Unicode " + unicodeVersion + " normalization; " + checks + " codepoint-exact assertions; " +
  data.decompositions.length + " decomposition mappings; " + data.compositions.length + " composition mappings; " +
  (officialRows ? officialRows + " complete official NormalizationTest rows" : "offline tables/Hangul/browser cases (use --ucd-dir for full official conformance)"));
