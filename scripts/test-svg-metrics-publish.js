"use strict";
// Synthetic paths exercise both release gates; no generated font outline is
// committed. Real source/license hashes still come from the pinned registry.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os");
const path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const ROOT=path.resolve(__dirname,".."),scratch=fs.mkdtempSync(path.join(os.tmpdir(),"svg-metrics-publish-"));
const index=JSON.parse(fs.readFileSync(path.join(ROOT,"data/unicode18_font_coverage_index.json")));
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/svg-approved-fonts.json")));
const fontFile="fonts/han/WenJinMinchoP3-Regular.otf";
const source=index.font_families.find(f=>f.file===fontFile);
const sourceNames=policy.approved_fonts.map(f=>f.file).sort();
const id="0123456789abcdef",hex="332D3",file="page-0665.json";
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const metadata={unitsPerEm:1000,ascent:800,descent:-200,lineGap:0,advanceWidth:1000,
  fontFile,fontSha256:source.sha256,fontWeight:400};
let checks=0;
function fixture(){return {v:1,g:{[hex]:[[0,-800,1000,1000],"M0 0L12 12Z"]},m:{[hex]:{...metadata}}}}
function publish(mode,name,mutate,expected){
  const folder=path.join(scratch,mode+"-"+name),bundle=path.join(folder,"bundle");
  fs.mkdirSync(bundle,{recursive:true});
  const data=fixture(),manifest={schema_version:2,unicode_version:"18.0.0",layout:"font-metrics-v1",
    build_id:id,bucket_size:128,scanned_fonts:index.font_families.length,source_font:fontFile,
    source_fonts:sourceNames,glyphs:1};
  mutate(data,manifest);
  const body=Buffer.from(JSON.stringify(data)+"\n");
  manifest.pages=[{page:"0665",start:0x33280,end:0x332FF,file,count:1,bytes:body.length,sha256:hash(body)}];
  fs.writeFileSync(path.join(bundle,file),body);
  fs.writeFileSync(path.join(bundle,"manifest.json"),JSON.stringify(manifest));
  const metrics={mode,approved_only:true,approved_font:fontFile,audit_matched:false,
    generated_outline_count:1,build_id:id,local_font_files:index.font_families.length,data_shards:1,
    font_contributions:[{font:fontFile,contributed:1,errors:0}],approved_fonts:sourceNames};
  const report=path.join(folder,"metrics.json");fs.writeFileSync(report,JSON.stringify(metrics));
  const command=mode==="approved"?"publish-svg-bundle.js":"publish-svg-approved-set.js";
  const args=[path.join(__dirname,command),"--bundle="+bundle,"--metrics="+report,
    "--index="+path.join(ROOT,"data/unicode18_font_coverage_index.json"),"--dest="+path.join(folder,"site")];
  args.push(mode==="approved"?"--review="+path.join(ROOT,"docs/svg-font-license-approvals.json"):
    "--policy="+path.join(ROOT,"docs/svg-approved-fonts.json"));
  const result=spawnSync(process.execPath,args,{encoding:"utf8",timeout:30000});
  assert(!result.error,result.error?.message);
  if(expected)assert.equal(result.status,0,mode+" "+name+": "+result.stderr);
  else {
    assert.notEqual(result.status,0,mode+" "+name+" must be refused");
    assert.match(result.stderr,/metrics|viewport|source|metadata/i);
    assert(!fs.existsSync(path.join(folder,"site/active.json")),"Rejected data must not become active");
  }
  checks++;
}
try{
  for(const mode of ["approved","approved-set"]){
    publish(mode,"valid",()=>{},true);
    publish(mode,"zero-advance",data=>{data.m[hex].advanceWidth=0},true);
    publish(mode,"legacy",(data,manifest)=>{delete data.m;delete manifest.layout},true);
    publish(mode,"optional-metrics",(_data,manifest)=>{delete manifest.layout},true);
    publish(mode,"missing-table",data=>{delete data.m},false);
    publish(mode,"extra-key",data=>{data.m["332D4"]={...metadata}},false);
    publish(mode,"wrong-key",data=>{data.m["332D4"]=data.m[hex];delete data.m[hex]},false);
    publish(mode,"bad-em",data=>{data.m[hex].unitsPerEm=0},false);
    publish(mode,"bad-height",data=>{data.m[hex].ascent=-200},false);
    publish(mode,"bad-gap",data=>{data.m[hex].lineGap=null},false);
    publish(mode,"negative-advance",data=>{data.m[hex].advanceWidth=-1},false);
    publish(mode,"synthetic-weight",data=>{data.m[hex].fontWeight=700},false);
    publish(mode,"wrong-hash",data=>{data.m[hex].fontSha256="a".repeat(64)},false);
    publish(mode,"unapproved-source",data=>{
      const unapproved=index.font_families.find(f=>f.file==="fonts/han/BabelStoneHan.woff2");
      data.m[hex].fontFile=unapproved.file;data.m[hex].fontSha256=unapproved.sha256;
    },false);
    publish(mode,"bbox-normalization",data=>{data.g[hex][0]=[0,-10,12,12]},false);
  }
  console.log("PASS: "+checks+" SVG metrics release checks, legacy compatibility, source pinning and zero advance");
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
