"use strict";
// Test successful license-checked publication and fail-closed approval validation
// without distributing even one font-derived glyph.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os");
const path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"svg-approved-test-"));
const bundle=path.join(scratch,"bundle"),dest=path.join(scratch,"site","svg-data");
fs.mkdirSync(bundle,{recursive:true});
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const indexFull=JSON.parse(fs.readFileSync(path.join(root,"data/unicode18_font_coverage_index.json"),"utf8"));
const reviewFull=JSON.parse(fs.readFileSync(path.join(root,"docs/svg-font-license-approvals.json"),"utf8"));
const font="fonts/han/WenJinMinchoP3-Regular.otf";
const entry=indexFull.font_families.find(x=>x.file===font);
assert(entry,"Pinned OFL source must appear in the audited index");
assert(reviewFull.approvals.length===1);
const part=Buffer.from(JSON.stringify({v:1,g:{"332D3":[[0,-10,12,12],"M0 0L12 12Z"]}})+"\n");
const page={page:"0665",start:parseInt("33280",16),end:parseInt("332FF",16),file:"page-0665.json",
 count:1,bytes:part.length,sha256:hash(part)};
assert(0x332D3>=page.start&&0x332D3<=page.end);
const id="0123456789abcdef";
const manifest={schema_version:2,unicode_version:"18.0.0",build_id:id,
 bucket_size:128,scanned_fonts:1,source_font:font,glyphs:1,pages:[page]};
const metric={mode:"approved",approved_only:true,approved_font:font,audit_matched:false,
 generated_outline_count:1,build_id:id,local_font_files:1,data_shards:1,
 font_contributions:[{font,contributed:1,errors:0}]};
const put=(name,x)=>fs.writeFileSync(path.join(scratch,name),JSON.stringify(x));
const doPublish=()=>spawnSync(process.execPath,[path.join(__dirname,"publish-svg-bundle.js"),
 "--bundle="+bundle,"--metrics="+path.join(scratch,"metrics.json"),
 "--review="+path.join(scratch,"licenses.json"),"--index="+path.join(scratch,"index.json"),
 "--dest="+dest],{encoding:"utf8"});
try{
 fs.writeFileSync(path.join(bundle,page.file),part);
 fs.writeFileSync(path.join(bundle,"manifest.json"),JSON.stringify(manifest)+"\n");
 put("index.json",{font_families:[entry]});
 put("metrics.json",metric);
 put("licenses.json",{schema_version:1,approvals:[]});
 let p=doPublish();
 assert.notEqual(p.status,0,"No license approval => no release");
 assert.match(p.stderr,/REFUSING SVG OUTLINE PUBLICATION/);
 assert(!fs.existsSync(path.join(dest,"active.json")));
 put("licenses.json",reviewFull);
 const badSha={...reviewFull.approvals[0],source_sha256:"a".repeat(64)};
 put("licenses.json",{schema_version:1,approvals:[badSha]});
 p=doPublish();assert.notEqual(p.status,0);
 assert(!fs.existsSync(path.join(dest,"active.json")));
 put("licenses.json",reviewFull);
 const badMetric={...metric,approved_font:"fonts/han/another.otf"};
 put("metrics.json",badMetric);
 p=doPublish();assert.notEqual(p.status,0);
 assert.match(p.stderr,/Invalid single-source approved SVG bundle/);
 put("metrics.json",metric);
 p=doPublish();
 assert.equal(p.status,0,p.stderr);
 const active=JSON.parse(fs.readFileSync(path.join(dest,"active.json"),"utf8"));
 assert.equal(active.build_id,id);
 assert.equal(active.manifest,id+"/manifest.json");
 const staged=path.join(dest,id);
 assert.equal(fs.readFileSync(path.join(staged,page.file),"utf8"),part.toString("utf8"));
 assert.equal(fs.readFileSync(path.join(staged,"LICENSE-1.md"),"utf8"),
  fs.readFileSync(path.join(root,"fonts/han/LICENSE-WenJinMincho.md"),"utf8"));
 const sources=JSON.parse(fs.readFileSync(path.join(staged,"SOURCES.json"),"utf8"));
 assert.equal(sources.sources.length,1);
 assert.equal(sources.sources[0].sha256,entry.sha256);
 assert.equal(sources.sources[0].notice,"LICENSE-1.md");
 console.log("PASS: licensed subset publishes immutable SVG shards with full upstream OFL notice; unlicensed, tampered and malformed metadata are blocked");
}finally{
 fs.rmSync(scratch,{recursive:true,force:true});
}
