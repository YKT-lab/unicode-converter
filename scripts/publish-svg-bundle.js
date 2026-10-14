"use strict";
/*
 * Fail-closed SVG outline redistribution gate. No review => no publication.
 * Before creating active.json, validates all contributing source fonts,
 * every page hash, byte length, glyph count, and assigned codepoint range.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const args=Object.fromEntries(process.argv.slice(2).map(s=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(s);if(!m)throw Error("Unexpected argument: "+s);return [m[1],m[2]]
}));
for(const key of ["bundle","metrics","review","index","dest"])if(!args[key])throw Error("Missing --"+key);
const read=x=>JSON.parse(fs.readFileSync(x,"utf8"));
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const index=read(args.index),review=read(args.review),metrics=read(args.metrics);
const src=path.resolve(args.bundle),dst=path.resolve(args.dest);
const manifest=read(path.join(src,"manifest.json"));
if(review.schema_version!==1||!Array.isArray(review.approvals))throw Error("Invalid license review");
if(metrics.mode!=="full"||metrics.audit_matched!==true||metrics.generated_outline_count!==167875||
   metrics.build_id!==manifest.build_id||manifest.schema_version!==2||
   manifest.unicode_version!=="18.0.0"||metrics.local_font_files!==index.font_families.length||
   metrics.data_shards!==manifest.pages.length)
 throw Error("Invalid or incomplete full SVG audit");
const approvals=new Map();
for(const item of review.approvals){
 if(!item||typeof item.file!=="string"||approvals.has(item.file))throw Error("Duplicate approval");
 approvals.set(item.file,item);
}
const sources=new Map(index.font_families.map(x=>[x.file,x]));
const lacking=[];
for(const f of metrics.font_contributions){
 if(!Number.isInteger(f.contributed)||f.contributed<0)throw Error("Invalid source contribution");
 if(f.contributed===0)continue;
 const record=approvals.get(f.font),source=sources.get(f.font);
 if(!record||!source||record.source_sha256!==source.sha256||
    record.status!=="verified"||record.outline_redistribution_allowed!==true||
    !String(record.license||"").trim()||!String(record.license_source||"").trim()||
    !String(record.reviewer||"").trim()||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewed_on||""))lacking.push(f.font);
}
if(lacking.length)throw Error("REFUSING SVG OUTLINE PUBLICATION: "+
 lacking.length+" contributing fonts lack verified derivative redistribution permission:\n"+
 lacking.slice(0,30).join("\n"));
if(!/^[0-9a-f]{16}$/i.test(manifest.build_id))throw Error("Invalid SVG release ID");
let total=0,previous=-1;
for(const page of manifest.pages){
 if(!/^page-[0-9a-f]{4}(?:-[ab]+)?\.json$/i.test(page.file)||
    !Number.isInteger(page.start)||!Number.isInteger(page.end)||
    page.start<=previous||page.end<page.start||page.end>0x10ffff)
  throw Error("Unsafe or overlapping page");
 previous=page.end;
 const bytes=fs.readFileSync(path.join(src,page.file));
 if(bytes.length!==page.bytes||hash(bytes)!==page.sha256)
  throw Error("Page integrity mismatch: "+page.file);
 const body=JSON.parse(bytes.toString("utf8"));
 if(body.v!==1||!body.g||typeof body.g!=="object"||
    Object.keys(body.g).length!==page.count)
  throw Error("Page glyph count mismatch: "+page.file);
 for(const key of Object.keys(body.g)){
  const cp=parseInt(key,16);
  if(!/^[0-9a-f]{4,6}$/i.test(key)||cp<page.start||cp>page.end)
   throw Error("Out-of-range glyph: "+page.file);
 }
 total+=page.count;
}
if(total!==manifest.glyphs||total!==metrics.generated_outline_count)
 throw Error("Full SVG release glyph count mismatch");
const id=manifest.build_id,manifestBytes=fs.readFileSync(path.join(src,"manifest.json"));
fs.mkdirSync(dst,{recursive:true});
const dest=path.join(dst,id);
if(fs.existsSync(dest)){
 if(hash(fs.readFileSync(path.join(dest,"manifest.json")))!==hash(manifestBytes))
  throw Error("Immutable build ID changed content");
 for(const page of manifest.pages){
  const b=fs.readFileSync(path.join(dest,page.file));
  if(b.length!==page.bytes||hash(b)!==page.sha256)throw Error("Corrupt existing release");
 }
}else{
 const tmp=path.join(dst,".staging-"+id+"-"+process.pid);
 fs.mkdirSync(tmp);
 try{
  fs.writeFileSync(path.join(tmp,"manifest.json"),manifestBytes);
  for(const page of manifest.pages)
   fs.copyFileSync(path.join(src,page.file),path.join(tmp,page.file));
  fs.renameSync(tmp,dest);
 }catch(err){fs.rmSync(tmp,{recursive:true,force:true});throw err}
}
const active={schema_version:1,build_id:id,manifest:id+"/manifest.json"};
const tmp=path.join(dst,".active-"+process.pid+".json");
fs.writeFileSync(tmp,JSON.stringify(active,null,2)+"\n");
fs.renameSync(tmp,path.join(dst,"active.json"));
console.log("Licensed and verified SVG release staged:",id,"glyphs:",total);
