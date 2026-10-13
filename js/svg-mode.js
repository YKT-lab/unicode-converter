/* Optional SVG compatibility renderer: true vector outlines, never SVG text. */
const svgModeToggle = document.getElementById("svgModeToggle");
const svgModeDescription = document.getElementById("svgModeDescription");
const svgModeProgress = document.getElementById("svgModeProgress");
let svgModeEnabled = false;
let svgPreviousCustomCount = null;
let svgParserPromise = null;
const svgFontCache = new Map();

function isSvgModeEnabled() { return svgModeEnabled; }
function updateSvgModeProgress(message) {
  if (!svgModeProgress) return;
  svgModeProgress.hidden = !message;
  svgModeProgress.textContent = message || "";
}
function loadSvgParser() {
  if (window.opentype && typeof window.opentype.parse === "function")
    return Promise.resolve(window.opentype);
  if (!svgParserPromise) {
    svgParserPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./js/opentype.min.js";
      script.onload = () => window.opentype?.parse
        ? resolve(window.opentype)
        : reject(new Error("SVG OpenType parser not available"));
      script.onerror = () => reject(new Error("SVG OpenType parser load failed"));
      document.head.appendChild(script);
    }).catch(error => {
      svgParserPromise = null;
      throw error;
    });
  }
  return svgParserPromise;
}
function svgFontPath(file) {
  // The deployment build produces TTF equivalents of the local WOFF2 fonts.
  return /\.woff2$/i.test(file)
    ? file.replace(/^fonts\//, "fonts-svg/").replace(/\.woff2$/i, ".ttf")
    : file;
}
async function loadSvgFont(file) {
  if (svgFontCache.has(file)) {
    const found = svgFontCache.get(file);
    svgFontCache.delete(file);
    svgFontCache.set(file, found);
    return found;
  }
  const job = (async () => {
    const parser = await loadSvgParser();
    const response = await fetch(new URL("./" + svgFontPath(file), document.baseURI));
    if (!response.ok) throw new Error("Failed to fetch vector font: " + response.status);
    return parser.parse(await response.arrayBuffer(), {lowMemory:true});
  })();
  svgFontCache.set(file, job);
  // Bound memory usage for older tablets.
  while (svgFontCache.size > 2) svgFontCache.delete(svgFontCache.keys().next().value);
  job.catch(() => {
    if (svgFontCache.get(file) === job) svgFontCache.delete(file);
  });
  return job;
}
function svgCandidateFontIds(index, codePoint) {
  const range = unicodeRangeLookup(index.ranges, codePoint);
  if (!range) return [];
  const covered = index.combinations[range[2]] || [];
  const script = unicodeRangeLookup(index.script_ranges, codePoint)?.[2];
  const preferred = index.script_font_candidates?.[script] || [];
  const valid = new Set(covered);
  const ordered = [];
  for (const id of preferred)
    if (valid.has(id) && !ordered.includes(id)) ordered.push(id);
  for (const id of covered)
    if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}
function makeSvgOutline(font, codePoint, character) {
  const glyphId = font.charToGlyphIndex(character);
  if (!glyphId) return null; // Do not draw the .notdef box.
  const glyph = font.glyphs.get(glyphId);
  if (!glyph) return null;
  const glyphPath = glyph.getPath(0, 0, font.unitsPerEm || 1000);
  const d = glyphPath.toPathData(2);
  if (!d) return null;
  const bounds = glyphPath.getBoundingBox();
  if (![bounds.x1,bounds.y1,bounds.x2,bounds.y2].every(Number.isFinite)) return null;
  const w = bounds.x2-bounds.x1, h = bounds.y2-bounds.y1;
  if (w<=0 || h<=0) return null;
  const pad = Math.max(w,h)*0.08;
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  const outline = document.createElementNS("http://www.w3.org/2000/svg","path");
  svg.setAttribute("viewBox",[
    bounds.x1-pad,bounds.y1-pad,w+2*pad,h+2*pad
  ].map(x=>Number(x.toFixed(2))).join(" "));
  svg.setAttribute("class","unicode-svg-outline");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","U+"+codePoint.toString(16).toUpperCase());
  svg.dataset.codePoint = codePoint.toString(16).toUpperCase();
  outline.setAttribute("d",d);
  outline.setAttribute("fill","currentColor");
  svg.appendChild(outline);
  return svg;
}
async function createSvgGlyph(codePoint, character) {
  const index = await getUnicodeCoverageIndex();
  if (!index) return {svg:null,reason:"SVGデータ未取得"};
  const candidates = svgCandidateFontIds(index,codePoint);
  if (!candidates.length) return {svg:null,reason:"SVG未対応"};
  let hadError = false;
  for (const id of candidates) {
    const file = index.font_families[id]?.file;
    if (!file) continue;
    try {
      const font = await loadSvgFont(file);
      const svg = makeSvgOutline(font,codePoint,character);
      if (svg) return {svg,reason:null};
    } catch (error) {
      hadError = true;
      console.warn("SVG glyph load failed:",file,error);
    }
  }
  return {svg:null,reason:hadError?"SVG読込失敗":"SVG未対応"};
}
function updateSvgRandomOptions() {
  const max = svgModeEnabled ? 100 : 500;
  const custom = document.getElementById("randomCustomCount");
  if (custom) {
    if (svgModeEnabled) {
      svgPreviousCustomCount = custom.value;
      if (Number(custom.value) > 100) custom.value = "100";
    } else if (svgPreviousCustomCount !== null) {
      if (custom.value === "100") custom.value = svgPreviousCustomCount;
      svgPreviousCustomCount = null;
    }
    custom.max = String(max);
  }
  const label = document.querySelector(".random-limit");
  if (label) label.textContent = "最大"+max;
}
document.getElementById("randomCustomCount")?.addEventListener("input", () => {
  if (svgModeEnabled) svgPreviousCustomCount = null;
});
svgModeToggle?.addEventListener("click", () => {
  svgModeEnabled = !svgModeEnabled;
  svgModeToggle.textContent = svgModeEnabled
    ? "通常表示に戻す" : "SVG表示に切り替える";
  svgModeToggle.setAttribute("aria-pressed",String(svgModeEnabled));
  svgModeDescription.hidden = !svgModeEnabled;
  updateSvgModeProgress("");
  updateSvgRandomOptions();
  hideUnicodeScope();
  if (lastUnicodeOutputSource==="single" && singleHexDigits.every(Boolean)) {
    convertUnicode("U+"+singleHexDigits.join(""));
  } else if (lastUnicodeOutputSource==="bulk" && unicodeInput.value.trim()) {
    convertUnicode();
  } else {
    unicodeRun++; // Cancel any outstanding render.
  }
});
