"use strict";

(function () {
  const input = document.getElementById("urlCheckerInput");
  const status = document.getElementById("urlCheckerStatus");
  const count = document.getElementById("urlCheckerCount");
  const preview = document.getElementById("urlCheckerPreview");
  const list = document.getElementById("urlCheckerFindings");
  const copy = document.getElementById("urlCheckerCopy");
  if (!input || !status || !count || !preview || !list || !copy) return;

  const examples = {
    normal: "https://m.youtube.com",
    variation: "h\u{E0109}ttps://m.y\u{E0109}outube.com",
    zeroWidth: "amazon\u200B.com",
    confusable: "https://www.y\u043Eutube.com",
    bidi: "https://exa\u202Emple.com"
  };

  const confusables = new Map([
    [0x0391, "A"], [0x0392, "B"], [0x0395, "E"], [0x0396, "Z"], [0x0397, "H"],
    [0x0399, "I"], [0x039A, "K"], [0x039C, "M"], [0x039D, "N"], [0x039F, "O"],
    [0x03A1, "P"], [0x03A4, "T"], [0x03A5, "Y"], [0x03A7, "X"],
    [0x03B1, "a"], [0x03B5, "e"], [0x03B9, "i"], [0x03BA, "k"], [0x03BF, "o"],
    [0x03C1, "p"], [0x03C4, "t"], [0x03C5, "u"], [0x03C7, "x"],
    [0x0410, "A"], [0x0412, "B"], [0x0415, "E"], [0x041A, "K"], [0x041C, "M"],
    [0x041D, "H"], [0x041E, "O"], [0x0420, "P"], [0x0421, "C"], [0x0422, "T"],
    [0x0425, "X"], [0x0430, "a"], [0x0435, "e"], [0x043E, "o"], [0x0440, "p"],
    [0x0441, "c"], [0x0445, "x"], [0x0443, "y"], [0x0456, "i"]
  ]);

  const invisibles = new Map([
    [0x00AD, "SOFT HYPHEN"],
    [0x034F, "COMBINING GRAPHEME JOINER"],
    [0x061C, "ARABIC LETTER MARK"],
    [0x180E, "MONGOLIAN VOWEL SEPARATOR"],
    [0x200B, "ZERO WIDTH SPACE"],
    [0x200C, "ZERO WIDTH NON-JOINER"],
    [0x200D, "ZERO WIDTH JOINER"],
    [0x200E, "LEFT-TO-RIGHT MARK"],
    [0x200F, "RIGHT-TO-LEFT MARK"],
    [0x2060, "WORD JOINER"],
    [0x2061, "FUNCTION APPLICATION"],
    [0x2062, "INVISIBLE TIMES"],
    [0x2063, "INVISIBLE SEPARATOR"],
    [0x2064, "INVISIBLE PLUS"],
    [0xFEFF, "ZERO WIDTH NO-BREAK SPACE"]
  ]);

  const hex = cp => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

  function classify(cp, ch) {
    // Unicode properties also cover Mongolian free variation selectors and
    // direction marks, which are not all in the commonly used VS/bidi ranges.
    if (/\p{Variation_Selector}/u.test(ch)) {
      return {level: "warn", label: "異体字セレクタ"};
    }
    if (/\p{Bidi_Control}/u.test(ch)) {
      return {level: "warn", label: "表示方向制御文字"};
    }
    if (invisibles.has(cp)) {
      return {level: "warn", label: "不可視文字", detail: invisibles.get(cp)};
    }
    if (/\p{Default_Ignorable_Code_Point}/u.test(ch)) {
      return {level: "warn", label: "不可視文字"};
    }
    if (confusables.has(cp)) {
      return {level: "note", label: "似た形の別文字", detail: "ASCII " + confusables.get(cp) + " に似ています"};
    }
    if (cp >= 0xFF01 && cp <= 0xFF5E) {
      return {level: "note", label: "全角英数字・記号"};
    }
    if (/\p{M}/u.test(ch)) {
      return {level: "note", label: "結合文字"};
    }
    if (/\p{Cc}/u.test(ch)) {
      return {level: "warn", label: "制御文字"};
    }
    return null;
  }

  let annotated = "";

  function render() {
    const value = input.value;
    const characters = Array.from(value);
    const findings = [];
    annotated = "";
    preview.replaceChildren();
    list.replaceChildren();

    characters.forEach((ch, index) => {
      const cp = ch.codePointAt(0);
      const info = classify(cp, ch);
      if (!info) {
        preview.append(document.createTextNode(ch));
        annotated += ch;
        return;
      }

      findings.push({index, cp, ch, ...info});
      const mark = document.createElement("span");
      mark.className = "url-checker-mark " + (info.level === "warn" ? "warning" : "notice");
      mark.textContent = "⟦" + hex(cp) + "⟧";
      mark.title = info.label;
      preview.append(mark);
      annotated += mark.textContent;
    });

    count.textContent = characters.length + " コードポイント";

    if (!value) {
      status.textContent = "文字列を入力してください";
      status.className = "url-checker-status";
    } else if (findings.length === 0) {
      status.textContent = "対象の特殊文字は検出されませんでした";
      status.className = "url-checker-status safe";
    } else {
      const warnings = findings.filter(item => item.level === "warn").length;
      status.textContent = warnings
        ? "特殊・紛らわしい文字を " + findings.length + " 個検出"
        : "確認したい文字を " + findings.length + " 個検出";
      status.className = "url-checker-status warning";
    }

    for (const item of findings) {
      const row = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = hex(item.cp);
      const text = document.createElement("span");
      text.textContent =
        (item.index + 1) + "文字目 · " + item.label +
        (item.detail ? " · " + item.detail : "");
      row.append(code, text);
      list.append(row);
    }

    list.hidden = findings.length === 0;
    copy.disabled = !value;
  }

  input.addEventListener("input", render);

  document.querySelectorAll("[data-url-checker-example]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.urlCheckerExample;
      if (!(key in examples)) return;
      input.value = examples[key];
      input.focus();
      render();
    });
  });

  copy.addEventListener("click", async () => {
    if (!annotated) return;
    const original = copy.textContent;
    try {
      await navigator.clipboard.writeText(annotated);
      copy.textContent = "コピーしました";
    } catch {
      copy.textContent = "コピーできませんでした";
    }
    window.setTimeout(() => {
      copy.textContent = original;
    }, 1400);
  });

  input.value = examples.normal;
  render();
})();
