"use strict";
// Optional browser integration test. Requires Playwright and an installed Chromium.
// Requests are fulfilled from this checkout: no public site or TLS bypass is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {chromium} = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const argument = name => process.argv.find(value => value.startsWith("--" + name + "="))?.split("=").slice(1).join("=");
const OUT = path.resolve(argument("out") || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "unicode-combining-maker"));
const ORIGIN = "http://127.0.0.1:4198";
const PREFIX = "/unicode-converter/";
const URL = ORIGIN + PREFIX + "combining/";
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/combining-marks.json"), "utf8"));
const MIME = {".html":"text/html", ".css":"text/css", ".js":"application/javascript", ".json":"application/json", ".png":"image/png", ".ttf":"font/ttf", ".otf":"font/otf", ".woff":"font/woff", ".woff2":"font/woff2"};
const report = {unicodeVersion:data.unicode_version, count:data.count, realSafariTested:false, checks:[], fonts:[]};
fs.mkdirSync(OUT, {recursive:true});
const codes = text => Array.from(text, character => "U+" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
function check(width, name) { report.checks.push({width, name}); }

async function open(browser, width, options = {}) {
  const context = await browser.newContext({viewport:{width, height:844}, hasTouch:width === 390, isMobile:width === 390});
  const page = await context.newPage();
  const errors = [], requests = [], missing = [];
  let releaseFonts, noticeFont;
  const fontGate = {enabled:false, held:[], started:new Promise(resolve => { noticeFont = resolve; }), release:() => releaseFonts()};
  const delayedFonts = new Promise(resolve => { releaseFonts = resolve; });
  let catalogueFailure = !!options.failCatalogueOnce;
  let normalizationFailure = !!options.failNormalizationOnce;
  page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(() => {
    window.__combiningCopied = [];
    window.__combiningCopyFail = false;
    Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText:async value => {
      if (window.__combiningCopyFail) throw Error("Clipboard denied for fallback test");
      window.__combiningCopied.push(value);
    }}});
  });
  await page.route("**/*", async route => {
    const address = new global.URL(route.request().url());
    requests.push(address.pathname);
    if (address.origin !== ORIGIN || !address.pathname.startsWith(PREFIX)) {
      missing.push(address.pathname);
      return route.abort("blockedbyclient");
    }
    const relative = decodeURIComponent(address.pathname.slice(PREFIX.length));
    if (relative === "data/combining-marks.json" && catalogueFailure) {
      catalogueFailure = false;
      return route.fulfill({status:404, body:"Injected catalogue fetch failure"});
    }
    if (relative === "data/combining-normalization.json" && normalizationFailure) {
      normalizationFailure = false;
      return route.fulfill({status:503, body:"Injected normalization fetch failure"});
    }
    let file = path.resolve(ROOT, relative);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return route.abort("blockedbyclient");
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(address.pathname);
      return route.fulfill({status:404, body:"Missing test asset"});
    }
    if (fontGate.enabled && /\.(?:ttf|otf|woff2?)$/.test(relative)) {
      fontGate.held.push(relative); noticeFont();
      await delayedFonts;
    }
    return route.fulfill({body:fs.readFileSync(file), contentType:MIME[path.extname(file)] || "application/octet-stream"});
  });
  await page.goto(URL, {waitUntil:"domcontentloaded"});
  return {context, page, errors, requests, missing, fontGate};
}
async function ready(page) {
  await page.waitForFunction(() => document.getElementById("combining-data-count").textContent.trim().length > 0 &&
    document.querySelectorAll(".combining-normalization").length === 4 &&
    document.querySelector(".combining-normalization .combining-codes").textContent.length > 0);
}
async function result(page, expected) {
  await page.waitForFunction(text => document.getElementById("combining-preview").textContent === text, expected);
  assert.equal(await page.locator("#combining-result-codes").textContent(), codes(expected));
  const structure = await page.locator("#combining-preview").evaluate(node => ({
    elements:node.children.length, textNodes:Array.from(node.childNodes).filter(child => child.nodeType === 3).length,
    mode:node.dataset.displayMode, svg:node.querySelectorAll("svg").length
  }));
  assert.equal(structure.elements, 0, "Preview must remain one whole native text run");
  assert.equal(structure.textNodes, expected ? 1 : 0);
  assert.equal(structure.mode, "normal");
  assert.equal(structure.svg, 0, "A collection of single-glyph SVGs must never be reported as shaped output");
}
async function add(page, cp) {
  await page.locator("#combining-search").fill("U+" + cp.toString(16).toUpperCase().padStart(4, "0"));
  await page.locator("#combining-catalogue button").first().click();
}
async function expectNormalization(page, expected) {
  const forms = ["NFC", "NFD", "NFKC", "NFKD"];
  for (let index = 0; index < forms.length; index++) {
    const row = page.locator(".combining-normalization").nth(index);
    assert.equal(await row.locator("h3").textContent(), forms[index]);
    assert.equal(await row.locator(".combining-normalized-text").textContent(), expected[index], forms[index] + " text");
    assert.equal(await row.locator(".combining-codes").textContent(), codes(expected[index]), forms[index] + " codepoints");
  }
}
async function captureFonts(page, width, sample) {
  await page.waitForFunction(() => !!document.getElementById("combining-preview").dataset.fontReason);
  report.fonts.push({width, sample, ...await page.locator("#combining-preview").evaluate(node => ({
    text:node.textContent, family:getComputedStyle(node).fontFamily, files:JSON.parse(node.dataset.fontFiles || "[]"),
    reason:node.dataset.fontReason, displayMode:node.dataset.displayMode, svgReason:node.dataset.svgReason
  }))});
}
async function captureNormalizationFonts(page, width, sample) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".combining-normalized-text")).every(node => !!node.dataset.fontReason));
  const rows = await page.locator(".combining-normalization").evaluateAll(nodes => nodes.map(row => {
    const node = row.querySelector(".combining-normalized-text");
    return {form:row.querySelector("h3").textContent, text:node.textContent, family:getComputedStyle(node).fontFamily,
      files:JSON.parse(node.dataset.fontFiles || "[]"), reason:node.dataset.fontReason, displayMode:node.dataset.displayMode, svgReason:node.dataset.svgReason};
  }));
  assert(rows.every(row => row.displayMode === "normal" && row.files.length > 0), "Normalization views should load at least one verified local font");
  report.fonts.push(...rows.map(row => ({width, sample, ...row})));
}
async function normalCase(browser, width) {
  const {context, page, errors, requests, missing} = await open(browser, width);
  try {
    await ready(page);
    assert.match(await page.locator("#combining-data-version").textContent(), new RegExp(data.unicode_version.replace(/\./g, "\\.")));
    assert.match(await page.locator("#combining-data-count").textContent(), new RegExp(data.count.toLocaleString("ja-JP")));
    assert.equal(await page.locator("#combining-catalogue li").count(), Math.min(60, data.count));
    assert.equal(await page.locator("#combining-catalogue").getAttribute("aria-busy"), "false");
    const active = page.locator('.site-nav a[aria-current="page"]');
    assert.equal(await active.textContent(), "結合文字メーカー");
    assert.equal(await active.getAttribute("href"), URL);
    assert.equal(await page.locator('label[for="combining-base"]').count(), 1);
    assert.equal(await page.locator('label[for="combining-search"]').count(), 1);
    check(width, "project-prefix assets, data version/count, paging, accessible labels, shared navigation");
    await page.locator("#combining-more").click();
    assert.equal(await page.locator("#combining-catalogue li").count(), Math.min(120, data.count));
    check(width, "catalogue incremental rendering");
    await page.locator("#combining-search").fill("COMBINING ACUTE ACCENT");
    assert.match(await page.locator("#combining-catalogue").textContent(), /U\+0301/);
    await page.locator("#combining-search").fill("U+0301");
    assert.equal(await page.locator("#combining-catalogue li").count(), 1);
    assert.match(await page.locator("#combining-catalogue").textContent(), /CCC 230/);
    assert.equal(await page.locator("#combining-catalogue .combining-dotted").textContent(), "◌\u0301");
    await page.locator("#combining-search").fill("Arabic");
    assert.match(await page.locator("#combining-catalogue").textContent(), /Arabic/);
    await page.locator("#combining-search").fill("");
    await page.locator("#combining-script").selectOption("Arab");
    const arabicCount = data.marks.filter(mark => mark.script_code === "Arab" || mark.script_extensions.includes("Arab")).length;
    assert.match(await page.locator("#combining-catalogue-status").textContent(), new RegExp("^" + arabicCount + " /"));
    await page.locator("#combining-script").selectOption("");
    await page.locator("#combining-category").selectOption("Me");
    assert.equal(await page.locator("#combining-catalogue li").count(), data.category_counts.Me);
    for (const description of await page.locator("#combining-catalogue .combining-mark-description").allTextContents()) assert.match(description, / · Me · CCC /);
    await page.locator("#combining-category").selectOption("");
    check(width, "name/codepoint/script/category search, dotted-circle helper, CCC metadata");

    await add(page, 0x0301); await add(page, 0x0301); await add(page, 0x0327);
    await result(page, "a\u0301\u0301\u0327");
    assert.equal(await page.locator("#combining-selected li").count(), 3);
    await page.locator("#combining-selected li").nth(2).locator('[data-action="up"]').click();
    await result(page, "a\u0301\u0327\u0301");
    await page.locator("#combining-selected li").first().locator('[data-action="remove"]').click();
    await result(page, "a\u0327\u0301");
    await expectNormalization(page, ["\u00E1\u0327", "a\u0327\u0301", "\u00E1\u0327", "a\u0327\u0301"]);
    check(width, "duplicate addition, exact order, reorder, individual removal, normalization after changes");
    await page.locator("#combining-base").fill("AB😀");
    await result(page, "AB😀\u0327\u0301");
    await page.locator("#combining-clear").click();
    await result(page, "AB😀");
    assert.equal(await page.locator("#combining-selected li").count(), 0);
    assert.equal(await page.locator("#combining-clear").isDisabled(), true);
    check(width, "arbitrary multi-character base, supplementary codepoints, append-at-end semantics, clear");

    const source = "e\u0301\uFF21\uFB03\u2460\u{1D400}😀\u1100\u1161\u11A8";
    const normalized = ["éＡﬃ①\u{1D400}😀각", "e\u0301Ａﬃ①\u{1D400}😀\u1100\u1161\u11A8", "éAffi1A😀각", "e\u0301Affi1A😀\u1100\u1161\u11A8"];
    await page.locator("#combining-base").fill(source);
    await result(page, source);
    await expectNormalization(page, normalized);
    await captureNormalizationFonts(page, width, "normalization fixture");
    await page.locator("#combining-copy-result").click();
    await page.locator("#combining-copy-codes").click();
    for (let index = 0; index < normalized.length; index++) {
      const buttons = page.locator(".combining-normalization").nth(index).locator("button");
      await buttons.nth(0).click(); await buttons.nth(1).click();
    }
    assert.deepEqual(await page.evaluate(() => window.__combiningCopied), [source, codes(source), ...normalized.flatMap(text => [text, codes(text)])]);
    check(width, "NFC/NFD/NFKC/NFKD exact text and scalar codepoint sequences, all ten clipboard values");

    const unsafe = 'A😀<img src=x onerror="window.__combiningXss=true">👩‍🔬\nक़';
    await page.locator("#combining-base").fill(unsafe);
    await result(page, unsafe);
    assert.equal(await page.evaluate(() => !!window.__combiningXss), false);
    assert.equal(await page.locator("#combining-preview img, #combining-preview script, #combining-preview svg").count(), 0);
    check(width, "literal HTML input remains text; emoji ZWJ, mixed scripts, newline and supplementary characters preserved");
    await page.locator("#combining-base").fill("");
    await add(page, 0x0301);
    await result(page, "\u0301");
    assert.equal(await page.locator("#combining-result-codes").textContent(), "U+0301");
    await page.locator("#combining-copy-result").click();
    assert.equal(await page.evaluate(() => window.__combiningCopied.at(-1)), "\u0301");
    await page.locator("#combining-clear").click();
    await result(page, "");
    assert.equal(await page.locator("#combining-copy-result").isDisabled(), true);
    assert.equal(await page.locator("#combining-copy-codes").isDisabled(), true);
    check(width, "standalone mark excludes dotted-circle helper from output/copy; empty result disables copy");

    await page.locator("#combining-base").fill("a\u0301 · ع\u064E · क\u093F · 😀");
    await captureFonts(page, width, "mixed-script result");
    assert(report.fonts.at(-1).files.length > 0, "Mixed-script preview should prepare local fonts");
    await page.locator("#combining-build-heading").scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(OUT, "maker-" + width + ".png")});
    await page.locator("#combining-normalization-heading").scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(OUT, "normalizations-" + width + ".png")});
    const horizontal = await page.evaluate(() => ({client:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth}));
    assert(horizontal.scroll <= horizontal.client + 1, "Page must not overflow horizontally: " + JSON.stringify(horizontal));
    check(width, "responsive layout and whole-string native-font provenance; no false SVG success");
    await page.evaluate(() => { window.__combiningCopyFail = true; document.execCommand = () => false; });
    await page.locator("#combining-copy-result").click();
    assert.equal(await page.locator(".combining-manual-copy").inputValue(), "a\u0301 · ع\u064E · क\u093F · 😀");
    check(width, "clipboard rejection provides selected manual-copy field");
    assert.deepEqual(errors, [], "No uncaught page exceptions");
    assert.deepEqual(missing, [], "Every requested asset preserves the project prefix");
    assert(requests.includes(PREFIX + "data/combining-marks.json"));
    assert(requests.includes(PREFIX + "data/combining-normalization.json"));
    assert(requests.filter(name => /\.(?:ttf|otf|woff2?)$/.test(name)).every(name => name.startsWith(PREFIX + "fonts/")));
  } catch (error) {
    await page.screenshot({path:path.join(OUT, "failure-" + width + ".png")}).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function delayedFontCase(browser) {
  const {context, page, errors, missing, fontGate} = await open(browser, 390);
  try {
    await ready(page);
    await captureFonts(page, 390, "initial cached Latin");
    await page.waitForLoadState("networkidle");
    fontGate.enabled = true;
    await page.locator("#combining-base").fill("ع\u064E");
    let timer;
    try {
      await Promise.race([fontGate.started, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Expected Arabic font request to be held")), 10000); })]);
    } finally { clearTimeout(timer); }
    await result(page, "ع\u064E");
    await page.locator("#combining-base").fill("z");
    await result(page, "z");
    await captureFonts(page, 390, "new Latin input while old Arabic font pending");
    const current = await page.locator("#combining-preview").evaluate(node => ({family:node.style.fontFamily, files:node.dataset.fontFiles, reason:node.dataset.fontReason}));
    fontGate.release();
    await page.evaluate(async () => { await window.UnicodeCombiningFonts.prepare("ع\u064E"); await new Promise(resolve => requestAnimationFrame(resolve)); });
    await result(page, "z");
    assert.deepEqual(await page.locator("#combining-preview").evaluate(node => ({family:node.style.fontFamily, files:node.dataset.fontFiles, reason:node.dataset.fontReason})), current,
      "An older Arabic font response must not replace the current Latin font selection");
    assert(fontGate.held.length > 0);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    check(390, "delayed old-font completion cannot overwrite current text or font provenance");
  } finally { fontGate.release(); await context.close(); }
}
async function failureCase(browser, options, name) {
  const {context, page, errors, missing} = await open(browser, 390, options);
  try {
    await page.waitForFunction(() => !document.getElementById("combining-retry").hidden);
    assert.match(await page.locator("#combining-status").textContent(), /読み込めません/);
    await page.locator("#combining-base").fill("😀e\u0301");
    await result(page, "😀e\u0301");
    await page.locator("#combining-retry").click();
    await ready(page);
    assert.equal(await page.locator("#combining-retry").isHidden(), true);
    assert.equal(await page.locator(".combining-normalization").count(), 4);
    await expectNormalization(page, ["😀é", "😀e\u0301", "😀é", "😀e\u0301"]);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    check(390, name + ": independent native input, actionable retry, recovery without duplicate rows");
  } finally { await context.close(); }
}
(async () => {
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({headless:true, executablePath, args:["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    await normalCase(browser, 1100);
    await normalCase(browser, 390);
    await delayedFontCase(browser);
    await failureCase(browser, {failCatalogueOnce:true}, "Catalogue HTTP failure");
    await failureCase(browser, {failNormalizationOnce:true}, "Normalization HTTP failure");
    report.status = "PASS";
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("PASS: " + report.checks.length + " browser integration checks across desktop1100/mobile390, Unicode " + report.unicodeVersion + " / " + report.count + " marks");
  } catch (error) {
    report.status = "FAIL"; report.error = error.stack;
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
