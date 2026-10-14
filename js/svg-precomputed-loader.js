/*
 * Unicode Converter SVG shard client (precomputed renderer).
 * This file is inert until svg-mode.js opts into it.
 * Vectors remain license-gated and are not yet deployed.
 */
(function(root){
"use strict";
const NS="http://www.w3.org/2000/svg";
const FILE=/^page-[0-9a-f]{4}(?:-[ab]+)?\.json$/i;
const SHA=/^[0-9a-f]{64}$/i, BUILD=/^[0-9a-f]{16}$/i;
function hex(cp){return cp.toString(16).toUpperCase().padStart(4,"0")}
class SvgLoadError extends Error {
 constructor(code,message,retryable=false){super(message);this.name="SvgLoadError";this.code=code;this.retryable=retryable}
}
function findPage(pages,cp){
 let low=0,high=pages.length-1;
 while(low<=high){const mid=(low+high)>>>1,p=pages[mid];
  if(cp<p.start)high=mid-1;else if(cp>p.end)low=mid+1;else return p}
 return null;
}
function validManifest(active,manifest){
 if(!active||active.schema_version!==1||!BUILD.test(active.build_id)||
    active.manifest!==active.build_id+"/manifest.json")
  throw new SvgLoadError("manifest","Bad SVG release pointer");
 if(!manifest||manifest.schema_version!==2||manifest.unicode_version!=="18.0.0"||
    manifest.build_id!==active.build_id||manifest.bucket_size!==128||
    !Array.isArray(manifest.pages)||!Number.isInteger(manifest.glyphs))
  throw new SvgLoadError("manifest","Bad SVG outline manifest");
 let last=-1,count=0;
 for(const p of manifest.pages){
  if(!p||!FILE.test(p.file)||!Number.isInteger(p.start)||!Number.isInteger(p.end)||
     p.start<=last||p.start<0||p.end<p.start||p.end>0x10ffff||
     !Number.isInteger(p.count)||p.count<1||
     !Number.isInteger(p.bytes)||p.bytes<=0||p.bytes>10_000_000||
     !SHA.test(p.sha256))
   throw new SvgLoadError("manifest","Invalid SVG shard");
  count+=p.count;last=p.end;
 }
 if(count!==manifest.glyphs)throw new SvgLoadError("manifest","SVG shard count mismatch");
 return manifest.pages;
}
function svgElement(doc,cp,entry){
 if(!Array.isArray(entry)||entry.length!==2||!Array.isArray(entry[0])||
   entry[0].length!==4||!entry[0].every(Number.isFinite)||
   entry[0][2]<=0||entry[0][3]<=0||typeof entry[1]!=="string"||
   !entry[1].trim()||entry[1].length>7_000_000)
  throw new SvgLoadError("format","Invalid SVG glyph geometry");
 const svg=doc.createElementNS(NS,"svg"),outline=doc.createElementNS(NS,"path");
 svg.setAttribute("viewBox",entry[0].join(" "));
 svg.setAttribute("class","unicode-svg-outline");
 svg.setAttribute("role","img");
 svg.setAttribute("aria-label","U+"+hex(cp));
 svg.setAttribute("data-code-point",hex(cp));
 outline.setAttribute("d",entry[1]);
 outline.setAttribute("fill","currentColor");
 // fontkit stores Y upwards; SVG's coordinate space points downwards.
 outline.setAttribute("transform","scale(1,-1)");
 svg.appendChild(outline);
 return svg;
}
function createClient(options={}){
 const doc=options.documentObj||root.document;
 const fetcher=options.fetchFn||(typeof root.fetch==="function"?root.fetch.bind(root):null);
 const subtle=options.subtle||root.crypto?.subtle;
 if(!doc?.createElementNS||!fetcher)throw Error("DOM and fetch required for SVG renderer");
 const base=new URL(options.baseUrl||"./svg-data/",options.siteUrl||doc.baseURI);
 if(!/^https?:$/.test(base.protocol))throw Error("Invalid SVG data base");
 const maxParallel=Math.max(1,Math.min(6,options.maxParallel??4));
 const maxCache=Math.max(1,Math.min(20,options.maxCache??6));
 const retries=Math.max(0,Math.min(2,options.retries??1));
 const sleep=options.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms)));
 const cache=new Map(),queue=[];
 let inFlight=0,manifestPromise=null,version=null;
 function url(relative){
  const u=new URL(relative,base);
  if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname))
   throw new SvgLoadError("manifest","Unsafe SVG path");
  return u.href;
 }
 function limited(task){
  return new Promise((resolve,reject)=>{
   const run=()=>{
    inFlight++;
    Promise.resolve().then(task).then(resolve,reject).finally(()=>{
     inFlight--;const next=queue.shift();if(next)next();
    });
   };
   if(inFlight<maxParallel)run();else queue.push(run);
  });
 }
 async function loadJson(name,size=null,hash=null){
  let lastError;
  for(let attempt=0;attempt<=retries;attempt++){
   try{
    return await limited(async()=>{
     const res=await fetcher(url(name),{cache:size===null?"no-store":"force-cache"});
     if(!res.ok)throw new SvgLoadError(res.status===404?"missing":"network",
      "SVG HTTP "+res.status,res.status===429||res.status>=500);
     if(size===null)return res.json();
     const buf=await res.arrayBuffer();
     if(buf.byteLength!==size)throw new SvgLoadError("version","SVG shard size mismatch");
     if(!subtle?.digest)throw new SvgLoadError("integrity","SHA-256 unavailable");
     const digest=await subtle.digest("SHA-256",buf);
     const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
     if(actual!==hash.toLowerCase())throw new SvgLoadError("version","SVG shard hash mismatch");
     try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buf))}
     catch(_err){throw new SvgLoadError("format","Invalid SVG JSON")}
    });
   }catch(err){
    lastError=err instanceof SvgLoadError?err:new SvgLoadError("network",String(err),true);
    if(!lastError.retryable||attempt===retries)break;
    await sleep(150*(attempt+1));
   }
  }
  throw lastError;
 }
 async function manifest(){
  if(!manifestPromise){
   manifestPromise=(async()=>{
    const active=await loadJson("active.json");
    if(!active||!BUILD.test(active.build_id)||active.manifest!==active.build_id+"/manifest.json")
     throw new SvgLoadError("manifest","Bad release pointer");
    const json=await loadJson(active.manifest);
    const pages=validManifest(active,json);
    version={build:active.build_id,pages};
    return version;
   })().catch(err=>{manifestPromise=null;version=null;throw err});
  }
  return manifestPromise;
 }
 async function shard(page,build){
  const key=build+"/"+page.file;
  if(cache.has(key)){
   const x=cache.get(key);cache.delete(key);cache.set(key,x);return x;
  }
  const promise=loadJson(key,page.bytes,page.sha256).then(obj=>{
   if(!obj||obj.v!==1||!obj.g||typeof obj.g!=="object"||Array.isArray(obj.g)||
      Object.keys(obj.g).length!==page.count)
    throw new SvgLoadError("format","Invalid glyph shard");
   for(const code of Object.keys(obj.g)){
    if(!/^[0-9a-f]{4,6}$/i.test(code))throw new SvgLoadError("format","Invalid glyph key");
    const cp=parseInt(code,16);
    if(cp<page.start||cp>page.end)throw new SvgLoadError("version","Out-of-range glyph");
   }
   return obj.g;
  }).catch(err=>{if(cache.get(key)===promise)cache.delete(key);throw err});
  cache.set(key,promise);
  while(cache.size>maxCache)cache.delete(cache.keys().next().value);
  return promise;
 }
 async function once(cp){
  const v=await manifest(),p=findPage(v.pages,cp);
  if(!p)return {svg:null,reason:"SVG未対応"};
  const all=await shard(p,v.build),entry=all[hex(cp)];
  return entry?{svg:svgElement(doc,cp,entry),reason:null}:{svg:null,reason:"SVG未対応"};
 }
 function clear(){cache.clear();manifestPromise=null;version=null}
 async function getGlyph(cp){
  if(!Number.isInteger(cp)||cp<0||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))
   return {svg:null,reason:"無効なUnicode番号"};
  try{return await once(cp)}
  catch(first){
   let err=first;
   if(first?.code==="missing"&&version){
    clear();
    try{return await once(cp)}catch(second){err=second}
   }
   if(err?.code==="missing")return {svg:null,reason:"SVGデータ未配信",error:err};
   if(err?.code==="network")return {svg:null,reason:"SVG通信失敗",error:err};
   return {svg:null,reason:"SVGデータ不整合",error:err};
  }
 }
 return {getGlyph,clearCache:clear,stats:()=>({cachedShards:cache.size,inFlight,queued:queue.length,build:version?.build||null})};
}
const api=Object.freeze({createClient,findPage,validManifest,svgElement,SvgLoadError});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else root.UnicodePrecomputedSvg=api;
})(typeof globalThis!=="undefined"?globalThis:this);
