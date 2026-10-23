"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
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
 const calls=[],requests=[];let simultaneous=0,maxSimultaneous=0;
 const fetchFn=async (u,init)=>{
  calls.push(u);requests.push({url:u,...init});simultaneous++;maxSimultaneous=Math.max(maxSimultaneous,simultaneous);
  try{
   await Promise.resolve();
   if(opts.response){const response=await opts.response(u,init,calls);if(response!==undefined)return response}
   if(opts.missing&&u.endsWith("active.json"))return {ok:false,status:404};
   if(opts.flaky&&u.endsWith("page-0000.json")&&calls.filter(x=>x===u).length===1)throw Error("offline");
   const v=urls.get(u);if(!v)return {ok:false,status:404};
   const data=(opts.bad&&u.endsWith("page-0000.json"))?{v:1,g:{"0041":[[0,0,1,1],"M0 0Z"]}}:v;
   const buf=Buffer.from(JSON.stringify(data));
   return {ok:true,json:async()=>data,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)};
  }finally{simultaneous--}
 };
 const client=api.createClient({baseUrl:base,siteUrl:doc.baseURI,fetchFn,
  documentObj:opts.doc||doc,subtle:"subtle" in opts?opts.subtle:crypto.webcrypto.subtle,
  AbortController:"AbortController" in opts?opts.AbortController:globalThis.AbortController,
  requestTimeoutMs:opts.requestTimeoutMs,maxParallel:1,
  retries:opts.retries??(opts.flaky?1:0),sleep:async()=>{}});
 return {client,calls,requests,max:()=>maxSimultaneous,urls};
}
function checkModePath(siteUrl,scriptUrl,useScriptList=false){
 let captured;
 const fakeDoc={baseURI:siteUrl,getElementById:()=>null,
  currentScript:useScriptList?null:{src:scriptUrl},
  scripts:[{src:"https://example.invalid/unrelated.js"},{src:scriptUrl}]};
 const ctx={document:fakeDoc,URL,window:{UnicodePrecomputedSvg:{createClient(options){
  captured=options;return {getGlyph:()=>Promise.resolve({svg:{}})};
 }}}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,"../js/svg-mode.js"),"utf8"),ctx);
 fakeDoc.currentScript=null;fakeDoc.scripts=[];
 ctx.getPrecomputedSvgClient();
 assert.equal(captured.baseUrl,"https://example.invalid/unicode-converter/svg-data/");
}
const watchdog=setTimeout(()=>{console.error("FAIL: SVG loader test did not settle");process.exitCode=1},5000);
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
 assert.equal((await miss.client.getGlyph(65)).error.status,404);
 assert.throws(()=>api.validManifest(active,{...m,pages:[page,{...page,start:0}]}));

 const brokenJson=session({retries:1,response:u=>u.endsWith("active.json")?
  {ok:true,json:async()=>{throw new SyntaxError("HTML instead of JSON")}}:undefined});
 const format=await brokenJson.client.getGlyph(65);
 assert.equal(format.code,"format");assert.equal(format.stage,"active");
 assert.equal(format.url,base+"active.json");
 assert.equal(brokenJson.calls.length,1,"Invalid JSON is not a transient network error");
 const noCrypto=await session({subtle:null}).client.getGlyph(65);
 assert.equal(noCrypto.code,"integrity");assert.equal(noCrypto.stage,"shard");
 assert.equal(noCrypto.reason,"SVG検証機能未対応");
 const denied=session({retries:1,response:()=>({ok:false,status:403})});
 const deniedResult=await denied.client.getGlyph(65);
 assert.equal(deniedResult.error.status,403);assert.equal(denied.calls.length,1);

 const refresh=session({response:(u,init,calls)=>{
  if(u.endsWith("page-0000.json")&&calls.filter(x=>x===u).length===1)
   return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};
 }});
 assert((await refresh.client.getGlyph(65)).svg,"A corrupt cached shard recovers once");
 assert.deepEqual(refresh.requests.filter(x=>x.url.endsWith("page-0000.json")).map(x=>x.cache),
  ["force-cache","reload"]);
 assert.equal(refresh.calls.filter(x=>x.endsWith("active.json")).length,2);
 const persistent=session({bad:true});
 const persistentError=await persistent.client.getGlyph(65);
 assert.equal(persistentError.code,"version");
 assert.equal(persistent.calls.filter(x=>x.endsWith("page-0000.json")).length,2,
  "Persistent corruption must not loop or bypass hash verification");
 const hashMismatch=session({response:u=>{
  if(!u.endsWith("page-0000.json"))return;
  const bytes=Buffer.from(pageBuf.toString("utf8").replace("L12 12Z","L13 12Z"));
  assert.equal(bytes.length,pageBuf.length);
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};
 }});
 const hashed=await hashMismatch.client.getGlyph(65);
 assert.equal(hashed.code,"version");assert.equal(hashed.phase,"hash");
 assert.equal(hashMismatch.requests.filter(x=>x.url.endsWith("page-0000.json")).length,2);
 const removed=session({response:(u,_init,calls)=>u.endsWith("page-0000.json")&&
  calls.filter(x=>x===u).length===1?{ok:false,status:404}:undefined});
 assert((await removed.client.getGlyph(65)).svg,"A retired release refreshes its pointer once");

 // Cover fetch, JSON body, binary body and digest independently. No abort
 // support is required for deadlines to settle and release the queue slot.
 const never=()=>new Promise(()=>{});
 for(const where of ["fetch","json","body","digest"]){
  let stuck=true;
  const timed=session({requestTimeoutMs:10,AbortController:null,
   subtle:where==="digest"?{digest:never}:crypto.webcrypto.subtle,
   response:(u)=>{
    if(!stuck)return;
    if(where==="fetch"&&u.endsWith("active.json")){stuck=false;return never()}
    if(where==="json"&&u.endsWith("active.json")){stuck=false;return {ok:true,json:never}}
    if(where==="body"&&u.endsWith("page-0000.json"))return {ok:true,arrayBuffer:never};
   }});
  const timeout=await timed.client.getGlyph(65);
  assert.equal(timeout.code,"timeout",where);
  assert.equal(timeout.phase,where==="digest"?"hash":where==="fetch"?"fetch":"body",where);
  await Promise.resolve();
  assert.equal(timed.client.stats().inFlight,0,where+" must release its queue slot");
  if(where==="fetch"||where==="json")assert((await timed.client.getGlyph(65)).svg);
 }
 const aborted=session({requestTimeoutMs:10,response:never});
 assert.equal((await aborted.client.getGlyph(65)).code,"timeout");
 assert.equal(aborted.requests[0].signal.aborted,true,"Cancel real fetches when abort is supported");
 const renderFailure=await session({doc:{...doc,createElementNS(){throw Error("DOM failure")}}}).client.getGlyph(65);
 assert.equal(renderFailure.code,"processing");assert.equal(renderFailure.stage,"render");

 checkModePath("https://example.invalid/unicode-converter/","https://example.invalid/unicode-converter/js/svg-mode.js?v=1");
 checkModePath("https://example.invalid/unicode-converter","https://example.invalid/unicode-converter/js/svg-mode.js?v=1");
 checkModePath("https://example.invalid/unicode-converter/emoji/","https://example.invalid/unicode-converter/js/svg-mode.js?v=1");
 checkModePath("https://example.invalid/other-base/","https://example.invalid/unicode-converter/js/svg-mode.js?v=1",true);
 console.log("PASS: SVG loader geometry, SHA-256, caching, concurrency, deadlines, recovery, typed errors and Pages paths");
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>clearTimeout(watchdog));
