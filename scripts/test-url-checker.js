"use strict";
// Exercise the actual input/render/copy path without requiring a browser or
// exporting production internals. Responsive geometry is checked separately.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() { this.children = []; this.handlers = {}; this.value = ""; this.dataset = {}; }
  set textContent(value) { this.children = [String(value)]; }
  get textContent() { return this.children.map(item => typeof item === "string" ? item : item.textContent).join(""); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  focus() { this.focused = true; }
}
const names = ["Input", "Status", "Count", "Preview", "Findings", "Copy"];
const nodes = Object.fromEntries(names.map(name => ["urlChecker" + name, new Element()]));
nodes.urlCheckerCopy.textContent = "解析表示をコピー";
const examples = ["normal", "variation", "zeroWidth", "confusable", "bidi"].map(key => {
  const button = new Element();
  button.dataset.urlCheckerExample = key;
  return button;
});
const copied = [];
const ctx = {
  document: {
    getElementById(id) { return nodes[id] || null; },
    querySelectorAll(selector) { return selector === "[data-url-checker-example]" ? examples : []; },
    createTextNode(value) { const node = new Element(); node.textContent = value; return node; },
    createElement() { return new Element(); }
  },
  navigator: {clipboard: {async writeText(value) { copied.push(value); }}},
  window: {setTimeout() {}}
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/url-checker.js"), "utf8"), ctx);
const result = value => {
  nodes.urlCheckerInput.value = value;
  nodes.urlCheckerInput.handlers.input();
  return nodes.urlCheckerFindings.children.map(row => ({
    code: row.children[0].textContent, text: row.children[1].textContent
  }));
};
let checks = 0;
function check(name, run) { run(); checks++; console.log("PASS " + name); }

check("normal URL reports detection scope without declaring safety", () => {
  assert.deepEqual(result("https://m.youtube.com"), []);
  assert.equal(nodes.urlCheckerCount.textContent, "21 コードポイント");
  assert.equal(nodes.urlCheckerStatus.textContent, "対象の特殊文字は検出されませんでした");
  assert.equal(nodes.urlCheckerPreview.textContent, "https://m.youtube.com");
  assert.equal(nodes.urlCheckerFindings.hidden, true);
});
check("ZERO WIDTH SPACE retains the correct position", () => {
  assert.deepEqual(result("amazon\u200B.com"), [{code:"U+200B", text:"7文字目 · 不可視文字 · ZERO WIDTH SPACE"}]);
  assert.equal(nodes.urlCheckerPreview.textContent, "amazon⟦U+200B⟧.com");
});
check("BMP, supplementary and Mongolian variation selectors are classified together", () => {
  for (const cp of [0x180B, 0x180C, 0x180D, 0x180F, 0xFE00, 0xFE0F, 0xE0100, 0xE01EF]) {
    const rows = result("a" + String.fromCodePoint(cp));
    assert.equal(rows.length, 1);
    assert.match(rows[0].text, /^2文字目 · 異体字セレクタ$/);
  }
});
check("Cyrillic and Greek confusables show ASCII counterparts", () => {
  assert.deepEqual(result("y\u043Eutube.com"), [{code:"U+043E", text:"2文字目 · 似た形の別文字 · ASCII o に似ています"}]);
  assert.match(result("\u0391")[0].text, /ASCII A/);
});
check("all Unicode bidi controls are labeled as directional", () => {
  for (const cp of [0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]) {
    assert.match(result("x" + String.fromCodePoint(cp))[0].text, /^2文字目 · 表示方向制御文字$/);
  }
  assert.equal(nodes.urlCheckerPreview.textContent, "x⟦U+2069⟧");
});
check("combining marks, fullwidth characters and controls stay distinct", () => {
  assert.deepEqual(result("a\u0301Ａ\u0001").map(row => row.text), [
    "2文字目 · 結合文字", "3文字目 · 全角英数字・記号", "4文字目 · 制御文字"
  ]);
});
check("other default-ignorable characters are visible in the annotation", () => {
  for (const cp of [0x206A, 0xE0001, 0xE0061, 0xE007F]) {
    assert.match(result("a" + String.fromCodePoint(cp))[0].text, /^2文字目 · 不可視文字$/);
  }
});
check("positions count Unicode scalars rather than UTF-16 code units or graphemes", () => {
  const rows = result("😀a\u0301\u{E0109}\u200B");
  assert.deepEqual(rows.map(row => row.code), ["U+0301", "U+E0109", "U+200B"]);
  assert.deepEqual(rows.map(row => row.text.split(" · ")[0]), ["3文字目", "4文字目", "5文字目"]);
  assert.equal(nodes.urlCheckerCount.textContent, "5 コードポイント");
});
check("literal HTML is displayed as text and source input is not normalized", () => {
  const value = '<img src=x onerror=alert(1)>e\u0301';
  result(value);
  assert.equal(nodes.urlCheckerInput.value, value);
  assert.equal(nodes.urlCheckerPreview.textContent, '<img src=x onerror=alert(1)>e⟦U+0301⟧');
});
check("empty input clears stale findings and disables copy", () => {
  assert.deepEqual(result(""), []);
  assert.equal(nodes.urlCheckerPreview.textContent, "");
  assert.equal(nodes.urlCheckerFindings.hidden, true);
  assert.equal(nodes.urlCheckerCopy.disabled, true);
});
check("all example buttons update the actual input and result", () => {
  for (const button of examples) {
    button.handlers.click();
    assert(nodes.urlCheckerInput.value.length > 0);
    assert.equal(nodes.urlCheckerInput.focused, true);
    if (button.dataset.urlCheckerExample === "normal") assert.equal(nodes.urlCheckerFindings.children.length, 0);
    else assert(nodes.urlCheckerFindings.children.length > 0);
  }
});
(async () => {
  result("😀a\u200B");
  await nodes.urlCheckerCopy.handlers.click();
  assert.deepEqual(copied, ["😀a⟦U+200B⟧"]);
  assert.equal(nodes.urlCheckerCopy.textContent, "コピーしました");
  checks++;
  console.log("PASS copy preserves the exact annotated scalar sequence");
  console.log("URL checker: " + checks + " checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
