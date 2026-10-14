"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os");
const path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"svg-publish-gate-"));
const bundle=path.join(base,"bundle"),dest=path.join(base,"site","svg-data");
fs.mkdirSync(bundle,{recursive:true});
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const body=Buffer.from(JSON.stringify({v:1,g:{"0041":[[0,-10,12,12],"M0 0L12 12Z"]}}));
fs.writeFileSync(path.join(bundle,"page-0000.json"),body);
const id="0123456789abcdef",p={start:0,end:127,file:"page-0000.json",
 count:1,bytes:body.length,sha256:hash(body)};
fs.writeFileSync(path.join(bundle,"manifest.json"),JSON.stringify({
 schema_version:2,unicode_version:"18.0.0",build_id:id,bucket_size:128,scanned_fonts:1,glyphs:167875,pages:[p]}));
const metrics={mode:"full",audit_matched:true,generated_outline_count:167875,
 build_id:id,local_font_files:1,data_shards:1,
 font_contributions:[{font:"fonts/example.ttf",contributed:1}]};
const index={font_families:[{file:"fonts/example.ttf",sha256:"f".repeat(64)}]};
const put=(f,data)=>fs.writeFileSync(path.join(base,f),JSON.stringify(data));
put("metrics.json",metrics);put("index.json",index);put("licenses.json",{schema_version:1,approvals:[]});
const script=path.join(__dirname,"publish-svg-bundle.js");
const run=()=>spawnSync(process.execPath,[script,"--bundle="+bundle,
 "--metrics="+path.join(base,"metrics.json"),"--index="+path.join(base,"index.json"),
 "--review="+path.join(base,"licenses.json"),"--dest="+dest],{encoding:"utf8"});
try{
 const denied=run();assert.notEqual(denied.status,0);
 assert.match(denied.stderr,/REFUSING SVG OUTLINE PUBLICATION/);
 assert(!fs.existsSync(path.join(dest,"active.json")));
 put("licenses.json",{schema_version:1,approvals:[{file:"fonts/example.ttf",
  source_sha256:"f".repeat(64),status:"verified",outline_redistribution_allowed:true,
  license:"FIXTURE_ONLY",license_source:"local test",reviewer:"test",reviewed_on:"2026-10-14"}]});
 // A license approval alone never permits publication of incomplete manifests.
 const incomplete=run();assert.notEqual(incomplete.status,0);
 assert.match(incomplete.stderr,/Full SVG release glyph count mismatch/);
 assert(!fs.existsSync(path.join(dest,"active.json")));
 fs.writeFileSync(path.join(bundle,"page-0000.json"),Buffer.from("corrupt"));
 const tampered=run();assert.notEqual(tampered.status,0);
 assert.match(tampered.stderr,/integrity mismatch/);
 console.log("PASS: License gate blocks unreviewed, incomplete and modified outline payloads");
}finally{fs.rmSync(base,{recursive:true,force:true})}
