"use strict";
const assert = require("node:assert/strict");
const {findRegisteredSource,getRegisteredEvidence} = require("./source-registry.js");
const {
  SECTION_DEFINITIONS, SECTION_KEYS, categorizeEvidence, availableFieldCount,
  validateEditorialDescription, hasApprovedDescription, selectBestTwoSections, textOverlap, overlapsSummary
} = require("./daily-evidence.js");

assert.equal(SECTION_DEFINITIONS.length + 1,11,"summary + ten researched headings");
assert.equal(new Set(SECTION_KEYS).size,10,"headings must be distinct");
assert.equal(findRegisteredSource(0x0041),null,"unregistered ranges excluded");
const kana=findRegisteredSource(0x31FC);
assert.equal(kana.id,"katakana-phonetic-extensions");
assert.equal(findRegisteredSource(0x20000).provider,"unihan");
const evidence=categorizeEvidence(getRegisteredEvidence(kana,{}));
assert.equal(availableFieldCount(evidence),3,"the official source has three distinct types of evidence");
const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,""]));
const example={...sections,usage:"アイヌ語などの転写に用いられます。",
  history:"この範囲はJIS X 0213:2000 に基づきます。"};
const valid=validateEditorialDescription({summary:"小書きのカタカナです。",sections:example},evidence);
assert.equal(valid.fieldCount,2);
const threeCandidates = {...example,structure:"濁点を加えることもできます。"};
const chosen = validateEditorialDescription({
  summary:"小書きカタカナです。", sections:threeCandidates
},evidence);
assert.ok(chosen,"three documented sections should be accepted, not rejected");
assert.equal(chosen.fieldCount,2,"select exactly two for publication");
assert.deepEqual(Object.keys(chosen.sections).filter(k=>chosen.sections[k]),["usage","history"],
  "prefer the two useful, independently supported sections");
assert.ok(hasApprovedDescription({
  descriptionSchema:4,summary:"小書きカタカナです.",sections:threeCandidates
}),"a documented old entry with 3 sections should not become ineligible");
assert.equal(Object.values(selectBestTwoSections(threeCandidates,evidence)).filter(Boolean).length,2);
assert.ok(textOverlap(
  "背中にフラゲラム（S45）を負ったアオサギ（G31）の姿で表される文字。",
  "アオサギの背中にフラゲラムを載せた姿を表しています。"
) > 0.33,"detect a visually repeated fact");
const egyptianEvidence={...Object.fromEntries(SECTION_KEYS.map(k=>[k,[]])),
  meaning:[{kind:"function",text:"Logogram god",strength:"strong"}],
  structure:[{kind:"appearance",text:"gray heron with flagellum",strength:"strong"}]};
const egyptianSections={...sections,
  meaning:"「神」を表す表語文字です。",
  structure:"アオサギの背中にフラゲラムを載せた姿を表しています。"};
const redundantSummary="背中にフラゲラム（S45）を負ったアオサギ（G31）の姿で表される文字。";
const flagged=validateEditorialDescription({
  summary:redundantSummary,sections:egyptianSections
},egyptianEvidence);
assert.ok(flagged&&flagged.needsRevision,"overview and detail overlap triggers revision");
assert.equal(hasApprovedDescription({
  descriptionSchema:4,summary:redundantSummary,sections:flagged.sections
}),false,"repetitive overview cannot be published");
const distinctSummary="古代エジプトの象形文字の一つです。";
const repaired=validateEditorialDescription({
  summary:distinctSummary,sections:egyptianSections
},egyptianEvidence);
assert.ok(repaired&&!repaired.needsRevision,"distinct overview passes");
assert.equal(hasApprovedDescription({
  descriptionSchema:4,summary:distinctSummary,sections:repaired.sections
}),true);
assert.equal(overlapsSummary(distinctSummary,repaired.sections),false);
assert.ok(!SECTION_KEYS.includes("pronunciation"),"pronunciation must not be counted");
assert.equal(availableFieldCount(categorizeEvidence([{kind:"functionValue",text:"nṯr",source:"Unikemet"}])),0,"transliteration does not qualify");
assert.ok(hasApprovedDescription({descriptionSchema:4,...valid}));
assert.equal(validateEditorialDescription({summary:"小書きのカタカナです。",
  sections:{...sections,usage:example.usage}},evidence),null,
  "one supported heading must fail");
assert.equal(validateEditorialDescription({summary:"小書きのカタカナです.",
  sections:{...sections,usage:example.usage,history:example.usage}},evidence),null,
  "repeated content cannot fill two headings");
assert.equal(validateEditorialDescription({summary:"小書きのカタカナです。",
  sections:{...sections,usage:example.usage,etymology:"出典にない推測"}},evidence),null,
  "unsupported headings must not count");
assert.equal(availableFieldCount(categorizeEvidence([
  {kind:"unihan:definition",text:"the meaning",source:"Unihan"}
])),1);
assert.equal(hasApprovedDescription({summary:"文字",usage:"用法",supplementalInfo:"補足"}),false,
  "legacy schema must be regenerated");
console.log("11 headings: 2+ supported candidates accepted, best 2 retained: OK");
