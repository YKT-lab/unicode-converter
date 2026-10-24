"use strict";
const assert=require("node:assert/strict");
const {fit,reset}=require("../js/glyph-layout.js");
function panel(inks,width=300){
 const output={style:{fontSize:""},dataset:{},width};
 const size=()=>parseFloat(output.style.fontSize)||48;
 const view={getComputedStyle:()=>({fontSize:"48px",borderLeftWidth:"0",borderRightWidth:"0",paddingLeft:"14"}),
  addEventListener(){},requestAnimationFrame:fn=>fn()};
 output.ownerDocument={defaultView:view};
 output.getBoundingClientRect=()=>({left:0,right:output.width,width:output.width});
 output.querySelectorAll=()=>inks.map(([left,right])=>({
  querySelector:()=>({getBoundingClientRect:()=>({left:14+left*size(),right:14+right*size()})})
 }));
 return output;
}
const ordinary=panel([[0,.6],[.6,.8],[.8,1.6]]);
reset(ordinary);fit(ordinary);
assert.equal(ordinary.style.fontSize,"");
assert.equal(ordinary.dataset.layoutScale,"1","Natural advances must not be enlarged or normalized");
const wide=panel([[0,8],[8,9]]);
reset(wide);fit(wide);
assert(parseFloat(wide.style.fontSize)<48,"Overflow must shrink the entire output");
let boxes=wide.querySelectorAll().map(inner=>inner.querySelector().getBoundingClientRect());
assert(boxes[1].right<wide.width);
assert(Math.abs((boxes[0].right-boxes[0].left)/(boxes[1].right-boxes[1].left)-8)<1e-9,
 "Small and large glyphs must keep their relative widths under the same scale");
wide.width=700;fit(wide);
assert.equal(wide.style.fontSize,"","Resizing must recover the natural font size");
const overhang=panel([[-1,0],[0,.5]]);
fit(overhang);
boxes=overhang.querySelectorAll().map(inner=>inner.querySelector().getBoundingClientRect());
assert(boxes[0].left>=1,"A negative bearing must remain inside the panel");
assert(parseFloat(overhang.style.fontSize)<48);
reset(overhang);
assert.equal(overhang.style.fontSize,"");assert.equal(overhang.dataset.layoutScale,undefined);
// At a panel boundary, hinted text metrics may round ink up by a pixel.
// The same font's exact SVG outline fits. Neither mode should then be
// uniformly reduced just because text and SVG use different metric precision.
const vector=panel([[0,.975]],61.875),text=panel([],61.875);
text.ownerDocument.defaultView.getComputedStyle=()=>({fontSize:"48px",fontStyle:"normal",fontWeight:"400",
 fontFamily:"Test Regular",borderLeftWidth:"0",borderRightWidth:"0",paddingLeft:"14"});
const context={font:"",measureText(){
 const size=Number(/([0-9.]+)px/.exec(this.font)[1]);
 return {actualBoundingBoxLeft:0,actualBoundingBoxRight:Math.ceil(.975*size)};
}};
text.ownerDocument.createElement=()=>({getContext:()=>context});
text.querySelectorAll=()=>[{textContent:"A",querySelector:()=>null,
 getBoundingClientRect:()=>({left:14,right:61})}];
fit(text);fit(vector);
assert.equal(text.dataset.layoutScale,vector.dataset.layoutScale,
 "Normal and SVG output must not acquire different font sizes from low-resolution metric rounding");
assert.equal(text.style.fontSize,"");
console.log("Glyph layout checks passed: natural spacing, uniform shrink, bearings, resize and reset");
