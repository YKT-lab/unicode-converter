"use strict";
/* Optional functionality for /emoji/ and /unicode/. No global dependencies. */
(function () {
  const emojiInput = document.getElementById("emoji-sequence-input");
  const emojiResults = document.getElementById("emoji-sequence-results");
  const emojiAnalyze = document.getElementById("emoji-sequence-analyze");

  function toHex(cp) { return "U+" + cp.toString(16).toUpperCase().padStart(4, "0"); }
  async function copyValue(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      if (button) {
        const original = button.textContent;
        button.textContent = "コピー済み";
        window.setTimeout(() => { button.textContent = original; }, 1400);
      }
    } catch (_) {
      if (button) button.textContent = "選択してコピーしてください";
    }
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function clusters(value) {
    if (typeof Intl.Segmenter === "function") {
      return [...new Intl.Segmenter("ja", {granularity:"grapheme"}).segment(value)]
        .map(entry => entry.segment);
    }
    return [...value]; // Fallback may split a multi-codepoint grapheme.
  }
  function emojiType(codePoints) {
    if (codePoints.includes(0x200D)) return "ZWJ（ゼロ幅接合子）による組み合わせ";
    if (codePoints.some(x => x >= 0x1F3FB && x <= 0x1F3FF)) return "肌の色修飾";
    if (codePoints.length === 2 && codePoints.every(x => x >= 0x1F1E6 && x <= 0x1F1FF)) return "国旗（地域指示記号）";
    if (codePoints.includes(0x20E3)) return "キーキャップ";
    if (codePoints.includes(0xFE0F)) return "絵文字表示セレクターを含む文字";
    return codePoints.length === 1 ? "単一コードポイント" : "複数コードポイント";
  }
  function analyzeEmoji() {
    if (!emojiInput || !emojiResults) return;
    emojiResults.replaceChildren();
    const value = emojiInput.value.trim();
    if (!value) {
      emojiResults.append(element("p", "page-muted", "絵文字を入力すると構成コードポイントを表示します。"));
      return;
    }
    const parts = clusters(value);
    for (const part of parts.slice(0, 30)) {
      const codePoints = [...part].map(x => x.codePointAt(0));
      const box = element("div", "page-result-group");
      const glyph = element("span", "page-result-emoji", part);
      const type = element("span", "page-pill", emojiType(codePoints));
      box.append(glyph, type);
      const codes = element("div", "page-result-codes");
      for (const cp of codePoints) codes.append(element("code", "", toHex(cp)));
      box.append(codes);
      const copy = element("button", "page-button", "コード列をコピー");
      copy.type = "button";
      copy.addEventListener("click", () => copyValue(codePoints.map(toHex).join(" "), copy));
      box.append(copy);
      emojiResults.append(box);
    }
    if (parts.length > 30) emojiResults.append(element("p", "page-muted", "先頭30個まで表示しています。"));
  }
  if (emojiInput && emojiResults && emojiAnalyze) {
    emojiAnalyze.addEventListener("click", analyzeEmoji);
    emojiInput.addEventListener("keydown", e => { if (e.key === "Enter") analyzeEmoji(); });
    document.querySelectorAll("[data-emoji-sample]").forEach(button => {
      button.addEventListener("click", () => {
        emojiInput.value = button.dataset.emojiSample;
        analyzeEmoji();
      });
    });
    analyzeEmoji();
  }

  const list = document.getElementById("unicode-script-list");
  const search = document.getElementById("unicode-script-search");
  const counter = document.getElementById("unicode-script-count");
  if (list && search && counter) {
    fetch("../data/unicode18_scripts_175.json")
      .then(response => { if (!response.ok) throw Error("文字体系データが読み込めません"); return response.json(); })
      .then(data => {
        if (!Array.isArray(data.scripts)) throw Error("データの形式が不正です");
        function render() {
          const query = search.value.trim().toLocaleLowerCase("ja");
          const results = data.scripts.filter(item =>
            [item.name_ja, item.code, ...(item.blocks || []).flatMap(b => [b.start,b.end])]
              .some(value => String(value || "").toLocaleLowerCase("ja").includes(query))
          );
          counter.textContent = results.length + " / " + data.scripts.length + " 文字体系";
          list.replaceChildren();
          for (const item of results) {
            const card = element("article", "page-script");
            const title = element("h3", "", item.name_ja + "  ");
            title.append(element("span", "page-pill", item.code));
            card.append(title, element("p", "page-muted", (item.blocks || []).length + " ブロック"));
            const details = element("details", "");
            const summary = element("summary", "", "対応するUnicodeブロックを見る");
            details.append(summary);
            for (const block of item.blocks || []) {
              details.append(element("p", "", "U+" + block.start + " 〜 U+" + block.end));
            }
            card.append(details);
            list.append(card);
          }
          if (!results.length) list.append(element("p", "page-muted", "一致する文字体系が見つかりませんでした。"));
        }
        search.addEventListener("input", render);
        render();
      })
      .catch(() => { counter.textContent = "読み込み失敗"; list.textContent = "一覧を取得できませんでした。ページを更新してください。"; });
  }
})();
