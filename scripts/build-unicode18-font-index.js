"use strict";

/*
 * Convert the verified local-font cmap audit into a compact, browser-readable
 * codepoint -> compact ranked lists of published font families.
 *
 * Source of truth: an actual fontkit characterSet read from local font files.
 * Never add research-only family names to this index.
 *
 * Run:
 *   node scripts/audit-unicode18-fonts.js
 *   node scripts/build-unicode18-font-index.js
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(fs.readFileSync(path.join(root, "data/unicode18_font_cmap_audit.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/unicode18_font_audit_manifest.json"), "utf8"));
const output = path.join(root, "data/unicode18_font_coverage_index.json");

if (audit.schema_version !== 1 || audit.unicode_version !== "18.0.0") {
  throw new Error("Unexpected audit format/version");
}
if (audit.summary.unicode18_assigned_codepoints !== 172808) {
  throw new Error("Unexpected Unicode 18.0 assigned count");
}
// The audit enumerates actual binaries under fonts/ recursively. No
// fixed 30-bit mask, manual manifest entry or full Unicode scan per font.
const actual = audit.font_sources.filter(x =>
  typeof x.file === "string" && x.file.startsWith("fonts/"));
const fonts = actual.map(f=>({
  family:f.family, file:f.file, sha256:f.file_sha256
}));
if (!fonts.length) throw new Error("No site font files audited");
if (fonts.length > 4096) throw new Error("Unexpected number of font files");

const uncovered = new Map();
for (let fontId=0; fontId<actual.length; fontId++) {
  const font = actual[fontId];
  for (const perScript of Object.values(font.per_script)) {
    for (const rg of perScript.codepoint_ranges) {
      const start=parseInt(rg.start,16),end=parseInt(rg.end,16);
      if (!Number.isInteger(start)||!Number.isInteger(end)||start>end||end>0x10FFFF)
        throw new Error("Invalid font cmap range "+font.file);
      for(let cp=start;cp<=end;cp++){
        let array=uncovered.get(cp);
        if(!array)uncovered.set(cp,array=[]);
        array.push(fontId);
      }
    }
  }
}

/*
 * Quality-first ranking for fonts that are actually mapped in cmap.
 * Never assign a font just from its script name: candidate enumeration is
 * already limited to the glyphs present in the corresponding binary.
 *
 * Prefer fonts with purpose-built outlines; use exact cmap data for eligibility.
 * CJK and Hentaigana need extra codepoint-specific rules because generic
 * "Hani" and "Hira" include many different typographic subrepertoires.
 */
const specializedByScript = {
  Cprt: "Noto Sans Cypriot",
  Dsrt: "Noto Sans Deseret",
  Gong: "Noto Sans Gunjala Gondi",
  Kthi: "Noto Sans Kaithi",
  Merc: "Noto Sans Meroitic",
  Mero: "Noto Sans Meroitic",
  Mroo: "Noto Sans Mro",
  Newa: "Noto Sans Newa",
  Nshu: "Noto Sans Nushu",
  Sgnw: "Noto Sans SignWriting",
  Sinh: "Noto Serif Sinhala",
  Todr: "Noto Serif Todhri"
};
const explicitPreferred = {
 Hani:["Noto Sans CJK JP","BabelStone Han","Plangothic P1","Plangothic P2"],
 Seal:["Kaiyuan Small Seal","LXGW Seal"],
 Egyp:["UniHieroglyphica","Egyptology Extended"],
 Xsux:["Noto Sans Cuneiform"],
 Lina:["Noto Sans Linear A"],
 Linb:["Noto Sans Linear B"],
 Hluw:["Noto Sans Anatolian Hieroglyphs"],
 Zyyy:["Noto Sans Symbols 2 Local","Noto Sans Symbols","Noto Sans Math","BabelStone Pseudographica","Noto Music"],
 Zinh:["Noto Sans Phonetics","Noto Sans Symbols 2 Local"],
 Latn:["Noto Sans Phonetics"],
 Tang:["Plangothic P2"],
 Kits:["Plangothic P2"]
};
function rankId(id, script, cp) {
 const f=fonts[id], family=f.family;
 // Prefer supplementary Han and specialized glyph outlines when available.
 if (script==="Hani" && cp>=0x20000) {
   if (family==="BabelStone Han") return -30;
   if (family==="Noto Sans CJK JP") return -20;
   if (family==="Plangothic P1") return -10;
   if (family==="Plangothic P2") return -9;
 }
 if (cp>=0x1B000 && cp<=0x1B12F && family==="Noto Serif Hentaigana")
   return -50;
 if (cp>=0x1CF00 && cp<=0x1CFCF &&
     family==="Noto Znamenny Musical Notation") return -50;
 if (specializedByScript[script]===family) return -40;
 const fixed=explicitPreferred[script]||[];
 const index=fixed.indexOf(family);
 if(index>=0) return index;
 const scriptSpecific=specialCodeToName.get(script);
 if(scriptSpecific && scriptSpecific.includes(family)) return 9;
 if (/Noto Sans CJK/i.test(family)) return 110;
 if (/Plangothic/i.test(family)) return 350;
 if (/Noto Sans Symbols 2/i.test(family)) return 450;
 if (/Noto Sans Symbols/i.test(family)) return 480;
 if (/Phonetics|Noto Music/i.test(family)) return 520;
 if (/fonts\/scripts\/|fonts\/ancient\/|fonts\/seal\/|fonts\/music\//.test(f.file))
   return 25;
 return 600;
}
const candidateCatalog=JSON.parse(fs.readFileSync(
 path.join(root,"data/unicode18_font_candidates_175.json"),"utf8"));
const specialCodeToName=new Map(candidateCatalog.scripts.map(s=>[
 s.script,s.font_candidates.map(c=>c.family)
]));
const lookupScript=new Map();
for(const sr of JSON.parse(fs.readFileSync(
path.join(root,"data/unicode18_all_ranges.json"),"utf8")).ranges){
  const start=parseInt(sr.start,16),end=parseInt(sr.end,16);
  for(let cp=start;cp<=end;cp++)if(uncovered.has(cp))lookupScript.set(cp,sr.script);
}

const combos=[[]], cache=new Map();
const ranges=[];
let covered=0, prior=-1, began=0;
function flush(end){
 if(prior>0) ranges.push([began,end,prior]);
}
for(let cp=0;cp<=0x110000;cp++){
 const available=uncovered.get(cp);
 let combo=0;
 if(available&&cp<0x110000){
   covered++;
   const script=lookupScript.get(cp);
   available.sort((a,b)=>rankId(a,script,cp)-rankId(b,script,cp)||a-b);
   const key=available.join(",");
   if(!cache.has(key)){
     cache.set(key,combos.length);
     combos.push([...available]);
   }
   combo=cache.get(key);
 }
 if(combo!==prior){
   if(prior!==-1)flush(cp-1);
   prior=combo;began=cp;
 }
}
if(covered!==audit.summary.cmap_covered_union)
 throw new Error("Cmap total mismatch; index "+covered+" audit "+audit.summary.cmap_covered_union);
const classification = JSON.parse(fs.readFileSync(path.join(root, "data/unicode18_all_ranges.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/unicode18_font_candidates_175.json"), "utf8"));
if (classification.unicode_version !== "18.0.0" || catalog.unicode_version !== "18.0.0" || catalog.scripts.length !== 175) {
  throw new Error("Unicode catalog mismatch");
}
const unencoded = new Set(["Cn", "Co", "Cs", "Cc"]);
const scriptRanges = [];
for (const r of classification.ranges) {
  if (unencoded.has(r.category)) continue;
  const start = parseInt(r.start, 16), end = parseInt(r.end, 16);
  const previous = scriptRanges[scriptRanges.length - 1];
  if (previous && previous[2] === r.script && previous[1] + 1 === start) {
    previous[1] = end;
  } else scriptRanges.push([start, end, r.script]);
}
const scriptGoogleCandidates = {};
for (const s of catalog.scripts) {
  const names = s.font_candidates.filter(candidate =>
    candidate.source_kind === "noto_fonts_family_directory" ||
    (candidate.source_kind === "repository_exists" && candidate.family.startsWith("Noto ")) ||
    (candidate.source_kind === "archived_source_repository" && candidate.family.startsWith("Noto "))
  ).map(candidate => candidate.family).filter(name => /^Noto (?:Sans|Serif) [\w \-]+$/.test(name));
  if (s.script === "Hani" || s.script === "Hira" || s.script === "Kana" || s.script === "Bopo")
    names.unshift("Noto Sans JP");
  if (s.script === "Hang") names.unshift("Noto Sans KR");
  if (names.length) scriptGoogleCandidates[s.script] = [...new Set(names)].slice(0, 3);
}

/*
 * Route characters by their Unicode 18 Script before consulting the exact
 * codepoint cmap. The 175 named Script values each receive a list of fonts
 * that are ACTUALLY installed and have at least one matching cmap entry.
 * Common (Zyyy) and Inherited (Zinh) are additional shared Script classes.
 *
 * The catalog is for family preferences/research, never proof of coverage.
 * At display time the individual codepoint still has to occur in the
 * compressed cmap combination, so a partial-script font cannot lie.
 */
const namedScriptCodes = catalog.scripts.map(item=>item.script);
const catalogPreference = new Map(catalog.scripts.map(item=>[
  item.script,item.font_candidates.map(font=>font.family)
]));
const scriptFontList = new Map(
  [...namedScriptCodes,"Zyyy","Zinh"].map(script=>[script,[]])
);
for(let id=0;id<actual.length;id++){
  for(const [script,coverage] of Object.entries(actual[id].per_script)){
    if(!coverage.codepoint_ranges.length)continue;
    if(!scriptFontList.has(script))scriptFontList.set(script,[]);
    const start=parseInt(coverage.codepoint_ranges[0].start,16);
    const preference=catalogPreference.get(script)||[];
    const catalogOrder=preference.indexOf(fonts[id].family);
    scriptFontList.get(script).push({
      id,
      rank:rankId(id,script,start),
      catalogOrder:catalogOrder<0?Number.MAX_SAFE_INTEGER:catalogOrder
    });
  }
}
const scriptFontCandidates={};
for(const [script,items] of scriptFontList){
  items.sort((a,b)=>a.rank-b.rank ||
    a.catalogOrder-b.catalogOrder || a.id-b.id);
  scriptFontCandidates[script]=items.map(item=>item.id);
}

const result = {
  schema_version: 2,
  unicode_version: audit.unicode_version,
  kind: "audited_site_local_font_cmap",
  disclaimer: "Actual font cmap mappings only: neither readable outlines nor colored emoji/shaping/browser rendering are guaranteed.",
  total_assigned_unicode18: 172808,
  covered_by_available_site_local_fonts: covered,
  font_families: fonts,
  combinations: combos,
  script_ranges: scriptRanges,
  script_font_candidates: scriptFontCandidates,
  script_google_candidates: scriptGoogleCandidates,
  ranges
};
fs.writeFileSync(output, JSON.stringify(result) + "\n", "utf8");
console.log("Generated", path.relative(root, output),
  "fonts:", fonts.length, "covered assigned codepoints:", covered, "ranges:", ranges.length);
