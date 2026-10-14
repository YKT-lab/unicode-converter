"use strict";
/*
 * Fail-closed approved Unicode SVG outline publisher.
 * Full release requires every contributing source approval and 167875 audited paths.
 * An approved subset may contain paths from exactly one licensed source.
 * Generated font contours are redistributed with their complete OFL text.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,"..");
const args=Object.fromEntries(process.argv.slice(2).map(s=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(s);if(!m)throw Error("Unexpected argument: "+s);
 return [m[1],m[2]];
}));
for(const key of ["bundle","metrics","review","index","dest"])if(!args[key])throw Error("Missing --"+key);
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const sha256=data=>crypto.createHash("sha256").update(data).digest("hex");
const gitBlob=data=>crypto.createHash("sha1")
 .update(Buffer.from("blob "+data.length+"\0")).update(data).digest("hex");
const index=read(args.index),review=read(args.review),metrics=read(args.metrics);
const src=path.resolve(args.bundle),dst=path.resolve(args.dest),manifest=read(path.join(src,"manifest.json"));
const mode=metrics.mode;
if(!["full","approved"].includes(mode)||review.schema_version!==1||
   !Array.isArray(review.approvals)||!Array.isArray(index.font_families)||
   !Array.isArray(metrics.font_contributions))
 throw Error("Invalid SVG publication metadata");
if(manifest.schema_version!==2||manifest.unicode_version!=="18.0.0"||
   manifest.build_id!==metrics.build_id||manifest.bucket_size!==128||
   manifest.scanned_fonts!==index.font_families.length||
   metrics.local_font_files!==index.font_families.length||
   manifest.pages.length!==metrics.data_shards||!manifest.pages.length||
   !/^[0-9a-f]{16}$/i.test(manifest.build_id))
 throw Error("Invalid SVG build metadata");
const approvedOnly=mode==="approved";
if(approvedOnly){
 if(!metrics.approved_only||!metrics.approved_font||
    metrics.audit_matched!==false||
    manifest.source_font!==metrics.approved_font||
    !Number.isInteger(metrics.generated_outline_count)||
    metrics.generated_outline_count<1||
    metrics.font_contributions.length!==1||
    metrics.font_contributions[0].font!==metrics.approved_font||
    metrics.font_contributions[0].contributed!==metrics.generated_outline_count)
  throw Error("Invalid single-source approved SVG bundle");
}else if(metrics.audit_matched!==true||metrics.generated_outline_count!==167875||
         manifest.glyphs!==167875)
 throw Error("Invalid or incomplete full SVG audit");
const approvals=new Map();
for(const x of review.approvals){
 if(!x||typeof x.file!=="string"||approvals.has(x.file))throw Error("Duplicate approval");
 approvals.set(x.file,x);
}
const sources=new Map(index.font_families.map(f=>[f.file,f]));
const lacking=[],notices=[];
for(const f of metrics.font_contributions){
 if(!Number.isInteger(f.contributed)||f.contributed<0||!sources.has(f.font))
  throw Error("Unknown or invalid source contribution");
 if(!f.contributed)continue;
 const record=approvals.get(f.font),source=sources.get(f.font);
 if(!record||!source||record.source_sha256!==source.sha256||
    record.status!=="verified"||record.outline_redistribution_allowed!==true||
    !String(record.license||"").trim()||!String(record.license_source||"").trim()||
    !String(record.reviewer||"").trim()||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewed_on||"")){
  lacking.push(f.font);continue;
 }
 if(approvedOnly){
  if(!/^fonts\/[\w.-]+\/[\w.-]+\.(?:ttf|otf|woff2?)$/i.test(record.file)||
     !/^fonts\/[\w.-]+\/LICENSE-[\w.-]+\.md$/.test(record.license_file||"")||
     !/^[0-9a-f]{40}$/i.test(record.source_git_blob_sha1||"")||
     !/^[0-9a-f]{40}$/i.test(record.license_git_blob_sha1||"")||
     record.license!=="SIL OFL 1.1")
   throw Error("Unverified approved font provenance");
  const bytes=fs.readFileSync(path.join(ROOT,record.file));
  const license=fs.readFileSync(path.join(ROOT,record.license_file));
  if(sha256(bytes)!==source.sha256||gitBlob(bytes)!==record.source_git_blob_sha1||
     gitBlob(license)!==record.license_git_blob_sha1||
     !license.toString("utf8").includes("SIL OPEN FONT LICENSE")||
     !license.toString("utf8").includes("Copyright"))
   throw Error("Approved source/font license changed: "+record.file);
  notices.push({font:record.file,license_file:record.license_file,
    license:"SIL OFL 1.1",license_source:record.license_source,
    sha256:record.source_sha256,license_bytes:license});
 }
}
if(lacking.length)throw Error("REFUSING SVG OUTLINE PUBLICATION: "+
 lacking.length+" contributing fonts lack verified derivative redistribution permission:\n"+
 lacking.slice(0,30).join("\n"));
if(approvedOnly&&notices.length!==1)throw Error("Approved SVG release needs one OFL notice");
let total=0,previous=-1;
for(const page of manifest.pages){
 if(!/^page-[0-9a-f]{4}(?:-[ab]+)?\.json$/i.test(page.file)||
    !Number.isInteger(page.start)||!Number.isInteger(page.end)||
    page.start<=previous||page.start<0||page.end<page.start||page.end>0x10ffff||
    !Number.isInteger(page.bytes)||page.bytes<=0||page.bytes>10000000||
    !Number.isInteger(page.count)||page.count<1||
    !/^[0-9a-f]{64}$/i.test(page.sha256))
  throw Error("Unsafe or overlapping SVG page");
 previous=page.end;
 const bytes=fs.readFileSync(path.join(src,page.file));
 if(bytes.length!==page.bytes||sha256(bytes)!==page.sha256)
  throw Error("Page integrity mismatch: "+page.file);
 const body=JSON.parse(bytes.toString("utf8"));
 if(body.v!==1||!body.g||typeof body.g!=="object"||Array.isArray(body.g)||
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
 throw Error(approvedOnly?"Approved SVG release glyph count mismatch":"Full SVG release glyph count mismatch");
const id=manifest.build_id,manifestBytes=fs.readFileSync(path.join(src,"manifest.json"));
fs.mkdirSync(dst,{recursive:true});
const dest=path.join(dst,id);
if(fs.existsSync(dest))throw Error("Refusing to overwrite existing immutable SVG release");
const tmp=path.join(dst,".staging-"+id+"-"+process.pid);
fs.mkdirSync(tmp);
try{
 fs.writeFileSync(path.join(tmp,"manifest.json"),manifestBytes);
 for(const page of manifest.pages)
  fs.copyFileSync(path.join(src,page.file),path.join(tmp,page.file));
 if(approvedOnly){
  for(let i=0;i<notices.length;i++)
   fs.writeFileSync(path.join(tmp,"LICENSE-"+(i+1)+".md"),notices[i].license_bytes);
  fs.writeFileSync(path.join(tmp,"SOURCES.json"),
   JSON.stringify({schema_version:1,unicode_version:"18.0.0",build_id:id,
    generated_outline_count:total,sources:notices.map(({font,license,license_source,sha256},i)=>
     ({font,license,license_source,sha256,notice:"LICENSE-"+(i+1)+".md"}))},null,2)+"\n");
 }
 fs.renameSync(tmp,dest);
}catch(err){fs.rmSync(tmp,{recursive:true,force:true});throw err}
const active={schema_version:1,build_id:id,manifest:id+"/manifest.json"};
const pointer=path.join(dst,".active-"+process.pid+".json");
fs.writeFileSync(pointer,JSON.stringify(active,null,2)+"\n");
fs.renameSync(pointer,path.join(dst,"active.json"));
console.log("LICENSE-CHECKED SVG release staged",id,"glyphs:",total,"mode:",mode);
