"use strict";
/* Unicode Emoji 18.0 RGI builder.
 * The official data defines every allowed result; UI only selects prefixes.
 */
(() => {
  const byId = id => document.getElementById(id);
  const root = byId("emoji-builder");
  if (!root) return;

  const picker = byId("emoji-builder-category");
  const categoryList = byId("emoji-builder-category-list");
  const categoryLabel = byId("emoji-builder-category-label");
  const slots = byId("emoji-builder-slots");
  const choices = byId("emoji-builder-choices");
  const output = byId("emoji-builder-output");
  const status = byId("emoji-builder-status");
  const search = byId("emoji-builder-search");
  const more = byId("emoji-builder-more");
  const codes = byId("emoji-builder-codes");
  const copy = byId("emoji-builder-copy");
  const count = byId("emoji-builder-count");

  const groups = [
    ["all", "すべての組み合わせ"],
    ["role", "人物・職業"],
    ["family", "家族・カップル"],
    ["gendered", "人物・動作"],
    ["hair", "髪型"],
    ["modifier", "肌の色"],
    ["flag", "国旗"],
    ["keycap", "キーキャップ"],
    ["other", "その他の接合"]
  ];
  const groupNames = Object.fromEntries(groups);
  const toneLabels = {
    0x1F3FB: "明るい肌",
    0x1F3FC: "やや明るい肌",
    0x1F3FD: "中間の肌",
    0x1F3FE: "やや濃い肌",
    0x1F3FF: "濃い肌"
  };
  const familiarNames = {
    0x1F9D1: "人物", 0x1F468: "男性", 0x1F469: "女性",
    0x1F466: "男の子", 0x1F467: "女の子", 0x1F476: "赤ちゃん",
    0x1F4BB: "パソコン", 0x1F52C: "顕微鏡", 0x1F680: "ロケット",
    0x1F373: "料理", 0x1F3EB: "学校", 0x2695: "医療",
    0x2696: "法律", 0x1F33E: "農業", 0x1F527: "工具",
    0x1F3A8: "芸術", 0x1F692: "消防車", 0x1F691: "救急車",
    0x2640: "女性", 0x2642: "男性", 0x27A1: "右向き",
    0x1F9B0: "赤毛", 0x1F9B1: "巻き毛", 0x1F9B2: "坊主頭", 0x1F9B3: "白髪",
    0x2764: "ハート", 0x1F48B: "キス", 0x1F9AF: "白杖",
    0x1F9BD: "車いす", 0x1F9BC: "電動車いす", 0x1F9B1: "巻き毛"
  };
  const hex = cp => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  const character = cps => String.fromCodePoint(...cps);
  const codePoints = raw => raw.split(" ").map(s => parseInt(s, 16));
  const toHexLine = cps => cps.map(hex).join(" + ");
  const isTone = cp => cp >= 0x1F3FB && cp <= 0x1F3FF;
  let nameData = {component_names:{},flag_regions:{}};
  let displayNames = null;
  try {
    if (Intl.DisplayNames) displayNames = new Intl.DisplayNames(["ja"], {type:"region"});
  } catch (_) { /* Some browsers do not implement Intl.DisplayNames. */ }

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = content;
    return element;
  }
  function tokenize(entry) {
    const cps = entry.cps;
    // Only two-letter Regional Indicator country flags belong in this builder.
    // Unicode tag-based subdivision flags remain documented in the source dataset.
    if (entry.group === "flag") return ["FLAG_COUNTRY",entry.cps[0].toString(16).toUpperCase(),entry.cps[1].toString(16).toUpperCase()];
    // UI presents the actual combining enclosing keycap, not the completed emoji.
    if (entry.group === "keycap") return ["KEYCAP_MARK",entry.raw];
    // Ignore joining controls in the UI but preserve them in the final result.
    // Skin tones become separate selectable attributes, including on both people.
    const chunks = [];
    let part = [];
    const push = () => { if (part.length) chunks.push(part); part = []; };
    for (const cp of cps) {
      if (cp === 0x200D) push();
      else if (isTone(cp)) { push(); chunks.push([cp]); }
      else if (cp === 0xFE0F || cp === 0x20E3) {
        if (part.length) part.push(cp);
      } else {
        push();
        part.push(cp);
      }
    }
    push();
    return chunks.map(chunk => chunk.map(cp => cp.toString(16).toUpperCase()).join(" "));
  }
  function flagName(entry) {
    if (entry.group !== "flag") return null;
    const [a,b] = entry.cps;
    if (a < 0x1F1E6 || a > 0x1F1FF || b < 0x1F1E6 || b > 0x1F1FF) return null;
    const region = String.fromCharCode(65+a-0x1F1E6,65+b-0x1F1E6);
    try { return nameData.flag_regions[region] || displayNames?.of(region) || region; }
    catch (_) { return region; }
  }
  function tokenInfo(token, sample) {
    if (token === "FLAG_COUNTRY") return {glyph:"🇦 + 🇧",label:"国旗",parts:true};
    if (sample.group === "flag" && /^1F1(?:E[6-9A-F]|F[0-9A-F])$/.test(token)) {
      const cp = parseInt(token,16);
      const letter = String.fromCharCode(cp - 0x1F1E6 + 65);
      return {glyph:String.fromCodePoint(cp),label:letter,searchText:letter+" "+sample.name};
    }
    if (token === "KEYCAP_MARK") return {glyph:"\u20E3",label:"キーキャップ結合記号",combining:true};
    const cps = codePoints(token);
    const glyph = character(cps);
    if (sample.group === "flag") {
      return {
        glyph: sample.cps.map(cp=>String.fromCodePoint(cp)).join(" + "),
        parts: true,
        label: flagName(sample) || sample.name,
        searchText: sample.name
      };
    }
    if (sample.group === "keycap") {
      const n=sample.cps[0];
      const name=n===0x23?"シャープ":n===0x2A?"アスタリスク":n>=0x30&&n<=0x39?String.fromCharCode(n):"キーキャップ";
      return {glyph: String.fromCodePoint(n),label:name,searchText:sample.name};
    }
    if (cps.length === 1 && isTone(cps[0])) {
      return {glyph:"●", label:toneLabels[cps[0]], tone:cps[0]};
    }
    const label = nameData.component_names[cps[0]?.toString(16).toUpperCase()] || familiarNames[cps[0]] || sample.name || "絵文字";
    return {glyph, label, searchText:sample.name};
  }

  let all = [], current = [], selected = [], active = 0, shown = 36;
  let group = "all";
  const startsWith = (array, prefix) => prefix.every((part, i) => array[i] === part);
  const candidates = prefix => current.filter(entry => startsWith(entry.tokens, prefix));
  function stepLabel(index, options) {
    if (group === "flag") return index === 0 ? "国旗" : index === 1 ? "1文字目" : "2文字目";
    if (group === "keycap") return index === 0 ? "結合記号" : "数字・記号";
    if (selected[0] === "FLAG_COUNTRY") return index === 1 ? "1文字目" : "2文字目";
    if (index === 1 && selected[0] === "KEYCAP_MARK") return "数字・記号";
    if (group === "modifier" && index === 0) return "基本の絵文字";
    if (options.length && options.every(token => {
      const parts = token.split(" ");
      return parts.length === 1 && isTone(parseInt(parts[0], 16));
    })) return "肌の色";
    if (options.length && options.every(token => ["2640 FE0F","2642 FE0F"].includes(token))) return "性別";
    if (group === "hair" && index > 0) return "髪型";
    if (group === "family") return "人物・素材 " + (index+1);
    if (index === 0) return "基本の絵文字";
    if (group === "role") return "職業・属性";
    return "追加する素材";
  }
  function buildOptions(prefix, index) {
    const map = new Map();
    for (const entry of candidates(prefix)) {
      const token = entry.tokens[index];
      if (!token) continue;
      if (!map.has(token)) {
        map.set(token, {token, sample:entry, names:[entry.name]});
      } else {
        map.get(token).names.push(entry.name);
      }
    }
    return [...map.values()];
  }
  function chooseCategory(next) {
    group = next;
    selected = [];
    active = 0;
    shown = 36;
    search.value = "";
    current = all.filter(entry => group === "all" ? entry.group !== "basic" : entry.group === group);
    categoryLabel.textContent = groupNames[group];
    picker.open = false;
    render();
  }
  function render() {
    const matching = candidates(selected);
    if (!matching.length) {
      // Defensive recovery; no recursive rendering on missing data.
      selected = [];
      active = 0;
    }
    const valid = candidates(selected);
    const finished = valid.find(entry => entry.tokens.length === selected.length) || null;
    const extendable = valid.some(entry => entry.tokens.length > selected.length);
    const size = selected.length + (extendable ? 1 : 0);
    if (active >= size) active = Math.max(0,size-1);

    slots.replaceChildren();
    for (let i=0; i<size; i++) {
      const prefix = selected.slice(0,i);
      const options = buildOptions(prefix,i).map(x=>x.token);
      const label = stepLabel(i, options);
      const token = selected[i];
      const button = node("button","emoji-builder-slot"+(i===active?" active":""),"");
      button.type = "button";
      button.setAttribute("aria-label", label + (token ? "、変更" : "、選択"));
      const sample = buildOptions(prefix,i).find(x=>x.token===token)?.sample;
      const info = token ? tokenInfo(token,sample) : null;
      const glyph = node("span","emoji-builder-slot-glyph",info?info.glyph:"＋");
      if (info?.tone) glyph.classList.add("emoji-builder-tone-" + info.tone.toString(16));
      if (info?.combining) glyph.classList.add("emoji-builder-combining-mark");
      if (info?.parts) glyph.classList.add("emoji-builder-flag-parts");
      button.append(glyph,node("span","emoji-builder-slot-label",label));
      button.addEventListener("click",()=>{active=i;shown=36;search.value="";render();});
      slots.append(button);
      if(i<size-1)slots.append(node("span","emoji-builder-plus","+"));
    }
    output.textContent = finished ? finished.glyph : "—";
    codes.textContent = finished ? toHexLine(finished.cps) : "";
    copy.disabled = !finished;
    status.textContent = finished ? "完成：Unicode公式の絵文字" : "左から素材を選んでください";
    count.textContent = valid.length + "種類の完成候補";
    renderChoices();
  }
  function renderChoices() {
    choices.replaceChildren();
    const prefix = selected.slice(0,active);
    const options = buildOptions(prefix,active);
    const query = search.value.trim().toLocaleLowerCase("ja");
    const visible = options.filter(item=>{
      const info = tokenInfo(item.token,item.sample);
      return !query || info.label.toLocaleLowerCase("ja").includes(query)
        || (info.searchText || "").toLocaleLowerCase().includes(query)
        || item.token.toLowerCase().includes(query)
        || info.glyph.includes(query)
        || item.names.some(name=>name.toLocaleLowerCase().includes(query));
    });
    for(const item of visible.slice(0,shown)) {
      const info = tokenInfo(item.token,item.sample);
      const button = node("button","emoji-builder-option","");
      button.type = "button";
      button.title = info.label + (item.sample.name ? " / "+item.sample.name : "");
      button.setAttribute("aria-label",info.label);
      const glyph = node("span","emoji-builder-option-glyph",info.glyph);
      if(info.tone)glyph.classList.add("emoji-builder-tone-"+info.tone.toString(16));
      if(info.combining)glyph.classList.add("emoji-builder-combining-mark");
      if(info.parts)glyph.classList.add("emoji-builder-flag-parts");
      button.append(glyph,node("span","emoji-builder-option-name",info.label));
      button.addEventListener("click",()=>{
        selected = [...prefix,item.token];
        const following = candidates(selected).some(entry=>entry.tokens.length>selected.length);
        active = following ? selected.length : Math.max(0,selected.length-1);
        shown=36;
        search.value="";
        render();
      });
      choices.append(button);
    }
    count.textContent = candidates(selected).length + "種類の完成候補 / 選べる素材 " + visible.length + "件";
    more.hidden = shown>=visible.length;
    if(!visible.length)choices.append(node("p","page-muted","候補がありません。検索語や前の□を変更してください。"));
  }
  categoryList.replaceChildren();
  for(const [value,label] of groups) {
    const button = node("button","emoji-builder-category-option",label);
    button.type="button";
    button.addEventListener("click",()=>chooseCategory(value));
    categoryList.append(button);
  }
  document.addEventListener("click",event=>{
    if(picker.open && !picker.contains(event.target))picker.open=false;
  });
  picker.addEventListener("keydown",event=>{
    if(event.key==="Escape"){picker.open=false;picker.querySelector("summary")?.focus();}
  });
  search.addEventListener("input",()=>{shown=36;renderChoices();});
  more.addEventListener("click",()=>{shown+=72;renderChoices();});
  copy.addEventListener("click",async()=>{
    const entry=candidates(selected).find(x=>x.tokens.length===selected.length);
    if(!entry)return;
    try {
      await navigator.clipboard.writeText(entry.glyph);
      const original="絵文字をコピー";
      copy.textContent="コピーしました";
      setTimeout(()=>{copy.textContent=original;},1400);
    }catch(_) {status.textContent="コピーできませんでした。生成結果を選択してコピーしてください。";}
  });
  Promise.all(["../data/unicode18_emoji_rgi_sequences.json","../data/unicode18_emoji_builder_names_ja.json"].map(url=>fetch(url).then(response=>{if(!response.ok)throw Error("HTTP "+response.status);return response.json();})))
    .then(([data,labels])=>{
      if (!labels.component_names || !labels.flag_regions) throw Error("日本語名が読み込めません");
      nameData=labels;
      if(data.unicode_version!=="18.0" || data.count!==3972 ||
         !Array.isArray(data.entries) || data.entries.length!==3972) {
        throw Error("Unicode 18.0の公式データを検証できませんでした");
      }
      // Preserve the official 3,972-entry source file. Exclude only the three
      // tag-based subdivision flags from the interactive composition builder.
      all=data.entries.filter(row=>row[1]!=="tag").map(row=>{
        const cps=codePoints(row[0]);
        const entry={raw:row[0],group:row[1],name:row[2],cps,glyph:character(cps)};
        entry.tokens=tokenize(entry);
        return entry;
      });
      root.hidden=false;
      chooseCategory("all");
    })
    .catch(error=>{
      root.hidden=false;
      status.textContent="絵文字データを読み込めませんでした: "+error.message;
    });
})();
