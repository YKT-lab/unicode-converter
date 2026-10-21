"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const policy=JSON.parse(fs.readFileSync(path.join(root,"docs/svg-approved-fonts.json"),"utf8"));
const index=JSON.parse(fs.readFileSync(path.join(root,"data/unicode18_font_coverage_index.json"),"utf8"));
assert.equal(policy.schema_version,1);
assert.equal(policy.unicode_version,"18.0.0");
assert.equal(policy.approved_fonts.length,162,"155 Noto-family files plus GenZui, WenJin, Plangothic P1/P2, Kaiyuan and UniHieroglyphica");
const seen=new Set(),look=new Map(index.font_families.map(x=>[x.file,x]));
for(const f of policy.approved_fonts){
 assert(!seen.has(f.file));seen.add(f.file);
 assert.equal(f.sha256,look.get(f.file)?.sha256);
 assert.equal(f.license,"SIL OFL 1.1");
 if(f.license_family==="wenjin")assert.equal(f.file,"fonts/han/WenJinMinchoP3-Regular.otf");
 else if(["noto","noto-cjk"].includes(f.license_family)) {
  assert.match(path.basename(f.file),/^Noto(?:Sans|Serif|Naskh|Music|Color|Znamenny)/);
 } else if(f.license_family==="noto-emoji"){
    assert.equal(f.file,"fonts/emoji/NotoColorEmoji-Regular.ttf");
    assert.equal(f.license_file,"docs/licenses/NotoEmoji-OFL-1.1.txt");
    assert.equal(f.license_source,"https://github.com/googlefonts/noto-emoji");
  } else if(f.license_family==="genzui"){
    assert(["fonts/east-asian/GenZuiSans-Regular.ttf","fonts/east-asian/GenZuiSerif-Regular.ttf"].includes(f.file));
    assert.equal(f.license_file,"docs/licenses/GenZui-OFL-1.1.txt");
    assert.equal(f.license_source,"https://github.com/mkpoli/GenZui");
  } else assert(["plangothic","kaiyuan","unihieroglyphica"].includes(f.license_family));
}
assert.equal([...seen].filter(x=>/\/Noto/.test(x)).length,155);
assert.equal([...seen].filter(x=>/\/GenZui/.test(x)).length,2);
// New audited fonts are intentionally excluded from the approved SVG release
// until their license and hashes have been reviewed and pinned.
assert(index.font_families.length>=seen.size,"More approved SVG fonts than audited sources");
const unreviewed=index.font_families.filter(f=>!seen.has(f.file)).map(f=>f.file).sort();
assert.deepEqual(unreviewed,[
  "fonts/han/BabelStoneHan.woff2",
  "fonts/hieroglyphs/EgyptologyExtended.woff2",
  "fonts/scripts/Mallige_Unicode_v2.ttf",
  "fonts/symbols/BabelStonePseudographica.woff2"
],"Only the four still-unverified sources may stay outside the SVG release");
const license=fs.readFileSync(path.join(root,policy.license_text));
const blob=crypto.createHash("sha1").update(Buffer.from("blob "+license.length+"\0")).update(license).digest("hex");
assert.equal(blob,policy.license_git_blob_sha1);
assert.match(license.toString("utf8"),/SIL OPEN FONT LICENSE/);
const wf=fs.readFileSync(path.join(root,".github/workflows/site-deploy.yml"),"utf8");
assert.match(wf,/--approved-list=docs\/svg-approved-fonts\.json/);
assert.match(wf,/--policy=docs\/svg-approved-fonts\.json/);
assert.match(wf,/node scripts\/publish-svg-approved-set\.js/);
assert(!/--approved-font=/.test(wf));
assert(/const approvedFiles=approvedList/.test(fs.readFileSync(path.join(root,"tools/build-svg-precompute.js"),"utf8")));
console.log("PASS: 162 licensed fonts pinned by SHA; only four unverified sources remain excluded");
