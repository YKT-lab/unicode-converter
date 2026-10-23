/*
 * Unicode Converter SVG shard client (precomputed renderer).
 * Activated only in the user-selected SVG mode. Glyphs are drawn from
 * license-gated, hash-checked shards; failures retain typed diagnostics.
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
function contextError(error,stage,url,phase){
 const err=error instanceof SvgLoadError?error:new SvgLoadError("processing",String(error));
 if(!err.stage)err.stage=stage;
 if(!err.url)err.url=url;
 if(!err.phase&&phase)err.phase=phase;
 return err;
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
    !Array.isArray(manifest.pages)||!Number.isInteger(manifest.glyphs)||
    (manifest.layout!==undefined&&manifest.layout!=="font-metrics-v1"))
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
function svgElement(doc,cp,entry,metrics=null){
 if(!Array.isArray(entry)||entry.length!==2||!Array.isArray(entry[0])||
   entry[0].length!==4||!entry[0].every(Number.isFinite)||
   entry[0][2]<=0||entry[0][3]<=0||typeof entry[1]!=="string"||
   !entry[1].trim()||entry[1].length>7_000_000)
  throw new SvgLoadError("format","Invalid SVG glyph geometry");
 if(metrics){
  if(!metrics||typeof metrics!=="object"||
     ![metrics.unitsPerEm,metrics.ascent,metrics.descent,metrics.lineGap,metrics.advanceWidth].every(Number.isFinite)||
     metrics.unitsPerEm<=0||metrics.ascent<=metrics.descent||metrics.advanceWidth<0||
     metrics.fontWeight!==400||typeof metrics.fontFile!=="string"||
     !/^fonts\/[\w.-]+(?:\/[\w.-]+)*\.(?:ttf|otf|woff2?)$/i.test(metrics.fontFile)||
     metrics.fontFile.split("/").includes("..")||!SHA.test(metrics.fontSha256))
   throw new SvgLoadError("format","Invalid SVG font metrics");
  const expected=[0,-metrics.ascent,metrics.advanceWidth||metrics.unitsPerEm,metrics.ascent-metrics.descent];
  if(entry[0].some((value,i)=>Math.abs(value-expected[i])>0.002))
   throw new SvgLoadError("format","SVG viewport and font metrics differ");
 }
 const svg=doc.createElementNS(NS,"svg"),outline=doc.createElementNS(NS,"path");
 svg.setAttribute("viewBox",entry[0].join(" "));
 svg.setAttribute("class","unicode-svg-outline");
 svg.setAttribute("role","img");
 svg.setAttribute("aria-label","U+"+hex(cp));
 svg.setAttribute("data-code-point",hex(cp));
 if(metrics){
  const em=metrics.unitsPerEm,advance=metrics.advanceWidth/em;
  // Preserve the font's origin and baseline. Never fit an individual ink box.
  svg.setAttribute("preserveAspectRatio","xMinYMin meet");
  svg.setAttribute("style","width:"+(advance||1)+"em;height:"+
   ((metrics.ascent-metrics.descent)/em)+"em;vertical-align:"+
   (metrics.descent/em)+"em;overflow:visible");
  svg.setAttribute("data-font-metrics","em");
  svg.setAttribute("data-advance-em",String(advance));
  svg.setAttribute("data-font-file",metrics.fontFile);
  svg.setAttribute("data-font-sha256",metrics.fontSha256);
  svg.setAttribute("data-font-weight",String(metrics.fontWeight));
 }
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
 const subtle="subtle" in options?options.subtle:root.crypto?.subtle;
 const Abort="AbortController" in options?options.AbortController:root.AbortController;
 if(!doc?.createElementNS||!fetcher)throw Error("DOM and fetch required for SVG renderer");
 const base=new URL(options.baseUrl||"./svg-data/",options.siteUrl||doc.baseURI);
 if(!/^https?:$/.test(base.protocol))throw Error("Invalid SVG data base");
 const maxParallel=Math.max(1,Math.min(6,options.maxParallel??4));
 const maxCache=Math.max(1,Math.min(20,options.maxCache??6));
 const retries=Math.max(0,Math.min(2,options.retries??1));
 const requestedTimeout=Number(options.requestTimeoutMs??8000);
 const requestTimeoutMs=Number.isFinite(requestedTimeout)?Math.max(1,Math.min(30000,requestedTimeout)):8000;
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
 async function loadJson(name,size=null,hash=null,reload=false){
  let lastError;
  const stage=name==="active.json"?"active":name.endsWith("/manifest.json")?"manifest":"shard";
  const requestUrl=url(name);
  for(let attempt=0;attempt<=retries;attempt++){
   try{
    return await limited(async()=>{
     const controller=typeof Abort==="function"?new Abort():null;
     let timer,phase="fetch";
     // Include body reads and hashing: an unresponsive WebView must release
     // its queue slot even when AbortController is absent or ignored.
     const deadline=new Promise((_resolve,reject)=>{
      timer=setTimeout(()=>{
       reject(contextError(new SvgLoadError("timeout","SVG request timed out"),stage,requestUrl,phase));
       if(controller)controller.abort();
      },requestTimeoutMs);
     });
     const request=(async()=>{
      try{
       const init={cache:size===null?"no-store":reload?"reload":"force-cache"};
       if(controller)init.signal=controller.signal;
       const res=await fetcher(requestUrl,init);
       if(!res.ok){
        const err=new SvgLoadError(res.status===404?"missing":"network",
         "SVG HTTP "+res.status,res.status===429||res.status>=500);
        err.status=res.status;throw err;
       }
       phase="body";
       if(size===null){
        try{return await res.json()}
        catch(err){
         if(err?.name==="SyntaxError")throw new SvgLoadError("format","Invalid SVG JSON");
         throw err;
        }
       }
       const buf=await res.arrayBuffer();
       if(buf.byteLength!==size)throw new SvgLoadError("version","SVG shard size mismatch");
       phase="hash";
       if(!subtle?.digest)throw new SvgLoadError("integrity","SHA-256 unavailable");
       const digest=await subtle.digest("SHA-256",buf);
       const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
       if(actual!==hash.toLowerCase())throw new SvgLoadError("version","SVG shard hash mismatch");
       phase="decode";
       if(typeof root.TextDecoder!=="function")throw new SvgLoadError("integrity","UTF-8 decoder unavailable");
       try{return JSON.parse(new root.TextDecoder("utf-8",{fatal:true}).decode(buf))}
       catch(_err){throw new SvgLoadError("format","Invalid SVG JSON")}
      }catch(err){
       if(!(err instanceof SvgLoadError)){
        const code=phase==="fetch"||phase==="body"?"network":err?.name==="NotSupportedError"?"integrity":"processing";
        err=new SvgLoadError(code,String(err),code==="network");
       }
       throw contextError(err,stage,requestUrl,phase);
      }
     })();
     try{return await Promise.race([request,deadline])}
     finally{clearTimeout(timer)}
    });
   }catch(err){
    lastError=contextError(err,stage,requestUrl);
    if(!lastError.retryable||attempt===retries)break;
    await sleep(150*(attempt+1));
   }
  }
  throw lastError;
 }
 async function manifest(){
  if(!manifestPromise){
   const promise=(async()=>{
    const active=await loadJson("active.json");
    if(!active||!BUILD.test(active.build_id)||active.manifest!==active.build_id+"/manifest.json")
     throw contextError(new SvgLoadError("manifest","Bad release pointer"),"active",url("active.json"),"validation");
    const json=await loadJson(active.manifest);
    let pages;
    try{pages=validManifest(active,json)}
    catch(err){throw contextError(err,"manifest",url(active.manifest),"validation")}
    const result={build:active.build_id,pages,layout:json.layout};
    if(manifestPromise===promise)version=result;
    return result;
   })().catch(err=>{if(manifestPromise===promise){manifestPromise=null;version=null}throw err});
   manifestPromise=promise;
  }
  return manifestPromise;
 }
 async function shard(page,build,reload){
  const key=build+"/"+page.file;
  if(cache.has(key)){
   const x=cache.get(key);cache.delete(key);cache.set(key,x);return x;
  }
  const promise=loadJson(key,page.bytes,page.sha256,reload).then(obj=>{
   if(!obj||obj.v!==1||!obj.g||typeof obj.g!=="object"||Array.isArray(obj.g)||
      Object.keys(obj.g).length!==page.count)
    throw new SvgLoadError("format","Invalid glyph shard");
   for(const code of Object.keys(obj.g)){
    if(!/^[0-9a-f]{4,6}$/i.test(code))throw new SvgLoadError("format","Invalid glyph key");
    const cp=parseInt(code,16);
    if(cp<page.start||cp>page.end)throw new SvgLoadError("version","Out-of-range glyph");
   }
   if(obj.m!==undefined&&(!obj.m||typeof obj.m!=="object"||Array.isArray(obj.m)||
      Object.keys(obj.m).length!==page.count||Object.keys(obj.g).some(code=>
       !Object.prototype.hasOwnProperty.call(obj.m,code)||!obj.m[code]||typeof obj.m[code]!=="object")))
    throw new SvgLoadError("format","Invalid SVG metrics table");
   return obj;
  }).catch(err=>{if(cache.get(key)===promise)cache.delete(key);throw contextError(err,"shard",url(key),"validation")});
  cache.set(key,promise);
  while(cache.size>maxCache)cache.delete(cache.keys().next().value);
  return promise;
 }
 async function once(cp,reload=false){
  const v=await manifest(),p=findPage(v.pages,cp);
  if(!p)return {svg:null,reason:"SVG未対応",code:"unsupported",stage:"manifest"};
  const all=await shard(p,v.build,reload),entry=all.g[hex(cp)],metrics=all.m?.[hex(cp)];
  if(!entry)return {svg:null,reason:"SVG未対応",code:"unsupported",stage:"shard"};
  if(v.layout==="font-metrics-v1"&&!metrics)
   throw contextError(new SvgLoadError("format","Missing SVG font metrics"),"shard",url(v.build+"/"+p.file),"validation");
  try{return {svg:svgElement(doc,cp,entry,metrics),reason:null,metrics:metrics||null}}
  catch(err){throw contextError(err,"render",url(v.build+"/"+p.file),"geometry")}
 }
 function clear(){cache.clear();manifestPromise=null;version=null}
 async function getGlyph(cp){
  if(!Number.isInteger(cp)||cp<0||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))
   return {svg:null,reason:"無効なUnicode番号",code:"invalid",stage:"input"};
  try{return await once(cp)}
  catch(first){
   let err=first;
   // A deployment may retire an old build; a cached shard may be corrupt.
   // Refresh the release pointer once and bypass the shard's HTTP cache.
   if(first?.code==="version"||(first?.code==="missing"&&first.stage!=="active")){
    clear();
    try{return await once(cp,true)}catch(second){err=second}
   }
   err=contextError(err,"render",null);
   const reasons={missing:"SVGデータ未配信",network:"SVG通信失敗",timeout:"SVG読込タイムアウト",
    integrity:"SVG検証機能未対応",processing:"SVG表示処理エラー"};
   return {svg:null,reason:reasons[err.code]||"SVGデータ不整合",error:err,
    code:err.code,stage:err.stage,url:err.url,phase:err.phase};
  }
 }
 return {getGlyph,clearCache:clear,stats:()=>({cachedShards:cache.size,inFlight,queued:queue.length,build:version?.build||null})};
}
const api=Object.freeze({createClient,findPage,validManifest,svgElement,SvgLoadError});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else root.UnicodePrecomputedSvg=api;
})(typeof globalThis!=="undefined"?globalThis:this);
