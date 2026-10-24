"use strict";
/* Exercise strictly separate SVG and normal rendering paths, short UI reasons,
 * diagnostics and stale async results. Font-outline tests cover binaries. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/converter.js"), "utf8");
const coverage = JSON.parse(fs.readFileSync(path.join(root,
  "data/unicode18_font_coverage_index.json"), "utf8"));

function element(tag = "span") {
  const node = {
    tagName: tag, children: [], parentNode: null, dataset: {}, style: {}, attrs: {},
    className: "", title: "", value: "",
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key]; },
    appendChild(child) {
      if (child.parentNode) {
        const siblings = child.parentNode.children;
        siblings.splice(siblings.indexOf(child), 1);
      }
      this.children.push(child); child.parentNode = this; return child;
    },
    replaceWith(next) {
      if (!this.parentNode) return;
      const parent = this.parentNode;
      parent.children.splice(parent.children.indexOf(this), 1, next);
      next.parentNode = parent; this.parentNode = null;
    },
    replaceChildren(...children) {
      this.textContent = "";
      for (const child of children) this.appendChild(child);
    }
  };
  let ownText = "";
  Object.defineProperty(node, "textContent", {
    get() { return ownText + this.children.map(child => child.textContent).join(""); },
    set(value) {
      for (const child of this.children) child.parentNode = null;
      this.children.length = 0; ownText = String(value);
    }
  });
  Object.defineProperty(node, "childNodes", {get() { return this.children; }});
  Object.defineProperty(node, "isConnected", {get() { return !!this.parentNode; }});
  node.classList = {
    contains(name) { return node.className.split(/\s+/).includes(name); },
    add(...names) {
      node.className = [...new Set([...node.className.split(/\s+/).filter(Boolean), ...names])].join(" ");
    },
    remove(...names) {
      node.className = node.className.split(/\s+/).filter(name => !names.includes(name)).join(" ");
    }
  };
  return node;
}
function lookup(ranges, cp) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, range = ranges[mid];
    if (cp < range[0]) hi = mid - 1;
    else if (cp > range[1]) lo = mid + 1;
    else return range;
  }
  return null;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function failure(code = "network", stage = "shard", phase = "fetch") {
  const url = "https://example.invalid/unicode-converter/svg-data/build/page-0000.json";
  return {svg: null, reason: "Internal diagnostic must not be visible", code, stage, phase, url,
    error: Object.assign(new Error("SVG fixture failure"), {code, stage, phase, url})};
}
function fixture(options = {}) {
  let svgEnabled = options.svg !== false;
  const output = element("div"), progress = [], svgCalls = [], fontCalls = [], normalCalls = [];
  const index = Object.hasOwn(options, "index") ? options.index : coverage;
  const ctx = {
    document: {createElement(tag) {
      const node = element(tag);
      if (options.domRenderError) {
        const append = node.appendChild;
        node.appendChild = function(child) {
          if (child.tagName === "svg") throw Error("SVG DOM insertion failed");
          return append.call(this, child);
        };
      }
      return node;
    }, fonts: {status: "loaded", ready: Promise.resolve()}},
    charOutput: output, charInput: element("textarea"), unicodeOutput: element("div"),
    unicodeInput: element("textarea"), backUnicode: element("button"),
    console: {warn() {}},
    setTimeout(fn, delay) { return setTimeout(fn, Math.min(delay, 30)); }, clearTimeout,
    sleep: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 30))),
    yieldToBrowser: async () => {}, hideUnicodeScope() {},
    getFontClass: () => "font-default",
    getWebFontNames: () => { normalCalls.push("getWebFontNames"); return []; },
    unicodeRangeLookup: lookup,
    getUnicodeCoverageIndex: options.getIndex || (async () => index),
    isInvisibleCharacter: options.invisible || ((cp, character) => [0x00ad, 0x200b, 0x200d].includes(cp) ||
      /\p{Default_Ignorable_Code_Point}/u.test(character)),
    isSvgModeEnabled: () => svgEnabled,
    updateSvgModeProgress: message => progress.push(message),
    async createSvgGlyph(cp, character) {
      svgCalls.push(cp);
      return options.renderSvg ? options.renderSvg(cp, character) : failure();
    },
    async selectUnicodeFont(cp, character) {
      fontCalls.push(cp); normalCalls.push("selectUnicodeFont");
      return options.selectFont ? options.selectFont(cp, character) : "Verified Web Font";
    },
    async getNativeEmojiRenderPlan(cp, character) {
      normalCalls.push("getNativeEmojiRenderPlan");
      return options.emojiPlan ? options.emojiPlan(cp, character) : null;
    },
    isVerifiedSpecialistSelection: options.specialist || (() => false),
    getComputedStyle(node) {
      normalCalls.push("getComputedStyle");
      return {fontFamily: node.style.fontFamily || "system-ui"};
    },
    isRenderedBlank(character, family) {
      normalCalls.push("isRenderedBlank");
      return options.blank ? options.blank(character, family) : false;
    },
    looksLikeMissingGlyph(character, family) {
      normalCalls.push("looksLikeMissingGlyph");
      return options.missing ? options.missing(character, family) : false;
    },
    applyGlyphScale() { normalCalls.push("applyGlyphScale"); },
    async waitForCharacterFont() { normalCalls.push("waitForCharacterFont"); }
  };
  if (options.noInvisibleHelper) delete ctx.isInvisibleCharacter;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, {filename: "converter.js"});
  return {ctx, output, progress, svgCalls, fontCalls, normalCalls,
    async convert(text) { await ctx.convertUnicode(text); return output.children; },
    mode(value) { svgEnabled = value; }};
}

const cases = [];
function test(name, run) { cases.push({name, run}); }
function expectGlyph(node, mode, text) {
  assert(node && node.classList.contains("character-span"), "Expected a displayed glyph");
  assert.equal(node.dataset.displayMode, mode);
  if (text !== undefined) assert.equal(node.textContent, text);
  assert(!node.classList.contains("loading-character"), "Loading state must terminate");
}
function expectReason(node, reason) {
  assert(node && node.classList.contains("character-status"), "Expected a reason status");
  assert.equal(node.dataset.reason, reason);
}

function assertNoNormalRendering(f) {
  assert.deepEqual(f.fontCalls, [], "SVG mode must not select a WebFont");
  assert.deepEqual(f.normalCalls, [], "SVG mode must not inspect or render WebFonts/OS fonts/emoji");
}
function expectSvgReason(f, node, reason, text) {
  expectReason(node, reason);
  assert.equal(node.textContent, text, "SVG reason must be the exact short UI label");
  assert.equal(node.dataset.displayMode, "svg-error");
  assert.equal(node.children.length, 0, "A failed SVG must not leave a glyph in the DOM");
  assertNoNormalRendering(f);
}

test("SVG success keeps data-display-mode=svg and uses no normal font rendering", async () => {
  const svg = element("svg");
  const f = fixture({renderSvg: async () => ({svg, reason: null})});
  const [node] = await f.convert("U+0041");
  expectGlyph(node, "svg");
  assert.equal(node.children[0].children[0], svg);
  assertNoNormalRendering(f);
  assert.equal(f.progress.at(-1), "");
});
for (const advanceWidth of [0, 268, 1000]) {
  test("SVG retains native advance " + advanceWidth + " and a text-sized baseline box", async () => {
    const svg = element("svg");
    const metrics = {unitsPerEm:1000, ascent:1160, descent:-288, advanceWidth};
    const f = fixture({renderSvg: async () => ({svg, metrics, reason:null})});
    const [node] = await f.convert(advanceWidth === 0 ? "0301" : "3002");
    expectGlyph(node, "svg");
    const inner = node.children[0];
    assert.equal(inner.style.width, (advanceWidth / 1000) + "em");
    assert.equal(inner.style.height, "1em");
    assert.equal(inner.style.verticalAlign, "-0.064em");
    assert.equal(svg.style.position, "absolute", "The viewport must not expand the text line box");
    assert(Math.abs(parseFloat(svg.style.top) + .224) < 1e-9);
    assert.equal(inner.style.transform, undefined, "Do not fit individual ink boxes");
    assertNoNormalRendering(f);
  });
}
test("Normal mode also preserves the original small Egyptian outline", async () => {
  const f = fixture({svg:false});
  const [node] = await f.convert("14354");
  expectGlyph(node, "web-font");
  assert(!f.normalCalls.includes("applyGlyphScale"), "The converter must not inflate a small glyph");
});
test("Normal U+1394 records its audited local source without claiming an OS glyph ID", async () => {
  const f = fixture({svg:false, selectFont:async()=>"Unicode Site 120"});
  const [node] = await f.convert("1394");
  expectGlyph(node,"web-font");
  assert.equal(node.dataset.codePoint,"1394");
  assert.equal(node.dataset.fontFamily,"Unicode Site 120");
  assert.equal(node.dataset.fontSource,"local");
  assert.equal(node.dataset.fontFile,"fonts/scripts/NotoSansEthiopic-Regular.ttf");
  assert.equal(node.dataset.fontSha256,coverage.font_families[120].sha256);
  assert.equal(node.dataset.glyphId,undefined);
});
test("Successful OS fallback removes the rejected local font attribution", async () => {
  const f = fixture({svg:false, selectFont:async()=>"Unicode Site 120",
    missing:(_character,family)=>family.includes("Unicode Site")});
  const [node] = await f.convert("1394");
  expectGlyph(node,"normal");
  assert.equal(node.dataset.fontSource,"system");
  assert.equal(node.dataset.fontFile,undefined);
  assert.equal(node.dataset.fontSha256,undefined);
});
test("SVG output records release layout and the exact outline source", async () => {
  const metrics={unitsPerEm:1000,ascent:1069,descent:-293,advanceWidth:483,
    fontFile:"fonts/scripts/NotoSansEthiopic-Regular.ttf",fontSha256:coverage.font_families[120].sha256};
  const f = fixture({renderSvg:async()=>({svg:element("svg"),metrics,
    build:"0123456789abcdef",layout:"font-metrics-v1"})});
  const [node] = await f.convert("1394");
  expectGlyph(node,"svg");
  assert.equal(node.dataset.codePoint,"1394");
  assert.equal(node.dataset.svgBuild,"0123456789abcdef");
  assert.equal(node.dataset.svgLayout,"font-metrics-v1");
  assert.equal(node.dataset.fontSource,"svg-outline");
  assert.equal(node.dataset.fontFile,metrics.fontFile);
  assert.equal(node.dataset.fontSha256,metrics.fontSha256);
  assertNoNormalRendering(f);
});
for (const [code, stage, phase, reason, label] of [
  ["unsupported", "manifest", "validation", "svg-unsupported", "SVG未対応"],
  ["unsupported", "shard", "validation", "svg-unsupported", "SVG未対応"],
  ["missing", "active", "fetch", "svg-load-error", "読込失敗"],
  ["missing", "shard", "fetch", "svg-load-error", "読込失敗"],
  ["network", "shard", "fetch", "svg-load-error", "読込失敗"],
  ["loader", "loader", "fetch", "svg-load-error", "読込失敗"],
  ["version", "shard", "hash", "svg-integrity-error", "検証失敗"],
  ["version", "shard", "body", "svg-integrity-error", "検証失敗"],
  ["format", "shard", "decode", "svg-integrity-error", "検証失敗"],
  ["format", "active", "body", "svg-integrity-error", "検証失敗"],
  ["manifest", "manifest", "validation", "svg-integrity-error", "検証失敗"],
  ["processing", "manifest", "validation", "svg-integrity-error", "検証失敗"],
  ["integrity", "shard", "hash", "svg-integrity-error", "検証失敗"],
  ["processing", "render", "geometry", "svg-render-error", "描画失敗"],
  ["format", "render", "geometry", "svg-render-error", "描画失敗"],
  ["timeout", "shard", "body", "timeout", "時間切れ"]
]) {
  test("SVG " + code + "/" + stage + "/" + phase + " shows " + label + " and retains diagnostics", async () => {
    const f = fixture({renderSvg: async () => failure(code, stage, phase)});
    const [node] = await f.convert("U+0041");
    expectSvgReason(f, node, reason, label);
    assert.equal(node.dataset.svgError, code);
    assert.equal(node.dataset.svgStage, stage);
    assert.equal(node.dataset.svgPhase, phase);
    assert.match(node.dataset.svgUrl, /\/unicode-converter\/svg-data\//);
  });
}
for (const [code, stage, phase, reason, label] of [
  ["network", "shard", "fetch", "svg-load-error", "読込失敗"],
  ["processing", "render", "geometry", "svg-render-error", "描画失敗"],
  ["timeout", "shard", "body", "timeout", "時間切れ"]
]) {
  test("Thrown SVG " + code + " produces a short reason without normal rendering", async () => {
    const f = fixture({renderSvg: async () => { throw failure(code, stage, phase).error; }});
    const [node] = await f.convert("0041");
    expectSvgReason(f, node, reason, label);
    assert.equal(node.dataset.svgError, code);
  });
}
test("SVG DOM insertion exception becomes 描画失敗", async () => {
  const f = fixture({domRenderError: true, renderSvg: async () => ({svg: element("svg"), reason: null})});
  const [node] = await f.convert("0041");
  expectSvgReason(f, node, "svg-render-error", "描画失敗");
});
for (const [token, reason, label] of [
  ["0378", "unassigned", "未割当"], ["10FFFF", "unassigned", "未割当"],
  ["0000", "control", "制御文字"], ["007F", "control", "制御文字"],
  ["0020", "invisible", "不可視文字"], ["00A0", "invisible", "不可視文字"],
  ["00AD", "invisible", "不可視文字"], ["200B", "invisible", "不可視文字"],
  ["E000", "svg-unsupported", "SVG未対応"]
]) {
  test(token + " has exact SVG-mode label " + label, async () => {
    const f = fixture();
    const [node] = await f.convert(token);
    expectSvgReason(f, node, reason, label);
    assert.equal(f.svgCalls.length, 0, "Non-glyph reasons should not fetch SVG");
  });
}
for (const token of ["10D40", "18E01"]) {
  test(token + " without SVG shows no Script name or font-specific explanation", async () => {
    const f = fixture({renderSvg: async () => failure("unsupported", "shard", "validation")});
    const [node] = await f.convert(token);
    expectSvgReason(f, node, "svg-unsupported", "SVG未対応");
    assert.equal(f.svgCalls.length, 1);
  });
}
test("SVG failure cannot display an available WebFont or OS glyph", async () => {
  const f = fixture({selectFont: async () => { throw Error("WebFont path must not run"); },
    blank: () => { throw Error("OS inspection must not run"); },
    emojiPlan: async () => { throw Error("Native emoji must not run"); }});
  const [node] = await f.convert("0041");
  expectSvgReason(f, node, "svg-load-error", "読込失敗");
});
test("An SVG-missing color emoji does not use the native emoji font in SVG mode", async () => {
  const f = fixture({renderSvg: async () => failure("unsupported"),
    emojiPlan: async () => ({character: "😀", displayVariation: false})});
  const [node] = await f.convert("1F600");
  expectSvgReason(f, node, "svg-unsupported", "SVG未対応");
});
for (const code of ["unsupported", "network", "processing"]) {
  test("One " + code + " failure does not prevent the next character's SVG", async () => {
    const svg = element("svg");
    const f = fixture({renderSvg: async cp => cp === 0x41
      ? failure(code, code === "unsupported" ? "manifest" : "shard") : {svg, reason: null}});
    const nodes = await f.convert("0041 0042");
    assert.equal(nodes.length, 2);
    expectGlyph(nodes[1], "svg");
    assert.equal(f.svgCalls.length, 2);
    assertNoNormalRendering(f);
  });
}
for (const stage of ["active", "manifest"]) {
  test("A transient " + stage + " failure does not prevent the next character's SVG", async () => {
    const f = fixture({renderSvg: async cp => cp === 0x41
      ? failure("network", stage, "fetch") : {svg: element("svg"), reason: null}});
    const nodes = await f.convert("0041 0042");
    assert.equal(nodes.length, 2);
    expectSvgReason(f, nodes[0], "svg-load-error", "読込失敗");
    expectGlyph(nodes[1], "svg");
    assert.equal(f.svgCalls.length, 2);
  });
}
test("Coverage unavailable never declares a visible SVG unassigned", async () => {
  const f = fixture({index: null, renderSvg: async () => ({svg: element("svg"), reason: null})});
  const [node] = await f.convert("0041");
  expectGlyph(node, "svg");
  assertNoNormalRendering(f);
});
test("Coverage rejection does not stop SVG rendering or later characters", async () => {
  const f = fixture({getIndex: async () => { throw Error("index offline"); },
    renderSvg: async () => ({svg: element("svg"), reason: null})});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  for (const node of nodes) expectGlyph(node, "svg");
  assertNoNormalRendering(f);
});
test("SVG timeout terminates loading with 時間切れ and no font calls", async () => {
  const f = fixture({renderSvg: () => new Promise(() => {})});
  const [node] = await f.convert("0041");
  expectSvgReason(f, node, "timeout", "時間切れ");
  assert.equal(node.dataset.svgError, "timeout");
  assert.equal(f.progress.at(-1), "");
});

// The new SVG-mode contract must leave the established normal-mode path intact.
test("Ordinary mode still uses its existing WebFont path", async () => {
  const f = fixture({svg: false});
  const [node] = await f.convert("0041");
  expectGlyph(node, "web-font", "A");
  assert.equal(f.svgCalls.length, 0);
});
test("Ordinary mode retains OS text when WebFont is unavailable", async () => {
  const f = fixture({svg: false, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
  assert.equal(f.svgCalls.length, 0);
});
test("Ordinary mode keeps blank WebFont to working OS font fallback", async () => {
  const f = fixture({svg: false, blank: (_character, family) => family.includes("Verified Web Font")});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
  assert.match(node.children[0].style.fontFamily, /system-ui/);
});
test("Ordinary mode still gives a final reason when all fonts fail", async () => {
  const f = fixture({svg: false, blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectReason(node, "display-error");
});
for (const [token, reason] of [
  ["0378", "unassigned"], ["0000", "control"], ["0020", "space"],
  ["00AD", "invisible"], ["10D40", "garay-unsupported"], ["18E01", "jurchen-unsupported"]
]) {
  test("Ordinary mode preserves " + token + " reason " + reason, async () => {
    const f = fixture({svg: false, blank: () => true, selectFont: async () => null});
    const [node] = await f.convert(token);
    expectReason(node, reason);
    assert.equal(f.svgCalls.length, 0);
  });
}
test("Ordinary mode distinguishes a failing Jurchen cmap entry from a missing font", async () => {
  const f = fixture({svg: false, blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("18E00");
  expectReason(node, "display-error");
});
test("Ordinary mode handles missing coverage without calling it unassigned", async () => {
  const f = fixture({svg: false, index: null, blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectReason(node, "coverage-unavailable");
  assert(!node.textContent.includes("未割当"));
});
test("Ordinary mode permits font rendering after coverage timeout", async () => {
  const f = fixture({svg: false, getIndex: () => new Promise(() => {})});
  const [node] = await f.convert("0041");
  expectGlyph(node, "web-font", "A");
});
test("Ordinary mode still permits OS rendering outside the site's cmap", async () => {
  const f = fixture({svg: false, index: {...coverage, ranges: []}, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
});
test("Ordinary mode isolates a Canvas exception to one character", async () => {
  const f = fixture({svg: false, selectFont: async () => null,
    blank: character => { if (character === "A") throw Error("Canvas read failed"); return false; }});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectReason(nodes[0], "display-error");
  expectGlyph(nodes[1], "normal", "B");
});
test("An absent optional invisibility helper does not stop normal rendering", async () => {
  const f = fixture({svg: false, noInvisibleHelper: true});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectGlyph(nodes[0], "web-font", "A");
  expectGlyph(nodes[1], "web-font", "B");
});
test("Optional invisibility helper failure does not reject normal rendering", async () => {
  const f = fixture({svg: false, invisible: cp => {
    if (cp === 0x41) throw Error("invisibility helper failed");
    return false;
  }});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  assert(nodes[0].textContent.length > 0);
  expectGlyph(nodes[1], "web-font", "B");
});
test("Ordinary mode preserves all eight Safari specialist glyphs", async () => {
  const tokens = ["109EB", "1081F", "11D6B", "110C0", "16A51", "11400", "111E5", "10408"];
  const f = fixture({svg: false, specialist: () => true,
    blank: () => { throw Error("Specialist must bypass Canvas heuristic"); }});
  const nodes = await f.convert(tokens.join(" "));
  assert.equal(nodes.length, tokens.length);
  for (const [i, node] of nodes.entries()) expectGlyph(node, "web-font", String.fromCodePoint(parseInt(tokens[i], 16)));
});
test("Ordinary mode retains native-color-emoji behavior", async () => {
  const f = fixture({svg: false,
    emojiPlan: async () => ({character: "😀", displayVariation: false}), blank: () => true});
  const [node] = await f.convert("1F600");
  expectGlyph(node, "normal", "😀");
  assert(node.classList.contains("native-color-emoji"));
  assert.equal(f.fontCalls.length, 0);
});
for (const fault of ["rejection", "timeout"]) {
  test("Ordinary mode emoji lookup " + fault + " still permits WebFont rendering", async () => {
    const f = fixture({svg: false, emojiPlan: fault === "timeout" ? () => new Promise(() => {})
      : async () => { throw Error("emoji lookup unavailable"); }});
    const [node] = await f.convert("1F600");
    expectGlyph(node, "web-font", "😀");
  });
}
test("Ordinary mode font timeout still produces a final reason", async () => {
  const f = fixture({svg: false, selectFont: () => new Promise(() => {}), blank: () => true});
  const [node] = await f.convert("0041");
  expectReason(node, "font-timeout");
});

test("A late SVG success cannot overwrite a switch to normal mode and new input", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({renderSvg: cp => { started.resolve(cp); return pending.promise; }});
  const oldRun = f.ctx.convertUnicode("0041");
  await started.promise;
  f.mode(false);
  await f.ctx.convertUnicode("0042");
  pending.resolve({svg: element("svg"), reason: null});
  await oldRun;
  assert.equal(f.output.children.length, 1);
  expectGlyph(f.output.children[0], "web-font", "B");
});
test("A late SVG failure cannot overwrite the new normal-mode result", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({renderSvg: cp => { started.resolve(cp); return pending.promise; }});
  const oldRun = f.ctx.convertUnicode("0041");
  await started.promise;
  f.mode(false);
  await f.ctx.convertUnicode("0042");
  pending.resolve(failure("network"));
  await oldRun;
  assert.equal(f.output.children.length, 1);
  expectGlyph(f.output.children[0], "web-font", "B");
});
test("A late SVG cannot reinsert a cleared conversion", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({renderSvg: cp => { started.resolve(cp); return pending.promise; }});
  const oldRun = f.ctx.convertUnicode("0041");
  await started.promise;
  await f.ctx.convertUnicode("");
  pending.resolve({svg: element("svg"), reason: null});
  await oldRun;
  assert.equal(f.output.children.length, 0);
});
test("A late old SVG cannot overwrite a newer SVG conversion", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({renderSvg: cp => {
    if (cp === 0x41) { started.resolve(cp); return pending.promise; }
    return {svg: element("svg"), reason: null};
  }});
  const oldRun = f.ctx.convertUnicode("0041");
  await started.promise;
  await f.ctx.convertUnicode("0042");
  const latest = f.output.children[0];
  pending.resolve({svg: element("svg"), reason: null});
  await oldRun;
  assert.equal(f.output.children.length, 1);
  assert.equal(f.output.children[0], latest);
  expectGlyph(latest, "svg");
});
test("A late normal WebFont result cannot reinsert a cleared conversion", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({svg: false, selectFont: cp => { started.resolve(cp); return pending.promise; }});
  const oldRun = f.ctx.convertUnicode("0041");
  await started.promise;
  await f.ctx.convertUnicode("");
  pending.resolve("Verified Web Font");
  await oldRun;
  assert.equal(f.output.children.length, 0);
});

(async () => {
  const failures = [];
  for (const {name, run} of cases) {
    // A never-settling mock must fail the test, rather than let Node exit
    // successfully with an unresolved Promise and no live event-loop handles.
    let watchdog;
    try {
      await Promise.race([run(), new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error("Converter did not settle")), 1500);
      })]);
    }
    catch (error) { failures.push(name); console.error("FAIL:", name, error.message); }
    finally { clearTimeout(watchdog); }
  }
  assert.equal(failures.length, 0, "Converter regression failures: " + failures.join("; "));
  console.log("PASS: " + cases.length + " converter strict-SVG/normal-mode, reason, timeout and cancellation cases");
})().catch(error => { console.error(error); process.exitCode = 1; });
