"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const {formatHanStructure,getHanDailyFacts}=require("../js/han-structure.js");
const water={total:"13",radicalStroke:"85.10"};
assert.equal(formatHanStructure(water),"部首は「水」で、部首を除く画数は10画、総画数は13画です。");
assert.equal(formatHanStructure({radicalStroke:"85.10"}),"部首は「水」で、部首を除く画数は10画です。");
assert.equal(formatHanStructure({total:"5",radicalStroke:"85.10"}),"部首は「水」で、部首を除く画数は10画です。");
assert.equal(formatHanStructure({total:"5",radicalStroke:"85.10"}).includes("総画数"),false);
assert.match(formatHanStructure({total:"8",radicalStroke:"1'.7"}),/部首は「一」系/);
for(const radicalStroke of ["",null,"0.10","215.1","abc","85.70","85.10 99.2",{}]){
  assert.equal(formatHanStructure({total:"13",radicalStroke}),"",String(radicalStroke));
}
assert.equal(formatHanStructure(null),"");
const info={descriptionSchema:4,summary:"汎用的な紹介文",han:{strokes:water},
 sections:{meaning:"岸、砂州、浅瀬、急流などを意味します。",structure:"AIが作った不正確な構造説明"}};
const facts=getHanDailyFacts(info);
assert.deepEqual(facts.map(x=>x.label),["意味","部首・画数"]);
assert.equal(facts[0].text,info.sections.meaning);
assert.equal(facts[1].text,formatHanStructure(water));
assert(!facts.some(x=>x.text.includes("汎用的な紹介文")));
assert(!facts.some(x=>x.text.includes("不正確な構造説明")));
assert.equal(getHanDailyFacts({...info,sections:{meaning:"",structure:"何か"}}),null);
assert.equal(getHanDailyFacts({...info,han:{strokes:{}}}),null);
assert.equal(getHanDailyFacts({sections:info.sections}),null);
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const helper=html.indexOf('src="./js/han-structure.js?');
const daily=html.indexOf('src="./js/daily.js?');
assert(helper>0&&helper<daily,"Han parser must load before the daily card");
const client=fs.readFileSync(path.join(root,"js/daily.js"),"utf8");
assert(client.includes('getHanDailyFacts(info)'),"Daily UI must use reviewed two fact formatter");
assert(client.includes('dailySummary.parentElement.hidden = !!hanFacts'),"Suppress filler summary for valid Han");
assert(client.includes('dailySummary.parentElement.hidden = false'),"Reset hidden state");
const json=JSON.parse(fs.readFileSync(path.join(root,"daily.json"),"utf8"));
const current=json.current?.codePoint==="6EE9"?json.current:json.next?.codePoint==="6EE9"?json.next:null;
if(current){
 const v=getHanDailyFacts(current.info);
 assert(v&&v.length===2&&v[1].text.includes("13画"));
}
console.log("PASS: real Unihan radical/strokes and meaningful two-field Han card; uncertain data falls back");
