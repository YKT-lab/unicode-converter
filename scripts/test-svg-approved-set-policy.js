"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const policy=JSON.parse(fs.readFileSync(path.join(root,"docs/svg-approved-fonts.json"),"utf8"));
const index=JSON.parse(fs.readFileSync(path.join(root,"data/unicode18_font_coverage_index.json"),"utf8"));
assert.equal(policy.schema_version,1);
assert.equal(policy.unicode_version,"18.0.0");
assert.equal(policy.approved_fonts.length,97,"92 Noto, WenJin, Plangothic P1/P2, Kaiyuan and UniHieroglyphica");
const seen=new Set(),look=new Map(index.font_families.map(x=>[x.file,x]));
for(const f of policy.approved_fonts){
 assert(!seen.has(f.file));seen.add(f.file);
 assert.equal(f.sha256,look.get(f.file)?.sha256);
 assert.equal(f.license,"SIL OFL 1.1");
 if(f.license_family==="wenjin")assert.equal(f.file,"fonts/han/WenJinMinchoP3-Regular.otf");
 else if(["noto","noto-cjk"].includes(f.license_family)) {
  assert.match(path.basename(f.file),/^Noto(?:Sans|Serif|Music|Color|Znamenny)/);
 } else assert(["plangothic","kaiyuan","unihieroglyphica"].includes(f.license_family));
}
assert.equal([...seen].filter(x=>/\/Noto/.test(x)).length,92);
assert.equal(index.font_families.length-seen.size,4);
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
console.log("PASS: 97 licensed fonts pinned by SHA with project-specific licenses, 4 pending sources excluded");
