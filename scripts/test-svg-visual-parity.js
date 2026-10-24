"use strict";
/* Optional real-browser audit. PNGs and JSON stay outside the repository.
 * npm dependencies do not include Playwright; install it separately, then run:
 * node scripts/test-svg-visual-parity.js --bundle=/tmp/svg --out=/tmp/parity
 * Add --baseline-root=/path/to/old/site --baseline-bundle=/tmp/old-svg for
 * before/after screenshots of exactly the same ordered codepoint sequence. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,".."),PREFIX="/unicode-converter/",ORIGIN="http://127.0.0.1:4197";
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
 const m=/^--(root|bundle|baseline-root|baseline-bundle|out|codepoints|text|widths|chromium)=(.+)$/s.exec(arg);
 if(!m)throw Error("Unknown argument: "+arg);return[m[1],m[2]];
}));
if(!args.bundle){
 console.log("SKIP: optional screenshot audit; provide --bundle and --out, with Playwright installed separately.");
 process.exit(0);
}
const {chromium}=require("playwright"),fontkit=require("@cantoo/fontkit");
const hex=cp=>cp.toString(16).toUpperCase().padStart(4,"0"),hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
if(args.text&&args.codepoints)throw Error("Use --text or --codepoints, not both");
const points=args.codepoints?args.codepoints.split(/[,\s]+/).map(value=>{
 if(!/^(?:U\+)?[0-9a-f]{1,6}$/i.test(value))throw Error("Invalid codepoint "+value);
 return parseInt(value.replace(/^U\+/i,""),16);
}):Array.from(args.text||"笄珪窩洞宋綺᎔挪あぁつっ。一AiW.́",c=>c.codePointAt(0));
assert(points.length>0&&points.every(cp=>Number.isInteger(cp)&&cp>=0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)),"Use Unicode scalar values");
const raw=points.map(cp=>"U+"+hex(cp)).join(" "),expected=points.map(hex);
const out=path.resolve(args.out||"/tmp/unicode-svg-visual-parity");
assert(out!==ROOT&&!out.startsWith(ROOT+path.sep),"Keep screenshots outside the repository");
fs.mkdirSync(out,{recursive:true});
const widths=(args.widths||"1100,390").split(",").map(Number);
assert(widths.every(n=>Number.isInteger(n)&&n>=240));
assert.equal(Boolean(args["baseline-root"]),Boolean(args["baseline-bundle"]),"Provide both baseline paths");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const mime={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",
 ".ttf":"font/ttf",".otf":"font/otf",".woff2":"font/woff2",".png":"image/png"};
const report={input:raw,codepoints:expected,realIPhoneSafariTested:false,sessions:[],fontDifferences:[]};
const near=(a,b,tol,why)=>assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,why+": "+a+" vs "+b);
function release(site,bundle,label){
 site=path.resolve(site);bundle=path.resolve(bundle);
 const active=fs.existsSync(path.join(bundle,"active.json"))?read(path.join(bundle,"active.json")):null;
 const folder=active?path.join(bundle,active.build_id):bundle,manifest=read(path.join(folder,"manifest.json"));
 const pointer=active||{schema_version:1,build_id:manifest.build_id,manifest:manifest.build_id+"/manifest.json"};
 const index=read(path.join(site,"data/unicode18_font_coverage_index.json")),fonts=new Map(),pages=new Map();
 const coverageCounts=index.font_families.map(()=>0);
 for(const [start,end,combination] of index.ranges)
  for(const id of index.combinations[combination]||[])coverageCounts[id]+=end-start+1;
 const allowed=manifest.source_fonts?new Set(manifest.source_fonts):null;
 function font(file){
  if(fonts.has(file)){
   const cached=fonts.get(file);fonts.delete(file);fonts.set(file,cached);return cached;
  }
  // CJK WOFF2 fonts expand substantially. A comparison must not retain all
  // cmap candidates (or their shaping tables) across the whole sample.
  while(fonts.size>=2)fonts.delete(fonts.keys().next().value);
  const loaded=fontkit.openSync(path.join(site,file));fonts.set(file,loaded);return loaded;
 }
 function entry(cp){
  const page=manifest.pages.find(p=>p.start<=cp&&cp<=p.end);if(!page)return null;
  if(!pages.has(page.file)){
   const bytes=fs.readFileSync(path.join(folder,page.file));
   assert.equal(bytes.length,page.bytes);assert.equal(hash(bytes),page.sha256);
   pages.set(page.file,JSON.parse(bytes.toString("utf8")));
  }
  const data=pages.get(page.file);return {geometry:data.g[hex(cp)],metrics:data.m?.[hex(cp)]};
 }
 function source(file,cp,shape=true){
  const f=font(file),glyph=f.glyphForCodePoint(cp),layout=shape?f.layout(String.fromCodePoint(cp)):null;
  return {file,family:f.familyName,unitsPerEm:f.unitsPerEm,cmapGlyphId:glyph.id,glyphName:glyph.name||null,
   shapedGlyphIds:layout?layout.glyphs.map(g=>g.id):null,advanceWidth:glyph.advanceWidth,
   outlineSha256:hash(glyph.path.toSVG()),bounds:glyph.path.bbox};
 }
 return {site,bundle,label,folder,manifest,pointer,index,font,entry,source,coverageCounts,allowed};
}
async function snapshot(page,cdp,r){
 const measured=await page.evaluate(()=>{
  const output=document.getElementById("charOutput"),base=output.getBoundingClientRect(),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  const rows=[...output.querySelectorAll(".character-span,.character-status,.invalid-unicode")].map(wrapper=>{
   const inner=wrapper.querySelector(".glyph-inner"),svg=wrapper.querySelector("svg.unicode-svg-outline");
   const label=inner?.getAttribute("aria-label")||svg?.getAttribute("aria-label")||"";
   const cp=wrapper.dataset.codePoint||svg?.dataset.codePoint||/^U\+([0-9a-f]+)/i.exec(label)?.[1];
   const row={codepoint:cp?cp.toUpperCase().padStart(4,"0"):null,text:wrapper.textContent,mode:wrapper.dataset.displayMode,
    reason:wrapper.dataset.reason,dataset:{...wrapper.dataset}};
   if(!inner)return row;
   const css=getComputedStyle(inner),box=inner.getBoundingClientRect();
   Object.assign(row,{fontFamily:css.fontFamily,fontSize:parseFloat(css.fontSize),fontWeight:css.fontWeight,
    lineHeight:css.lineHeight,letterSpacing:css.letterSpacing,wordSpacing:css.wordSpacing,fontSizeAdjust:css.fontSizeAdjust,
    wrapperWidth:wrapper.getBoundingClientRect().width,innerWidth:box.width,innerHeight:box.height});
   const probe=document.createElement("span");probe.style.cssText="display:inline-block;width:0;height:0;vertical-align:baseline";
   wrapper.appendChild(probe);row.baseline=probe.getBoundingClientRect().top-base.top;probe.remove();
   if(!svg){
    const character=inner.textContent;
    ctx.font=css.fontStyle+" "+css.fontWeight+" 1000px "+css.fontFamily;
    const text=ctx.measureText(character),scale=row.fontSize/1000;
    row.highResolutionInk={width:(text.actualBoundingBoxLeft+text.actualBoundingBoxRight)*scale,
     height:(text.actualBoundingBoxAscent+text.actualBoundingBoxDescent)*scale,
     ascent:text.actualBoundingBoxAscent*scale,advance:text.width*scale};
   }else{
    const p=svg.querySelector("path"),ink=p.getBoundingClientRect(),matrix=p.getScreenCTM(),ctm=svg.getScreenCTM(),s=getComputedStyle(svg);
    Object.assign(row,{svg:{viewBox:svg.getAttribute("viewBox"),width:s.width,height:s.height,
     style:svg.getAttribute("style"),dataset:{...svg.dataset},path:p.getAttribute("d"),matrixA:matrix.a,
     inkWidth:ink.width,inkHeight:ink.height,inkTop:ink.top-base.top,baseline:ctm.f-base.top,
     transform:p.getAttribute("transform"),stroke:getComputedStyle(p).stroke}});
   }
   return row;
  });
  const css=getComputedStyle(output);
  return {rows,output:{fontSize:parseFloat(css.fontSize),lineHeight:css.lineHeight,letterSpacing:css.letterSpacing,
   wordSpacing:css.wordSpacing,textSizeAdjust:css.webkitTextSizeAdjust||css.textSizeAdjust,width:base.width,height:base.height,
   layoutScale:output.dataset.layoutScale||null,dataset:{...output.dataset}},input:document.getElementById("unicodeInput").value};
 });
 const document=await cdp.send("DOM.getDocument",{depth:0});
 const nodes=await cdp.send("DOM.querySelectorAll",{nodeId:document.root.nodeId,selector:"#charOutput .glyph-inner"});
 let glyphNumber=0;
 for(const row of measured.rows){
  if(!row.fontFamily)continue;
  try{row.platformFonts=(await cdp.send("CSS.getPlatformFontsForNode",{nodeId:nodes.nodeIds[glyphNumber]})).fonts}
  catch(error){row.platformFontError=String(error)}
  glyphNumber++;
  const cp=parseInt(row.codepoint,16),id=/Unicode Site ([0-9]+)/.exec(row.fontFamily);
  const normalFile=id?r.index.font_families[Number(id[1])]?.file:null;
  if(!row.svg){
   row.selectedFontFile=normalFile;
   // A CSS family alone cannot prove the actual fallback font. CDP records
   // the renderer's actual face; do not invent OS glyph IDs.
   if(normalFile){
    const candidate=r.source(normalFile,cp);
    row.source=candidate;
    row.actualSourceVerified=row.platformFonts?.some(f=>f.isCustomFont&&
     (f.familyName===candidate.family||f.postScriptName===r.font(normalFile).postscriptName))||false;
   }else row.source={file:null,cmapGlyphId:null,shapedGlyphIds:null,note:"OS/CSS fallback: glyph ID cannot be established from a computed family"};
  }else{
   const data=r.entry(cp),file=data?.metrics?.fontFile||row.svg.dataset.fontFile;
   if(file)row.source=r.source(file,cp);
   else{
    // Reproduce the legacy builder's coverage-count ordering and confirm
    // its stored path. Do not open every large candidate just to find all
    // identical copies of a glyph. The source is labelled with this method.
    const range=r.index.ranges.find(x=>x[0]<=cp&&cp<=x[1]),ids=range?r.index.combinations[range[2]]:[];
    const ordered=[...ids].filter(i=>!r.allowed||r.allowed.has(r.index.font_families[i]?.file))
     .sort((a,b)=>r.coverageCounts[b]-r.coverageCounts[a]||a-b);
    for(const id of ordered){
     const file=r.index.font_families[id]?.file;if(!file)continue;
     if(r.font(file).glyphForCodePoint(cp).path.toSVG()===row.svg.path){
      row.source=r.source(file,cp,cp===0x1394);
      row.sourceEvidence="legacy-coverage-order-and-exact-path";break;
     }
    }
   }
   row.svg.pathSha256=hash(row.svg.path);delete row.svg.path;
   if(data?.metrics)row.svg.pixelsPerEm=Math.abs(row.svg.matrixA)*data.metrics.unitsPerEm;
  }
 }
 return measured;
}
async function session(browser,r,width){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>sessionStorage.setItem("unicode-converter-svg-display","normal"));
 await page.route("**/*",async route=>{
  const u=new URL(route.request().url());if(u.origin!==ORIGIN)return route.abort();
  let file;
  if(u.pathname===PREFIX)file=path.join(r.site,"index.html");
  else if(u.pathname===PREFIX+"svg-data/active.json")return route.fulfill({body:JSON.stringify(r.pointer),contentType:"application/json"});
  else if(u.pathname.startsWith(PREFIX+"svg-data/")){
   const relative=u.pathname.slice((PREFIX+"svg-data/"+r.pointer.build_id+"/").length);file=path.join(r.folder,relative);
  }else if(u.pathname.startsWith(PREFIX))file=path.join(r.site,u.pathname.slice(PREFIX.length));
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:"missing"});
  return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||"application/octet-stream"});
 });
 try{
  await page.goto(ORIGIN+PREFIX,{waitUntil:"domcontentloaded"});
  const cdp=await context.newCDPSession(page);await cdp.send("DOM.enable");await cdp.send("CSS.enable");
  await page.locator("#unicodeInput").fill(raw);
  await page.evaluate(async()=>{lastUnicodeOutputSource="bulk";await convertUnicode()});
  const normal=await snapshot(page,cdp,r);
  await page.locator("#charOutput").screenshot({path:path.join(out,r.label+"-normal-"+width+".png")});
  await page.locator("#svgModeToggle").click();
  await page.waitForFunction(count=>isSvgModeEnabled()&&
   charOutput.querySelectorAll(".character-span,.character-status,.invalid-unicode").length===count&&
   !charOutput.querySelector(".loading-character")&&svgModeProgress.hidden,points.length);
  const svg=await snapshot(page,cdp,r);
  await page.locator("#charOutput").screenshot({path:path.join(out,r.label+"-svg-"+width+".png")});
  for(const mode of [normal,svg]){
   assert.equal(mode.input,raw,"Toggle must keep the same input");
   assert.deepEqual(mode.rows.map(row=>row.codepoint),expected,"Character order and count must match the input");
  }
  const result={label:r.label,width,build:r.manifest.build_id,layout:r.manifest.layout||"legacy-bbox",normal,svg};
  report.sessions.push(result);
  if(r.label==="after"){
   near(svg.output.fontSize,normal.output.fontSize,.03,"Whole-string font size must agree");
   for(let n=0;n<points.length;n++){
    const a=normal.rows[n],b=svg.rows[n];
    assert(b.svg,"Every default sample must have a verified SVG");
    if(points[n]===0x1394){
     assert(a.actualSourceVerified,"U+1394's actual browser font must be verified, not inferred from CSS");
     assert.equal(a.source?.file,"fonts/scripts/NotoSansEthiopic-Regular.ttf");
     assert.equal(b.source?.file,a.source.file);
     assert.equal(a.source.cmapGlyphId,96);assert.equal(b.source.cmapGlyphId,96);
     near(b.svg.inkHeight,0.213*a.fontSize,.1,"U+1394 must keep its native 0.213em ink height");
    }
    assert.equal(b.svg.stroke,"none");assert.equal(b.svg.transform,"scale(1,-1)");
    near(b.fontSize,a.fontSize,.03,"CSS font size U+"+hex(points[n]));
    near(b.svg.pixelsPerEm,a.fontSize,.15,"Physical SVG em U+"+hex(points[n]));
    if(a.source?.file&&a.source.file===b.source?.file&&a.actualSourceVerified){
     near(b.svg.inkHeight,a.highResolutionInk.height,.3,"Same-source ink height U+"+hex(points[n]));
     near(b.svg.inkWidth,a.highResolutionInk.width,.3,"Same-source ink width U+"+hex(points[n]));
     near(b.wrapperWidth,a.wrapperWidth,.08,"Same-source advance U+"+hex(points[n]));
     near(b.svg.baseline,a.baseline,.2,"Same-source baseline U+"+hex(points[n]));
     assert.deepEqual(b.source.shapedGlyphIds,a.source.shapedGlyphIds);
    }else report.fontDifferences.push({width,codepoint:hex(points[n]),normal:a.source||null,svg:b.source||null,
     actualPlatformFonts:a.platformFonts||null});
   }
  }
  await page.locator("#svgModeToggle").click();
  await page.waitForFunction(count=>!isSvgModeEnabled()&&charOutput.children.length===count&&
   [...charOutput.children].every(n=>n.dataset.displayMode||n.classList.contains("character-status")),points.length);
  assert.equal(await page.locator("#unicodeInput").inputValue(),raw);
  assert.equal(await page.locator("#charOutput svg").count(),0,"Normal mode must not retain old SVGs");
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}
(async()=>{
 const after=release(args.root||ROOT,args.bundle,"after"),releases=[];
 if(args["baseline-root"])releases.push(release(args["baseline-root"],args["baseline-bundle"],"before"));
 releases.push(after);
 const browser=await chromium.launch({headless:true,...(args.chromium?{executablePath:args.chromium}:{}),args:["--no-sandbox"]});
 try{for(const r of releases)for(const width of widths)await session(browser,r,width)}finally{await browser.close()}
 fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({pass:true,sessions:report.sessions.length,codepoints:points.length,fontDifferences:report.fontDifferences.length,out}));
})().catch(error=>{
 fs.writeFileSync(path.join(out,"failed.json"),JSON.stringify({error:error.stack,report},null,2));
 console.error(error);process.exitCode=1;
});
