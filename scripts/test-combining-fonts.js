"use strict";
/* Browser-adapter contracts: font reuse must never turn a text run into SVGs. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/combining-fonts.js"), "utf8");
const {createAdapter} = require("../js/combining-fonts");
const tests = [];
const test = (name, body) => tests.push([name, body]);
function fixture(options = {}) {
  const requests = [], created = [], added = [], calls = [];
  const data = {
    schema_version: 2,
    font_families: Array.from({length: 32}, (_, id) => ({file: "fonts/scripts/f" + id + ".ttf", family: "Source " + id})),
    ranges: [], script_ranges: [], combinations: []
  };
  class Face {
    constructor(family, url, descriptors) {
      Object.assign(this, {family, url, descriptors});
      created.push(this);
    }
    async load() { return this; }
  }
  const config = {
    scriptUrl: "https://example.test/unicode-converter/js/combining-fonts.js?v=1",
    documentObj: {
      fonts: {add(face) { added.push(face); }},
      createElement() { throw Error("Font preparation must not render markup"); },
      createElementNS() { throw Error("Font preparation must not render SVG"); }
    },
    FontFace: Face,
    fontPolicy: {getCandidateFontIds(_data, cp) { calls.push(cp); return cp === 0x41 ? [0, 1] : [1, 2]; }},
    fetchFn: async (url, init) => {
      requests.push({url, init});
      return {ok: true, json: async () => data};
    },
    ...options
  };
  return {adapter: createAdapter(config), config, data, requests, created, added, calls};
}
test("site-wide device mode performs no index fetch or FontFace load", async () => {
  const f = fixture();
  f.config.documentObj.defaultView = {};
  const adapter = createAdapter({...f.config});
  // The module reads the root API dynamically; use a VM browser fixture for this contract.
  const context = {
    URL, setTimeout, clearTimeout, AbortController,
    document: {...f.config.documentObj, currentScript: {src: f.config.scriptUrl}, baseURI: "https://example.test/unicode-converter/combining/"},
    fetch: f.config.fetchFn, FontFace: f.config.FontFace,
    UnicodeFontPolicy: f.config.fontPolicy,
    UnicodeSiteDisplay: {isDeviceFontModeEnabled: () => true}
  };
  vm.runInNewContext(source, context);
  const result = await context.UnicodeCombiningFonts.prepare("A\u0301");
  assert.equal(result.reason, "site-device-font");
  assert.equal(result.fontFamily, "sans-serif");
  assert.equal(result.files.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.created.length, 0);
});

test("prefers one common font for a complete shaped string", async () => {
  const f = fixture();
  const result = await f.adapter.prepare("A\u0301");
  assert.equal(result.reason, "common-web-font");
  assert.deepEqual(result.files, ["fonts/scripts/f1.ttf"]);
  assert.deepEqual(result.sourceFamilies, ["Source 1"]);
  assert.equal(f.created.length, 1);
  assert.equal(f.added.length, 1);
  assert.deepEqual(f.created[0].descriptors, {style: "normal", weight: "400"});
  assert.match(result.fontFamily, /^"Unicode Combining 1", -apple-system/);
});
test("retains GitHub Pages prefix for index and font URLs", async () => {
  const f = fixture();
  await f.adapter.prepare("A\u0301");
  assert.equal(f.requests[0].url, "https://example.test/unicode-converter/data/unicode18_font_coverage_index.json");
  assert.equal(f.created[0].url, 'url("https://example.test/unicode-converter/fonts/scripts/f1.ttf")');
});
test("browser default derives root from currentScript on a nested page", async () => {
  const f = fixture();
  const context = {
    URL, setTimeout, clearTimeout, AbortController,
    document: {...f.config.documentObj, currentScript: {src: f.config.scriptUrl}, baseURI: "https://example.test/unicode-converter/combining/"},
    fetch: f.config.fetchFn, FontFace: f.config.FontFace,
    UnicodeFontPolicy: f.config.fontPolicy
  };
  vm.runInNewContext(source, context);
  const result = await context.UnicodeCombiningFonts.prepare("A\u0301");
  assert.equal(result.reason, "common-web-font");
  assert.equal(f.requests[0].url, "https://example.test/unicode-converter/data/unicode18_font_coverage_index.json");
});
test("browser can find its script URL after currentScript becomes unavailable", async () => {
  const f = fixture();
  const context = {
    URL, setTimeout, clearTimeout,
    document: {...f.config.documentObj, scripts: [{src: "https://example.test/other.js"}, {src: f.config.scriptUrl}]},
    fetch: f.config.fetchFn, FontFace: f.config.FontFace,
    UnicodeFontPolicy: f.config.fontPolicy
  };
  vm.runInNewContext(source, context);
  assert.equal((await context.UnicodeCombiningFonts.prepare("A\u0301")).reason, "common-web-font");
});
test("mixed scripts produce a font stack and no rendering operations", async () => {
  const f = fixture({fontPolicy: {getCandidateFontIds: (_data, cp) => cp === 0x41 ? [0] : [2]}});
  const result = await f.adapter.prepare("A\u05b8");
  assert.equal(result.reason, "mixed-web-fonts");
  assert.deepEqual(result.files, ["fonts/scripts/f0.ttf", "fonts/scripts/f2.ttf"]);
  assert.equal(result.svgReason, "whole-string-shaping-unavailable");
  assert.equal(Object.hasOwn(result, "svg"), false);
  assert.equal(Object.hasOwn(result, "text"), false);
});
test("repeated and concurrent preparation share index and font requests", async () => {
  const f = fixture();
  await Promise.all([f.adapter.prepare("A\u0301"), f.adapter.prepare("A\u0301")]);
  await f.adapter.prepare("A\u0301");
  assert.equal(f.requests.length, 1);
  assert.equal(f.created.length, 1);
});
test("format controls and variation selectors do not demand standalone glyphs", async () => {
  const f = fixture();
  const original = "A\u0301\u034f\u200d\ufe0f\u{e0100}\n\u202e";
  const result = await f.adapter.prepare(original);
  assert.equal(result.reason, "common-web-font");
  assert.deepEqual(f.calls, [0x41, 0x301]);
  assert.equal(original, "A\u0301\u034f\u200d\ufe0f\u{e0100}\n\u202e");
});
test("empty or entirely formatting input needs no network request", async () => {
  const f = fixture();
  for (const text of ["", "\u200d\ufe0f\n"]) {
    assert.equal((await f.adapter.prepare(text)).reason, "native-font-fallback");
  }
  assert.equal(f.requests.length, 0);
});
test("font failures preserve normal native fallback and remain cached", async () => {
  let attempts = 0;
  class FailedFace {
    constructor() { attempts++; }
    async load() { throw Error("Font network failure"); }
  }
  const f = fixture({FontFace: FailedFace});
  const result = await f.adapter.prepare("A\u0301");
  assert.equal(result.reason, "native-font-fallback");
  assert.deepEqual(result.files, []);
  assert.match(result.fontFamily, /sans-serif$/);
  assert.equal(f.added.length, 0);
  const prior = attempts;
  await f.adapter.prepare("A\u0301");
  assert.equal(attempts, prior);
});
test("index network, HTTP, schema and JSON failures return normal fallback", async () => {
  for (const fetchFn of [
    async () => { throw Error("Network"); },
    async () => ({ok: false}),
    async () => ({ok: true, json: async () => ({schema_version: 1})}),
    async () => ({ok: true, json: async () => { throw Error("JSON"); }})
  ]) {
    const f = fixture({fetchFn});
    assert.equal((await f.adapter.prepare("A")).reason, "font-index-unavailable");
  }
});
test("a stalled fetch or body read expires and aborts when supported", async () => {
  for (const bodyStalls of [false, true]) {
    let aborted = false;
    class Controller { constructor() { this.signal = {}; } abort() { aborted = true; } }
    const f = fixture({
      timeoutMs: 5, AbortController: Controller,
      fetchFn: async () => bodyStalls ? {ok: true, json: () => new Promise(() => {})} : new Promise(() => {})
    });
    assert.equal((await f.adapter.prepare("A")).reason, "font-index-unavailable");
    assert.equal(aborted, true);
  }
});
test("a font resolving after timeout is not added to document fonts", async () => {
  let finish;
  class SlowFace {
    load() { return new Promise(resolve => { finish = () => resolve(this); }); }
  }
  const f = fixture({timeoutMs: 5, FontFace: SlowFace, fontPolicy: {getCandidateFontIds: () => [0]}});
  assert.equal((await f.adapter.prepare("A")).reason, "native-font-fallback");
  finish();
  await Promise.resolve();
  assert.equal(f.added.length, 0);
});
test("at most twelve font IDs are attempted including failed common fonts", async () => {
  let attempts = 0;
  class CountFace {
    constructor(family) { this.family = family; attempts++; }
    async load() { if (Number(this.family.split(" ").at(-1)) < 3) throw Error("Common unavailable"); return this; }
  }
  const f = fixture({
    FontFace: CountFace,
    fontPolicy: {getCandidateFontIds: (_data, cp) => [0, 1, 2, cp - 65 + 3]}
  });
  const result = await f.adapter.prepare("ABCDEFGHIJKLMNOPQRSTUVWX");
  assert.equal(attempts, 12);
  assert.equal(result.files.length, 9);
  assert.equal(result.reason, "partial-web-fonts");
});
test("unsafe font paths and unsupported browser APIs use native fallback", async () => {
  const f = fixture({fontPolicy: {getCandidateFontIds: () => [0]}});
  f.data.font_families[0].file = "fonts/../../outside.ttf";
  assert.equal((await f.adapter.prepare("A")).reason, "native-font-fallback");
  assert.equal(f.created.length, 0);
  const withoutFonts = fixture({documentObj: {}});
  assert.equal((await withoutFonts.adapter.prepare("A")).reason, "native-font-fallback");
  const withoutPolicy = fixture({fontPolicy: {}});
  assert.equal((await withoutPolicy.adapter.prepare("A")).reason, "font-index-unavailable");
});
(async () => {
  for (const [name, body] of tests) {
    await body();
    console.log("PASS " + name);
  }
  console.log("PASS " + tests.length + " combining-font adapter tests");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
