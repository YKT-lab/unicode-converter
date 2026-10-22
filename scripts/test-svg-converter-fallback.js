"use strict";
/* Exercise the real converter, including SVG -> normal rendering and stale
 * async results. Browser APIs are injected; font-outline tests cover binaries. */
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
function failure(code = "network", stage = "shard") {
  const url = "https://example.invalid/unicode-converter/svg-data/build/page-0000.json";
  return {svg: null, reason: "SVG通信失敗", code, stage, url,
    error: Object.assign(new Error("SVG fixture failure"), {code, stage, url})};
}
function fixture(options = {}) {
  let svgEnabled = options.svg !== false;
  const output = element("div"), progress = [], svgCalls = [], fontCalls = [];
  const index = Object.hasOwn(options, "index") ? options.index : coverage;
  const ctx = {
    document: {createElement: element, fonts: {status: "loaded", ready: Promise.resolve()}},
    charOutput: output, charInput: element("textarea"), unicodeOutput: element("div"),
    unicodeInput: element("textarea"), backUnicode: element("button"),
    console: {warn() {}},
    setTimeout(fn, delay) { return setTimeout(fn, Math.min(delay, 30)); }, clearTimeout,
    sleep: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 30))),
    yieldToBrowser: async () => {}, hideUnicodeScope() {},
    getFontClass: () => "font-default", getWebFontNames: () => [],
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
      fontCalls.push(cp);
      return options.selectFont ? options.selectFont(cp, character) : "Verified Web Font";
    },
    getNativeEmojiRenderPlan: options.emojiPlan || (async () => null),
    isVerifiedSpecialistSelection: options.specialist || (() => false),
    getComputedStyle: node => ({fontFamily: node.style.fontFamily || "system-ui"}),
    isRenderedBlank: options.blank || (() => false),
    looksLikeMissingGlyph: options.missing || (() => false),
    applyGlyphScale() {}, waitForCharacterFont: async () => {}
  };
  if (options.noInvisibleHelper) delete ctx.isInvisibleCharacter;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, {filename: "converter.js"});
  return {ctx, output, progress, svgCalls, fontCalls,
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

test("SVG success keeps outline rendering", async () => {
  const svg = element("svg");
  const f = fixture({renderSvg: async () => ({svg, reason: null})});
  const [node] = await f.convert("U+0041");
  expectGlyph(node, "svg");
  assert.equal(node.children[0].children[0], svg);
  assert.equal(f.fontCalls.length, 0);
  assert.equal(f.progress.at(-1), "");
});
for (const code of ["unsupported", "network", "missing", "integrity", "format", "version"]) {
  test("SVG " + code + " falls back to WebFont with diagnostic context", async () => {
    const f = fixture({renderSvg: async () => failure(code)});
    const [node] = await f.convert("U+0041");
    expectGlyph(node, "web-font", "A");
    assert.equal(node.dataset.svgError, code);
    assert.equal(node.dataset.svgStage, "shard");
    assert.match(node.dataset.svgUrl, /\/unicode-converter\/svg-data\//);
  });
}
test("Thrown SVG error falls back and retains its code", async () => {
  const f = fixture({renderSvg: async () => { throw failure("network").error; }});
  const [node] = await f.convert("U+0041");
  expectGlyph(node, "web-font", "A");
  assert.equal(node.dataset.svgError, "network");
});
test("An unsupported character in the manifest does not disable later SVG glyphs", async () => {
  const svg = element("svg");
  const f = fixture({renderSvg: async cp => cp === 0x41
    ? failure("unsupported", "manifest") : {svg, reason: null}});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectGlyph(nodes[0], "web-font", "A");
  expectGlyph(nodes[1], "svg");
  assert.equal(f.svgCalls.length, 2);
});
test("OS text is retained when WebFont is unavailable", async () => {
  const f = fixture({selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
});
test("A blank WebFont glyph falls back to a working system font", async () => {
  const f = fixture({blank: (_character, family) => family.includes("Verified Web Font")});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
  assert.match(node.children[0].style.fontFamily, /system-ui/);
  assert.equal(node.dataset.svgError, "network");
});
test("A fallback glyph failure keeps SVG diagnostics on its final reason", async () => {
  const f = fixture({blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectReason(node, "display-error");
  assert.equal(node.dataset.svgError, "network");
  assert.equal(node.dataset.svgStage, "shard");
});
for (const [token, reason] of [
  ["0378", "unassigned"], ["10FFFF", "unassigned"], ["0000", "control"],
  ["0020", "space"], ["00AD", "invisible"], ["200B", "invisible"],
  ["10D40", "garay-unsupported"], ["18E01", "jurchen-unsupported"]
]) {
  test(token + " has an explicit " + reason + " reason", async () => {
    const f = fixture({blank: () => true, selectFont: async () => null});
    const [node] = await f.convert(token);
    expectReason(node, reason);
  });
}
test("A Jurchen cmap entry that fails rendering is not declared font-unsupported", async () => {
  // The current index contains U+18E00 in Plangothic P2; adjacent U+18E01
  // has no site font. Classify the exact codepoint, not its entire Script.
  const f = fixture({blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("18E00");
  expectReason(node, "display-error");
});
test("Coverage unavailable does not classify a codepoint as unassigned", async () => {
  const f = fixture({index: null, blank: () => true, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectReason(node, "coverage-unavailable");
  assert(!node.textContent.includes("未割当"));
});
test("Coverage rejection does not stop later characters", async () => {
  const f = fixture({getIndex: async () => { throw Error("index offline"); }});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectGlyph(nodes[0], "web-font", "A");
  expectGlyph(nodes[1], "web-font", "B");
});
test("Coverage timeout still permits available fallback fonts", async () => {
  const f = fixture({getIndex: () => new Promise(() => {})});
  const [node] = await f.convert("0041");
  expectGlyph(node, "web-font", "A");
});
test("A local cmap miss still permits normal OS rendering", async () => {
  const f = fixture({index: {...coverage, ranges: []}, selectFont: async () => null});
  const [node] = await f.convert("0041");
  expectGlyph(node, "normal", "A");
});
test("A Canvas exception on one character does not stop the batch", async () => {
  const f = fixture({selectFont: async () => null,
    blank: character => { if (character === "A") throw Error("Canvas read failed"); return false; }});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectReason(nodes[0], "display-error");
  expectGlyph(nodes[1], "normal", "B");
});
test("An unavailable optional invisibility helper does not stop visible text", async () => {
  const f = fixture({noInvisibleHelper: true});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  expectGlyph(nodes[0], "web-font", "A");
  expectGlyph(nodes[1], "web-font", "B");
});
test("A failing invisibility check cannot make final reason creation reject the batch", async () => {
  const f = fixture({invisible: cp => {
    if (cp === 0x41) throw Error("invisibility helper failed");
    return false;
  }});
  const nodes = await f.convert("0041 0042");
  assert.equal(nodes.length, 2);
  assert(nodes[0].textContent.length > 0);
  expectGlyph(nodes[1], "web-font", "B");
});
test("All eight audited specialist glyphs survive Safari Canvas heuristics", async () => {
  const tokens = ["109EB", "1081F", "11D6B", "110C0", "16A51", "11400", "111E5", "10408"];
  const f = fixture({specialist: () => true,
    blank: () => { throw Error("Specialist must bypass Canvas heuristic"); }});
  const nodes = await f.convert(tokens.join(" "));
  assert.equal(nodes.length, tokens.length);
  for (const [i, node] of nodes.entries()) expectGlyph(node, "web-font", String.fromCodePoint(parseInt(tokens[i], 16)));
});
test("Color emoji fallback preserves native emoji plan", async () => {
  const f = fixture({emojiPlan: async cp => cp === 0x1f600
    ? {character: "😀", displayVariation: false} : null});
  const [node] = await f.convert("1F600");
  expectGlyph(node, "normal", "😀");
  assert(node.classList.contains("native-color-emoji"));
  assert.equal(f.fontCalls.length, 0);
});
test("An unavailable native emoji after SVG failure still tries WebFont rendering", async () => {
  const f = fixture({emojiPlan: async () => ({character: "😀", displayVariation: false}),
    blank: (_character, family) => family === "system-ui"});
  const [node] = await f.convert("1F600");
  expectGlyph(node, "web-font", "😀");
  assert.equal(f.fontCalls.length, 1);
  assert(!node.classList.contains("native-color-emoji"), "WebFont must not inherit the native-only font class");
});
test("A missing native emoji and all missing fallback glyphs produce a reason", async () => {
  const f = fixture({emojiPlan: async () => ({character: "😀", displayVariation: false}),
    selectFont: async () => null, blank: () => true});
  const [node] = await f.convert("1F600");
  expectReason(node, "display-error");
  assert.equal(node.dataset.svgError, "network");
});
test("Ordinary mode retains the established native-color-emoji behavior", async () => {
  const f = fixture({svg: false,
    emojiPlan: async () => ({character: "😀", displayVariation: false}), blank: () => true});
  const [node] = await f.convert("1F600");
  expectGlyph(node, "normal", "😀");
  assert(node.classList.contains("native-color-emoji"));
  assert.equal(f.fontCalls.length, 0);
});
for (const fault of ["rejection", "timeout"]) {
  test("Emoji lookup " + fault + " still permits WebFont rendering", async () => {
    const f = fixture({emojiPlan: fault === "timeout" ? () => new Promise(() => {})
      : async () => { throw Error("emoji lookup unavailable"); }});
    const [node] = await f.convert("1F600");
    expectGlyph(node, "web-font", "😀");
  });
}
test("Ordinary mode still uses its existing normal font path", async () => {
  const f = fixture({svg: false});
  const [node] = await f.convert("0041");
  expectGlyph(node, "web-font", "A");
  assert.equal(f.svgCalls.length, 0);
});
test("SVG timeout terminates loading and falls back", async () => {
  const f = fixture({renderSvg: () => new Promise(() => {})});
  const [node] = await f.convert("0041");
  expectGlyph(node, "web-font", "A");
  assert.equal(node.dataset.svgError, "timeout");
});
test("Font timeout has a final reason if device rendering also fails", async () => {
  const f = fixture({selectFont: () => new Promise(() => {}), blank: () => true});
  const [node] = await f.convert("0041");
  expectReason(node, "font-timeout");
  assert.equal(node.dataset.svgError, "network");
});
test("A late SVG result cannot overwrite a mode switch and new input", async () => {
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
test("A late WebFont result cannot reinsert a cleared conversion", async () => {
  const pending = deferred(), started = deferred();
  const f = fixture({selectFont: cp => { started.resolve(cp); return pending.promise; }});
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
  console.log("PASS: " + cases.length + " converter SVG/fallback, reason, timeout and cancellation cases");
})().catch(error => { console.error(error); process.exitCode = 1; });
