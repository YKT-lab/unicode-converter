/* Keep the converter's natural font spacing; only shrink the whole result
 * when an ink overhang or a wide glyph exceeds the available panel width. */
(function(root){
"use strict";
const observed=new WeakMap();
function inkBounds(output,view){
 let left=Infinity,right=-Infinity;
 let context=null;
 for(const inner of output.querySelectorAll(".glyph-inner")){
  const path=inner.querySelector("svg path");
  let box=(path||inner).getBoundingClientRect();
  let x1=box.left,x2=box.right;
  if(!path&&inner.textContent){
   // Text element boxes omit italic/combining overhangs. Use the same loaded
   // font at its actual size, without changing that glyph's scale or bearing.
   try{
    if(!context)context=output.ownerDocument.createElement("canvas").getContext("2d");
    const css=view.getComputedStyle(inner);
    // Measure in font space, then scale to CSS pixels. Measuring at the
    // displayed size quantizes hinted text bounds, while SVG keeps fractional
    // outlines; near the panel edge that could shrink only normal mode.
    const fontSize=parseFloat(css.fontSize),measureSize=1000;
    context.font=css.fontStyle+" "+css.fontWeight+" "+measureSize+"px "+css.fontFamily;
    const ink=context.measureText(inner.textContent);
    if(fontSize>0&&Number.isFinite(ink.actualBoundingBoxLeft)&&Number.isFinite(ink.actualBoundingBoxRight)){
     const scale=fontSize/measureSize;
     x1=box.left-ink.actualBoundingBoxLeft*scale;x2=box.left+ink.actualBoundingBoxRight*scale;
    }
   }catch(_error){/* DOM bounds remain usable when Canvas is unavailable. */}
  }
  if(Number.isFinite(x1)&&Number.isFinite(x2)){left=Math.min(left,x1);right=Math.max(right,x2)}
 }
 return {left,right};
}
function fit(output){
 if(!output)return;
 const view=output.ownerDocument?.defaultView;
 if(!view?.getComputedStyle)return;
 output.style.fontSize="";
 const css=view.getComputedStyle(output),base=parseFloat(css.fontSize);
 if(!(base>0))return;
 const box=output.getBoundingClientRect(),borderLeft=parseFloat(css.borderLeftWidth)||0,
  borderRight=parseFloat(css.borderRightWidth)||0,padding=parseFloat(css.paddingLeft)||0;
 const origin=box.left+borderLeft+padding,leftLimit=box.left+borderLeft+1,
  rightLimit=box.right-borderRight-1;
 let scale=1;
 // Wrapping remains natural. Each pass uses one font size for every glyph,
 // including glyphs on later lines; individual ink boxes are never fitted.
 for(let pass=0;pass<3;pass++){
  const ink=inkBounds(output,view);
  let ratio=1;
  if(ink.left<leftLimit&&ink.left<origin)
   ratio=Math.min(ratio,(origin-leftLimit)/(origin-ink.left));
  if(ink.right>rightLimit&&ink.right>origin)
   ratio=Math.min(ratio,(rightLimit-origin)/(ink.right-origin));
  if(!(ratio>0)||ratio>=0.999)break;
  scale*=ratio*0.995;
  output.style.fontSize=(base*scale)+"px";
 }
 output.dataset.layoutScale=String(scale);
}
function reset(output){
 if(!output)return;
 output.style.fontSize="";
 delete output.dataset.layoutScale;
 if(observed.has(output))return;
 const view=output.ownerDocument?.defaultView;
 if(!view)return;
 const state={width:output.getBoundingClientRect().width,pending:false};
 const schedule=()=>{
  if(state.pending)return;
  state.pending=true;
  (view.requestAnimationFrame||view.setTimeout).call(view,()=>{state.pending=false;fit(output)});
 };
 if(typeof view.ResizeObserver==="function"){
  const observer=new view.ResizeObserver(()=>{
   const width=output.getBoundingClientRect().width;
   if(width!==state.width){state.width=width;schedule()}
  });
  observer.observe(output);state.observer=observer;
 }else view.addEventListener("resize",schedule);
 output.ownerDocument.fonts?.addEventListener?.("loadingdone",schedule);
 observed.set(output,state);
}
const api=Object.freeze({fit,reset});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else root.UnicodeGlyphLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this);
