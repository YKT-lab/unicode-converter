"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const {createPolicy, GROUPS, classify} = require("../js/combining-candidates.js");
const {prepareCatalogue} = require("../js/combining-core.js");
const ROOT = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/combining-marks.json"), "utf8"));
const properties = JSON.parse(fs.readFileSync(path.join(ROOT, "data/combining-base-properties.json"), "utf8"));
const marks = prepareCatalogue(data), policy = createPolicy(properties);
let tests = 0;
function test(name, callback) { callback(); tests++; console.log("PASS " + name); }
const candidateIds = (base, options) => new Set(policy.select(marks, base, options).map(entry => entry.mark.codepoint));
const mark = cp => marks.find(item => item.codepoint === cp);

test("one Unicode scalar includes supplementary characters without splitting surrogates", () => {
  const ascii = policy.describeBase("A"), supplementary = policy.describeBase("😀");
  assert.equal(ascii.valid, true); assert.equal(ascii.script_code, "Latn"); assert.equal(ascii.category, "Lu");
  assert.equal(supplementary.valid, true); assert.equal(supplementary.codepoint, 0x1F600); assert.equal(supplementary.category, "So");
  assert.equal(policy.describeBase("𐐀").script_code, "Dsrt");
  assert.equal(policy.describeBase(" ").valid, true, "Space is one scalar, not silently trimmed");
});
test("empty, multiple scalars, decomposed graphemes, variation and ZWJ sequences are rejected", () => {
  assert.equal(policy.describeBase("").error, "empty");
  for (const value of ["AB", "a\u0301", "❤️", "👩‍🔬", "😀😀"])
    assert.equal(policy.describeBase(value).error, "multiple-codepoints", value);
  for (const value of ["\uD800", "\uDC00"]) assert.equal(policy.describeBase(value).error, "invalid-scalar");
  assert.deepEqual(policy.select(marks, "AB"), []);
});
test("Latin recommends generic accents and decorations, not dedicated Arabic or Indic marks", () => {
  const ids = candidateIds("A");
  assert(ids.has(0x0301)); assert(ids.has(0x0323)); assert(ids.has(0x20DD));
  assert(!ids.has(0x064E)); assert(!ids.has(0x093F)); assert(!ids.has(0x1CD0));
  assert(!ids.has(0x1D165), "Musical Inherited/Common marks are not universal");
  assert(!ids.has(0xFE0F), "Applicability of variation selector sequences is not inferred");
});
test("Arabic and Hebrew dedicated marks precede general-purpose fallback accents", () => {
  const arabic = policy.select(marks, "ع"), hebrew = policy.select(marks, "א");
  assert(arabic.some(entry => entry.mark.codepoint === 0x064E));
  assert(hebrew.some(entry => entry.mark.codepoint === 0x05B8));
  assert(!candidateIds("ع").has(0x093F)); assert(!candidateIds("א").has(0x093F));
  const dedicated = hebrew.findIndex(entry => entry.mark.codepoint === 0x05B8);
  const general = hebrew.findIndex(entry => entry.mark.codepoint === 0x0336);
  assert(dedicated >= 0 && general > dedicated);
});
test("Script_Extensions handles kana and shared Vedic transcription without treating all Inherited as generic", () => {
  for (const base of ["か", "カ"]) {
    const ids = candidateIds(base); assert(ids.has(0x3099)); assert(ids.has(0x309A));
  }
  assert(!candidateIds("A").has(0x3099));
  assert(candidateIds("क").has(0x093F)); assert(candidateIds("क").has(0x1CD0));
  assert(candidateIds("A").has(0x0951), "Official Scx includes Latin Vedic transcription");
});
test("base Script_Extensions is generated from official ranges", () => {
  const base = policy.describeBase("ー");
  assert.equal(base.script_code, "Zyyy"); assert(base.script_extensions.includes("Hira")); assert(base.script_extensions.includes("Kana"));
  assert(candidateIds("ー").has(0x3099));
});
test("specialized Inherited name usage supports Greek and Latin without leaking to unrelated scripts", () => {
  assert(candidateIds("α").has(0x0343)); assert(!candidateIds("A").has(0x0343));
  assert(candidateIds("A").has(0x0363)); assert(!candidateIds("ع").has(0x0363));
});
test("music candidates use source-name-derived base context", () => {
  assert.equal(policy.describeBase("𝄞").music, true);
  assert(candidateIds("𝄞").has(0x1D165));
  assert(!candidateIds("😀").has(0x1D165));
});
test("all mode preserves exactly the existing 2580 marks for every valid base", () => {
  assert.equal(marks.length, 2580); assert.equal(properties.unicode_version, data.unicode_version);
  for (const base of ["A", "ع", "क", "か", "😀", "𐐀", "\u0378", "\uE000"]) {
    const entries = policy.select(marks, base, {all:true});
    assert.equal(entries.length, 2580, base); assert.equal(new Set(entries.map(entry => entry.mark.codepoint)).size, 2580);
    assert.deepEqual(new Set(entries.map(entry => entry.mark.codepoint)), new Set(marks.map(item => item.codepoint)));
    assert.equal(entries.find(entry => entry.mark.codepoint === 0xFE0F).group, "variation");
  }
});
test("purpose groups partition all marks exactly once and recommendations have stable ranking", () => {
  const full = policy.select(marks, "A", {all:true});
  assert.deepEqual(new Set(full.map(entry => entry.group)), new Set(GROUPS.map(group => group.id)));
  let sum = 0;
  for (const group of GROUPS) {
    const entries = policy.select(marks, "A", {all:true, group:group.id});
    assert(entries.every(entry => classify(entry.mark) === group.id)); sum += entries.length;
  }
  assert.equal(sum, 2580); assert.deepEqual(policy.select(marks, "A", {group:"invalid"}), []);
  for (let i=1;i<full.length;i++) assert(full[i-1].priority <= full[i].priority);
  assert.equal(classify(mark(0x093F)), "vowels"); assert.equal(classify(mark(0x20DD)), "enclosing");
  assert.equal(classify(mark(0xFE0F)), "variation"); assert.equal(classify(mark(0x1D165)), "music");
});
test("property ranges cover private-use, range-expanded CJK, unassigned and supplementary scripts", () => {
  assert.equal(policy.describeBase("\uE000").category, "Co");
  assert.equal(policy.describeBase("\u0378").category, "Cn");
  assert.equal(policy.describeBase("𠀀").category, "Lo"); assert.equal(policy.describeBase("𠀀").script_code, "Hani");
  assert.equal(policy.describeBase("𐐀").script_code, "Dsrt");
});
test("bad property schemas and overlapping ranges cannot silently alter recommendations", () => {
  assert.throws(() => createPolicy({}), TypeError);
  assert.throws(() => createPolicy({...properties, script_ranges:[[0,10,"Latn"],[10,20,"Latn"]]}), TypeError);
  assert.throws(() => createPolicy({...properties, script_ranges:[[0,10,"not_a_script"]]}), TypeError);
});
test("browser export matches Node and does not depend on Unicode regex engine versions", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/combining-candidates.js"), "utf8"), context);
  const browser = context.UnicodeCombiningCandidates.createPolicy(properties);
  assert.equal(browser.describeBase("😀").codepoint, 0x1F600);
  assert.equal(browser.select(marks, "A", {all:true}).length, 2580);
  assert(Object.isFrozen(context.UnicodeCombiningCandidates));
});
console.log("PASS " + tests + " combining-candidate policy tests");
