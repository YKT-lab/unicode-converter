"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const ROOT = path.resolve(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data/unicode18_font_coverage_index.json")));
const all = JSON.parse(fs.readFileSync(path.join(ROOT, "data/unicode18_all_ranges.json")));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/unicode18_font_audit_manifest.json")));
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "data/unicode18_font_cmap_audit.json")));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/unicode18_font_candidates_175.json")));
const read = (intervals, codePoint) => {
  let lo = 0, hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, r = intervals[mid];
    if (codePoint < r[0]) hi = mid - 1;
    else if (codePoint > r[1]) lo = mid + 1;
    else return r;
  }
  return null;
};
assert.strictEqual(index.schema_version, 2);
assert.strictEqual(index.unicode_version, "18.0.0");
assert.strictEqual(index.total_assigned_unicode18, 172808);
assert.strictEqual(all.counts.encoded_characters, 172808);
assert(index.font_families.length > 0, "No published fonts");
const {combinations, font_families:fonts}=index;
assert(Array.isArray(combinations) && Array.isArray(fonts) && fonts.length>0);
assert.deepStrictEqual(combinations[0],[]);
for(const font of fonts){
 assert(font.file.startsWith("fonts/"),"Missing served font path");
 assert(font.sha256 && /^[0-9a-f]{64}$/.test(font.sha256));
}
for(const list of combinations){
 assert(Array.isArray(list));
 assert.strictEqual(new Set(list).size,list.length);
 for(const id of list)assert(Number.isInteger(id)&&id>=0&&id<fonts.length);
}
for(const [name, intervals] of [["cmap",index.ranges],["script",index.script_ranges]]){
 for(let n=0;n<intervals.length;n++){
  const rg=intervals[n];
  assert(Number.isInteger(rg[0])&&Number.isInteger(rg[1])&&rg[0]<=rg[1]);
  if(n)assert(intervals[n-1][1]<rg[0],name+" overlap");
  if(name==="cmap")assert(Number.isInteger(rg[2])&&rg[2]>0&&rg[2]<combinations.length);
 }
}
// The codepoint-to-font resolution is now routed through the 175 named
// Unicode scripts and the Common/Inherited shared script classes.
assert.strictEqual(catalog.scripts.length,175);
assert(index.script_font_candidates && typeof index.script_font_candidates==="object",
  "Missing Unicode Script font candidate groups");
const allScripts=[...catalog.scripts.map(item=>item.script),"Zyyy","Zinh"];
assert.strictEqual(new Set(allScripts).size,177);
for(const script of allScripts){
  const ids=index.script_font_candidates[script];
  assert(Array.isArray(ids),"Missing script group: "+script);
  assert.strictEqual(new Set(ids).size,ids.length,"Duplicate script font: "+script);
  for(const id of ids){
    assert(Number.isInteger(id)&&id>=0&&id<fonts.length,
      "Invalid script font id: "+script);
    const file=fonts[id].file;
    const audited=audit.font_sources.find(source=>source.file===file);
    assert(audited?.per_script[script]?.count>0,
      "Script group font without audited cmap coverage: "+script+" / "+file);
  }
}
const scriptCandidatesFor=(cp)=>{
  const sr=read(index.script_ranges,cp);
  const cr=read(index.ranges,cp);
  const eligible=new Set(cr?combinations[cr[2]]:[]);
  const candidates=sr?(index.script_font_candidates[sr[2]]||[]):[];
  return candidates.filter(id=>eligible.has(id));
};
assert(scriptCandidatesFor(0x0041).length>0);
assert(scriptCandidatesFor(0x31FC).length>0);
assert(scriptCandidatesFor(0x32634).length>0);
assert(scriptCandidatesFor(0x0378).length===0);
assert(scriptCandidatesFor(0x20000).every(id=>
  combinations[read(index.ranges,0x20000)[2]].includes(id)));
assert.strictEqual(read(index.script_ranges, 0x0041)[2], "Latn");
assert.strictEqual(read(index.script_ranges, 0x4E00)[2], "Hani");
assert.strictEqual(read(index.script_ranges, 0x1E900)[2], "Adlm");
assert.strictEqual(read(index.script_ranges, 0x3D000)[2], "Seal");
assert.strictEqual(read(index.script_ranges, 0x0378), null);
assert.strictEqual(read(index.ranges, 0x0378), null);
const samples=[0x0041,0x3042,0x4E00,0x1D0DF,0x1E900,0x3D000,0x10FFFF];
for(const cp of samples){
 const rg=read(index.ranges,cp);
 if(rg)assert(combinations[rg[2]].length>0);
}
let count = 0;
for (const r of index.ranges) count += (r[1]-r[0]+1);
assert.strictEqual(count,index.covered_by_available_site_local_fonts);
assert.strictEqual(audit.summary.unicode18_assigned_codepoints,172808);
console.log("Validated Unicode 18.0 font coverage index:",
  index.font_families.length, "font files;",
  index.covered_by_available_site_local_fonts, "assigned codepoints;",
  index.ranges.length, "compressed cmap intervals;");
