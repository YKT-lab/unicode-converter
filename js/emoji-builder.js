"use strict";
/* Emoji 18.0 RGI builder: all choices come directly from the official catalogue. */
(() => {
const $=id=>document.getElementById(id),root=$("emoji-builder");if(!root)return;
const category=$("emoji-builder-category"),slots=$("emoji-builder-slots"),choices=$("emoji-builder-choices"),out=$("emoji-builder-output"),status=$("emoji-builder-status"),search=$("emoji-builder-search"),more=$("emoji-builder-more"),codes=$("emoji-builder-codes"),copy=$("emoji-builder-copy"),count=$("emoji-builder-count");
const groups=[["all","すべて"],["role","人物・職業"],["family","家族・カップル"],["gendered","人物・動作"],["hair","髪型"],["other","その他の接合"],["modifier","肌の色"],["flag","国旗"],["tag","地域旗"],["keycap","キーキャップ"]];
const groupNames=Object.fromEntries(groups);
const skip=new Set([0x200D,0xFE0F,0x20E3]);
const renderCode=cp=>"U+"+cp.toString(16).toUpperCase().padStart(4,"0");
const grapheme=code=>code.map(cp=>String.fromCodePoint(cp)).join("");
const rowText=(code)=>code.map(renderCode).join(" + ");
let all=[],current=[],stages=[],selected=[],active=0,shown=36;
function text(tag,name,value){const e=document.createElement(tag);if(name)e.className=name;e.textContent=value;return e;}
function slotTokens(p){const a=p.split(" ").map(x=>parseInt(x,16)),tokens=[];let chunk=[];for(const cp of a){if(cp===0x200D){if(chunk.length){tokens.push(chunk);chunk=[];}}else if(!skip.has(cp)&&cp<0xE0000){if(cp>=0x1F3FB&&cp<=0x1F3FF&&chunk.length)chunk.push(cp);else{if(chunk.length)tokens.push(chunk);chunk=[cp];}}else if(cp===0x20E3){/* attach keycap to the preceding character */}else if(cp>=0xE0000){/* tags remain in source for exact reproduction */}}
if(chunk.length)tokens.push(chunk);
return tokens.map(x=>x.join("-"));}
function tokenize(e){const cp=e[0].split(" ").map(x=>parseInt(x,16));const g=e[1];
if(g==="tag")return [e[0]]; // Hidden tag letters are presented as one named region.
if(g==="keycap")return [e[0]];
const chunks=[];let current=[];for(const n of cp){if(n===0x200D){if(current.length)chunks.push(current);current=[];}else if(n===0xFE0F){if(current.length)current.push(n);}else if(n===0x20E3){if(current.length)current.push(n);}else if(n>=0x1F3FB&&n<=0x1F3FF){if(current.length)chunks.push(current);current=[n];}else if(current.length){chunks.push(current);current=[n];}else current=[n];}
if(current.length)chunks.push(current);
return chunks.map(chunk=>chunk.map(renderCode).map(x=>x.slice(2)).join(" "));}
function matches(e){return selected.every((value,i)=>e.tokens[i]===value);}
function candidates(){return current.filter(matches);}
function rebuild(){const valid=candidates();if(!valid.length){selected=[];active=0;return rebuild();}
stages=[];const max=Math.max(1,...valid.map(e=>e.tokens.length));
for(let i=0;i<max;i++){const u=[...new Set(valid.map(e=>e.tokens[i]).filter(Boolean))];stages.push(u);}
if(active>=max)active=max-1;
slots.replaceChildren();
for(let i=0;i<max;i++){const holder=document.createElement("button");holder.type="button";holder.className="emoji-builder-slot"+(i===active?" active":"");const val=selected[i];
holder.append(text("span","emoji-builder-slot-glyph",val?grapheme(val.split(" ").map(s=>parseInt(s,16))):"＋"));
holder.append(text("span","emoji-builder-slot-label",val&&/^1F3F[B-F]$/.test(val)?"肌の色":val?"素材 "+(i+1):"選択 "+(i+1)));
holder.addEventListener("click",()=>{active=i;shown=36;search.value="";rebuild()});
slots.append(holder);if(i<max-1)slots.append(text("span","emoji-builder-plus","+"));}
const complete=valid.filter(e=>e.tokens.length===selected.length);
const exact=selected.length?complete[0]:null;
out.textContent=exact?exact.glyph:"—";codes.textContent=exact?rowText(exact.cps):"";
copy.disabled=!exact;
status.textContent=exact?(complete.length===1?"完成：Unicode公式RGI絵文字":"完成候補 "+complete.length+" 件"):"左から素材を選んでください";
count.textContent=valid.length+" 件の候補";
renderChoices(valid);
}
function renderChoices(valid){choices.replaceChildren();
const index=active,base=valid.filter(e=>e.tokens[index]);const opts=new Map();for(const e of base){const token=e.tokens[index];if(!opts.has(token))opts.set(token,{token,sample:e});}
const q=search.value.trim().toLocaleLowerCase();let shownItems=[...opts.values()].filter(x=>!q||x.sample[2].toLocaleLowerCase().includes(q)||x.token.toLowerCase().includes(q)||grapheme(x.token.split(" ").map(s=>parseInt(s,16))).includes(q));shownItems=shownItems.slice(0,shown);
for(const item of shownItems){const b=document.createElement("button");b.type="button";b.className="emoji-builder-option";b.title=item.sample[2]||item.token;
b.append(text("span","emoji-builder-option-glyph",grapheme(item.token.split(" ").map(s=>parseInt(s,16)))));
b.append(text("span","emoji-builder-option-code",item.token.split(" ").map(s=>"U+"+s).join(" ")));
b.addEventListener("click",()=>{selected=selected.slice(0,index);selected[index]=item.token;active=index+1;shown=36;search.value="";rebuild()});choices.append(b);}
const total=[...opts.values()].filter(x=>!q||x.sample[2].toLowerCase().includes(q)||x.token.toLowerCase().includes(q)||grapheme(x.token.split(" ").map(s=>parseInt(s,16))).includes(q)).length;
more.hidden=shownItems.length>=total;
if(!total)choices.append(text("p","page-muted","該当する素材がありません。"));
}
function setGroup(){const g=category.value;selected=[];active=0;shown=36;search.value="";current=all.filter(x=>g==="all"?x[1]!=="basic":x[1]===g);rebuild();}
category.addEventListener("change",setGroup);
search.addEventListener("input",()=>{shown=36;renderChoices(candidates())});
more.addEventListener("click",()=>{shown+=72;renderChoices(candidates())});
copy.addEventListener("click",async()=>{const complete=candidates().find(e=>e.tokens.length===selected.length);if(!complete)return;try{await navigator.clipboard.writeText(complete.glyph);copy.textContent="コピーしました";setTimeout(()=>copy.textContent="絵文字をコピー",1500);}catch(e){status.textContent="コピーできませんでした。表示された文字を選択してコピーしてください。";}});
fetch("../data/unicode18_emoji_rgi_sequences.json").then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(data=>{
if(data.unicode_version!=="18.0"||data.count!==3972||!Array.isArray(data.entries)||data.entries.length!==3972)throw Error("絵文字データの形式が不正です");
all=data.entries.map(x=>{const cps=x[0].split(" ").map(n=>parseInt(n,16));const e=[x[0],x[1],x[2],grapheme(cps)];return {raw:x[0],group:x[1],name:x[2],glyph:e[3],cps,tokens:tokenize(x)};});
for(const [key,label]of groups){if(key!=="all"&&!all.some(e=>e.group===key))continue;const opt=document.createElement("option");opt.value=key;opt.textContent=label;category.append(opt);}
category.value="role";root.hidden=false;setGroup();
}).catch(e=>{root.hidden=false;status.textContent="データを読み込めませんでした: "+e.message;});
})();