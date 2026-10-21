"use strict";
/*
 * Multi-font, pinned OFL release gate. No guessed approvals.
 * Every licensed source must match its pinned hash and family identity,
 * with exact publisher attribution and a preserved original license.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const fontkit=require("@cantoo/fontkit");
const ROOT=path.resolve(__dirname,"..");
const kv=Object.fromEntries(process.argv.slice(2).map(x=>{
  const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)throw Error("Invalid option "+x);return[m[1],m[2]];
}));
for(const key of ["bundle","metrics","index","policy","dest"])if(!kv[key])throw Error("Missing --"+key);
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const blob=x=>crypto.createHash("sha1").update(Buffer.from("blob "+x.length+"\0")).update(x).digest("hex");
const policy=read(kv.policy),index=read(kv.index),metrics=read(kv.metrics);
const input=path.resolve(kv.bundle),dest=path.resolve(kv.dest);
const manifest=read(path.join(input,"manifest.json"));
function insist(ok,why){if(!ok)throw Error("SVG OFL release refused: "+why)}
insist(policy.schema_version===1&&policy.unicode_version==="18.0.0"&&
  Array.isArray(policy.approved_fonts)&&policy.approved_fonts.length>0,"approved source registry");
insist(manifest.schema_version===2&&manifest.unicode_version==="18.0.0"&&
  manifest.bucket_size===128&&/^[0-9a-f]{16}$/.test(manifest.build_id)&&
  manifest.build_id===metrics.build_id&&Array.isArray(manifest.pages)&&manifest.pages.length,
  "invalid build manifest");
insist(metrics.mode==="approved-set"&&metrics.approved_only===true&&
  metrics.audit_matched===false&&metrics.local_font_files===index.font_families.length&&
  manifest.scanned_fonts===index.font_families.length&&
  Array.isArray(metrics.font_contributions)&&Array.isArray(manifest.source_fonts)&&
  Array.isArray(metrics.approved_fonts)&&
  Array.isArray(index.font_families)&&metrics.data_shards===manifest.pages.length,
  "invalid or nonapproved run");
const selected=policy.approved_fonts.map(f=>f.file).sort();
insist(new Set(selected).size===selected.length&&
  JSON.stringify(manifest.source_fonts)===JSON.stringify(selected)&&
  JSON.stringify(metrics.approved_fonts)===JSON.stringify(selected),
  "font allowlist mismatch");
const indexMap=new Map(index.font_families.map(f=>[f.file,f]));
const approved=new Map(),notices=[];
const licenseBytes=fs.readFileSync(path.join(ROOT,policy.license_text));
insist(policy.license_text==="docs/licenses/Noto-OFL-1.1.txt"&&
  blob(licenseBytes)===policy.license_git_blob_sha1&&
  licenseBytes.toString("utf8").includes("SIL OPEN FONT LICENSE"),
  "Noto official license not pinned");
const old=read(path.join(ROOT,"docs/svg-font-license-approvals.json"));
const previous=old.approvals?.find(x=>x.file==="fonts/han/WenJinMinchoP3-Regular.otf");
insist(previous&&previous.outline_redistribution_allowed===true,"existing WenJin approval missing");
let hasNoto=false,hasNotoEmoji=false,hasGenZui=false,hasWenjin=false;
for(const f of policy.approved_fonts){
  insist(f&&typeof f.file==="string"&&/^[a-f0-9]{64}$/.test(f.sha256)&&
    f.license==="SIL OFL 1.1"&&
    ["noto","noto-cjk","noto-emoji","genzui","wenjin","plangothic","unihieroglyphica","kaiyuan"].includes(f.license_family),"invalid approved entry");
  const ref=indexMap.get(f.file);
  insist(ref&&ref.sha256===f.sha256,"font audit mismatch "+f.file);
  insist(/^fonts\/[\w.-]+\/[\w.-]+\.(?:ttf|otf|woff2)$/i.test(f.file),"unsafe source file");
  const bytes=fs.readFileSync(path.join(ROOT,f.file));
  insist(hash(bytes)===f.sha256,"actual font hash drift "+f.file);
  const font=fontkit.openSync(path.join(ROOT,f.file));
  const family=String(font.familyName||"");
  const copyright=String(font.copyright||"").trim();
  insist(copyright.length>12&&copyright.length<60000,
    "missing copyright in font metadata "+f.file);
  let licenseName,licenseSource;
  if(f.license_family==="noto"||f.license_family==="noto-cjk"){
    insist(/^Noto(?:Sans|Serif|Naskh|Music|Color|Znamenny)[\w.-]*\.(?:otf|ttf)$/i.test(path.basename(f.file))&&
      /^Noto(?: Sans| Serif| Naskh| Music| Color| Znamenny)/i.test(family),
      "Noto identity mismatch "+f.file);
    if(f.license_family==="noto-cjk"){
      insist(/NotoSansCJK/i.test(f.file),"CJK family mismatch");
      insist(f.license_source==="https://github.com/adobe-fonts/source-han-super-otc",
        "CJK license provenance mismatch");
    } else {
      insist(!/NotoSansCJK/i.test(f.file)&&
        f.license_source==="https://github.com/notofonts/get-noto",
        "Noto OFL provenance mismatch");
    }
    licenseName="LICENSE-Noto-OFL-1.1.txt";
    licenseSource=f.license_source;
    hasNoto=true;
  }else if(f.license_family==="noto-emoji"){
    insist(f.file==="fonts/emoji/NotoColorEmoji-Regular.ttf"&&
      /^Noto Color Emoji$/i.test(family)&&
      f.license_file==="docs/licenses/NotoEmoji-OFL-1.1.txt"&&
      f.license_source==="https://github.com/googlefonts/noto-emoji",
      "Noto Emoji source/license identity mismatch "+f.file);
    const registered=policy.additional_licenses?.find(x=>x.file===f.license_file);
    insist(registered&&/^[a-f0-9]{40}$/.test(registered.blob_sha1),
      "Noto Emoji license is not pinned");
    const projectLicense=fs.readFileSync(path.join(ROOT,registered.file));
    insist(blob(projectLicense)===registered.blob_sha1&&
      /SIL OPEN FONT LICENSE/i.test(projectLicense.toString("utf8")),
      "Noto Emoji license invalid");
    licenseName=path.basename(f.license_file);
    licenseSource=f.license_source;
    hasNotoEmoji=true;
  }else if(f.license_family==="genzui"){
    insist(["fonts/east-asian/GenZuiSans-Regular.ttf",
      "fonts/east-asian/GenZuiSerif-Regular.ttf"].includes(f.file)&&
      /^Gen ?Zui (?:Sans|Serif)$/i.test(family)&&
      f.license_file==="docs/licenses/GenZui-OFL-1.1.txt"&&
      f.license_source==="https://github.com/mkpoli/GenZui",
      "GenZui source/license identity mismatch "+f.file);
    const registered=policy.additional_licenses?.find(x=>x.file===f.license_file);
    insist(registered&&/^[a-f0-9]{40}$/.test(registered.blob_sha1),
      "GenZui license is not pinned");
    const projectLicense=fs.readFileSync(path.join(ROOT,registered.file));
    insist(blob(projectLicense)===registered.blob_sha1&&
      /SIL OPEN FONT LICENSE/i.test(projectLicense.toString("utf8")),
      "GenZui license invalid");
    licenseName=path.basename(f.license_file);
    licenseSource=f.license_source;
    hasGenZui=true;
  }else if(f.license_family==="wenjin"){
    insist(f.file===previous.file&&
      f.sha256===previous.source_sha256&&
      f.license_source===previous.license_source&&
      blob(bytes)===previous.source_git_blob_sha1,
      "WenJin source mismatch");
    const prior=fs.readFileSync(path.join(ROOT,previous.license_file));
    insist(blob(prior)===previous.license_git_blob_sha1&&
      prior.toString("utf8").includes("SIL OPEN FONT LICENSE"),
      "WenJin full license mismatch");
    licenseName="LICENSE-WenJinMincho-OFL-1.1.md";
    licenseSource=previous.license_source;
    hasWenjin=true;
  }else{
    const allowed={
      plangothic:{
        names:["fonts/han/PlangothicP1-Regular.woff2","fonts/han/PlangothicP2-Regular.woff2"],
        families:/^Plangothic P[12]$/,
        license:"docs/licenses/Plangothic-OFL-1.1.txt",
        source:"https://github.com/Losketch/Plangothic-Project"
      },
      unihieroglyphica:{
        names:["fonts/hieroglyphs/UniHieroglyphica.ttf"],
        families:/^UniHieroglyphica$/,
        license:"docs/licenses/UniHieroglyphica-OFL-1.1.txt",
        source:"https://github.com/thesaurus-linguae-aegyptiae/unihieroglyphica"
      },
      kaiyuan:{
        names:["fonts/seal/KaiyuanSmallSeal-Regular.woff2"],
        families:/^Kaiyuan Small Seal$/,
        license:"docs/licenses/Kaiyuan-OFL-1.1.txt",
        source:"https://github.com/frankslin/kaiyuan-small-seal-font"
      }
    }[f.license_family];
    insist(allowed&&allowed.names.includes(f.file)&&allowed.families.test(family)&&
      f.license_file===allowed.license&&f.license_source===allowed.source,
      "project source/license identity mismatch "+f.file);
    const registered=policy.additional_licenses?.find(x=>x.file===f.license_file);
    insist(registered&&/^[a-f0-9]{40}$/.test(registered.blob_sha1),
      "project license is not pinned");
    const projectLicense=fs.readFileSync(path.join(ROOT,registered.file));
    insist(blob(projectLicense)===registered.blob_sha1&&
      /SIL Open Font License/i.test(projectLicense.toString("utf8")),
      "project license invalid "+f.file);
    licenseName=path.basename(f.license_file);
    licenseSource=f.license_source;
  }
  approved.set(f.file,f);
  notices.push({file:f.file,sha256:f.sha256,family,copyright,license:"SIL OFL 1.1",
    license_source:licenseSource,license_file:licenseName});
}
insist(hasNoto&&hasNotoEmoji&&hasGenZui&&hasWenjin,"expected Noto/Noto Emoji/GenZui/WenJin license families missing");
let totalContributed=0;
const contributed=new Set();
for(const src of metrics.font_contributions){
  insist(src&&approved.has(src.font)&&Number.isInteger(src.contributed)&&src.contributed>=0,
    "unexpected glyph contributing font");
  insist(!contributed.has(src.font),"duplicate font contribution");
  contributed.add(src.font);totalContributed+=src.contributed;
}
insist(Number.isInteger(metrics.generated_outline_count)&&
  metrics.generated_outline_count>0&&metrics.generated_outline_count===manifest.glyphs&&
  totalContributed===manifest.glyphs,
  "invalid generated outline count");
let previousEnd=-1,pageCount=0;
for(const p of manifest.pages){
  insist(p&&/^page-[0-9a-f]{4}(?:-[ab]+)?\.json$/i.test(p.file)&&
    Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.start>previousEnd&&
    p.end>=p.start&&p.start>=0&&p.end<=0x10ffff&&
    Number.isInteger(p.count)&&p.count>0&&Number.isInteger(p.bytes)&&p.bytes>0&&
    /^[0-9a-f]{64}$/.test(p.sha256),"invalid or overlapping shard");
  previousEnd=p.end;
  const body=fs.readFileSync(path.join(input,p.file));
  insist(body.length===p.bytes&&hash(body)===p.sha256,
    "shard integrity mismatch "+p.file);
  const data=JSON.parse(body.toString("utf8"));
  insist(data.v===1&&data.g&&typeof data.g==="object"&&
    !Array.isArray(data.g)&&Object.keys(data.g).length===p.count,
    "shard count mismatch");
  for(const name of Object.keys(data.g)){
    const point=parseInt(name,16);
    insist(/^[a-f0-9]{4,6}$/i.test(name)&&point>=p.start&&point<=p.end,
      "out-of-range code point");
  }
  pageCount+=p.count;
}
insist(pageCount===manifest.glyphs,"outline count mismatch");
fs.mkdirSync(dest,{recursive:true});
const output=path.join(dest,manifest.build_id);
insist(!fs.existsSync(output),"immutable build ID already staged");
const tmp=path.join(dest,".staging-"+manifest.build_id+"-"+process.pid);
fs.mkdirSync(tmp);
try{
  fs.copyFileSync(path.join(input,"manifest.json"),path.join(tmp,"manifest.json"));
  for(const p of manifest.pages)fs.copyFileSync(path.join(input,p.file),path.join(tmp,p.file));
  fs.writeFileSync(path.join(tmp,"LICENSE-Noto-OFL-1.1.txt"),licenseBytes);
  if(hasWenjin)fs.copyFileSync(path.join(ROOT,previous.license_file),
    path.join(tmp,"LICENSE-WenJinMincho-OFL-1.1.md"));
  for(const item of policy.additional_licenses||[]){
    insist(/^docs\/licenses\/[\w.-]+$/.test(item.file)&&
      /^[a-f0-9]{40}$/.test(item.blob_sha1),
      "invalid supplemental license name");
    const data=fs.readFileSync(path.join(ROOT,item.file));
    insist(blob(data)===item.blob_sha1,"supplemental license content changed");
    fs.writeFileSync(path.join(tmp,path.basename(item.file)),data);
  }
  const sourceFile={
    schema_version:1,build_id:manifest.build_id,unicode_version:"18.0.0",
    generated_outline_count:manifest.glyphs,
    licenses:["LICENSE-Noto-OFL-1.1.txt","LICENSE-WenJinMincho-OFL-1.1.md",...(policy.additional_licenses||[]).map(x=>path.basename(x.file))],
    sources:notices
  };
  fs.writeFileSync(path.join(tmp,"SOURCES.json"),JSON.stringify(sourceFile,null,2)+"\n");
  fs.writeFileSync(path.join(tmp,"FONT-COPYRIGHTS.txt"),
    notices.map(f=>f.file+"\n"+f.copyright+"\nLicense: "+f.license_file+
      "\nSource: "+f.license_source).join("\n\n")+"\n");
  fs.renameSync(tmp,output);
}catch(err){fs.rmSync(tmp,{recursive:true,force:true});throw err}
const active={schema_version:1,build_id:manifest.build_id,
  manifest:manifest.build_id+"/manifest.json"};
const pointer=path.join(dest,".active-"+process.pid+".json");
fs.writeFileSync(pointer,JSON.stringify(active,null,2)+"\n");
fs.renameSync(pointer,path.join(dest,"active.json"));
console.log("PUBLISHED PINNED OFL SVG SET",manifest.glyphs,"glyphs",manifest.pages.length,
  "shards",notices.length,"fonts");
