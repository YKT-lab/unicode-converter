"use strict";
/*
 * Offline generator for sharded SVG outline data (Unicode 18.0).
 * LICENSE SAFETY: output MUST NOT be deployed or committed until every
 * source font has been reviewed for derived-outline redistribution.
 * GitHub Actions generates bundles only in $RUNNER_TEMP and stores metrics.
 *
 * Usage:
 *   node tools/build-svg-precompute.js --out=/tmp/svg-pages --report=/tmp/svg-report.json
 *   node tools/build-svg-precompute.js --out=/tmp/sample --report=/tmp/sample.json --only=0041,14354,109EB
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const zlib=require("node:zlib");
const crypto=require("node:crypto");
const fontkit=require("@cantoo/fontkit");
const ROOT=path.resolve(__dirname,"..");
const {getCandidateFontIds}=require("../js/font-policy.js");
const coverage=JSON.parse(fs.readFileSync(path.join(ROOT,"data/unicode18_font_coverage_index.json"),"utf8"));
const classifier=JSON.parse(fs.readFileSync(path.join(ROOT,"data/unicode18_svg_classification.json"),"utf8"));
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=/^--([a-z-]+)=(.*)$/.exec(arg);
  if(!m)throw Error("Invalid argument: "+arg);
  return [m[1],m[2]];
}));
for(const key of Object.keys(args))if(!["out","report","only","approved-font","approved-list"].includes(key))
  throw Error("Unknown argument: "+key);
if(!args.out||!args.report)throw Error("Provide --out and --report");
const OUT=path.resolve(args.out),REPORT=path.resolve(args.report);
if(OUT===ROOT||OUT.startsWith(ROOT+path.sep))
  throw Error("Refusing to save copyrighted outline bundles inside the repository");
const approvedFont=args["approved-font"]||null;
const approvedList=args["approved-list"] ? JSON.parse(fs.readFileSync(path.resolve(ROOT,args["approved-list"]),"utf8")) : null;
if(approvedList&&(approvedFont||args.only||approvedList.schema_version!==1||approvedList.unicode_version!=="18.0.0"||!Array.isArray(approvedList.approved_fonts)||!approvedList.approved_fonts.length))
  throw Error("Invalid approved set configuration");
const approvedFiles=approvedList?new Set(approvedList.approved_fonts.map(x=>x.file)):null;
if(approvedFiles&&approvedFiles.size!==approvedList.approved_fonts.length)throw Error("Duplicate source in approved list");
if(approvedList)for(const src of approvedList.approved_fonts){
  const f=coverage.font_families.find(f=>f.file===src.file);
  if(!f||f.sha256!==src.sha256)throw Error("Pinned approved font mismatch: "+src.file);
}
if(approvedFont&&(!/^fonts\/[\w.-]+(?:\/[\w.-]+)*\.(?:ttf|otf|woff2?)$/i.test(approvedFont)||args.only))
  throw Error("Approved build needs one repository font and no --only option");
if(approvedFont&&!coverage.font_families.some(f=>f.file===approvedFont))
  throw Error("Approved source absent from font index: "+approvedFont);
const sample=args.only?
  new Set(args.only.split(",").map(s=>{
    if(!/^[0-9a-f]{1,6}$/i.test(s))throw Error("Invalid sample code point "+s);
    const cp=parseInt(s,16);
    if(cp>0x10FFFF)throw Error("Out of Unicode range");
    return cp;
  })):null;
if(coverage.unicode_version!=="18.0.0"||classifier.unicode_version!=="18.0.0")
  throw Error("Unicode data versions mismatch");
const classifierFresh = coverage.font_families.length === classifier.font_count;
// The audited outline count is required for a full-source report, not for a
// restricted licensed release. New unapproved fonts must never block the
// SHA-pinned allowlisted SVG bundle from being rebuilt.
if(!classifierFresh && !approvedFont && !approvedList && !sample)
  throw Error("Unicode font coverage and outline audit need rebuilding");
fs.mkdirSync(OUT,{recursive:true});
fs.mkdirSync(path.dirname(REPORT),{recursive:true});
const WORK=fs.mkdtempSync(path.join(os.tmpdir(),"unicode-svg-precompute-"));
const startMs=Date.now(),BUCKET=128;
const hash=data=>crypto.createHash("sha256").update(data).digest("hex");
const hex=cp=>cp.toString(16).toUpperCase().padStart(4,"0");
const candidates=new Map(),candidatePositions=new Map();
let pending=new Map();
function enqueue(groups,id,cp){
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(cp);
}
for(const [a,b] of coverage.ranges) {
  for(let cp=a;cp<=b;cp++) {
    if(sample&&!sample.has(cp))continue;
    const ids=getCandidateFontIds(coverage,cp).filter(id=>{
      const entry=coverage.font_families[id];
      return entry&&(!approvedFont||entry.file===approvedFont)&&
        (!approvedFiles||approvedFiles.has(entry.file));
    });
    if(!ids.length)continue;
    candidates.set(cp,ids);candidatePositions.set(cp,0);
    enqueue(pending,ids[0],cp);
  }
}
const solved=new Uint8Array(0x110000),failures=[],fontResults=new Map();
let count=0,rawPaths=0;
const temporaryPages=new Set();
function shape(font,cp,notdef,source) {
  if(!font.hasGlyphForCodePoint(cp))return null;
  const glyph=font.glyphForCodePoint(cp);
  if(!glyph||glyph.id===0||!glyph.path)return null;
  const bounds=glyph.path.bbox;
  if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite))return null;
  const w=bounds.maxX-bounds.minX,h=bounds.maxY-bounds.minY;
  if(w<=0||h<=0)return null;
  const d=glyph.path.toSVG();
  if(!d||!d.trim()||(notdef&&d===notdef))return null;
  // Keep the font's coordinate system: do not enlarge a small glyph to its
  // own ink bounds. Bearings, ascenders and descenders remain untouched.
  const metrics={unitsPerEm:font.unitsPerEm,ascent:font.ascent,descent:font.descent,
    lineGap:font.lineGap,advanceWidth:glyph.advanceWidth,
    fontFile:source.file,fontSha256:source.sha256,fontWeight:400};
  if(![metrics.unitsPerEm,metrics.ascent,metrics.descent,metrics.lineGap,
       metrics.advanceWidth].every(Number.isFinite)||metrics.unitsPerEm<=0||
     metrics.ascent<=metrics.descent||metrics.advanceWidth<0)return null;
  // A zero-advance combining mark still has a usable viewport; its actual
  // horizontal advance stays zero in metadata and is respected by the client.
  const box=[0,-metrics.ascent,metrics.advanceWidth||metrics.unitsPerEm,
    metrics.ascent-metrics.descent];
  return [box,d,metrics];
}
let round=0;
while(pending.size){
 const next=new Map();round++;
 for(const [id,points] of [...pending].sort((a,b)=>a[0]-b[0])){
  if(points.length===0)continue;
  const entry=coverage.font_families[id],file=path.join(ROOT,entry.file);
  if(!fs.existsSync(file))throw Error("Missing font "+entry.file);
  const bytes=fs.readFileSync(file);
  if(entry.sha256&&hash(bytes)!==entry.sha256)throw Error("Font hash drift: "+entry.file);
  let font;
  try{font=fontkit.openSync(file)}
  catch(error){throw Error("Font parse failed for "+entry.file+": "+error)}
  let notdef="";
  try{notdef=font.getGlyph(0)?.path?.toSVG()||""}catch(_error){}
  if(!fontResults.has(id))fontResults.set(id,{font:entry.file,contributed:0,errors:0});
  const resultStats=fontResults.get(id);
  let contributed=0,buffer=new Map(),bufferSize=0;
  function flush(){
    for(const [page,lines] of buffer){
      const dest=path.join(WORK,page+".jsonl");
      fs.appendFileSync(dest,lines.join(""));
      temporaryPages.add(page);
    }
    buffer.clear();bufferSize=0;
  }
  for(const cp of points){
    if(solved[cp])continue;
    let result;
    try{result=shape(font,cp,notdef,entry)}
    catch(error){
      resultStats.errors++;
      if(failures.length<60)failures.push({codepoint:hex(cp),font:entry.file,error:String(error)});
    }
    if(!result){
      const position=candidatePositions.get(cp)+1;
      candidatePositions.set(cp,position);
      const alternative=candidates.get(cp)[position];
      if(alternative!==undefined)enqueue(next,alternative,cp);
      continue;
    }
    solved[cp]=1;count++;contributed++;
    const page=Math.floor(cp/BUCKET).toString(16).padStart(4,"0");
    const line=JSON.stringify([cp,result[0],result[1],result[2]])+"\n";
    if(!buffer.has(page))buffer.set(page,[]);
    buffer.get(page).push(line);
    bufferSize+=Buffer.byteLength(line);
    rawPaths+=Buffer.byteLength(result[1]);
    if(bufferSize>=8*1024*1024)flush();
  }
  flush();
  resultStats.contributed+=contributed;
  console.log("Round "+round+" font "+entry.file+
    " outlines="+contributed+" total="+count);
 }
 pending=next;
}
const fontsUsed=[...fontResults].sort((a,b)=>a[0]-b[0]).map(([,result])=>result);
const pages=[],topHeavy=[];
let totalJsonBytes=0,totalGzipBytes=0,maxJsonBytes=0,maxGzipBytes=0;
let splitCount=0,unsplittableCount=0;
const TARGET_GZIP_BYTES=192*1024;
function storeAdaptive(page,from,to,entries,suffix=""){
  if(!entries.length)return;
  const sorted=Object.fromEntries(entries.map(([key,entry])=>[key,entry.slice(0,2)]));
  const metricEntries=Object.fromEntries(entries.map(([key,entry])=>[key,entry[2]]));
  // Keep v1/g geometry readable by existing clients while the optional m
  // table gives new clients exact font sizing, source identity and baseline.
  const body=Buffer.from(JSON.stringify({v:1,g:sorted,m:metricEntries})+"\n");
  const gz=zlib.gzipSync(body,{level:9});
  if(gz.length>TARGET_GZIP_BYTES && from<to && entries.length>1){
    splitCount++;
    const half=Math.floor((from+to)/2);
    const left=entries.filter(([key])=>parseInt(key,16)<=half);
    const right=entries.filter(([key])=>parseInt(key,16)>half);
    storeAdaptive(page,from,half,left,suffix+"a");
    storeAdaptive(page,half+1,to,right,suffix+"b");
    return;
  }
  const file="page-"+page+(suffix?"-"+suffix:"")+".json";
  fs.writeFileSync(path.join(OUT,file),body);
  const info={page,start:from,end:to,file,count:entries.length,bytes:body.length,
    gzip_bytes:gz.length,sha256:hash(body)};
  pages.push(info);
  totalJsonBytes+=body.length;totalGzipBytes+=gz.length;
  maxJsonBytes=Math.max(maxJsonBytes,body.length);
  maxGzipBytes=Math.max(maxGzipBytes,gz.length);
  if(info.gzip_bytes>TARGET_GZIP_BYTES){
    topHeavy.push({page,file,gzip_bytes:info.gzip_bytes,count:entries.length});
    unsplittableCount++;
  }
}
for(const page of [...temporaryPages].sort()){
  const lines=fs.readFileSync(path.join(WORK,page+".jsonl"),"utf8").trim().split("\n");
  const glyphs={};
  for(const line of lines){
    const [cp,box,d,metrics]=JSON.parse(line);
    const key=hex(cp);
    if(Object.hasOwn(glyphs,key))throw Error("Duplicate outline "+key);
    glyphs[key]=[box,d,metrics];
  }
  const entries=Object.entries(glyphs).sort((a,b)=>parseInt(a[0],16)-parseInt(b[0],16));
  const first=parseInt(page,16)*BUCKET;
  storeAdaptive(page,first,first+BUCKET-1,entries);
}
pages.sort((a,b)=>a.start-b.start);
const digest=hash(pages.map(p=>p.sha256).join("\n")).slice(0,16);
const manifest={schema_version:2,unicode_version:"18.0.0",
  build_id:digest,bucket_size:BUCKET,layout:"font-metrics-v1",scanned_fonts:coverage.font_families.length,
  source_font:approvedFont,source_fonts:approvedList?approvedList.approved_fonts.map(f=>f.file).sort():null,glyphs:count,pages};
const manifestBody=JSON.stringify(manifest,null,2)+"\n";
fs.writeFileSync(path.join(OUT,"manifest.json"),manifestBody);
const expected=classifierFresh?classifier.counts.svg_outline:null;
const allPresent=!sample&&!approvedFont&&!approvedList&&expected!==null&&count===expected;
const report={
  schema_version:1,unicode_version:"18.0.0",
  layout:"font-metrics-v1",
  mode:sample?"sample":approvedList?"approved-set":approvedFont?"approved":"full",
  approved_only:!!(approvedFont||approvedList),
  approved_fonts:approvedList?approvedList.approved_fonts.map(f=>f.file).sort():null,
  approved_font:approvedFont,
  sample_requested:sample?[...sample].map(hex):null,
  expected_outline_count:sample?null:expected,
  generated_outline_count:count,
  audit_matched:allPresent,
  local_font_files:coverage.font_families.length,
  data_shards:pages.length,
  bucket_size:BUCKET,
  oversized_shards_unsplittable:unsplittableCount,
  adaptive_splits:splitCount,
  uncompressed_bytes:totalJsonBytes,
  gzip_estimated_bytes:totalGzipBytes,
  manifest_bytes:Buffer.byteLength(manifestBody),
  max_shard_bytes:maxJsonBytes,max_shard_gzip_bytes:maxGzipBytes,
  shards_over_192k_gzip:topHeavy,
  outline_path_input_bytes:rawPaths,
  work_duration_seconds:Number(((Date.now()-startMs)/1000).toFixed(2)),
  build_id:digest,
  errors:failures,
  font_contributions:fontsUsed,
  policy:"No generated glyph outline data is committed or published; review derivative redistribution licenses before release."
};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n");
fs.rmSync(WORK,{recursive:true,force:true});
console.log("SVG_PRECOMPUTE_METRICS "+JSON.stringify({
  mode:report.mode,glyphs:count,expected,
  page_count:pages.length,bytes:totalJsonBytes,
  gzip_estimated_bytes:totalGzipBytes,max_gzip_bytes:maxGzipBytes,
  adaptive_splits:splitCount,oversized_shards_unsplittable:unsplittableCount,
  seconds:report.work_duration_seconds,build_id:digest
}));
if(!sample&&!approvedFont&&!approvedList&&!allPresent)throw Error("Failed full outline coverage: "+count+" != "+expected);
if(approvedList&&(!count||fontsUsed.some(f=>!approvedFiles.has(f.font))||fontsUsed.reduce((sum,f)=>sum+f.contributed,0)!==count))
  throw Error("Invalid approved set outline result");
if(approvedFont&&(count<=0||fontsUsed.length!==1||fontsUsed[0].font!==approvedFont||fontsUsed[0].contributed!==count))
  throw Error("Empty or inconsistent approved font output");
