"use strict";
/* Verify typographic dimensions against real font binaries. This test does not
 * write generated outlines into the repository. Optional full-bundle inputs
 * also compare the complete old/new character sets. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const fontkit=require("@cantoo/fontkit");
const ROOT=path.resolve(__dirname,"..");
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
 const match=/^--(bundle|baseline)=(.+)$/.exec(arg);
 if(!match)throw Error("Unknown option: "+arg);
 return[match[1],path.resolve(match[2])];
}));
const points=[0x41,0x69,0x57,0x2e,0x2c,0x301,0x3042,0x3041,0x3064,0x3063,
 0x30a2,0x30a1,0x3002,0x4e00,0x109eb,0x14354,
 ...Array.from({length:10},(_,n)=>0x1390+n)];
const hex=cp=>cp.toString(16).toUpperCase().padStart(4,"0");
const read=file=>JSON.parse(fs.readFileSync(file,"utf8"));
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<0.0011,
 message+": "+actual+" != "+expected);
const scratch=!args.bundle?fs.mkdtempSync(path.join(os.tmpdir(),"unicode-svg-metrics-test-")):null;
const bundle=args.bundle||path.join(scratch,"bundle");

function manifestAt(folder){
 const pointer=path.join(folder,"active.json");
 if(fs.existsSync(pointer)){
  const active=read(pointer);
  return {manifest:read(path.join(folder,active.manifest)),folder:path.join(folder,active.build_id)};
 }
 return {manifest:read(path.join(folder,"manifest.json")),folder};
}
function codePointsIn(folder){
 const release=manifestAt(folder),points=new Set();
 for(const page of release.manifest.pages){
  const bytes=fs.readFileSync(path.join(release.folder,page.file));
  assert.equal(bytes.length,page.bytes);assert.equal(hash(bytes),page.sha256);
  const data=JSON.parse(bytes.toString("utf8"));
  for(const key of Object.keys(data.g)){
   assert(!points.has(key),"Duplicate glyph "+key);points.add(key);
  }
 }
 assert.equal(points.size,release.manifest.glyphs);
 return points;
}

try{
 if(!args.bundle){
  const result=spawnSync(process.execPath,[path.join(ROOT,"tools/build-svg-precompute.js"),
   "--out="+bundle,"--report="+path.join(scratch,"report.json"),
   "--only="+points.map(hex).join(",")],{cwd:ROOT,encoding:"utf8",timeout:120000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }
 const release=manifestAt(bundle),fonts=new Map(),samples=new Map();
 for(const cp of points){
  const page=release.manifest.pages.find(p=>p.start<=cp&&cp<=p.end);
  assert(page,"No shard for U+"+hex(cp));
  const bytes=fs.readFileSync(path.join(release.folder,page.file));
  assert.equal(bytes.length,page.bytes);assert.equal(hash(bytes),page.sha256);
  const data=JSON.parse(bytes.toString("utf8")),entry=data.g[hex(cp)],metrics=data.m?.[hex(cp)];
  assert(entry&&metrics,"Missing outline or metrics for U+"+hex(cp));
  assert.equal(metrics.fontWeight,400,"Use the font's regular weight without synthetic bold");
  if(!fonts.has(metrics.fontFile)){
   const file=path.join(ROOT,metrics.fontFile),raw=fs.readFileSync(file);
   assert.equal(hash(raw),metrics.fontSha256,"Source font hash drift");
   fonts.set(metrics.fontFile,fontkit.openSync(file));
  }
  const font=fonts.get(metrics.fontFile),glyph=font.glyphForCodePoint(cp),bounds=glyph.path.bbox;
  assert(glyph.id>0);
  near(metrics.unitsPerEm,font.unitsPerEm,"unitsPerEm U+"+hex(cp));
  near(metrics.ascent,font.ascent,"ascent U+"+hex(cp));
  near(metrics.descent,font.descent,"descent U+"+hex(cp));
  near(metrics.lineGap,font.lineGap||0,"line gap U+"+hex(cp));
  near(metrics.advanceWidth,glyph.advanceWidth,"advance U+"+hex(cp));
  const width=glyph.advanceWidth>0?glyph.advanceWidth:font.unitsPerEm;
  const expected=[0,-font.ascent,width,font.ascent-font.descent];
  for(let n=0;n<4;n++)near(entry[0][n],expected[n],"font-space viewport U+"+hex(cp));
  assert.equal(entry[1],glyph.path.toSVG(),"Original outline path must remain unchanged U+"+hex(cp));
  if(cp>=0x1390&&cp<=0x1399){
   assert.equal(metrics.fontFile,"fonts/scripts/NotoSansEthiopic-Regular.ttf",
    "Ethiopic tonal marks must use the same available regular font as normal mode");
   const shaped=font.layout(String.fromCodePoint(cp));
   assert.equal(shaped.glyphs.length,1,"One tonal codepoint must not be split into different glyphs");
   assert.equal(shaped.glyphs[0].id,glyph.id,"Default shaping must select the same cmap glyph U+"+hex(cp));
   assert.equal(shaped.glyphs[0].path.toSVG(),entry[1],"Shaping must preserve the SVG outline U+"+hex(cp));
   near(shaped.positions[0].xAdvance,metrics.advanceWidth,"Shaped advance U+"+hex(cp));
   near(shaped.positions[0].xOffset,0,"Shaped X offset U+"+hex(cp));
   near(shaped.positions[0].yOffset,0,"Shaped Y offset U+"+hex(cp));
  }
  samples.set(cp,{metrics,bounds,glyphId:glyph.id,inkHeight:(bounds.maxY-bounds.minY)/font.unitsPerEm,
   inkWidth:(bounds.maxX-bounds.minX)/font.unitsPerEm});
 }
 for(const [small,large] of [[0x3041,0x3042],[0x3063,0x3064],[0x30a1,0x30a2]]){
  const a=samples.get(small),b=samples.get(large);
  assert.equal(a.metrics.fontFile,b.metrics.fontFile,"Use one source for related kana");
  assert(a.inkHeight<b.inkHeight*0.94,"Small kana must retain its smaller ink height");
  assert.equal(a.metrics.advanceWidth,b.metrics.advanceWidth,"Small kana keeps its full-width advance");
 }
 assert(samples.get(0x3002).inkHeight<0.5,"Ideographic full stop must not be inflated to a full em");
 assert(samples.get(0x4e00).inkHeight<0.2,"The horizontal ideograph must remain a thin line");
 assert(samples.get(0x2e).inkHeight<samples.get(0x41).inkHeight*0.45,"Full stop must stay small");
 assert(samples.get(0x69).metrics.advanceWidth/samples.get(0x69).metrics.unitsPerEm<
  samples.get(0x57).metrics.advanceWidth/samples.get(0x57).metrics.unitsPerEm,
  "Narrow and wide Latin letters need their original advances");
 const mark=samples.get(0x301);
 assert.equal(mark.metrics.advanceWidth,0,"Combining acute must retain zero advance");
 assert(mark.bounds.minX<0||mark.bounds.maxY>mark.metrics.unitsPerEm/2,
  "A combining mark must retain its bearing and raised position");
 const difat=samples.get(0x1394);
 assert.equal(difat.glyphId,96,"U+1394 ETHIOPIC TONAL MARK DIFAT must retain the audited glyph ID");
 near(difat.inkHeight,0.213,"U+1394 must retain its naturally small ink height in em");
 near(difat.metrics.advanceWidth/difat.metrics.unitsPerEm,0.483,"U+1394 native advance in em");
 assert(difat.inkHeight<samples.get(0x1392).inkHeight/2,
  "Short and tall Ethiopic tonal marks must retain their native relative sizes");
 if(args.baseline){
  const before=codePointsIn(args.baseline),after=codePointsIn(bundle);
  assert(before.size>=170775,"Baseline must contain the full approved release");
  for(const cp of before)assert(after.has(cp),"Lost approved glyph U+"+cp);
  console.log("PASS: complete approved glyph set retained:",before.size,"=>",after.size);
 }
 console.log("PASS: real-font em size, baseline, advances, small kana, punctuation and original paths for",points.length,"glyphs");
}finally{
 if(scratch)fs.rmSync(scratch,{recursive:true,force:true});
}
