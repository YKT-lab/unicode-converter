"use strict";
const assert = require("node:assert/strict");
const {findRegisteredSource, getRegisteredEvidence} = require("./source-registry.js");
const {categorizeEvidence, availableFieldCount, validateEditorialDescription} = require("./daily-evidence.js");

assert.equal(findRegisteredSource(0x0041), null, "unregistered ranges must not enter the draw");
const kana = findRegisteredSource(0x31FC);
assert.equal(kana.id, "katakana-phonetic-extensions");
assert.equal(findRegisteredSource(0x20000).provider, "unihan");
const ainu = categorizeEvidence(getRegisteredEvidence(kana, {}));
assert.equal(availableFieldCount(ainu), 3, "Unicode Standard documents three different facets");
assert.equal(validateEditorialDescription({
  summary: "小書きのカタカナです。",
  usage: "アイヌ語などの転写に用いられます。",
  supplementalInfo: "JIS X 0213:2000に基づく文字範囲です。",
  facts: []
}, ainu).fieldCount, 2);
assert.equal(validateEditorialDescription({
  summary: "小書きのカタカナです。",
  usage: "アイヌ語などの転写に用いられます。",
  supplementalInfo: "",
  facts: []
}, ainu), null, "one filled section must be rejected");
assert.equal(validateEditorialDescription({
  summary: "小書きのカタカナです。",
  usage: "アイヌ語などの転写に用いられます。",
  supplementalInfo: "アイヌ語などの転写に用いられます。",
  facts: []
}, ainu), null, "duplicated sections must be rejected");
const isolated = categorizeEvidence([{kind:"unihan:definition",text:"meaning",source:"Unihan"}]);
assert.equal(availableFieldCount(isolated), 1, "one Unicode property cannot fake two sections");
console.log("Daily source registry and 2-of-3 content gate: OK");
