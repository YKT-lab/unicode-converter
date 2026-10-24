"use strict";
(function () {
  const core = window.UnicodeCombiningCore;
  const byId = id => document.getElementById("combining-" + id);
  const base = byId("base");
  if (!base || !core) return;
  const scriptURL = new URL(document.currentScript.src);
  const siteRoot = new URL("../", scriptURL);
  let catalogue = [], selected = [], matches = [], shown = 60, normalizer = null, revision = 0;
  let loading = false, catalogueReady = false, normalizationReady = false;
  let catalogueVersion = null, normalizationVersion = null;
  const forms = ["NFC", "NFD", "NFKC", "NFKD"];
  const normalizationViews = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function status(text) { byId("status").textContent = text; }
  async function copy(text) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      status("コピーしました。");
    } catch (_) {
      // The fallback requires no permissions and still works in embedded browsers.
      const field = element("textarea", "combining-copy-fallback");
      field.value = text;
      field.setAttribute("aria-label", "コピーする文字列");
      document.body.append(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (_) { /* manual copy below */ }
      if (copied) { field.remove(); status("コピーしました。"); }
      else {
        field.className = "page-input combining-manual-copy";
        byId("status").append(field);
        field.focus(); field.select();
        statusWithField(field);
      }
    }
  }
  function statusWithField(field) {
    byId("status").replaceChildren(document.createTextNode("コピーできませんでした。下の文字列を選択してコピーしてください。"), field);
  }
  function copyButton(label, value) {
    const button = element("button", "page-button", label);
    button.type = "button";
    button.addEventListener("click", () => copy(value()));
    return button;
  }
  function setNativeMetadata(node) {
    node.dataset.displayMode = "normal";
    node.dataset.svgReason = "whole-string-shaping-unavailable";
    node.dir = "auto";
  }
  function makeNormalizations() {
    byId("normalizations").replaceChildren();
    for (const form of forms) {
      const row = element("article", "combining-normalization");
      const text = element("div", "combining-text combining-normalized-text");
      setNativeMetadata(text);
      const codes = element("code", "combining-codes");
      codes.dir = "ltr";
      const notice = element("p", "page-muted");
      const buttons = element("div", "page-tool-row");
      const textCopy = copyButton(form + "をコピー", () => text.textContent);
      const codesCopy = copyButton("コード列をコピー", () => codes.textContent);
      buttons.append(textCopy, codesCopy);
      row.append(element("h3", "", form), text, codes, notice, buttons);
      byId("normalizations").append(row);
      normalizationViews.push({form, text, codes, notice, textCopy, codesCopy});
    }
  }
  async function prepareFonts(nodes, text, currentRevision) {
    if (!window.UnicodeCombiningFonts) return;
    const prepared = await window.UnicodeCombiningFonts.prepare(text);
    if (currentRevision !== revision) return;
    for (const node of nodes) {
      node.style.fontFamily = prepared.fontFamily;
      node.dataset.fontFiles = JSON.stringify(prepared.files);
      node.dataset.fontReason = prepared.reason;
    }
  }
  function updateResult() {
    const currentRevision = ++revision;
    const result = core.compose(base.value, selected);
    const preview = byId("preview");
    preview.textContent = result;
    setNativeMetadata(preview);
    byId("result-codes").textContent = core.codePoints(result);
    byId("copy-result").disabled = byId("copy-codes").disabled = !result;
    const fontGroups = new Map([[result, [preview]]]);
    for (const view of normalizationViews) {
      view.textCopy.disabled = view.codesCopy.disabled = !normalizer || !result;
      if (!normalizer) {
        view.text.textContent = ""; view.codes.textContent = "";
        view.notice.textContent = "正規化データの読み込み待ちです。";
        continue;
      }
      let value;
      try { value = normalizer.normalize(result, view.form); }
      catch (_) {
        view.text.textContent = ""; view.codes.textContent = "";
        view.textCopy.disabled = view.codesCopy.disabled = true;
        view.notice.textContent = "正規化データの処理に失敗しました。";
        continue;
      }
      view.text.textContent = value;
      view.codes.textContent = core.codePoints(value);
      view.notice.textContent = value === result ? "入力と同じコードポイント列です。" : "コードポイント列が変わりました。";
      if (!fontGroups.has(value)) fontGroups.set(value, []);
      fontGroups.get(value).push(view.text);
    }
    // Text updates synchronously; a slow font request cannot overwrite new input.
    for (const [text, nodes] of fontGroups) {
      for (const node of nodes) { node.style.fontFamily = ""; delete node.dataset.fontFiles; delete node.dataset.fontReason; }
      prepareFonts(nodes, text, currentRevision).catch(() => { /* native CSS remains usable */ });
    }
  }
  function describe(mark) {
    return core.codePoint(mark.codepoint) + " · " + mark.name + " · " + mark.script.replace(/_/g, " ") +
      " (" + mark.script_code + ") · " + mark.category + " · CCC " + mark.combining_class;
  }
  function dotted(mark) {
    const preview = element("span", "combining-dotted combining-text", "\u25CC" + String.fromCodePoint(mark.codepoint));
    preview.setAttribute("aria-label", core.codePoint(mark.codepoint) + " の点線円付き補助表示");
    preview.dir = "auto";
    if (window.UnicodeCombiningFonts) {
      const expected = preview.textContent;
      window.UnicodeCombiningFonts.prepare(expected).then(font => {
        if (preview.isConnected) preview.style.fontFamily = font.fontFamily;
      }).catch(() => {});
    }
    return preview;
  }
  function renderSelected(focusIndex, action) {
    const list = byId("selected");
    list.replaceChildren();
    byId("empty-selected").hidden = selected.length > 0;
    byId("clear").disabled = !selected.length;
    selected.forEach((mark, index) => {
      const item = element("li", "combining-selected-item");
      const info = element("div", "combining-mark-info");
      info.append(dotted(mark), element("span", "combining-mark-description", describe(mark)));
      const controls = element("div", "combining-mark-controls");
      for (const [name, label, delta] of [["up", "前へ", -1], ["down", "後へ", 1], ["remove", "削除", 0]]) {
        const button = element("button", "page-button", label);
        button.type = "button";
        button.dataset.action = name;
        button.setAttribute("aria-label", (index + 1) + "番目の " + core.codePoint(mark.codepoint) + " を" + label);
        button.disabled = name === "up" && index === 0 || name === "down" && index === selected.length - 1;
        button.addEventListener("click", () => {
          if (name === "remove") selected.splice(index, 1);
          else selected = core.move(selected, index, delta);
          renderSelected(Math.min(selected.length - 1, name === "remove" ? index : index + delta), name);
          updateResult();
        });
        controls.append(button);
      }
      item.append(info, controls); list.append(item);
    });
    if (focusIndex >= 0) {
      const item = list.children[focusIndex];
      const button = item?.querySelector('[data-action="' + action + '"]:not(:disabled)') || item?.querySelector("button:not(:disabled)");
      button?.focus();
    } else if (focusIndex === -1) base.focus();
  }
  function renderCatalogue() {
    matches = core.search(catalogue, byId("search").value, byId("script").value, byId("category").value);
    byId("catalogue-status").textContent = matches.length + " / " + catalogue.length + "文字（" + Math.min(shown, matches.length) + "文字を表示）";
    const list = byId("catalogue");
    list.setAttribute("aria-busy", "false");
    list.replaceChildren();
    for (const mark of matches.slice(0, shown)) {
      const item = element("li", "combining-catalogue-item");
      const info = element("div", "combining-mark-info");
      info.append(dotted(mark), element("span", "combining-mark-description", describe(mark)));
      const button = element("button", "page-button", "追加");
      button.type = "button";
      button.setAttribute("aria-label", core.codePoint(mark.codepoint) + " " + mark.name + " を追加");
      button.addEventListener("click", () => {
        selected.push(mark); renderSelected(); updateResult();
        status(core.codePoint(mark.codepoint) + " を追加しました。選択中 " + selected.length + "文字。");
      });
      item.append(info, button); list.append(item);
    }
    byId("more").hidden = shown >= matches.length;
  }
  async function fetchData(file) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const request = (async () => {
      const response = await fetch(new URL("data/" + file, siteRoot).href, controller ? {signal: controller.signal} : {});
      if (!response.ok) throw Error("Data HTTP " + response.status);
      return response.json();
    })();
    try {
      return await Promise.race([request, new Promise((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(Error("Data timeout")); }, 15000);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function load() {
    if (loading) return;
    loading = true;
    byId("retry").hidden = true;
    const results = await Promise.allSettled([
      catalogueReady ? Promise.resolve() : fetchData("combining-marks.json").then(data => {
        if (normalizationVersion && normalizationVersion !== data.unicode_version) throw Error("Unicode version mismatch");
        catalogue = core.prepareCatalogue(data);
        catalogueVersion = data.unicode_version;
        byId("data-version").textContent = "Unicode " + data.unicode_version + (data.unicode_status === "draft" ? "（ドラフト）" : "");
        byId("data-count").textContent = data.count.toLocaleString("ja-JP") + "文字";
        byId("data-categories").textContent = ["Mn", "Mc", "Me"].map(category => category + " " + data.category_counts[category]).join(" / ");
        const scripts = new Map();
        for (const mark of catalogue) {
          scripts.set(mark.script_code, mark.script.replace(/_/g, " "));
          for (const code of mark.script_extensions) if (!scripts.has(code)) scripts.set(code, code);
        }
        for (const [code, name] of [...scripts].sort((a,b) => a[1].localeCompare(b[1]))) {
          const option = element("option", "", name + " (" + code + ")");
          option.value = code; byId("script").append(option);
        }
        catalogueReady = true; renderCatalogue();
      }),
      normalizationReady ? Promise.resolve() : fetchData("combining-normalization.json").then(data => {
        if (catalogueVersion && catalogueVersion !== data.unicode_version) throw Error("Unicode version mismatch");
        normalizer = window.UnicodeCombiningNormalization.createNormalizer(data);
        normalizationVersion = data.unicode_version;
        normalizationReady = true; updateResult();
      })
    ]);
    loading = false;
    const failed = results.some(result => result.status === "rejected");
    if (!catalogueReady) {
      byId("catalogue-status").textContent = "結合文字データを取得できませんでした。";
      byId("catalogue").setAttribute("aria-busy", "false");
    }
    if (!normalizationReady) for (const view of normalizationViews) view.notice.textContent = "正規化データを取得できませんでした。再読み込みしてください。";
    byId("retry").hidden = !failed;
    status(failed ? "一部のデータを読み込めませんでした。再読み込みできます。" : "結合文字を選ぶと、基本文字列の末尾に追加されます。");
  }
  makeNormalizations();
  base.addEventListener("input", updateResult);
  for (const name of ["search", "script", "category"]) byId(name).addEventListener(name === "search" ? "input" : "change", () => { shown = 60; renderCatalogue(); });
  byId("more").addEventListener("click", () => { shown += 60; renderCatalogue(); });
  byId("clear").addEventListener("click", () => { selected = []; renderSelected(); updateResult(); status("追加した結合文字をすべて削除しました。"); });
  byId("copy-result").addEventListener("click", () => copy(core.compose(base.value, selected)));
  byId("copy-codes").addEventListener("click", () => copy(core.codePoints(core.compose(base.value, selected))));
  byId("retry").addEventListener("click", load);
  renderSelected(); updateResult(); load();
})();
