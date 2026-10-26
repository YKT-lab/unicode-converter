"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root,"js/svg-mode.js"),"utf8");
const home = fs.readFileSync(path.join(root,"index.html"),"utf8");
const news = fs.readFileSync(path.join(root,"news/index.html"),"utf8");
const article = fs.readFileSync(path.join(root,"news/svg-display/index.html"),"utf8");
const scope = fs.readFileSync(path.join(root,"js/scope.js"),"utf8");
const siteDisplay = fs.readFileSync(path.join(root,"js/site-display-mode.js"),"utf8");

function makeEl(value="") {
  return {
    value,
    textContent:"",
    hidden:true,
    children:[],
    childNodes:[],
    attrs:{},
    handlers:{},
    setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(k,fn){this.handlers[k]=fn;}
  };
}
function simulate(opts={}) {
  const keys = new Map();
  if (opts.stored) keys.set("unicode-converter-svg-display",opts.stored);
  let deviceMode = Boolean(opts.device);
  const browserToggle=makeEl(), modeToggle=makeEl(), description=makeEl(), current=makeEl();
  // Mirror the markup: the SVG help link is visible in every display mode.
  description.hidden=false;
  const progress=makeEl(), custom=makeEl("150"), randomLimit=makeEl();
  const nodes={browserFontModeToggle:browserToggle,svgModeToggle:modeToggle,
    svgModeDescription:description,svgModeCurrent:current,svgModeProgress:progress,
    randomCustomCount:custom};
  let reloads=0, conversions=[], scopeHides=0;
  const charInput=makeEl(opts.character||"");
  const unicodeInput=makeEl(opts.unicode||"");
  const charOutput=makeEl();
  charOutput.childNodes=opts.hasResult?[{}]:[];
  const ctx={
    document:{
      getElementById(id){return nodes[id]||null;},
      querySelector(s){return s===".random-limit"?randomLimit:null;}
    },
    window:{
      sessionStorage:{
        getItem(k){return keys.get(k)||null;},
        setItem(k,v){keys.set(k,v);}
      },
      location:{reload(){reloads++;}}
    },
    UnicodeSiteDisplay:{
      isDeviceFontModeEnabled(){return deviceMode;},
      setDeviceFontModeEnabled(value){deviceMode=Boolean(value);}
    },
    charInput,unicodeInput,charOutput,
    lastUnicodeOutputSource:opts.lastSource||null,
    singleHexDigits:opts.digits||["","","",""],
    unicodeRun:0,
    hideUnicodeScope(){scopeHides++;},
    convertUnicode(text){conversions.push(text===undefined?"<bulk>":text);},
    unicodeRangeLookup(){return null;},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:"svg-mode.js"});
  return {
    ctx,nodes,keys,
    clickSvg(){modeToggle.handlers.click();},
    clickBrowser(){browserToggle.handlers.click();},
    reloadCount(){return reloads;},
    conversions(){return conversions;},
    hides(){return scopeHides;}
  };
}

const empty=simulate();
assert.equal(empty.ctx.isSvgModeEnabled(),false,"Normal must remain the initial mode");
assert.equal(empty.nodes.svgModeCurrent.textContent,"現在：通常表示");
assert.equal(empty.nodes.svgModeDescription.hidden,false);
empty.clickSvg();
assert.equal(empty.ctx.isSvgModeEnabled(),true);
assert.equal(empty.keys.get("unicode-converter-svg-display"),"svg");
assert.equal(empty.reloadCount(),1,"Empty conversion should trigger a reload");
assert.equal(empty.conversions().length,0);
assert.equal(empty.nodes.svgModeCurrent.textContent,"現在：SVG表示");
assert.equal(empty.nodes.svgModeDescription.hidden,false);
assert.equal(empty.nodes.randomCustomCount.value,"100");

const afterReload=simulate({stored:"svg"});
assert.equal(afterReload.ctx.isSvgModeEnabled(),true,"Reload must preserve the choice");
assert.equal(afterReload.reloadCount(),0,"Loading a stored preference must not reload again");
assert.equal(afterReload.nodes.svgModeDescription.hidden,false);
assert.equal(afterReload.nodes.svgModeToggle.textContent,"通常表示に戻す");
afterReload.clickSvg();
assert.equal(afterReload.reloadCount(),1,"Returning to normal with empty input should reload");
assert.equal(afterReload.keys.get("unicode-converter-svg-display"),"normal");

const browserStored=simulate({device:true});
assert.equal(browserStored.ctx.isBrowserFontModeEnabled(),true);
assert.equal(browserStored.ctx.isSvgModeEnabled(),false);
assert.equal(browserStored.nodes.browserFontModeToggle.attrs["aria-pressed"],"true");
assert.equal(browserStored.nodes.svgModeCurrent.textContent,"現在：端末フォント");

const single=simulate({lastSource:"single",digits:["0","0","4","1"]});
single.clickBrowser();
assert.equal(single.ctx.isBrowserFontModeEnabled(),true);
assert.equal(single.reloadCount(),0,"Site-wide mode switches without page reload");
assert.deepEqual(single.conversions(),["U+0041"],"Re-render input with selected mode");

const bulk=simulate({lastSource:"bulk",unicode:"U+14354 U+0041"});
bulk.clickBrowser();
assert.equal(bulk.reloadCount(),0);
assert.deepEqual(bulk.conversions(),["<bulk>"]);

const partial=simulate({digits:["0","","",""]});
partial.clickBrowser();
assert.equal(partial.reloadCount(),0,"Partially-entered digit cells must not reload");
assert.equal(partial.conversions().length,0,"Do not fabricate incomplete input");

for(const tag of ['id="browserFontModeToggle"','id="scopeModeToggle"','id="svgModeToggle"','id="svgModeCurrent"','id="svgModeDescription"'])
  assert(home.includes(tag),"Missing mode indicator/control "+tag);
assert(home.includes('class="unicode-actions unicode-scope-excluded"'));
assert(home.includes('class="svg-mode-switch"'));
assert(home.includes('class="home-quick-modes unicode-scope-excluded"'));
assert(home.includes('<a href="./news/svg-display/">SVG表示とは？</a>'));
assert(!/id="svgModeDescription"[^>]*\shidden\b/.test(home),"SVG help must always be visible");
assert(!home.includes("SVG互換モードでは、サイトのフォントから"));
assert(home.indexOf('id="svgModeToggle"') < home.indexOf('id="charOutput"'));
assert(scope.includes(".unicode-scope-excluded"));
assert(home.includes('href="./news/svg-display/"'));
assert(news.includes('href="./svg-display/"'));
assert(news.includes('SVG表示機能を追加しました'));
assert(article.includes('datetime="2026-10-14"'));
assert(article.includes("文字の輪郭"));
assert(article.includes("最大100文字"));
assert(siteDisplay.includes("site-device-font-mode"));
assert(siteDisplay.includes("font-family: sans-serif !important"));
assert(siteDisplay.includes("localStorage"));
console.log("SVG/device-font mode UI, persistence, Scope exclusion and NEWS link checks passed.");
