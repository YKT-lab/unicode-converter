"use strict";
// Scope is a separate presentation of a glyph. Result-only positioning must
// never leak into it, and measuring a lens must never alter the result SVG.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../js/scope.js"),"utf8");
let checks=0;
const near=(a,b,why,tol=1e-3)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=tol,why+": "+a+" vs "+b);
const camel=name=>name.replace(/-([a-z])/g,(_m,c)=>c.toUpperCase());
function styles(){
 const style={setProperty(k,v){this[k]=String(v)},removeProperty(k){const old=this[camel(k)];delete this[camel(k)];return old||""},getPropertyValue(k){return this[camel(k)]||""}};
 Object.defineProperty(style,"cssText",{get(){return Object.keys(this).filter(k=>typeof this[k]!=="function").map(k=>k+":"+this[k]).join(";")},set(text){
  for(const k of Object.keys(this))if(typeof this[k]!=="function")delete this[k];
  for(const declaration of String(text).split(";")){const at=declaration.indexOf(":");if(at>=0)this[camel(declaration.slice(0,at).trim())]=declaration.slice(at+1).trim()}
 }});
 return style;
}
function element(tag="span"){
 const el={tagName:tag,attrs:{},dataset:{},style:styles(),children:[],handlers:{},parentElement:null,
  setAttribute(k,v){this.attrs[k]=String(v);if(k==="style")this.style.cssText=v;if(k.startsWith("data-"))this.dataset[camel(k.slice(5))]=String(v)},
  getAttribute(k){return this.attrs[k]??null},
  removeAttribute(k){delete this.attrs[k];if(k==="style")this.style.cssText=""},
  appendChild(child){child.parentElement=this;this.children.push(child);return child},
  replaceChildren(...children){this.textContent="";for(const child of children)this.appendChild(child)},
  querySelector(selector){return this.children.find(child=>selector==="path"?child.tagName==="path":child.tagName==="svg")||null},
  addEventListener(k,fn){this.handlers[k]=fn},
  getBoundingClientRect(){return this.rect||{left:0,top:0,right:42,bottom:42,width:42,height:42}},
  getBBox(){if(this.bboxError)throw Error("Geometry unavailable");return {...this.bbox}},
  cloneNode(deep){const copy=element(this.tagName);copy.attrs={...this.attrs};copy.dataset={...this.dataset};copy.style.cssText=this.style.cssText;copy.bbox={...this.bbox};copy.bboxError=this.bboxError;
   if(deep)for(const child of this.children)copy.appendChild(child.cloneNode(true));return copy}
 };
 let text="";
 Object.defineProperty(el,"textContent",{get(){return text+this.children.map(child=>child.textContent).join("")},set(v){text=String(v);this.children=[]}});
 Object.defineProperty(el,"viewBox",{get(){const v=(this.attrs.viewBox||"").split(/[ ,]+/).map(Number);return{baseVal:{x:v[0],y:v[1],width:v[2],height:v[3]}}}});
 const classes=new Set();el.classList={add(...names){names.forEach(n=>classes.add(n))},remove(...names){names.forEach(n=>classes.delete(n))},contains:n=>classes.has(n)};
 return el;
}
function fixture(options={}){
 const scope=element("div"),glyph=element(),code=element("button"),frames=[],documentEvents={},windowEvents={},viewportEvents={};
 const viewport=options.visual===false?null:{pageLeft:30,pageTop:140,offsetLeft:10,offsetTop:20,width:390,height:700,scale:2,
  addEventListener(k,fn){viewportEvents[k]=fn}};
 const ctx={unicodeScope:scope,unicodeScopeGlyph:glyph,unicodeScopeCode:code,
  document:{addEventListener(k,fn){documentEvents[k]=fn},elementFromPoint(){return ctx.hitElement||null}},
  window:{scrollX:20,scrollY:120,innerWidth:900,innerHeight:800,visualViewport:viewport,
   addEventListener(k,fn){windowEvents[k]=fn},getSelection:()=>({removeAllRanges(){}})},
  Node:{ELEMENT_NODE:1,TEXT_NODE:3},Intl,Number,Math,console,
  navigator:{clipboard:{writeText:async()=>{}}},setTimeout(){},performance:{now:()=>100},
  requestAnimationFrame(fn){frames.push(fn)},
  getComputedStyle(node){return{fontFamily:"Source Regular",fontSize:"32px",fontWeight:"400",fontStyle:"normal",height:"53.76px",...node.computed}},
  analyseGlyphPixels(){ctx.canvasCalls++;return{inkPixels:100,width:80,height:90}},canvasCalls:0
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:"scope.js"});
 return {ctx,scope,glyph,code,frames,documentEvents,windowEvents,viewportEvents,flush(){while(frames.length)frames.shift()()}};
}
function sourceSvg(bbox={x:70,y:-700,width:420,height:850}){
 const svg=element("svg");svg.bbox=bbox;svg.dataset.codePoint="1D719";
 svg.setAttribute("viewBox","0 -1000 600 1300");
 svg.setAttribute("class","unicode-svg-outline");
 svg.setAttribute("style","width:0.6em;height:1.3em;vertical-align:-0.3em;overflow:visible;position:absolute;left:0px;top:-0.15em");
 const outline=element("path");
 // Paths use font Y-up coordinates; the SVG root's getBBox reports the
 // already transformed Y-down bounds supplied by this fixture.
 outline.setAttribute("d",`M${bbox.x} ${-bbox.y}L${bbox.x+bbox.width} ${-bbox.y}L${bbox.x+bbox.width} ${-bbox.y-bbox.height}Z`);
 outline.setAttribute("transform","scale(1,-1)");
 outline.rect={left:110,top:220,right:130,bottom:250,width:20,height:30};svg.appendChild(outline);
 svg.rect={left:100,top:190,right:140,bottom:270,width:40,height:80};
 svg.parentElement=element();svg.parentElement.computed={fontSize:"48px"};
 return svg;
}
function footprint(svg){return JSON.stringify({attrs:svg.attrs,style:svg.style.cssText,dataset:svg.dataset,path:svg.children[0].attrs})}
function inkInFrame(svg){
 const v=svg.getAttribute("viewBox").split(/[ ,]+/).map(Number),b=svg.getBBox();
 return{x:(b.x+b.width/2-v[0])*42/v[2],y:(b.y+b.height/2-v[1])*42/v[3],width:b.width*42/v[2],height:b.height*42/v[3]};
}
function test(name,run){run();checks++;}

const f=fixture();
for(const name of ["getScopeSvgRect","cloneUnicodeScopeSvg","fitScopeSvgGlyph"])
 assert.equal(typeof f.ctx[name],"function","Missing Scope SVG regression helper: "+name);
assert.equal(typeof f.ctx.isUnicodeScopeEnabled,"function");
assert.equal(typeof f.ctx.setUnicodeScopeEnabled,"function");
assert.equal(f.ctx.isUnicodeScopeEnabled(),true);

test("clone is in flow and does not mutate the converter SVG",()=>{
 const svg=sourceSvg(),before=footprint(svg),clone=f.ctx.cloneUnicodeScopeSvg(svg);
 assert.notEqual(clone,svg);assert.notEqual(clone.children[0],svg.children[0]);
 assert.notEqual(clone.style.position,"absolute");assert(!clone.style.left);assert(!clone.style.top);
 assert.notEqual(clone.style.height,"1.3em","Scope must not inherit the converter viewport CSS");
 assert.equal(clone.getAttribute("preserveAspectRatio"),"xMidYMid meet");
 near(Number(clone.dataset.scopeUnitsPerEm),1000,"Recover native source units before clearing its style");
 assert.equal(clone.children[0].getAttribute("d"),svg.children[0].getAttribute("d"));
 assert.equal(clone.children[0].getAttribute("transform"),"scale(1,-1)");
 assert.equal(footprint(svg),before);
});
for(const [name,bounds] of [
 ["italic phi/descender",{x:70,y:-700,width:420,height:850}],
 ["negative bearing",{x:-350,y:-760,width:500,height:180}],
 ["very wide glyph",{x:-400,y:-2000,width:4000,height:2500}]
])test(name+" is centered and contained in the scope",()=>{
 const svg=sourceSvg(bounds),before=footprint(svg),clone=f.ctx.cloneUnicodeScopeSvg(svg);
 f.ctx.fitScopeSvgGlyph(clone,32);
 const ink=inkInFrame(clone);
 near(ink.x,21,"Visible ink is centered horizontally");near(ink.y,21,"Visible ink is centered vertically");
 assert(ink.width<=42.001&&ink.height<=42.001,"Lens must contain the whole outline");
 const scale=(ink.width/bounds.width)/(32/1000);
 assert(scale<=1.15001,"Scope enlargement must remain capped at the existing 1.15 factor");
 assert.equal(footprint(svg),before,"Fitting the lens must not move or resize result characters");
 const fitted=clone.getAttribute("viewBox");f.ctx.fitScopeSvgGlyph(clone,32);
 assert.equal(clone.getAttribute("viewBox"),fitted,"Repeated font-ready/frame fitting must be stable");
});
test("small punctuation stays small",()=>{
 const clone=f.ctx.cloneUnicodeScopeSvg(sourceSvg({x:80,y:-50,width:80,height:50}));
 f.ctx.fitScopeSvgGlyph(clone,32);const ink=inkInFrame(clone);
 near(ink.width,80/1000*32*1.15,"Preserve a tiny glyph's native size with the same bounded magnification");
 assert(ink.width<4&&ink.height<3);
});
test("legacy SVG can recover its scale from computed height",()=>{
 const svg=sourceSvg();svg.removeAttribute("style");svg.setAttribute("viewBox","0 -800 1000 1120");
 svg.computed={fontSize:"48px",height:"53.76px"};
 const clone=f.ctx.cloneUnicodeScopeSvg(svg);
 near(Number(clone.dataset.scopeUnitsPerEm),1000,"Legacy CSS-height scale");
});
test("invalid geometry does not throw or turn an SVG into a font",()=>{
 for(const bounds of [{x:0,y:0,width:0,height:10},{x:NaN,y:0,width:10,height:10}]){
  const clone=f.ctx.cloneUnicodeScopeSvg(sourceSvg(bounds)),before=clone.children[0].getAttribute("d");
  assert.doesNotThrow(()=>f.ctx.fitScopeSvgGlyph(clone,32));
  assert.equal(clone.children[0].getAttribute("d"),before);
 }
 const clone=f.ctx.cloneUnicodeScopeSvg(sourceSvg());clone.bboxError=true;
 assert.doesNotThrow(()=>f.ctx.fitScopeSvgGlyph(clone,32));
 assert.equal(f.ctx.canvasCalls,0,"SVG geometry errors must not invoke a normal-font renderer");
});
test("tap selection anchors to visible ink rather than the full font viewport",()=>{
 const svg=sourceSvg();f.ctx.hitElement={closest:()=>svg};
 const result=f.ctx.getCharacterFromPoint(120,235);
 assert.equal(result.character,String.fromCodePoint(0x1D719));
 assert.deepEqual(result.rect,svg.children[0].rect);
 assert.equal(result.svgElement,svg);
});
test("missing/invalid ink rect falls back to the SVG viewport",()=>{
 const svg=sourceSvg();svg.children[0].rect={left:0,top:0,right:0,bottom:0,width:0,height:0};
 assert.deepEqual(f.ctx.getScopeSvgRect(svg),svg.rect);
 svg.children[0].getBoundingClientRect=()=>{throw Error("No rendered geometry")};
 assert.deepEqual(f.ctx.getScopeSvgRect(svg),svg.rect);
 svg.children=[];assert.deepEqual(f.ctx.getScopeSvgRect(svg),svg.rect);
});
test("show uses the isolated clone and retains document/pinch coordinates",()=>{
 const f=fixture(),svg=sourceSvg(),before=footprint(svg);
 const result={character:String.fromCodePoint(0x1D719),rect:svg.children[0].rect,
  textNode:{parentElement:svg.parentElement},svgElement:svg};
 f.ctx.showUnicodeScope(result);f.flush();
 assert.equal(f.scope.style.left,"140px");assert.equal(f.scope.style.top,"355px");
 assert.equal(f.scope.style["--scope-inverse-scale"],"0.5");
 assert.equal(f.code.textContent,"U+1D719");
 assert.equal(f.glyph.children.length,1);assert.notEqual(f.glyph.children[0],svg);
 assert.notEqual(f.glyph.children[0].style.position,"absolute");
 near(inkInFrame(f.glyph.children[0]).x,21,"Shown ink center");
 assert.equal(footprint(svg),before);assert.equal(f.ctx.canvasCalls,0);
});
test("normal text still uses the original Canvas fitting path",()=>{
 const f=fixture({visual:false}),parent=element();
 f.ctx.showUnicodeScope({character:"g",rect:{left:100,top:200,width:20,height:30},textNode:{parentElement:parent}});f.flush();
 assert.equal(f.glyph.textContent,"g");assert.equal(f.glyph.children.length,0);
 assert(f.ctx.canvasCalls>0);assert.match(f.glyph.style.transform,/^scale\(/);
 assert.equal(f.code.textContent,"U+0067");
});
test("Scope OFF suppresses the lens without changing glyph rendering",()=>{
 const f=fixture();
 f.ctx.setUnicodeScopeEnabled(false);
 assert.equal(f.ctx.isUnicodeScopeEnabled(),false);
 f.ctx.showUnicodeScope({character:"A",rect:{left:10,top:10,width:10,height:10},textNode:{parentElement:element()}});
 assert(!f.scope.classList.contains("visible"));
 f.ctx.setUnicodeScopeEnabled(true);
 assert.equal(f.ctx.isUnicodeScopeEnabled(),true);
});
test("scroll and visual viewport changes dismiss old lens geometry",()=>{
 const f=fixture();
 for(const callback of [f.windowEvents.scroll,f.windowEvents.resize,f.viewportEvents.scroll,f.viewportEvents.resize]){
  f.scope.classList.add("visible");f.scope.setAttribute("aria-hidden","false");callback();
  assert(!f.scope.classList.contains("visible"));assert.equal(f.scope.attrs["aria-hidden"],"true");
 }
});
console.log("PASS: "+checks+" Scope SVG isolation, ink centering, native proportions, tap anchors, normal mode and viewport regressions");
