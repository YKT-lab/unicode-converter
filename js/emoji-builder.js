"use strict";
/* Unicode Emoji 18.0 compositional builder.
 * Meaningful categories and UI order are independent from Unicode codepoint order.
 * The original RGI dataset remains the sole authority for complete results.
 */
(() => {
  const $ = id => document.getElementById(id);
  const root = $("emoji-builder");
  if (!root) return;
  const categoryPicker = $("emoji-builder-category");
  const categoryList = $("emoji-builder-category-list");
  const categoryText = $("emoji-builder-category-label");
  const slots = $("emoji-builder-slots");
  const choices = $("emoji-builder-choices");
  const result = $("emoji-builder-output");
  const status = $("emoji-builder-status");
  const count = $("emoji-builder-count");
  const codes = $("emoji-builder-codes");
  const copy = $("emoji-builder-copy");
  const more = $("emoji-builder-more");

  const categories = [
    ["person","人物・身体"],
    ["action","動作・スポーツ"],
    ["multi","複数人・関係"],
    ["face","顔・感情"],
    ["nature","動物・自然"],
    ["symbol","物・記号"],
    ["flag","国旗"],
    ["keycap","キーキャップ"]
  ];
  const titles = Object.fromEntries(categories);
  // These base-emoji sets describe the UI's subject matter, not Unicode's
  // technical ZWJ file headings (Role/Gendered/Other).
  const set = words => new Set(words.split(/\s+/).filter(Boolean));
  const actionBases = set("26F9 1F3C2 1F3C3 1F3C4 1F3C7 1F3CA 1F3CB 1F3CC 1F481 1F483 1F486 1F487 1F574 1F57A 1F645 1F646 1F647 1F64B 1F64D 1F64E 1F6A3 1F6B4 1F6B5 1F6B6 1F6C0 1F6CC 1F926 1F937 1F938 1F939 1F93D 1F93E 1F9CD 1F9CE 1F9D6 1F9D7 1F9D8");
  const multiBases = set("1F46B 1F46C 1F46D 1F46F 1F48F 1F491 1F91D 1F93C 1FAF1");
  const faceBases = set("1F441 1F62E 1F635 1F636 1F642");
  const natureBases = set("1F344 1F34B 1F408 1F415 1F426 1F43B");
  const symbolBases = set("26D3 2764 1F3F3 1F3F4");
  const tones = {
    "1F3FB":"明るい肌",
    "1F3FC":"やや明るい肌",
    "1F3FD":"中間の肌",
    "1F3FE":"やや濃い肌",
    "1F3FF":"濃い肌"
  };
  const toHex = n => n.toString(16).toUpperCase();
  const codepoints = raw => raw.split(" ").map(n => parseInt(n,16));
  const glyph = cps => String.fromCodePoint(...cps);
  const isTone = n => n>=0x1F3FB && n<=0x1F3FF;
  const node = (tag,className,label) => {
    const el = document.createElement(tag);
    if(className)el.className=className;
    if(label!=null)el.textContent=label;
    return el;
  };
  let labels={component_names:{},flag_regions:{}};
  let currentCategory="person";
  let entries=[],current=[],selected=[],active=0,shown=36;

  function categoryFor(entry) {
    if(entry.group==="flag" || entry.group==="keycap")return entry.group;
    const base=toHex(entry.cps[0]);
    if(entry.group==="family" || multiBases.has(base) ||
      /^(people|men|women) (wrestling|with bunny ears)/i.test(entry.name)) return "multi";
    if(faceBases.has(base))return "face";
    if(natureBases.has(base))return "nature";
    if(symbolBases.has(base))return "symbol";
    if(actionBases.has(base) || /ballet dancer/i.test(entry.name))return "action";
    return "person";
  }
  function buildPath(entry) {
    const cps=entry.cps;
    if(entry.group==="flag")return ["FLAG_COUNTRY",toHex(cps[0]),toHex(cps[1])];
    if(entry.group==="keycap")return ["KEYCAP_MARK",toHex(cps[0])];
    const base=toHex(cps[0]);
    const extras=cps.slice(1).filter(n=>n!==0x200D && n!==0xFE0F && n!==0x20E3 && !isTone(n)).map(toHex);
    const skin=cps.filter(isTone).map(toHex);
    // Attribute choice is last even when its Unicode codepoint occurs earlier.
    // NO_DETAIL makes a skin-tone-only variant an explicit, unambiguous route.
    return [base,...(extras.length?extras:skin.length?["NO_DETAIL"]:[]),...skin];
  }
  function regionName(entry) {
    if(entry.group!=="flag")return "";
    const code=String.fromCharCode(...entry.cps.map(cp=>65+cp-0x1F1E6));
    return labels.flag_regions[code] || code;
  }
  function tokenInfo(token,entry) {
    if(token==="FLAG_COUNTRY")return {glyph:"🇦 + 🇧",name:"地域指示記号",wide:true};
    if(token==="KEYCAP_MARK")return {glyph:"\u20E3",name:"キーキャップ結合記号",combining:true};
    if(token==="NO_DETAIL")return {glyph:"＋",name:"肌の色だけを変更"};
    const cp=parseInt(token,16);
    if(token in tones)return {glyph:"●",name:tones[token],tone:token.toLowerCase()};
    if(cp>=0x1F1E6 && cp<=0x1F1FF && entry.group==="flag") {
      const letter=String.fromCharCode(65+cp-0x1F1E6);
      return {glyph:String.fromCodePoint(cp),name:letter};
    }
    if(entry.group==="keycap") {
      const name=cp===0x23?"シャープ":cp===0x2A?"アスタリスク":String.fromCodePoint(cp);
      return {glyph:String.fromCodePoint(cp),name};
    }
    const name=labels.component_names[token] || entry.name || token;
    if(cp===0x1F430 && entry.category==="multi")return {glyph:String.fromCodePoint(cp),name:"ウサギの耳"};
    return {glyph:String.fromCodePoint(cp),name};
  }
  const begins=(tokens,prefix)=>prefix.every((x,i)=>tokens[i]===x);
  const matching=prefix=>current.filter(e=>begins(e.path,prefix));
  function optionsAt(prefix,index) {
    const seen=new Map();
    for(const item of matching(prefix)){
      const value=item.path[index];
      if(value!=null && !seen.has(value))seen.set(value,{token:value,entry:item});
    }
    return [...seen.values()];
  }
  function stepTitle(index,available){
    if(currentCategory==="flag")return index===0?"国旗":index===1?"1文字目":"2文字目";
    if(currentCategory==="keycap")return index===0?"結合記号":"数字・記号";
    if(index===0)return "基本の絵文字";
    if(available.length && available.every(item=>item.token in tones))return "肌の色";
    if(available.length && available.every(item=>["2640","2642"].includes(item.token)))return "性別";
    if(available.length && available.every(item=>["1F9B0","1F9B1","1F9B2","1F9B3"].includes(item.token)))return "髪型";
    if(available.length && available.every(item=>item.token==="27A1"))return "向き";
    if(currentCategory==="person")return "職業・特徴";
    if(currentCategory==="action")return "動作・性別・向き";
    if(currentCategory==="multi")return "人物・関係";
    return "追加する素材";
  }
  // Skip fixed-only selections (e.g. the flag starter and tone-only placeholder)
  // while still showing them in the sequence of chosen material slots.
  function skipFixed() {
    for(let i=0;i<8;i++){
      const options=optionsAt(selected,selected.length);
      if(options.length!==1)break;
      const only=options[0].token;
      if(!["FLAG_COUNTRY","KEYCAP_MARK","NO_DETAIL"].includes(only))break;
      selected.push(only);
    }
  }
  function chooseCategory(key){
    currentCategory=key;
    current=entries.filter(e=>e.category===key);
    selected=[];
    active=0;
    shown=36;
    categoryText.textContent=titles[key];
    categoryPicker.open=false;
    skipFixed();
    active=selected.length;
    render();
  }
  function render(){
    const valid=matching(selected);
    const exact=valid.find(e=>e.path.length===selected.length);
    const extendsFurther=valid.some(e=>e.path.length>selected.length);
    const slotsCount=selected.length+(extendsFurther?1:0);
    if(active>=slotsCount)active=Math.max(0,slotsCount-1);
    slots.replaceChildren();
    for(let i=0;i<slotsCount;i++){
      const prefix=selected.slice(0,i);
      const opts=optionsAt(prefix,i);
      const title=stepTitle(i,opts);
      const chosen=selected[i];
      const sample=opts.find(o=>o.token===chosen);
      const info=sample?tokenInfo(sample.token,sample.entry):null;
      const button=node("button","emoji-builder-slot"+(active===i?" active":""),null);
      button.type="button";
      button.setAttribute("aria-label",title+(chosen?"、変更":"、選択"));
      const large=node("span","emoji-builder-slot-glyph",info?.glyph||"＋");
      if(info?.tone)large.classList.add("emoji-builder-tone-"+info.tone);
      if(info?.combining)large.classList.add("emoji-builder-combining-mark");
      if(info?.wide)large.classList.add("emoji-builder-flag-parts");
      button.append(large,node("span","emoji-builder-slot-label",title));
      button.addEventListener("click",()=>{
        active=i;
        shown=36;
        render();
      });
      slots.append(button);
      if(i<slotsCount-1)slots.append(node("span","emoji-builder-plus","+"));
    }
    result.textContent=exact?exact.emoji:"—";
    codes.textContent=exact?exact.cps.map(n=>"U+"+n.toString(16).toUpperCase().padStart(4,"0")).join(" + "):"";
    copy.disabled=!exact;
    status.textContent=exact
      ? (extendsFurther?"完成。さらに属性を追加できます":"完成：Unicode公式の絵文字")
      : "上から素材を選んでください";
    renderOptions();
  }
  function renderOptions(){
    const opts=optionsAt(selected.slice(0,active),active);
    choices.replaceChildren();
    for(const item of opts.slice(0,shown)){
      const info=tokenInfo(item.token,item.entry);
      const button=node("button","emoji-builder-option",null);
      button.type="button";
      button.title=info.name;
      button.setAttribute("aria-label",info.name);
      const symbol=node("span","emoji-builder-option-glyph",info.glyph);
      if(info.tone)symbol.classList.add("emoji-builder-tone-"+info.tone);
      if(info.combining)symbol.classList.add("emoji-builder-combining-mark");
      if(info.wide)symbol.classList.add("emoji-builder-flag-parts");
      button.append(symbol,node("span","emoji-builder-option-name",info.name));
      button.addEventListener("click",()=>{
        selected=[...selected.slice(0,active),item.token];
        skipFixed();
        active=selected.length;
        shown=36;
        render();
      });
      choices.append(button);
    }
    count.textContent=matching(selected).length+"種類の完成候補 / 選べる素材 "+opts.length+"件";
    more.hidden=shown>=opts.length;
    if(!opts.length){
      choices.append(node("p","page-muted",matching(selected).some(e=>e.path.length===selected.length)
        ? "この組み合わせは完成しています。前の素材を押すと選び直せます。"
        : "候補がありません。前の素材を変更してください。"));
    }
  }
  categoryList.replaceChildren();
  for(const [key,name]of categories){
    const button=node("button","emoji-builder-category-option",name);
    button.type="button";
    button.addEventListener("click",()=>chooseCategory(key));
    categoryList.append(button);
  }
  document.addEventListener("click",e=>{
    if(categoryPicker.open&&!categoryPicker.contains(e.target))categoryPicker.open=false;
  });
  categoryPicker.addEventListener("keydown",e=>{
    if(e.key==="Escape"){categoryPicker.open=false;categoryPicker.querySelector("summary")?.focus();}
  });
  more.addEventListener("click",()=>{shown+=72;renderOptions();});
  copy.addEventListener("click",async()=>{
    const exact=matching(selected).find(e=>e.path.length===selected.length);
    if(!exact)return;
    try{
      await navigator.clipboard.writeText(exact.emoji);
      copy.textContent="コピーしました";
      setTimeout(()=>{copy.textContent="絵文字をコピー";},1400);
    }catch(_){status.textContent="コピーできませんでした。表示文字を選択してコピーしてください。";}
  });
  Promise.all([
    "../data/unicode18_emoji_rgi_sequences.json",
    "../data/unicode18_emoji_builder_names_ja.json"
  ].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json();})))
    .then(([data,names])=>{
      if(data.unicode_version!=="18.0" || data.entries?.length!==3972 ||
        !names.component_names || !names.flag_regions)throw Error("絵文字データを検証できませんでした");
      labels=names;
      entries=data.entries
        .filter(row=>row[1]!=="basic" && row[1]!=="tag")
        .map(row=>{
          const item={raw:row[0],group:row[1],name:row[2],cps:codepoints(row[0])};
          item.emoji=glyph(item.cps);
          item.category=categoryFor(item);
          item.path=buildPath(item);
          return item;
        });
      const paths=new Set(entries.map(e=>e.category+"|"+e.path.join("|")));
      if(entries.length!==2560 || paths.size!==2560 ||
        categories.some(([key])=>!entries.some(e=>e.category===key)))throw Error("絵文字の分類データに不整合があります");
      root.hidden=false;
      chooseCategory("person");
    })
    .catch(error=>{root.hidden=false;status.textContent="読み込みに失敗しました: "+error.message;});
})();
