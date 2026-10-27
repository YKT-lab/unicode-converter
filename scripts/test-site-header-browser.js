"use strict";
// Behaviour and geometry checks for the shared header. Files are served from
// this checkout beneath a GitHub Pages project prefix; no public requests run.
// --baseline=<git-ref> records an earlier revision without asserting fixes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {execFileSync} = require("node:child_process");
const {chromium} = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const argument = name => process.argv.find(value => value.startsWith("--" + name + "="))?.slice(name.length + 3);
const BASELINE = argument("baseline");
const OUT = path.resolve(argument("out") || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "unicode-site-header"));
const SVG_ROOT = argument("svg-root");
const ORIGIN = "http://127.0.0.1:4197";
const PREFIX = "/unicode-converter/";
const WIDTHS = [375, 390, 430, 519, 520, 521, 619, 620, 621, 768, 820, 899, 900, 1024, 1280];
const PAGES = ["", "about/", "emoji/", "combining/", "unicode/", "url-checker/", "news/", "news/about/", "news/combining-launch/", "news/combining-panel/", "news/display-issues/", "news/svg-display/", "news/unicode-18/"];
const MIME = {".html":"text/html", ".css":"text/css", ".js":"application/javascript", ".json":"application/json", ".png":"image/png", ".ttf":"font/ttf", ".otf":"font/otf", ".woff":"font/woff", ".woff2":"font/woff2"};
const report = {baseline:BASELINE || null, projectPrefix:PREFIX, realIPhoneSafariTested:false, checks:[], widths:[], pages:[], errors:[], missing:[]};
fs.mkdirSync(OUT, {recursive:true});
const historical = new Map();
function readFile(relative) {
  if (BASELINE && /\.(?:html|css|js|json)$/.test(relative)) {
    if (!historical.has(relative)) {
      try { historical.set(relative, execFileSync("git", ["show", BASELINE + ":" + relative], {cwd:ROOT, maxBuffer:64 * 1024 * 1024})); }
      catch (_) { historical.set(relative, null); }
    }
    if (historical.get(relative)) return historical.get(relative);
  }
  const file = path.resolve(ROOT, relative);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file);
  if (SVG_ROOT && relative.startsWith("svg-data/")) {
    const svg = path.resolve(SVG_ROOT, relative.slice("svg-data/".length));
    if (svg.startsWith(path.resolve(SVG_ROOT) + path.sep) && fs.existsSync(svg)) return fs.readFileSync(svg);
  }
  return null;
}
function check(name, detail) { report.checks.push({name, ...(detail || {})}); }
async function open(browser, width, options = {}) {
  let releaseFont, fontStarted;
  const fontGate = {hold:false, started:new Promise(resolve => { fontStarted = resolve; }), release:() => releaseFont()};
  const heldFont = new Promise(resolve => { releaseFont = resolve; });
  const context = await browser.newContext({viewport:{width, height:844}, hasTouch:width < 900, javaScriptEnabled:options.javaScriptEnabled !== false});
  await context.addInitScript(initial => {
    if (initial.deviceFont) localStorage.setItem("unicode-converter-device-font-mode", "on");
    window.__headerErrors = [];
    window.addEventListener("error", event => window.__headerErrors.push(event.message));
  }, options);
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push({width, url:page.url(), message:error.message}));
  await page.route("**/*", async route => {
    const address = new URL(route.request().url());
    if (address.origin !== ORIGIN || !address.pathname.startsWith(PREFIX)) return route.abort("blockedbyclient");
    let relative = decodeURIComponent(address.pathname.slice(PREFIX.length));
    if (!relative || relative.endsWith("/")) relative += "index.html";
    const body = readFile(relative);
    if (body === null) {
      if (!relative.startsWith("svg-data/")) report.missing.push(relative);
      return route.fulfill({status:404, body:"Not available in local checkout"});
    }
    if (fontGate.hold && /\.(?:ttf|otf|woff2?)$/.test(relative)) { fontStarted(); await heldFont; }
    return route.fulfill({body, contentType:MIME[path.extname(relative)] || "application/octet-stream"});
  });
  return {context, page, fontGate};
}
async function visit(page, suffix = "about/", js = true) {
  await page.goto(ORIGIN + PREFIX + suffix, {waitUntil:"domcontentloaded"});
  if (js) await page.waitForSelector(".site-menu-ready");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(70);
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom}; };
    const bar = document.querySelector(".site-topbar"), nav = document.querySelector(".site-nav"), menu = document.getElementById("siteMenuToggle");
    const main = document.querySelector("main") || document.querySelector(".page-intro");
    return {width:innerWidth, height:innerHeight, bar:rect(bar), nav:rect(nav), logo:rect(document.querySelector(".site-logo-link")), settings:document.getElementById("siteSettingsToggle") ? rect(document.getElementById("siteSettingsToggle")) : null,
      measuredHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-topbar-height")), padding:parseFloat(getComputedStyle(document.body).paddingTop), scrollPadding:parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
      documentWidth:document.documentElement.scrollWidth, menuVisible:!!menu && getComputedStyle(menu).display !== "none", navVisible:getComputedStyle(nav).visibility !== "hidden", navHidden:nav.getAttribute("aria-hidden"), navInert:nav.inert, bodyPosition:getComputedStyle(document.body).position,
      mainTop:main ? rect(main).y : null, contentTop:bar.nextElementSibling ? rect(bar.nextElementSibling).y : null, barPosition:getComputedStyle(bar).position, current:Array.from(nav.querySelectorAll('[aria-current="page"]'), node => node.textContent),
      links:Array.from(nav.querySelectorAll("a"), node => ({text:node.textContent, href:node.href, tabIndex:node.tabIndex, ...rect(node), textAlign:getComputedStyle(node).textAlign, justifyContent:getComputedStyle(node).justifyContent})),
      bodySelectable:getComputedStyle(document.querySelector("main p, .page-intro p, p")).userSelect,
      logoDraggable:document.querySelector(".site-logo-link").draggable, imageDraggable:document.querySelector("img.site-logo").draggable,
      headerUserSelect:getComputedStyle(bar).userSelect, headerCallout:getComputedStyle(bar).getPropertyValue("-webkit-touch-callout")};
  });
}
async function screenshot(page, name) { await page.screenshot({path:path.join(OUT, name + ".png"), animations:"disabled"}); }
async function expanded(page, selector, value) { assert.equal(await page.locator(selector).getAttribute("aria-expanded"), String(value)); }
async function openMenu(page) { await page.locator("#siteMenuToggle").click(); await page.waitForTimeout(260); }
async function settings(page) { await page.locator("#siteSettingsToggle").click(); await page.waitForTimeout(230); }
function assertHeader(g, width, pagePath) {
  assert.equal(g.links.length, 7, pagePath + " has all seven links");
  assert.deepEqual(g.links.map(link => link.href), PAGES.slice(0, 7).map(suffix => ORIGIN + PREFIX + suffix), "all seven destinations preserve the GitHub Pages project prefix");
  assert.equal(g.current.length, 1, pagePath + " has exactly one current page");
  assert.equal(g.documentWidth, width, pagePath + " does not overflow horizontally");
  assert(Math.abs(g.bar.height - g.measuredHeight) <= 1, "topbar CSS custom property matches actual full topbar");
  assert(g.padding >= g.bar.height + 15, "body clears fixed topbar");
  assert(g.scrollPadding >= g.bar.height, "fragment scrolling clears fixed topbar");
  if (g.mainTop !== null) assert(g.mainTop >= g.bar.bottom - 1, "page content starts below header");
  assert(Math.abs(g.logo.x + g.logo.width / 2 - width / 2) <= 2, "logo stays centered");
  assert(g.settings.x >= g.logo.right - 1 && g.settings.right <= width, "settings remain right of logo and inside viewport");
  assert.notEqual(g.bodySelectable, "none", "body copy remains enabled");
  assert.equal(g.logoDraggable, false); assert.equal(g.imageDraggable, false);
  assert.equal(g.headerUserSelect, "none", "selection suppression is scoped to header");
  if (width >= 900) {
    assert.equal(g.menuVisible, false); assert.equal(g.navVisible, true); assert.equal(g.navHidden, "false"); assert.equal(g.navInert, false);
    for (const link of g.links) {
      assert.equal(link.tabIndex, 0, "desktop links remain keyboard-accessible");
      assert(link.x >= 0 && link.right <= width, "desktop links fit viewport");
      assert(link.y >= g.bar.y && link.bottom <= g.bar.bottom + 1, "desktop links fit header");
      assert(Math.abs(link.y - g.links[0].y) <= 1, "desktop navigation remains one row");
    }
  } else {
    assert.equal(g.menuVisible, true); assert.equal(g.navHidden, "true"); assert.equal(g.navInert, true);
    for (const link of g.links) assert.equal(link.tabIndex, -1, "closed mobile links are not focusable");
  }
}
async function widths(browser) {
  for (const width of WIDTHS) {
    const {context, page} = await open(browser, width);
    try {
      await visit(page);
      const closed = await geometry(page);
      if (!BASELINE) assertHeader(closed, width, "about/");
      await screenshot(page, width + "-closed");
      const record = {width, closed};
      if (width < 900) {
        await openMenu(page);
        record.open = await geometry(page);
        await screenshot(page, width + "-menu");
        if (!BASELINE) {
          const g = record.open;
          assert(Math.abs(g.nav.x) <= 1 && Math.abs(g.nav.y) <= 1, "drawer starts at viewport top-left");
          assert(Math.abs(g.nav.height - g.height) <= 1 && Math.abs(g.nav.bottom - g.height) <= 1, "drawer covers full viewport height");
          assert(g.nav.width <= 260.5 && g.nav.width >= Math.min(width * .68, 250), "drawer remains narrow and usable");
          assert.equal(g.bodyPosition, "fixed", "drawer locks background scrolling");
          assert.equal(g.navInert, false); assert.equal(g.navHidden, "false");
          for (const link of g.links) { assert.equal(link.tabIndex, 0); assert(link.height >= 44); assert.notEqual(link.justifyContent, "center"); }
        }
        await page.keyboard.press("Escape"); await page.waitForTimeout(230);
      }
      await settings(page);
      await screenshot(page, width + "-settings");
      record.settings = await page.locator("#siteSettingsPanel").evaluate(node => { const r=node.getBoundingClientRect(); return {x:r.x, y:r.y, right:r.right, bottom:r.bottom, visibility:getComputedStyle(node).visibility, aria:node.getAttribute("aria-hidden"), hit:node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))}; });
      if (!BASELINE) {
        assert.equal(record.settings.visibility, "visible"); assert.equal(record.settings.aria, "false"); assert.equal(record.settings.hit, true);
        assert(record.settings.x >= 0 && record.settings.right <= width && record.settings.bottom < 844);
        await expanded(page, "#siteMenuToggle", false);
      }
      report.widths.push(record); check("header/drawer/settings geometry and screenshots", {width});
    } finally { await context.close(); }
  }
}
async function allPages(browser) {
  for (const width of [390, 900]) {
    const {context, page} = await open(browser, width);
    try {
      for (const suffix of PAGES) {
        await visit(page, suffix);
        const g = await geometry(page);
        if (!BASELINE) assertHeader(g, width, suffix || "top");
        report.pages.push({width, page:suffix || "top", geometry:g});
        if (suffix === "url-checker/") await screenshot(page, width + "-url-checker");
      }
      check("all 13 pages and news articles use shared header, prefix, active link and body offsets", {width});
    } finally { await context.close(); }
  }
}
async function interactions(browser) {
  const {context, page} = await open(browser, 390);
  try {
    await visit(page);
    await page.evaluate(() => { const spacer=document.createElement("div"); spacer.style.height="2200px"; document.body.append(spacer); window.scrollTo(0,180); });
    await page.waitForTimeout(80);
    const previous = await page.evaluate(() => scrollY);
    assert(previous > 100);
    await openMenu(page); await expanded(page, "#siteMenuToggle", true);
    assert.equal(await page.locator(".site-nav a").first().evaluate(node => node === document.activeElement), true, "opening menu moves focus to navigation");
    await page.mouse.move(350, 600); await page.mouse.wheel(0, 500); await page.waitForTimeout(100);
    assert.equal(await page.locator("body").evaluate(node => getComputedStyle(node).position), "fixed");
    await page.setViewportSize({width:390, height:650}); await page.waitForTimeout(100);
    await expanded(page, "#siteMenuToggle", true);
    assert(Math.abs((await geometry(page)).nav.bottom - 650) <= 1);
    await page.setViewportSize({width:390, height:844});
    await page.locator("#siteMenuToggle").click(); await page.waitForTimeout(260);
    await expanded(page, "#siteMenuToggle", false);
    assert.equal(await page.locator("#siteMenuToggle").evaluate(node => node === document.activeElement), true);
    assert(Math.abs(await page.evaluate(() => scrollY) - previous) <= 1, "closing restores original scroll position");
    check("drawer close control, background scroll lock and height-only resize preserve state and scroll");

    await openMenu(page); await page.mouse.click(350, 500); await page.waitForTimeout(250);
    await expanded(page, "#siteMenuToggle", false);
    await openMenu(page); await page.keyboard.press("Escape");
    await expanded(page, "#siteMenuToggle", false);
    await openMenu(page); await page.locator(".site-nav a").last().focus(); await page.keyboard.press("Tab");
    // Permit an additional header control before focus reaches page content.
    if (await page.locator(".site-topbar").evaluate(node => node.contains(document.activeElement))) await page.keyboard.press("Tab");
    await expanded(page, "#siteMenuToggle", false);
    check("outside tap, Escape, and keyboard exit collapse non-modal drawer");

    await openMenu(page); await settings(page);
    await expanded(page, "#siteMenuToggle", false); await expanded(page, "#siteSettingsToggle", true);
    await openMenu(page); await expanded(page, "#siteMenuToggle", true); await expanded(page, "#siteSettingsToggle", false);
    await page.keyboard.press("Escape");
    await settings(page);
    const on = await page.locator("#browserFontModeToggle").getAttribute("aria-pressed");
    await page.locator("#browserFontModeToggle").click();
    assert.equal(await page.locator("#browserFontModeToggle").getAttribute("aria-pressed"), String(on !== "true"));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("site-device-font-mode")), on !== "true");
    await page.locator("#browserFontModeToggle").click();
    const scope = await page.locator("#scopeModeToggle").getAttribute("aria-pressed");
    await page.locator("#scopeModeToggle").click();
    assert.equal(await page.locator("#scopeModeToggle").getAttribute("aria-pressed"), String(scope !== "true"));
    await page.locator("#scopeModeToggle").click();
    await page.keyboard.press("Escape"); await expanded(page, "#siteSettingsToggle", false);
    assert.equal(await page.locator("#siteSettingsToggle").evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator("#browserFontModeToggle").evaluate(node => node.tabIndex), -1);
    assert.equal(await page.locator("#siteSettingsPanel").evaluate(node => node.inert), true);
    check("settings mutual exclusion, Escape/focus, device font and Scope controls");

    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(80);
    await openMenu(page); await page.setViewportSize({width:900, height:844}); await page.waitForTimeout(100);
    let g = await geometry(page); assertHeader(g, 900, "resized desktop");
    assert.notEqual(g.bodyPosition, "fixed");
    await page.locator(".site-nav a").first().focus(); await page.setViewportSize({width:899, height:844}); await page.waitForTimeout(100);
    g = await geometry(page); assertHeader(g, 899, "resized mobile");
    assert.equal(await page.locator(".site-nav").evaluate(node => node.contains(document.activeElement)), false);
    await settings(page); await page.setViewportSize({width:900, height:844}); await page.waitForTimeout(100);
    await expanded(page, "#siteSettingsToggle", false);
    assert.equal(await page.locator("#siteSettingsToggle").evaluate(node => node === document.activeElement), true);
    assert(!(await page.evaluate(() => window.__headerErrors)).some(message => /ResizeObserver/.test(message)), "no ResizeObserver loop errors");
    check("900px breakpoint resets drawer/settings, scroll lock, focus, aria and tab order");

    await page.setViewportSize({width:390, height:844}); await visit(page);
    await openMenu(page);
    await page.locator('.site-nav a[href$="url-checker/"]').click();
    await page.waitForURL(ORIGIN + PREFIX + "url-checker/");
    assert.equal(await page.locator('.site-nav a[aria-current="page"]').textContent(), "URLチェッカー");
    check("mobile navigation follows correct GitHub Pages project URL");

    await visit(page, "combining/");
    await page.waitForFunction(() => document.querySelectorAll("#combining-catalogue button").length > 0);
    await settings(page); await page.locator("#scopeModeToggle").click();
    assert.equal(await page.locator("#scopeModeToggle").getAttribute("aria-pressed"), "true");
    await visit(page, "about/"); await settings(page);
    assert.equal(await page.locator("#scopeModeToggle").getAttribute("aria-pressed"), "true", "combining preference is honored by Scope pages");
    await page.locator("#scopeModeToggle").click();
    await visit(page, "combining/"); await settings(page);
    assert.equal(await page.locator("#scopeModeToggle").getAttribute("aria-pressed"), "false");
    check("Scope preference works on combining page without viewer and survives navigation");
  } finally { await context.close(); }
}
async function noJavaScript(browser) {
  for (const width of [390, 900]) {
    const {context, page} = await open(browser, width, {javaScriptEnabled:false});
    try {
      for (const suffix of ["", "about/", "url-checker/", "news/svg-display/"]) {
        await visit(page, suffix, false);
        const nav = page.locator(".site-nav");
        const g = await geometry(page);
        if (!BASELINE) {
          assert.equal(await nav.locator("a").count(), 7);
          assert.equal(g.navVisible, true, "static navigation remains visible without JavaScript");
          assert.equal(g.documentWidth, width);
          assert(g.nav.y >= 0 && g.nav.bottom <= g.bar.bottom + 1);
          if (g.barPosition === "fixed") assert(g.padding >= g.bar.height, "fixed fallback header has a sufficient body offset");
          else assert(g.contentTop >= g.bar.bottom - 1, "in-flow fallback header leaves page content below navigation");
          for (const link of g.links) assert(link.href.startsWith(ORIGIN + PREFIX));
          for (const link of await nav.locator("a").all()) {
            await link.focus();
            assert.equal(await link.evaluate(node => node === document.activeElement), true, "static links remain keyboard focusable");
            const visible = await link.evaluate(node => {
              const r = node.getBoundingClientRect(), n = node.parentElement.getBoundingClientRect();
              return r.left >= n.left - 1 && r.right <= n.right + 1;
            });
            assert(visible, "static navigation scrolls each focused link into view");
          }
        }
      }
      await screenshot(page, width + "-no-javascript");
      check("no-JavaScript fallback retains seven navigable links and clears content", {width});
    } finally { await context.close(); }
  }
}
async function deviceFontInitial(browser) {
  const {context, page, fontGate} = await open(browser, 390, {deviceFont:true});
  try {
    await visit(page, "combining/");
    await page.waitForFunction(() => document.querySelector("#combining-preview").dataset.fontReason === "site-device-font");
    await settings(page); await page.locator("#browserFontModeToggle").click();
    await page.waitForFunction(() => {
      const preview = document.querySelector("#combining-preview");
      return preview.dataset.fontReason && preview.dataset.fontReason !== "site-device-font";
    });
    assert.equal(await page.locator("#combining-preview").textContent(), "a");
    assert.equal(await page.locator("#browserFontModeToggle").getAttribute("aria-pressed"), "false");
    check("device-font mode enabled before page load returns combining previews to web fonts immediately when disabled");
    // A fresh base character forces a new font request. Delay only font bytes,
    // then switch mode again while its real font loading promise is pending.
    await page.locator("#browserFontModeToggle").click();
    assert.equal(await page.locator("#browserFontModeToggle").getAttribute("aria-pressed"), "true");
    fontGate.hold = true;
    await page.locator("#combining-base").fill("\u0915");
    await settings(page);
    await page.locator("#browserFontModeToggle").click();
    await Promise.race([fontGate.started, new Promise((_, reject) => setTimeout(() => reject(Error("Delayed font request did not start")), 8000))]);
    await page.locator("#browserFontModeToggle").click();
    await page.waitForFunction(() => document.querySelector("#combining-preview").dataset.fontReason === "site-device-font");
    fontGate.hold = false; fontGate.release();
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#combining-preview").getAttribute("data-font-reason"), "site-device-font");
    assert.equal(await page.locator("#combining-preview").textContent(), "\u0915");
    check("old asynchronous web-font results cannot overwrite a later device-font mode");
  } finally { fontGate.release(); await context.close(); }
}
(async () => {
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({headless:true, executablePath, args:["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    await widths(browser); await allPages(browser); await noJavaScript(browser);
    if (!BASELINE) { await interactions(browser); await deviceFontInitial(browser); }
    assert.equal(report.errors.length, 0, "no browser JavaScript errors");
    assert.deepEqual([...new Set(report.missing)], [], "all requested non-SVG local assets exist");
    report.result = "PASS";
  } catch (error) { report.result = "FAIL"; report.failure = error.stack; process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify({result:report.result, checks:report.checks.length, widths:report.widths.length, pages:report.pages.length, out:OUT, failure:report.failure}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
