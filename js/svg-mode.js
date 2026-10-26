/* Optional SVG compatibility renderer: true vector outlines, never SVG text. */
// Capture while this deferred script is executing: currentScript is null later
// in click handlers. Keep the project prefix even on nested/unslashed URLs.
const svgModeScriptUrl = document.currentScript?.src ||
  Array.from(document.scripts || []).find(script =>
    /\/js\/svg-mode\.js(?:[?#]|$)/.test(script.src || ""))?.src;
const svgDataBaseUrl = svgModeScriptUrl
  ? new URL("../svg-data/", svgModeScriptUrl).href : "./svg-data/";
const browserFontModeToggle = document.getElementById("browserFontModeToggle");
const svgModeToggle = document.getElementById("svgModeToggle");
const svgModeDescription = document.getElementById("svgModeDescription");
const svgModeProgress = document.getElementById("svgModeProgress");
const svgModeCurrent = document.getElementById("svgModeCurrent");
const SVG_MODE_SESSION_KEY = "unicode-converter-svg-display";
const DISPLAY_MODES = new Set(["normal", "svg"]);
function readUnicodeDisplayModePreference() {
  try {
    const stored = window.sessionStorage?.getItem(SVG_MODE_SESSION_KEY);
    return DISPLAY_MODES.has(stored) ? stored : "normal";
  } catch (_error) {
    return "normal";
  }
}
function saveUnicodeDisplayModePreference() {
  try {
    if (!window.sessionStorage) return false;
    window.sessionStorage.setItem(SVG_MODE_SESSION_KEY, unicodeDisplayMode);
    return true;
  } catch (_error) {
    return false;
  }
}
let unicodeDisplayMode = readUnicodeDisplayModePreference();
let svgModeEnabled = unicodeDisplayMode === "svg";
let svgPreviousCustomCount = null;
let svgParserPromise = null;
const svgFontCache = new Map();

function isBrowserFontModeEnabled() {
  return Boolean(window.UnicodeSiteDisplay?.isDeviceFontModeEnabled?.());
}
function isSvgModeEnabled() {
  return unicodeDisplayMode === "svg" && !isBrowserFontModeEnabled();
}
function getUnicodeDisplayMode() {
  return isBrowserFontModeEnabled() ? "browser" : unicodeDisplayMode;
}
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
  const em = font.unitsPerEm, ascent = font.ascender, descent = font.descender;
  if (![em,ascent,descent].every(Number.isFinite) || em <= 0 || ascent <= descent) return null;
  const glyphId = font.charToGlyphIndex(character);
  if (!glyphId) return null; // Do not draw the .notdef box.
  const glyph = font.glyphs.get(glyphId);
  if (!glyph) return null;
  const advance = glyph.advanceWidth;
  if (!Number.isFinite(advance) || advance < 0) return null;
  // OpenType's getPath already inverts Y. Using the font's own em as its
  // fontSize keeps native units; never fit a glyph's ink to an equal box.
  const glyphPath = glyph.getPath(0, 0, em);
  const d = glyphPath.toPathData(2);
  if (!d) return null;
  const bounds = glyphPath.getBoundingBox();
  if (![bounds.x1,bounds.y1,bounds.x2,bounds.y2].every(Number.isFinite)) return null;
  const w = bounds.x2-bounds.x1, h = bounds.y2-bounds.y1;
  if (w<=0 || h<=0) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  const outline = document.createElementNS("http://www.w3.org/2000/svg","path");
  svg.setAttribute("viewBox",[0,-ascent,advance||em,ascent-descent].join(" "));
  svg.setAttribute("preserveAspectRatio","xMinYMin meet");
  svg.setAttribute("style","width:"+(advance/em||1)+"em;height:"+
    ((ascent-descent)/em)+"em;vertical-align:"+(descent/em)+"em;overflow:visible");
  svg.setAttribute("data-font-metrics","em");
  svg.setAttribute("data-advance-em",String(advance/em));
  svg.setAttribute("data-font-weight","400");
  svg.setAttribute("class","unicode-svg-outline");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","U+"+codePoint.toString(16).toUpperCase());
  svg.dataset.codePoint = codePoint.toString(16).toUpperCase();
  outline.setAttribute("d",d);
  outline.setAttribute("fill","currentColor");
  svg.appendChild(outline);
  return svg;
}
/* License-approved precomputed release is authoritative in SVG mode. */
const SVG_PRECOMPUTED_RELEASE_ENABLED = true;
let precomputedSvgClient = null;
function getPrecomputedSvgClient() {
  if (!SVG_PRECOMPUTED_RELEASE_ENABLED || !window.UnicodePrecomputedSvg) return null;
  if (!precomputedSvgClient) {
    precomputedSvgClient = window.UnicodePrecomputedSvg.createClient({
      baseUrl: svgDataBaseUrl, documentObj: document,
      maxParallel: 4, maxCache: 6, retries: 1
    });
  }
  return precomputedSvgClient;
}
async function createSvgGlyph(codePoint, character) {
  // Deterministic production renderer: use only precomputed, license-approved,
  // SHA-256-verified SVG outlines. Browser-side font parsing is intentionally
  // not used as a fallback because it can behave differently across devices.
  const client = getPrecomputedSvgClient();
  if (!client) return {svg:null,reason:"SVGデータローダー未取得",code:"loader",stage:"loader"};
  return client.getGlyph(codePoint);
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
function refreshSvgModePresentation() {
  const deviceMode = isBrowserFontModeEnabled();
  svgModeEnabled = unicodeDisplayMode === "svg" && !deviceMode;
  if (browserFontModeToggle)
    browserFontModeToggle.setAttribute("aria-pressed", String(deviceMode));
  if (svgModeToggle) {
    svgModeToggle.textContent = svgModeEnabled
      ? "通常表示に戻す" : "SVG表示に切り替える";
    svgModeToggle.setAttribute("aria-pressed", String(svgModeEnabled));
  }
  if (svgModeCurrent) {
    const label = deviceMode ? "端末フォント"
      : svgModeEnabled ? "SVG表示" : "通常表示";
    svgModeCurrent.textContent = "現在：" + label;
  }
}
function hasUnicodeInputForModeSwitch() {
  const singleEntered = typeof singleHexDigits !== "undefined"
    && singleHexDigits.some(Boolean);
  return Boolean(
    charInput?.value.trim() ||
    unicodeInput?.value.trim() ||
    singleEntered
  );
}
function rerenderActiveUnicodeForModeSwitch() {
  if (lastUnicodeOutputSource === "single" && singleHexDigits.every(Boolean)) {
    convertUnicode("U+" + singleHexDigits.join(""));
  } else if (lastUnicodeOutputSource === "bulk" && unicodeInput.value.trim()) {
    convertUnicode();
  } else {
    unicodeRun++;
  }
}
function setUnicodeDisplayMode(nextMode) {
  if (!DISPLAY_MODES.has(nextMode) || nextMode === unicodeDisplayMode) return;
  unicodeDisplayMode = nextMode;
  svgModeEnabled = unicodeDisplayMode === "svg" && !isBrowserFontModeEnabled();
  saveUnicodeDisplayModePreference();
  refreshSvgModePresentation();
  updateSvgModeProgress("");
  updateSvgRandomOptions();
  hideUnicodeScope();
  rerenderActiveUnicodeForModeSwitch();
}
browserFontModeToggle?.addEventListener("click", () => {
  const display = window.UnicodeSiteDisplay;
  if (!display?.setDeviceFontModeEnabled) return;
  const next = !display.isDeviceFontModeEnabled();
  if (next && unicodeDisplayMode === "svg") {
    unicodeDisplayMode = "normal";
    saveUnicodeDisplayModePreference();
  }
  display.setDeviceFontModeEnabled(next);
});
svgModeToggle?.addEventListener("click", () => {
  if (isBrowserFontModeEnabled()) {
    window.UnicodeSiteDisplay?.setDeviceFontModeEnabled?.(false);
    setUnicodeDisplayMode("svg");
    return;
  }
  setUnicodeDisplayMode(unicodeDisplayMode === "svg" ? "normal" : "svg");
});
window.addEventListener?.("unicode-site-device-font-change", () => {
  refreshSvgModePresentation();
  updateSvgModeProgress("");
  updateSvgRandomOptions();
  hideUnicodeScope();
  rerenderActiveUnicodeForModeSwitch();
  if (typeof loadDailyCharacter === "function") loadDailyCharacter();
});
refreshSvgModePresentation();
if (svgModeEnabled) updateSvgRandomOptions();
