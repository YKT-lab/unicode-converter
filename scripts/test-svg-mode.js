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
  charToGlyphIndex:()=>17,
  glyphs:{
    get:()=>({
      getPath:()=>({
        toPathData:()=>"M0 0L100 0L100 100Z",
        getBoundingBox:()=>({x1:0,y1:0,x2:100,y2:100})
      })
    })
  }
};
const svg=ctx.makeSvgOutline(fakeFont,0x14354,String.fromCodePoint(0x14354));
assert.equal(svg.tagName,"svg");
assert.equal(svg.children[0].tagName,"path");
assert(svg.children[0].attrs.d.startsWith("M"));
assert.equal(svg.dataset.codePoint,"14354");
fakeFont.charToGlyphIndex=()=>0;
assert.equal(ctx.makeSvgOutline(fakeFont,0x14354,String.fromCodePoint(0x14354)),null,
  "The undefined-glyph box cannot be used as an SVG outline");
console.log("SVG compatibility mode checks passed");
