"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const fontkit=require("@cantoo/fontkit");
const root=path.resolve(__dirname,"..");
const imports=JSON.parse(fs.readFileSync(path.join(root,"data/verified_font_imports.json"),"utf8"));
function gitBlobHash(bytes){
 return crypto.createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
}
async function download(url,maxSize){
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error("Upstream HTTP "+response.status+" for "+url);
 const declared=Number(response.headers.get("content-length")||0);
 if(declared>maxSize)throw Error("File is too large: "+url);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(!bytes.length||bytes.length>maxSize)throw Error("Invalid size: "+bytes.length+" "+url);
 return bytes;
}
function verifyFont(bytes,src){
 const temporary=path.join(root,"fonts/han/.verified-import-temp.otf");
 fs.mkdirSync(path.dirname(temporary),{recursive:true});
 try{
  fs.writeFileSync(temporary,bytes);
  const font=fontkit.openSync(temporary);
  const from=parseInt(src.unicode_range[0],16),to=parseInt(src.unicode_range[1],16);
  let count=0;
  for(let cp=from;cp<=to;cp++)if(font.hasGlyphForCodePoint(cp))count++;
  assert(count>=src.min_glyphs_in_range,
   "The target Unicode block is not adequately mapped: "+count);
  const notdef=font.getGlyph(0)?.path?.toSVG()||"";
  for(const hex of src.verify_glyphs){
   const cp=parseInt(hex,16);
   assert(font.hasGlyphForCodePoint(cp),"No cmap: U+"+hex);
   const glyph=font.glyphForCodePoint(cp);
   const outline=glyph?.path?.toSVG()||"";
   const bounds=glyph?.path?.bbox;
   assert(glyph?.id>0&&outline.length>0&&outline!==notdef&&
    bounds&&bounds.maxX>bounds.minX&&bounds.maxY>bounds.minY,
    "Missing or empty glyph outline: U+"+hex);
  }
  console.log("Verified mapped glyphs in range:",count,"outlines:",src.verify_glyphs.length);
 }finally{
  if(fs.existsSync(temporary))fs.unlinkSync(temporary);
 }
}
async function main(){
 assert.equal(imports.schema_version,1);
 for(const src of imports.sources){
  assert(/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(src.upstream_repository));
  assert(/^[a-f0-9]{40}$/.test(src.revision));
  assert(/^[a-f0-9]{40}$/.test(src.blob_sha1));
  assert(/^fonts\/[\w.-]+\/[\w.-]+\.(?:otf|ttf|woff2?)$/i.test(src.destination));
  assert(/^[\w.-]+\/[\w.-]+\.(?:otf|ttf)$/i.test(src.upstream_font));
  assert(/^fonts\/[\w.-]+\/[\w.-]+\.md$/.test(src.destination_license));
  assert(/^[\w.-]+\.md$/.test(src.upstream_license));
  const target=path.join(root,src.destination),licenseFile=path.join(root,src.destination_license);
  const url="https://raw.githubusercontent.com/"+src.upstream_repository+"/"+src.revision+"/";
  const existed=fs.existsSync(target);
  const bytes=existed?fs.readFileSync(target):await download(url+src.upstream_font,80000000);
  assert.equal(gitBlobHash(bytes),src.blob_sha1,
   "Font content differs from pinned upstream Git blob");
  verifyFont(bytes,src);
  const license=fs.existsSync(licenseFile)?fs.readFileSync(licenseFile):
    await download(url+src.upstream_license,200000);
  assert(license.toString("utf8").includes("SIL OPEN FONT LICENSE"),
   "Upstream font redistribution terms missing");
  if(!existed){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
  if(!fs.existsSync(licenseFile)){fs.mkdirSync(path.dirname(licenseFile),{recursive:true});fs.writeFileSync(licenseFile,license);}
  console.log("Imported and verified:",src.destination);
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
