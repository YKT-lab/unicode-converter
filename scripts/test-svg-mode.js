"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ROOT=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(ROOT,"js/svg-mode.js"),"utf8");
const index=JSON.parse(fs.readFileSync(path.join(ROOT,"data/unicode18_font_coverage_index.json"),"utf8"));
assert(!source.includes('createElementNS("http://www.w3.org/2000/svg","text")'),
  "SVG compatibility must draw outline paths, not font-dependent SVG text");
assert(!source.includes("if (precomputed.svg) return precomputed;"),
  "SVG mode must not fall back to device-side font parsing after a precomputed miss");
assert(source.includes("return client.getGlyph(codePoint);"),
  "SVG mode must use the precomputed release as the authoritative renderer");

const elements=[];
function element(tag) {
  return {
    tagName:tag,
    attrs:{},
    dataset:{},
    children:[],
    setAttribute(name,value){this.attrs[name]=value;},
    appendChild(node){this.children.push(node);return node;}
  };
}
const ctx={
  document:{
    getElementById:()=>null,
    createElementNS:(_ns,tag)=>{const e=element(tag);elements.push(e);return e;}
  },
  window:{},
  unicodeRangeLookup(ranges,cp) {
    let low=0,high=ranges.length-1;
    while(low<=high) {
      const mid=(low+high)>>>1, range=ranges[mid];
      if(cp<range[0])high=mid-1;
      else if(cp>range[1])low=mid+1;
      else return range;
    }
    return null;
  }
};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:"svg-mode.js"});
assert.equal(ctx.isSvgModeEnabled(),false,"Default mode must be normal");
assert.equal(
  ctx.svgFontPath("fonts/han/PlangothicP1-Regular.woff2"),
  "fonts-svg/han/PlangothicP1-Regular.ttf");
assert.equal(
  ctx.svgFontPath("fonts/scripts/NotoSansNewa-Regular.ttf"),
  "fonts/scripts/NotoSansNewa-Regular.ttf");
for(const cp of [0x14354,0x109EB,0x11D6B,0x41]) {
  const ids=ctx.svgCandidateFontIds(index,cp);
  assert(ids.length>0,"Missing candidate for U+"+cp.toString(16));
  for(const id of ids) assert(index.font_families[id]?.file);
}
assert.equal(ctx.svgCandidateFontIds(index,0x10FFFF).length,0);
const fakeFont={
  unitsPerEm:1000,
  ascender:800,
  descender:-200,
  charToGlyphIndex:()=>17,
  glyphs:{
    get:()=>({
      advanceWidth:600,
      getPath:(x,y,size)=>({
        toPathData:()=>{
          assert.equal(x,0);assert.equal(y,0);assert.equal(size,1000);
          return "M20 0L450 0L450 -700Z";
        },
        getBoundingBox:()=>({x1:20,y1:-700,x2:450,y2:0})
      })
    })
  }
};
const svg=ctx.makeSvgOutline(fakeFont,0x14354,String.fromCodePoint(0x14354));
assert.equal(svg.tagName,"svg");
assert.equal(svg.children[0].tagName,"path");
assert(svg.children[0].attrs.d.startsWith("M"));
assert.equal(svg.dataset.codePoint,"14354");
assert.equal(svg.attrs.viewBox,"0 -800 600 1000");
assert.equal(svg.attrs.style,"width:0.6em;height:1em;vertical-align:-0.2em;overflow:visible");
assert.equal(svg.attrs["data-font-metrics"],"em");
assert.equal(svg.attrs["data-advance-em"],"0.6");
assert.equal(svg.children[0].attrs.stroke,undefined,"Do not embolden an outline with a stroke");
assert.equal(svg.children[0].attrs.transform,undefined,"OpenType paths already have their native orientation");

function outlineFont(advance,bounds,d) {
  return {
    ...fakeFont,
    glyphs:{get:()=>({advanceWidth:advance,getPath:()=>({
      getBoundingBox:()=>bounds,toPathData:()=>d
    })})}
  };
}
const smallPath="M20 0L100 0L100 -100Z";
const small=ctx.makeSvgOutline(outlineFont(600,{x1:20,y1:-100,x2:100,y2:0},smallPath),0x3041,"ぁ");
assert.equal(small.attrs.viewBox,svg.attrs.viewBox,"Small ink must retain the same font viewport");
assert.equal(small.attrs.style,svg.attrs.style,"Small ink must not be enlarged to match tall ink");
assert.equal(small.children[0].attrs.d,smallPath,"The original path coordinates must remain untouched");
const narrow=ctx.makeSvgOutline(outlineFont(150,{x1:20,y1:-100,x2:100,y2:0},smallPath),0x1D62,"ᵢ");
assert.equal(narrow.attrs.viewBox,"0 -800 150 1000");
assert.equal(narrow.attrs.style,"width:0.15em;height:1em;vertical-align:-0.2em;overflow:visible");
const overhang=ctx.makeSvgOutline(outlineFont(600,{x1:-50,y1:-900,x2:750,y2:230},"M-50 -900L750 230Z"),0x41,"A");
assert.equal(overhang.attrs.viewBox,"0 -800 600 1000","Bearings/overshoots must not change the font viewport");
assert(overhang.attrs.style.endsWith("overflow:visible"));
const descender=ctx.makeSvgOutline(outlineFont(600,{x1:20,y1:-600,x2:450,y2:170},"M20 -600L450 170Z"),0x67,"g");
assert.equal(descender.attrs.viewBox,svg.attrs.viewBox,"A descender must not move the baseline");
assert.equal(descender.attrs.style,svg.attrs.style);
const zeroAdvance=ctx.makeSvgOutline(outlineFont(0,{x1:-70,y1:-700,x2:90,y2:-500},"M-70 -700L90 -500Z"),0x301,"́");
assert.equal(zeroAdvance.attrs["data-advance-em"],"0","A zero advance must remain identifiable to its layout wrapper");
assert.equal(zeroAdvance.attrs.viewBox,"0 -800 1000 1000");
const font2048={...fakeFont,unitsPerEm:2048,ascender:1500,descender:-548,
  glyphs:{get:()=>({advanceWidth:512,getPath:(_x,_y,size)=>{
    assert.equal(size,2048,"Use the source font's em rather than an assumed 1000-unit font");
    return {getBoundingBox:()=>({x1:10,y1:-500,x2:500,y2:0}),toPathData:()=>smallPath};
  }})}};
const native2048=ctx.makeSvgOutline(font2048,0x41,"A");
assert.equal(native2048.attrs.viewBox,"0 -1500 512 2048");
assert.equal(native2048.attrs.style,"width:0.25em;height:1em;vertical-align:-0.267578125em;overflow:visible");
assert.equal(ctx.makeSvgOutline({...fakeFont,unitsPerEm:0},0x41,"A"),null);
assert.equal(ctx.makeSvgOutline({...fakeFont,ascender:-200},0x41,"A"),null);
assert.equal(ctx.makeSvgOutline(outlineFont(-1,{x1:0,y1:-100,x2:100,y2:0},smallPath),0x41,"A"),null);
fakeFont.charToGlyphIndex=()=>0;
assert.equal(ctx.makeSvgOutline(fakeFont,0x14354,String.fromCodePoint(0x14354)),null,
  "The undefined-glyph box cannot be used as an SVG outline");
console.log("SVG compatibility mode, native em/advance/baseline and no-normalization checks passed");
