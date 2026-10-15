"use strict";
const fs=require("node:fs"),path=require("node:path");
const fontkit=require("@cantoo/fontkit");
const root=path.resolve(__dirname,"..");
const index=JSON.parse(fs.readFileSync(path.join(root,"data/unicode18_font_coverage_index.json"),"utf8"));
function shorten(x){return String(x||"").replace(/\s+/g," ").slice(0,180)}
const list=index.font_families.map(entry=>{
 try{
  const f=fontkit.openSync(path.join(root,entry.file));
  const meta={
    file:entry.file,hash:entry.sha256,
    family:shorten(f.familyName||f.name?.fontFamily),
    copyright:shorten(f.copyright||f.name?.copyright),
    license:shorten(f.license||f.name?.license),
    licenseURL:shorten(f.licenseURL||f.name?.licenseURL),
    manufacturer:shorten(f.manufacturer||f.name?.manufacturer),
    vendor:shorten(f.vendorURL||f.name?.vendorURL)
  };
  meta.embeddedOFL=/open font license|\bOFL\b/i.test(meta.license+" "+meta.licenseURL);
  return meta;
 }catch(e){return{file:entry.file,error:String(e)}}
});
console.log("SVG_FONT_METADATA_BEGIN");
for(const e of list) console.log(JSON.stringify(e));
console.log("SVG_FONT_METADATA_END");
