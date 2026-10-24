"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
const policy = require("../js/font-policy.js");
const coverage = require("../data/unicode18_font_coverage_index.json");
const policySource = fs.readFileSync(path.join(ROOT, "js/font-policy.js"), "utf8");
const selectorSource = fs.readFileSync(path.join(ROOT, "js/font-coverage.js"), "utf8");
const getIds = policy.getCandidateFontIds;

function sampleIndex(cp = 0x41, script = "Latn") {
  return {
    schema_version:2, unicode_version:"18.0.0",
    font_families:[0,1,2].map(id => ({family:"Local " + id,file:"fonts/scripts/Local-" + id + ".ttf"})),
    ranges:[[cp,cp,1]], script_ranges:[[cp,cp,script]],
    combinations:[[],[0,1,2]],
    script_font_candidates:{[script]:[2,99,1,2]}, script_google_candidates:{}
  };
}
const sample = sampleIndex();
const unchanged = JSON.stringify(sample);
assert.deepEqual(getIds(sample,0x41),[2,1,0], "Script candidates must precede remaining actual cmap fonts");
assert.equal(JSON.stringify(sample),unchanged,"Ordering must not mutate the shared index");
assert.deepEqual(getIds({...sample,script_font_candidates:{}},0x41),[0,1,2]);
assert.deepEqual(getIds({...sample,script_ranges:[]},0x41),[0,1,2]);
assert.deepEqual(getIds({...sample,combinations:[[],[0,0,2,2]]},0x41),[2,0]);
for (const cp of [null,-1,1.5,0x110000,NaN,Infinity,0x42])
  assert.deepEqual(getIds(sample,cp),[],"An unknown codepoint must not invent a cmap candidate");
assert.deepEqual(getIds(null,0x41),[]);
const browser = {};
vm.runInNewContext(policySource,browser,{filename:"font-policy.js"});
assert(Object.isFrozen(browser.UnicodeFontPolicy));
assert.deepEqual(Array.from(browser.UnicodeFontPolicy.getCandidateFontIds(sample,0x41)),[2,1,0],
  "The browser and generator exports must apply the same policy");

// Check every compressed cmap interval boundary, including supplementary and
// cross-Script coverage. A priority change must not remove a usable source.
let boundaryChecks = 0;
for (const range of coverage.ranges) {
  const expected = [...new Set(coverage.combinations[range[2]])].sort((a,b)=>a-b);
  for (const cp of new Set([range[0],range[1]])) {
    const actual = getIds(coverage,cp);
    assert.equal(new Set(actual).size,actual.length);
    assert.deepEqual([...actual].sort((a,b)=>a-b),expected,
      "Lost cmap source at U+" + cp.toString(16).toUpperCase());
    boundaryChecks++;
  }
}
assert.deepEqual(getIds(coverage,0x0378),[]);
assert.deepEqual(getIds(coverage,0x10FFFF),[]);

function fixture(options = {}) {
  const index = options.index || sampleIndex();
  const local = [], legacy = [], added = [], ctx = {};
  class Face {
    constructor(name,source,descriptors) {
      this.family = name; this.source = source;
      this.file = /\/fonts\/([^"]+)/.exec(source)?.[1];
      this.descriptors = descriptors;
      local.push(this);
    }
    async load() {
      if (options.failLocal || options.failFiles?.has(this.file)) throw Error("fixture font unavailable");
      return this;
    }
  }
  Object.assign(ctx,{
    URL, FontFace:Face,
    console:{warn(){}},
    sleep:() => new Promise(() => {}),
    fetch:async() => ({ok:!options.failIndex,json:async()=>index}),
    document:{
      baseURI:"https://example.invalid/unicode-converter/",
      fonts:{
        add(face){added.push(face);},
        async load(description) {
          legacy.push(description);
          return options.allowLegacy ? [{}] : [];
        }
      },
      createElement(){return {};}, head:{appendChild(node){node.onload?.();}}
    },
    getWebFontNames:() => options.legacyNames || [],
    isRenderedBlank:options.blank || (()=>false),
    looksLikeMissingGlyph:() => false
  });
  if (options.policy !== false) ctx.UnicodeFontPolicy = options.policy || policy;
  vm.createContext(ctx);
  vm.runInContext(selectorSource,ctx,{filename:"font-coverage.js"});
  return {ctx,index,local,legacy,added};
}

(async()=>{
  let checks = 0;
  for (const api of [policy,false,{getCandidateFontIds(){throw Error("script failure");}},
                    {getCandidateFontIds(){return [];}}]) {
    const f = fixture({policy:api});
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),"Unicode Site 2",
      "ASCII must use the same local candidate with or without the optional helper");
    assert.equal(f.local.length,1);
    assert.equal(f.local[0].source,'url("https://example.invalid/unicode-converter/fonts/scripts/Local-2.ttf")');
    assert.deepEqual({...f.local[0].descriptors},{style:"normal",weight:"400"});
    assert.equal(f.legacy.length,0);
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),"Unicode Site 2");
    assert.equal(f.local.length,1,"A font file must not be fetched twice");
    checks++;
  }
  {
    const f = fixture({failFiles:new Set(["scripts/Local-2.ttf"])});
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),"Unicode Site 1");
    assert.deepEqual(f.local.map(face=>face.family),["Unicode Site 2","Unicode Site 1"]);
    checks++;
  }
  {
    const f = fixture({blank:(_character,family)=>family.includes("Unicode Site 2")});
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),"Unicode Site 1",
      "A cmap entry with no visible glyph must still permit the next font");
    checks++;
  }
  {
    const f = fixture({index:sampleIndex(0x3042,"Kana"),allowLegacy:true});
    assert.equal(await f.ctx.selectUnicodeFont(0x3042,"あ"),"Unicode Site 2");
    assert.equal(f.legacy.length,0,"Local Japanese font must precede an unrelated hosted family");
    checks++;
  }
  for (const failIndex of [false,true]) {
    const f = fixture({index:sampleIndex(0x3042,"Kana"),failLocal:true,failIndex,allowLegacy:true});
    assert.equal(await f.ctx.selectUnicodeFont(0x3042,"あ"),"Noto Sans JP",
      "Japanese CSS fonts must remain a fallback if local files/index are unavailable");
    checks++;
  }
  {
    const f = fixture({failLocal:true,allowLegacy:true,legacyNames:["Legacy Face"]});
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),"Legacy Face");
    checks++;
  }
  {
    const f = fixture({failLocal:true});
    assert.equal(await f.ctx.selectUnicodeFont(0x41,"A"),null,
      "Unavailable Web fonts must leave the OS/CSS path available to normal mode");
    checks++;
  }
  for (const cp of [0x109EB,0x1081F,0x11D6B,0x110C0,0x16A51,0x11400,0x111E5,0x10408]) {
    const f = fixture({index:coverage,blank(){throw Error("Audited specialist must bypass Canvas heuristic");}});
    const face = await f.ctx.selectUnicodeFont(cp,String.fromCodePoint(cp));
    assert(f.ctx.isVerifiedSpecialistSelection(cp,face));
    assert.equal(Number(face.match(/(\d+)$/)[1]),getIds(coverage,cp)[0]);
    checks++;
  }
  console.log("PASS: Shared browser/build font policy;",boundaryChecks,
    "cmap boundaries retain coverage;",checks,"normal-font selection and fallback cases");
})().catch(error=>{console.error(error);process.exitCode=1;});
