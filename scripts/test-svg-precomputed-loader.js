"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const api=require("../js/svg-precomputed-loader.js");
const base="https://example.invalid/unicode-converter/svg-data/";
const id="0123456789abcdef";
const g={v:1,g:{"0041":[[0,-10,12,12],"M0 0L12 12Z"],"0042":[[0,-10,12,12],"M0 0L10 10Z"]}};
const pageBuf=Buffer.from(JSON.stringify(g));
const page={start:0,end:127,file:"page-0000.json",count:2,bytes:pageBuf.length,
 sha256:crypto.createHash("sha256").update(pageBuf).digest("hex")};
const m={schema_version:2,unicode_version:"18.0.0",build_id:id,bucket_size:128,glyphs:2,pages:[page]};
const active={schema_version:1,build_id:id,manifest:id+"/manifest.json"};
const doc={baseURI:"https://example.invalid/unicode-converter/",createElementNS:(_ns,tag)=>({
 tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v},appendChild(x){this.children.push(x)}
})};
function session(opts={}){
 const urls=new Map([[base+"active.json",active],[base+id+"/manifest.json",m],[base+id+"/page-0000.json",g]]);
 const calls=[];let simultaneous=0,maxSimultaneous=0;
 const fetchFn=async u=>{
  calls.push(u);simultaneous++;maxSimultaneous=Math.max(maxSimultaneous,simultaneous);
  try{
   await Promise.resolve();
   if(opts.missing&&u.endsWith("active.json"))return {ok:false,status:404};
   if(opts.flaky&&u.endsWith("page-0000.json")&&calls.filter(x=>x===u).length===1)throw Error("offline");
   const v=urls.get(u);if(!v)return {ok:false,status:404};
   const data=(opts.bad&&u.endsWith("page-0000.json"))?{v:1,g:{"0041":[[0,0,1,1],"M0 0Z"]}}:v;
   const buf=Buffer.from(JSON.stringify(data));
   return {ok:true,json:async()=>data,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)};
  }finally{simultaneous--}
 };
 const client=api.createClient({baseUrl:base,siteUrl:doc.baseURI,fetchFn,
  documentObj:doc,subtle:crypto.webcrypto.subtle,maxParallel:1,retries:opts.flaky?1:0,sleep:async()=>{}});
 return {client,calls,max:()=>maxSimultaneous,urls};
}
(async()=>{
 const s=session();
 const [a,b,c]=await Promise.all([s.client.getGlyph(65),s.client.getGlyph(66),s.client.getGlyph(65)]);
 assert(a.svg&&b.svg&&c.svg);
 assert.equal(a.svg.attrs["data-code-point"],"0041");
 assert.equal(a.svg.children[0].attrs.transform,"scale(1,-1)");
 assert.equal(s.calls.filter(x=>x.endsWith("page-0000.json")).length,1);
 assert.equal(s.max(),1);
 assert.equal(s.client.stats().cachedShards,1);
 assert.equal((await s.client.getGlyph(200)).reason,"SVG未対応");
 assert.equal((await s.client.getGlyph(0xd800)).reason,"無効なUnicode番号");
 assert.equal((await session({bad:true}).client.getGlyph(65)).reason,"SVGデータ不整合");
 const rec=session({flaky:true});
 assert((await rec.client.getGlyph(65)).svg);
 assert.equal(rec.calls.filter(x=>x.endsWith("page-0000.json")).length,2);
 const miss=session({missing:true});
 assert.equal((await miss.client.getGlyph(65)).reason,"SVGデータ未配信");
 assert.throws(()=>api.validManifest(active,{...m,pages:[page,{...page,start:0}]}));
 console.log("PASS: SVG loader geometry, SHA-256, caching, concurrency, retry and errors");
})().catch(err=>{console.error(err);process.exitCode=1});
