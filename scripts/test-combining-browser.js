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
  let propertiesFailure = !!options.failPropertiesOnce;
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
    if (relative === "data/combining-base-properties.json" && propertiesFailure) {
      propertiesFailure = false;
      return route.fulfill({status:503, body:"Injected base-property fetch failure"});
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
    document.querySelector(".combining-normalization .combining-codes").textContent.length > 0 &&
    document.querySelectorAll("#combining-groups button").length > 1 &&
    document.getElementById("combining-catalogue").getAttribute("aria-busy") === "false");
}
async function result(page, expected) {
  await page.waitForFunction(text => document.getElementById("combining-preview").textContent === text, expected);
  assert.equal(await page.locator("#combining-result-codes").textContent(), codes(expected));
  const structure = await page.locator("#combining-preview").evaluate(node => ({
    elements:node.children.length, textNodes:Array.from(node.childNodes).filter(child => child.nodeType === 3).length,
    mode:node.dataset.displayMode, svg:node.querySelectorAll("svg").length
  }));
  assert.equal(structure.elements, 0, "Preview must remain one browser-shaped text run");
  assert.equal(structure.textNodes, expected ? 1 : 0);
  assert.equal(structure.mode, "normal");
  assert.equal(structure.svg, 0, "Single-glyph SVGs cannot represent the completed sequence");
}
async function details(page, id, open = true) {
  const item = page.locator("#" + id);
  if (await item.evaluate(node => node.open) !== open) await item.locator(":scope > summary").click();
}
async function allGroups(page) {
  const button = page.locator('#combining-groups button[data-group=""]');
  if (await button.getAttribute("aria-pressed") === "true") return;
  await button.click();
}
async function search(page, query) {
  await details(page, "combining-search-options");
  // A previous query can legitimately leave an empty pool and disable its
  // already-active group button. Clear it before choosing the next filter.
  await page.locator("#combining-search").fill("");
  await allGroups(page);
  await page.locator("#combining-search").fill(query);
}
async function mark(page, cp) {
  await search(page, codes(String.fromCodePoint(cp)));
  return page.locator('#combining-catalogue button[data-codepoint="' + cp + '"]');
}
async function add(page, cp) { await (await mark(page, cp)).click(); }
async function clear(page) {
  if (await page.locator("#combining-clear").isEnabled()) await page.locator("#combining-clear").click();
}
async function resetSearch(page) {
  await details(page, "combining-search-options");
  await page.locator("#combining-search").fill("");
  await page.locator("#combining-script").selectOption("");
  await page.locator("#combining-category").selectOption("");
  await allGroups(page);
}
async function expectNormalization(page, expected) {
  for (const [index, form] of ["NFC", "NFD", "NFKC", "NFKD"].entries()) {
    const row = page.locator(".combining-normalization").nth(index);
    assert.equal(await row.locator("h3").textContent(), form);
    assert.equal(await row.locator(".combining-normalized-text").textContent(), expected[index], form + " text");
    assert.equal(await row.locator(".combining-codes").textContent(), codes(expected[index]), form + " codepoints");
  }
}
async function captureFonts(page, width, sample) {
  await page.waitForFunction(() => !!document.getElementById("combining-preview").dataset.fontReason);
  const record = await page.locator("#combining-preview").evaluate(node => ({
    text:node.textContent, family:getComputedStyle(node).fontFamily, files:JSON.parse(node.dataset.fontFiles || "[]"),
    reason:node.dataset.fontReason, displayMode:node.dataset.displayMode, svgReason:node.dataset.svgReason
  }));
  report.fonts.push({width, sample, ...record});
  return record;
}
async function invalid(page, value) {
  await page.locator("#combining-base").fill(value);
  assert.equal(await page.locator("#combining-base").inputValue(), value, "Invalid input must not be silently truncated");
  await result(page, "");
  assert.equal(await page.locator("#combining-base").getAttribute("aria-invalid"), "true");
  assert((await page.locator("#combining-base-error").textContent()).trim());
  assert.equal(await page.locator("#combining-copy-result").isDisabled(), true);
  assert.equal(await page.locator("#combining-copy-codes").isDisabled(), true);
  assert.equal(await page.locator("#combining-catalogue button:enabled").count(), 0);
}
async function normalCase(browser, width) {
  const {context, page, errors, requests, missing} = await open(browser, width);
  try {
    await ready(page);
    assert.match(await page.locator("#combining-data-version").textContent(), /18\.0\.0/);
    assert.match(await page.locator("#combining-data-count").textContent(), /2,?580/);
    assert.equal(await page.locator("#combining-base").getAttribute("maxlength"), null, "UTF-16 maxlength=1 would reject supplementary scalars");
    assert.equal(await page.locator("#combining-base").evaluate(node => node.tagName), "INPUT");
    assert.equal(await page.locator('.site-nav a[aria-current="page"]').textContent(), "結合文字メーカー");
    assert.equal(await page.locator('.site-nav a[aria-current="page"]').getAttribute("href"), URL);
    assert.equal(await page.locator('label[for="combining-base"]').count(), 1);
    assert.equal(await page.locator("#combining-show-all").isChecked(), false);
    assert.equal(await page.locator("#combining-normalization-panel").evaluate(node => node.open), false);
    check(width, "single-scalar input, version/count, compact defaults, accessible navigation and labels");

    await page.locator("#combining-base").fill("e");
    await result(page, "e");
    const acute = await mark(page, 0x301);
    assert.equal(await acute.count(), 1);
    const candidate = await acute.locator(".combining-candidate-preview").evaluate(node => ({text:node.textContent, children:node.children.length}));
    assert.deepEqual(candidate, {text:"e\u0301", children:0}, "Candidate displays the real base-plus-mark sequence, not a dotted circle");
    assert.match(await acute.getAttribute("title"), /CCC\s*230/);
    assert.equal(await (await mark(page, 0x64E)).count(), 0, "Arabic fatha is not recommended for Latin");
    assert.equal(await (await mark(page, 0x93F)).count(), 0, "Devanagari vowel sign is not recommended for Latin");
    await page.locator("#combining-base").fill("ع");
    assert.equal(await (await mark(page, 0x64E)).count(), 1, "Typing an Arabic scalar immediately updates recommendations");
    await page.locator("#combining-base").fill("か");
    assert.equal(await (await mark(page, 0x3099)).count(), 1, "Kana dakuten is recommended through Script_Extensions");
    await page.locator("#combining-base").fill("क");
    assert.equal(await (await mark(page, 0x93F)).count(), 1);
    check(width, "live Script/Script_Extensions recommendations, dedicated-script exclusion and real candidate previews");

    await page.locator("#combining-base").fill("a");
    await page.locator("#combining-show-all").check();
    await resetSearch(page);
    assert.match(await page.locator("#combining-catalogue-status").textContent(), /2,?580/);
    assert.equal(await (await mark(page, 0x64E)).count(), 1, "All mode exposes cross-script marks");
    await add(page, 0x64E);
    await result(page, "a\u064E");
    await clear(page);
    await resetSearch(page);
    const first = await page.locator("#combining-catalogue button").first().getAttribute("data-codepoint");
    assert.equal(await page.locator("#combining-catalogue li").count(), 36);
    await page.locator("#combining-page-next").click();
    assert.equal(await page.locator("#combining-catalogue li").count(), 36, "Paging replaces the selection panel instead of appending a long list");
    assert.notEqual(await page.locator("#combining-catalogue button").first().getAttribute("data-codepoint"), first);
    await page.locator("#combining-page-prev").click();
    assert.equal(await page.locator("#combining-catalogue button").first().getAttribute("data-codepoint"), first);
    const panelHeight = await page.locator("#combining-catalogue").evaluate(node => node.getBoundingClientRect().height);
    assert(panelHeight <= 520, "Candidate panel must remain compact: " + panelHeight);
    check(width, "all2580 retained, cross-script selection allowed, bounded36-item panel and replacement pagination");

    await page.locator('#combining-groups button[data-group="enclosing"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('#combining-groups button[data-group="enclosing"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('#combining-groups button[data-group=""]').getAttribute("aria-pressed"), "false");
    assert(await page.locator("#combining-catalogue button").count() > 0);
    await resetSearch(page);
    await page.locator("#combining-category").selectOption("Me");
    assert.equal(await page.locator("#combining-catalogue button").count(), data.category_counts.Me);
    await page.locator("#combining-category").selectOption("");
    await page.locator("#combining-script").selectOption("Hebr");
    await page.locator("#combining-search").fill("U+05B8");
    assert.equal(await page.locator('#combining-catalogue button[data-codepoint="1464"]').count(), 1);
    await resetSearch(page);
    await page.locator("#combining-search").fill("COMBINING ACUTE ACCENT");
    assert(await page.locator('#combining-catalogue button[data-codepoint="769"]').count() > 0);
    check(width, "keyboard group buttons and retained category/script/name/codepoint search");

    await page.locator("#combining-show-all").uncheck();
    await page.locator("#combining-base").fill("a");
    await add(page, 0x301); await add(page, 0x301); await add(page, 0x327);
    await result(page, "a\u0301\u0301\u0327");
    assert.equal(await page.locator("#combining-selected li").count(), 3);
    assert.equal(await page.locator("#combining-base-token").textContent(), "a");
    assert.equal(await page.locator("#combining-composition .combining-plus").count(), 3);
    await page.locator("#combining-selected li").nth(2).locator('[data-action="up"]').click();
    await result(page, "a\u0301\u0327\u0301");
    await page.locator("#combining-selected li").first().locator('[data-action="remove"]').click();
    await result(page, "a\u0327\u0301");
    await details(page, "combining-normalization-panel");
    await expectNormalization(page, ["\u00E1\u0327", "a\u0327\u0301", "\u00E1\u0327", "a\u0327\u0301"]);
    await page.locator("#combining-base").fill("e");
    await result(page, "e\u0327\u0301");
    assert.equal(await page.locator("#combining-selected li").count(), 2, "Changing base preserves explicitly selected marks");
    await clear(page);
    check(width, "addition-form composition, duplicates, reorder/removal, stable selection across base edits and exact normalization");

    for (const input of ["ab", "a\uFE0F", "👩‍🔬", '<img src=x onerror="window.__combiningXss=true">']) await invalid(page, input);
    assert.equal(await page.evaluate(() => !!window.__combiningXss), false);
    assert.equal(await page.locator("#combining-preview img, #combining-preview script").count(), 0);
    await page.locator("#combining-base").fill("😀");
    await result(page, "😀");
    assert.equal(await page.locator("#combining-base").inputValue(), "😀");
    assert.notEqual(await page.locator("#combining-base").getAttribute("aria-invalid"), "true");
    for (const value of ["<", "&", "\u0301"]) {
      await page.locator("#combining-base").fill(value);
      await result(page, value);
    }
    await invalid(page, "");
    await page.locator("#combining-base").fill("e");
    await page.locator("#combining-base").evaluate(node => {
      node.dispatchEvent(new CompositionEvent("compositionstart", {bubbles:true}));
      node.value = "ga"; node.dispatchEvent(new InputEvent("input", {bubbles:true, isComposing:true}));
    });
    assert.equal(await page.locator("#combining-base").inputValue(), "ga", "IME interim text must not be clobbered");
    await page.locator("#combining-base").evaluate(node => {
      node.value = "が"; node.dispatchEvent(new InputEvent("input", {bubbles:true, isComposing:true}));
      node.dispatchEvent(new CompositionEvent("compositionend", {bubbles:true, data:"が"}));
    });
    await result(page, "が");
    check(width, "strict scalar validation, supplementary surrogatepair support, safe invalid text and IME commit");

    const source = "ﬃ", normalized = [source, source, "ffi", "ffi"];
    await page.locator("#combining-base").fill(source);
    await result(page, source);
    await expectNormalization(page, normalized);
    await page.evaluate(() => { window.__combiningCopied = []; });
    await page.locator("#combining-copy-result").click(); await page.locator("#combining-copy-codes").click();
    for (let index = 0; index < normalized.length; index++) {
      const buttons = page.locator(".combining-normalization").nth(index).locator("button");
      await buttons.nth(0).click(); await buttons.nth(1).click();
    }
    assert.deepEqual(await page.evaluate(() => window.__combiningCopied), [source, codes(source), ...normalized.flatMap(value => [value, codes(value)])]);
    await page.locator("#combining-base").fill("\uAC01");
    await expectNormalization(page, ["\uAC01", "\u1100\u1161\u11A8", "\uAC01", "\u1100\u1161\u11A8"]);
    await page.locator("#combining-base").fill("\u{1D400}");
    await expectNormalization(page, ["\u{1D400}", "\u{1D400}", "A", "A"]);
    check(width, "four exact normalizations and ten clipboard values, including Hangul and supplementary compatibility input");

    await page.locator("#combining-base").fill("e"); await add(page, 0x301); await add(page, 0x327);
    await result(page, "e\u0301\u0327");
    await captureFonts(page, width, "completed Latin composition");
    assert(report.fonts.at(-1).files.length > 0);
    await resetSearch(page);
    await details(page, "combining-search-options", false);
    await details(page, "combining-normalization-panel", false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:path.join(OUT, "maker-" + width + ".png")});
    await page.screenshot({path:path.join(OUT, "maker-full-" + width + ".png"), fullPage:true});
    await details(page, "combining-normalization-panel");
    await page.locator("#combining-normalization-heading").scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(OUT, "normalizations-" + width + ".png")});
    const horizontal = await page.evaluate(() => ({client:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth}));
    assert(horizontal.scroll <= horizontal.client + 1, "No document horizontal overflow: " + JSON.stringify(horizontal));
    assert.equal(await page.locator("#combining-base").evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16), true);
    check(width, "responsive compact layout, screenshots, native-font provenance and preserved whole-text shaping");
    await page.evaluate(() => { window.__combiningCopyFail = true; document.execCommand = () => false; });
    await page.locator("#combining-copy-result").click();
    assert.equal(await page.locator(".combining-manual-copy").inputValue(), "e\u0301\u0327");
    check(width, "clipboard rejection retains a selected manual-copy fallback");
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    for (const name of ["combining-marks.json", "combining-normalization.json", "combining-base-properties.json"])
      assert(requests.includes(PREFIX + "data/" + name));
    assert(requests.filter(name => /\.(?:ttf|otf|woff2?)$/.test(name)).every(name => name.startsWith(PREFIX + "fonts/")));
  } catch (error) {
    await page.screenshot({path:path.join(OUT, "failure-" + width + ".png")}).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function delayedFontCase(browser) {
  const {context, page, errors, missing, fontGate} = await open(browser, 390);
  try {
    await ready(page); await captureFonts(page, 390, "cached initial Latin");
    await page.waitForLoadState("networkidle");
    fontGate.enabled = true;
    await page.locator("#combining-base").fill("ع");
    let timer;
    try { await Promise.race([fontGate.started, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Expected a held Arabic font request")), 10000); })]); }
    finally { clearTimeout(timer); }
    await result(page, "ع");
    await page.locator("#combining-base").fill("z"); await result(page, "z");
    await captureFonts(page, 390, "current Latin while old Arabic font pending");
    const latest = await page.locator("#combining-preview").evaluate(node => ({family:node.style.fontFamily, files:node.dataset.fontFiles, reason:node.dataset.fontReason}));
    fontGate.release();
    await page.evaluate(async () => { await window.UnicodeCombiningFonts.prepare("ع"); await new Promise(resolve => requestAnimationFrame(resolve)); });
    await result(page, "z");
    assert.deepEqual(await page.locator("#combining-preview").evaluate(node => ({family:node.style.fontFamily, files:node.dataset.fontFiles, reason:node.dataset.fontReason})), latest);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    check(390, "late font completion cannot overwrite current base, result or font selection");
  } finally { fontGate.release(); await context.close(); }
}
async function failureCase(browser, options, name) {
  const {context, page, errors, missing} = await open(browser, 390, options);
  try {
    await page.waitForFunction(() => !document.getElementById("combining-retry").hidden);
    await page.locator("#combining-base").fill("😀"); await result(page, "😀");
    await page.locator("#combining-retry").click(); await ready(page);
    assert.equal(await page.locator("#combining-retry").isHidden(), true);
    assert.equal(await page.locator(".combining-normalization").count(), 4);
    await expectNormalization(page, ["😀", "😀", "😀", "😀"]);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    check(390, name + ": base preview remains usable, retry restores independent data without duplicate rows");
  } finally { await context.close(); }
}
(async () => {
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({headless:true, executablePath, args:["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    await normalCase(browser, 1100); await normalCase(browser, 390);
    await delayedFontCase(browser);
    await failureCase(browser, {failCatalogueOnce:true}, "Catalogue HTTP failure");
    await failureCase(browser, {failNormalizationOnce:true}, "Normalization HTTP failure");
    await failureCase(browser, {failPropertiesOnce:true}, "Base-property HTTP failure");
    report.status = "PASS";
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("PASS: " + report.checks.length + " browser integration checks across desktop1100/mobile390, Unicode " + report.unicodeVersion + " / " + report.count + " marks");
  } catch (error) {
    report.status = "FAIL"; report.error = error.stack;
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
