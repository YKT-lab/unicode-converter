"use strict";
/*
 * Actual SVG-outline audit of every assigned Unicode 18.0 code point.
 * The source is the current local, cmap-audited font set served by the site.
 * This tests build-time SVG paths, not browser OpenType performance.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const fontkit=require("@cantoo/fontkit");
const root=path.resolve(__dirname,"..");
const index=require("../data/unicode18_font_coverage_index.json");
const official=require("../data/unicode18_all_ranges.json");
const hex=cp=>cp.toString(16).toUpperCase().padStart(4,"0");
const TOTAL=172808, UNKNOWN=0, SVG=1, FONT_ONLY=2, NO_FONT=3;
const exclude=new Set(["Cn","Cc","Co","Cs"]);
if(index.total_assigned_unicode18!==TOTAL||index.unicode_version!=="18.0.0"||
   official.unicode_version!=="18.0.0")throw Error("Unexpected Unicode data");

const state=new Uint8Array(0x110000);
let total=0;
for(const range of official.ranges){
 if(exclude.has(range.category))continue;
 for(let cp=parseInt(range.start,16),end=parseInt(range.end,16);cp<=end;cp++){
  if(state[cp])throw Error("Overlapping assigned data");
  state[cp]=NO_FONT;total++;
 }
}
if(total!==TOTAL)throw Error("Assigned count mismatch: "+total);

const byFont=index.font_families.map(()=>[]);
let covered=0;
for(const [a,b,combo] of index.ranges){
 const ids=index.combinations[combo];
 if(!Array.isArray(ids)||!ids.length)throw Error("Empty cmap candidates");
 for(let cp=a;cp<=b;cp++){
  if(state[cp]!==NO_FONT)throw Error("Non-assigned or repeated codepoint U+"+hex(cp));
  state[cp]=FONT_ONLY;covered++;
  for(const id of ids)byFont[id].push(cp);
 }
}
if(covered!==index.covered_by_available_site_local_fonts)
 throw Error("Cmap totals do not match");

const order=byFont.map((points,id)=>({id,points})).sort((a,b)=>b.points.length-a.points.length);
const fontResults=[],exceptions=[];
let svgCount=0;
for(const {id,points} of order){
 const file=index.font_families[id].file;
 const abs=path.resolve(root,file);
 if(!abs.startsWith(root+path.sep)||!fs.existsSync(abs))throw Error("Absent font: "+file);
 const sha=crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
 if(index.font_families[id].sha256&&sha!==index.font_families[id].sha256)
  throw Error("Audited font was modified: "+file);
 let font;
 try{font=fontkit.openSync(abs)}
 catch(error){throw Error("Cannot parse audited font "+file+": "+String(error))}
 let notdef="";
 try{notdef=font.getGlyph(0)?.path?.toSVG()||""}catch(error){}
 let added=0,withoutOutline=0,errors=0;
 for(const cp of points){
  if(state[cp]===SVG)continue;
  try{
   if(!font.hasGlyphForCodePoint(cp)){withoutOutline++;continue}
   const glyph=font.glyphForCodePoint(cp);
   if(!glyph||glyph.id===0||!glyph.path){withoutOutline++;continue}
   const b=glyph.path.bbox;
   if(!b||![b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)||
      b.maxX<=b.minX||b.maxY<=b.minY){withoutOutline++;continue}
   const d=glyph.path.toSVG();
   if(!d||!d.trim()||(notdef&&d===notdef)){withoutOutline++;continue}
   state[cp]=SVG;svgCount++;added++;
  }catch(error){
   errors++;
   if(exceptions.length<100)exceptions.push({code_point:hex(cp),font:file,error:String(error)});
  }
 }
 fontResults.push({font:file,cmap_count:points.length,new_svg_outlines:added,
   no_outline:withoutOutline,exceptions:errors});
 console.log("Font "+fontResults.length+"/"+order.length+": "+file+
   ", new SVG "+added+", total SVG "+svgCount+", errors "+errors);
}

const names={1:"svg_outline",2:"font_only",3:"no_site_font"};
const counts={svg_outline:0,font_only:0,no_site_font:0};
const ranges={svg_outline:[],font_only:[],no_site_font:[]};
let prev=UNKNOWN,start=-1;
for(let cp=0;cp<=0x110000;cp++){
 const kind=cp===0x110000?UNKNOWN:state[cp];
 if(kind!==UNKNOWN)counts[names[kind]]++;
 if(kind!==prev){
  if(prev!==UNKNOWN)ranges[names[prev]].push([hex(start),hex(cp-1)]);
  if(kind!==UNKNOWN)start=cp;
  prev=kind;
 }
}
if(counts.svg_outline!==svgCount||
 counts.svg_outline+counts.font_only!==covered||
 counts.no_site_font!==TOTAL-covered)throw Error("Unpartitioned codepoints");

const scripts=new Map();
for(const r of official.ranges){
 if(exclude.has(r.category))continue;
 let obj=scripts.get(r.script);
 if(!obj){obj={script:r.script,svg_outline:0,font_only:0,no_site_font:0};scripts.set(r.script,obj)}
 for(let cp=parseInt(r.start,16),end=parseInt(r.end,16);cp<=end;cp++)obj[names[state[cp]]]++;
}
const scriptStats=[...scripts.values()].sort((a,b)=>(b.no_site_font+b.font_only)-(a.no_site_font+a.font_only));
const report={
 schema_version:1,unicode_version:"18.0.0",assigned_codepoints:TOTAL,
 counts,font_count:index.font_families.length,
 scope:"Assigned code points excluding Cn Cc Cs Co (same as the font cmap audit).",
 meaning:"svg_outline: genuine non-empty vector outline extracted from at least one on-site font by fontkit; font_only: cmap match without an extractable outline; no_site_font: no match in the site's audited local fonts.",
 caveats:[
  "SVG extraction at build time does not prove that the current browser-based OpenType parser succeeds.",
  "No site font does not mean no OS or Google font exists.",
  "Color glyphs, shaping, and multi-codepoint sequences require separate visual testing."
 ],
 inspection_exception_samples:exceptions,
 ranges,script_stats:scriptStats,
 font_stats:fontResults.sort((a,b)=>a.font.localeCompare(b.font))
};
const target=path.join(root,"data/unicode18_svg_classification.json");
fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
const md=[
 "# Unicode 18.0 SVG 対応状況",
 "",
 "対象：Unicode 18.0 登録済み "+TOTAL.toLocaleString("en-US")+" 文字。サイトのフォント "+index.font_families.length+" 種類を検査。",
 "",
 "| 分類 | 文字数 |","|---|---:|",
 "| ① SVG輪郭を抽出できる | "+counts.svg_outline.toLocaleString("en-US")+" |",
 "| ② フォント収録あり、SVG輪郭は抽出不可 | "+counts.font_only.toLocaleString("en-US")+" |",
 "| ③ サイト内フォントに収録なし | "+counts.no_site_font.toLocaleString("en-US")+" |",
 "| **合計** | **"+TOTAL.toLocaleString("en-US")+"** |",
 "",
 "①はビルド時の事前SVG生成可能性。現在のiPadでの描画成功を保証するものではありません。",
 "③はサイトに同梱されたローカルフォントだけが対象です。OSやGoogleのフォントは未評価。",
 "全件のUnicode範囲は unicode18_svg_classification.json の ranges に記録。",
 "",
 "## 非対応の多い文字体系", "",
 "| Script | SVG可能 | フォントのみ | フォントなし |","|---|---:|---:|---:|"
];
for(const s of scriptStats.slice(0,30))md.push("| "+s.script+" | "+s.svg_outline+" | "+s.font_only+" | "+s.no_site_font+" |");
fs.writeFileSync(path.join(root,"data/unicode18_svg_classification.md"),md.join("\n")+"\n");
console.log("FINAL_SVG_CLASSIFICATION "+JSON.stringify(counts));
console.log("REPORT "+target);
