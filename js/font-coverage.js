/*
 * Unicode 18.0 verified-codepoint font selector.
 *
 * The index is produced by fontkit on GitHub Actions from actual font files.
 * Exact cmap membership is checked BEFORE fetching a font. FontFace keeps
 * downloads lazy and works without installed fonts on Windows, iOS, etc.
 *
 * Each source file has its own private CSS family to avoid collisions.
 */
const unicodeCoverageState={
  promise:null,
  data:null,
  loads:new Map(),
  remoteStyles:new Map()
};
function getUnicodeCoverageIndex(){
  if(!unicodeCoverageState.promise){
    unicodeCoverageState.promise=fetch("./data/unicode18_font_coverage_index.json",{cache:"no-cache"})
      .then(r=>{
        if(!r.ok)throw Error("Unicode cmap index not found");
        return r.json();
      })
      .then(data=>{
        if(data.schema_version!==2||data.unicode_version!=="18.0.0"||
          !Array.isArray(data.font_families)||!Array.isArray(data.combinations)||
          !Array.isArray(data.ranges)||!Array.isArray(data.script_ranges)||
          (data.script_font_candidates!==undefined&&
           (!data.script_font_candidates||typeof data.script_font_candidates!=="object")))
          throw Error("Unsupported Unicode font index version");
        unicodeCoverageState.data=data;
        return data;
      })
      .catch(error=>{
        console.warn("Using original fonts because coverage index unavailable:",error);
        return null;
      });
  }
  return unicodeCoverageState.promise;
}
function unicodeRangeLookup(ranges,cp){
  let lo=0,hi=ranges.length-1;
  while(lo<=hi){
    const m=(lo+hi)>>>1,r=ranges[m];
    if(cp<r[0])hi=m-1;
    else if(cp>r[1])lo=m+1;
    else return r;
  }
  return null;
}
/* Single shared fetch per file, even when hundreds of input characters
   use the same new Unicode script font. */
function loadAuditedUnicodeFont(id,entry){
  if(unicodeCoverageState.loads.has(id))return unicodeCoverageState.loads.get(id);
  const request=(async()=>{
    if(!document.fonts||typeof FontFace!=="function"||
       !entry||!/^fonts\/[a-zA-Z0-9_./-]+\.(?:ttf|otf|woff2?)$/i.test(entry.file))return null;
    const name="Unicode Site "+id;
    const url=new URL("./"+entry.file,document.baseURI).href;
    const font=new FontFace(name,'url("'+url+'")',{style:"normal",weight:"400"});
    try{
      await font.load();
      document.fonts.add(font);
      if(typeof glyphAnalysisCache!=="undefined")glyphAnalysisCache.clear();
      return name;
    }catch(error){
      console.warn("Site font unavailable:",entry.file,error);
      return null;
    }
  })();
  unicodeCoverageState.loads.set(id,request);
  return request;
}
async function ensureUnicodeGoogleFont(family){
  if(!/^Noto (?:Sans|Serif) [\w \-]+$/.test(family))return false;
  let p=unicodeCoverageState.remoteStyles.get(family);
  if(!p){
    p=new Promise(resolve=>{
      const el=document.createElement("link");
      el.rel="stylesheet";
      el.href="https://fonts.googleapis.com/css2?family="+encodeURIComponent(family).replace(/%20/g,"+")+"&display=swap";
      el.onload=()=>resolve(true);
      el.onerror=()=>resolve(false);
      document.head.appendChild(el);
    });
    unicodeCoverageState.remoteStyles.set(family,p);
  }
  return Promise.race([p,sleep(6500).then(()=>false)]);
}
// These eight exact glyphs have been checked with fontkit for real, non-.notdef
// outlines. Canvas's fallback-font pixel heuristics are unreliable on Safari.
const verifiedSpecialistGlyphFiles = new Map([
  [0x109EB, "fonts/ancient/NotoSansMeroitic-Regular.ttf"],
  [0x1081F, "fonts/ancient/NotoSansCypriot-Regular.ttf"],
  [0x11D6B, "fonts/scripts/NotoSansGunjalaGondi-Regular.ttf"],
  [0x110C0, "fonts/scripts/NotoSansKaithi-Regular.ttf"],
  [0x16A51, "fonts/scripts/NotoSansMro-Regular.ttf"],
  [0x11400, "fonts/scripts/NotoSansNewa-Regular.ttf"],
  [0x111E5, "fonts/scripts/NotoSerifSinhala-Regular.ttf"],
  [0x10408, "fonts/scripts/NotoSansDeseret-Regular.ttf"]
]);
function isVerifiedSpecialistSelection(codePoint, loadedFontName) {
  if (typeof loadedFontName !== "string") return false;
  const exactFile = verifiedSpecialistGlyphFiles.get(codePoint);
  if (!exactFile) return false;
  const match = /^Unicode Site ([0-9]+)$/.exec(loadedFontName);
  if (!match) return false;
  const index = Number(match[1]);
  return unicodeCoverageState.data?.font_families?.[index]?.file === exactFile;
}
function testUnicodeGlyph(character,family){
  const name='"'+family.replace(/"/g,"")+'", sans-serif';
  return !isRenderedBlank(character,name) && !looksLikeMissingGlyph(character,name);
}
/*
 * The candidate list is ranked by Unicode Script and local font
 * specialization at build time. Try only fonts whose real cmap includes cp.
 *
 * For common Japanese characters, preserve web Noto Sans JP's original
 * appearance; avoid downloading a 16 MB CJK font unnecessarily.
 */
async function selectUnicodeFont(codePoint,character){
  if(codePoint>=0x0020&&codePoint<=0x007E)return null;
  // The eight audited specialist glyphs must not lose their font because
  // the large coverage index took over five seconds to download on mobile.
  const data=verifiedSpecialistGlyphFiles.has(codePoint)
    ? await getUnicodeCoverageIndex()
    : await Promise.race([getUnicodeCoverageIndex(),sleep(5000).then(()=>null)]);
  const checked=new Set();
  const tryLegacy=async(family,remote=false)=>{
    if(!family||checked.has(family))return null;
    checked.add(family);
    if(remote&&!(await ensureUnicodeGoogleFont(family)))return null;
    if(!document.fonts)return null;
    try{
      const faces=await document.fonts.load('100px "'+family.replace(/"/g,"")+'"',character);
      if(!faces.length)return null;
      if(typeof glyphAnalysisCache!=="undefined")glyphAnalysisCache.clear();
      return testUnicodeGlyph(character,family)?family:null;
    }catch(error){console.warn("Font fallback failed",family,error);return null}
  };
  const cpJapanese=(codePoint>=0x3040&&codePoint<=0x30FF)||
    (codePoint>=0x3400&&codePoint<=0x9FFF);
  if(cpJapanese){
    const japanese=await tryLegacy("Noto Sans JP");
    if(japanese)return japanese;
  }
  if(data){
    // First classify this codepoint into its Unicode Script (175 named
    // scripts plus the Common/Inherited shared classes).
    const scriptRange=unicodeRangeLookup(data.script_ranges,codePoint);
    const script=scriptRange?.[2];
    // The exact cmap index is authoritative: a script-level association
    // never means a font supports every single character of that script.
    const entry=unicodeRangeLookup(data.ranges,codePoint);
    if(entry){
      const coveredIds=data.combinations[entry[2]]||[];
      const covered=new Set(coveredIds);
      const scriptIds=data.script_font_candidates?.[script]||[];
      const selected=new Set();
      // Try the matching script's actual, ordered local fonts first.
      for(const id of scriptIds){
        if(!covered.has(id)||selected.has(id))continue;
        selected.add(id);
        const face=await loadAuditedUnicodeFont(id,data.font_families[id]);
        if(face&&(isVerifiedSpecialistSelection(codePoint,face)||testUnicodeGlyph(character,face)))return face;
      }
      // Backward compatibility and coverage for fonts that belong to more
      // than one script, or when the deployed index has not been rebuilt yet.
      for(const id of coveredIds){
        if(selected.has(id))continue;
        const face=await loadAuditedUnicodeFont(id,data.font_families[id]);
        if(face&&(isVerifiedSpecialistSelection(codePoint,face)||testUnicodeGlyph(character,face)))return face;
      }
    }
  }
  // Preexisting CSS/web-font fallback remains available for older glyphs.
  for(const family of getWebFontNames(codePoint)){
    const face=await tryLegacy(family);
    if(face)return face;
  }
  // Unicode 18 Script -> publicly hosted Noto project lookup is secondary.
  // Source directories are leads only, not verified cmap coverage.
  if(data){
    const sr=unicodeRangeLookup(data.script_ranges,codePoint);
    if(sr&&sr[2]!=="Zyyy"&&sr[2]!=="Zinh"&&sr[2]!=="Zzzz"){
      for(const family of (data.script_google_candidates[sr[2]]||[]).slice(0,2)){
        const face=await tryLegacy(family,true);
        if(face)return face;
      }
    }
  }
  return null;
}
getUnicodeCoverageIndex();
