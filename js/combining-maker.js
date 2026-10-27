"use strict";
(function () {
  const core = window.UnicodeCombiningCore;
  const byId = id => document.getElementById("combining-" + id);
  const base = byId("base");
  if (!base || !core) return;
  const scriptURL = new URL(document.currentScript.src);
  const siteRoot = new URL("../", scriptURL);
  let catalogue = [], selected = [], matches = [], page = 0, group = "", normalizer = null, policy = null, revision = 0;
  const PAGE_SIZE = 36;
  let fontEpoch = 0;
  let composing = false;
  let loading = false, catalogueReady = false, normalizationReady = false;
  const versions = {};
  function recordVersion(kind, version) {
    if (Object.values(versions).some(value => value !== version)) throw Error("Unicode version mismatch");
    versions[kind] = version;
  }
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
  function currentBase() {
    return composing ? {valid:false, message:"文字の入力を確定してください。"} : core.parseBase(base.value);
  }
  function currentResult() { return currentBase().valid ? core.compose(base.value, selected) : ""; }
  async function prepareFonts(nodes, text, currentRevision) {
    if (!window.UnicodeCombiningFonts) return;
    const epoch = fontEpoch;
    const prepared = await window.UnicodeCombiningFonts.prepare(text);
    if (epoch !== fontEpoch) return;
    for (const node of nodes) {
      if (!node.isConnected || node.textContent !== text || (currentRevision !== undefined && currentRevision !== revision)) continue;
      node.style.fontFamily = prepared.fontFamily;
      node.dataset.fontFiles = JSON.stringify(prepared.files);
      node.dataset.fontReason = prepared.reason;
    }
  }
  function queueFont(node, text, currentRevision) {
    node.style.fontFamily = "";
    delete node.dataset.fontFiles; delete node.dataset.fontReason;
    prepareFonts([node], text, currentRevision).catch(() => { /* native CSS remains usable */ });
  }
  function updateResult() {
    const currentRevision = ++revision, parsed = currentBase();
    const result = currentResult(), preview = byId("preview");
    base.setAttribute("aria-invalid", String(!parsed.valid && !composing));
    byId("base-error").textContent = parsed.valid ? "" : parsed.message;
    const info = parsed.valid && policy ? policy.describeBase(base.value) : parsed;
    byId("base-info").textContent = parsed.valid ? core.codePoint(parsed.codepoint) +
      (info.script ? " · " + info.script.replace(/_/g, " ") + " (" + info.script_code + ") · " + info.category : "") : "";
    byId("base-token").textContent = parsed.valid ? base.value : "—";
    queueFont(byId("base-token"), byId("base-token").textContent, currentRevision);
    preview.textContent = result;
    setNativeMetadata(preview);
    byId("result-codes").textContent = core.codePoints(result);
    byId("copy-result").disabled = byId("copy-codes").disabled = !result;
    const fontGroups = new Map([[result, [preview]]]);
    for (const view of normalizationViews) {
      view.textCopy.disabled = view.codesCopy.disabled = !normalizer || !result;
      if (!parsed.valid || !normalizer) {
        view.text.textContent = ""; view.codes.textContent = "";
        view.notice.textContent = !parsed.valid ? "基本文字を1コードポイントで入力してください。" : "正規化データの読み込み待ちです。";
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
    for (const [text, nodes] of fontGroups) {
      for (const node of nodes) { node.style.fontFamily = ""; delete node.dataset.fontFiles; delete node.dataset.fontReason; }
      prepareFonts(nodes, text, currentRevision).catch(() => {});
    }
  }
  function describe(mark) {
    return core.codePoint(mark.codepoint) + " · " + mark.name + " · " + mark.script.replace(/_/g, " ") +
      " (" + mark.script_code + ") · " + mark.category + " · CCC " + mark.combining_class;
  }
  function dotted(mark) {
    const text = "\u25CC" + String.fromCodePoint(mark.codepoint);
    const preview = element("span", "combining-dotted combining-text combining-slot-glyph", text);
    preview.setAttribute("aria-label", core.codePoint(mark.codepoint) + " の点線円付き補助表示");
    preview.dir = "auto";
    queueFont(preview, text);
    return preview;
  }
  function renderSelected(focusIndex, action) {
    const list = byId("selected");
    list.replaceChildren();
    byId("empty-selected").hidden = selected.length > 0;
    byId("clear").disabled = !selected.length;
    document.querySelector(".combining-composition-plus").hidden = !selected.length;
    selected.forEach((mark, index) => {
      const item = element("li", "combining-selected-item");
      if (index) {
        const plus = element("span", "combining-plus", "＋");
        plus.setAttribute("aria-hidden", "true"); item.append(plus);
      }
      const slot = element("div", "combining-slot");
      slot.title = describe(mark);
      slot.append(dotted(mark), element("span", "combining-slot-code", core.codePoint(mark.codepoint)));
      const controls = element("div", "combining-mark-controls");
      for (const [name, label, delta] of [["up", "前へ", -1], ["down", "後へ", 1], ["remove", "削除", 0]]) {
        const button = element("button", "page-button", label);
        button.type = "button"; button.dataset.action = name;
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
      slot.append(controls); item.append(slot); list.append(item);
    });
    if (focusIndex >= 0) {
      const item = list.children[focusIndex];
      const button = item?.querySelector('[data-action="' + action + '"]:not(:disabled)') || item?.querySelector("button:not(:disabled)");
      button?.focus();
    } else if (focusIndex === -1) base.focus();
  }
  function renderCatalogue(focusGroup) {
    const parsed = currentBase(), api = window.UnicodeCombiningCandidates;
    const all = byId("show-all").checked;
    const filtered = core.search(catalogue, byId("search").value, byId("script").value, byId("category").value);
    let candidates = [];
    if (parsed.valid && catalogueReady) {
      if (policy) candidates = policy.select(filtered, base.value, {all});
      else if (all && api) candidates = filtered.map(mark => ({mark, group:api.classify(mark), reason:"all-marks"}));
    }
    const counts = new Map();
    for (const entry of candidates) counts.set(entry.group, (counts.get(entry.group) || 0) + 1);
    if (group && !counts.get(group)) group = "";
    byId("groups").replaceChildren();
    for (const use of [{id:"", label:"すべての用途"}, ...(api?.GROUPS || [])]) {
      const count = use.id ? counts.get(use.id) || 0 : candidates.length;
      const button = element("button", "combining-group", use.label + " " + count);
      button.type = "button"; button.dataset.group = use.id;
      button.setAttribute("aria-pressed", String(group === use.id));
      button.disabled = !parsed.valid || !count;
      button.addEventListener("click", () => { group = use.id; page = 0; renderCatalogue(use.id); });
      byId("groups").append(button);
      if (focusGroup === use.id) button.focus({preventScroll:true});
    }
    matches = group ? candidates.filter(entry => entry.group === group) : candidates;
    const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    page = Math.min(page, totalPages - 1);
    const list = byId("catalogue");
    list.setAttribute("aria-busy", "false");
    list.replaceChildren(); list.scrollTop = 0;
    byId("catalogue-status").textContent = !parsed.valid ? "基本文字を1コードポイントで入力してください。" :
      !catalogueReady ? "結合文字データの読み込み待ちです。" : !policy && !all ? "おすすめデータの読み込み待ちです。「すべて表示」も利用できます。" :
      matches.length + " / " + catalogue.length + "文字 · " + (all ? "すべて表示" : "おすすめ");
    byId("catalogue-status").dataset.count = String(matches.length);
    for (const entry of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const mark = entry.mark, pairBase = base.value, text = pairBase + String.fromCodePoint(mark.codepoint);
      const item = element("li", "combining-catalogue-item");
      const button = element("button", "combining-candidate");
      button.type = "button"; button.dataset.codepoint = String(mark.codepoint);
      button.dataset.reason = entry.reason; button.title = describe(mark);
      button.setAttribute("aria-label", core.codePoint(mark.codepoint) + " " + mark.name + " を追加");
      const glyph = element("span", "combining-candidate-preview combining-text", text);
      setNativeMetadata(glyph); queueFont(glyph, text);
      button.append(glyph, element("span", "combining-candidate-code", core.codePoint(mark.codepoint)),
        element("span", "combining-candidate-name", mark.name));
      button.addEventListener("click", () => {
        if (!currentBase().valid || composing || pairBase !== base.value) return;
        selected.push(mark); renderSelected(); updateResult();
        status(core.codePoint(mark.codepoint) + " を追加しました。選択中 " + selected.length + "文字。");
      });
      item.append(button); list.append(item);
    }
    byId("page-status").textContent = (page + 1) + " / " + totalPages + "ページ";
    byId("page-prev").disabled = page === 0;
    byId("page-next").disabled = page + 1 >= totalPages;
  }
  function refreshBase() { page = 0; updateResult(); renderCatalogue(); }
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
    loading = true; byId("retry").hidden = true;
    const results = await Promise.allSettled([
      catalogueReady ? Promise.resolve() : fetchData("combining-marks.json").then(data => {
        const prepared = core.prepareCatalogue(data);
        recordVersion("catalogue", data.unicode_version); catalogue = prepared;
        byId("data-version").textContent = "Unicode " + data.unicode_version;
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
        const prepared = window.UnicodeCombiningNormalization.createNormalizer(data);
        recordVersion("normalization", data.unicode_version); normalizer = prepared;
        normalizationReady = true; updateResult();
      }),
      policy ? Promise.resolve() : fetchData("combining-base-properties.json").then(data => {
        const prepared = window.UnicodeCombiningCandidates.createPolicy(data);
        recordVersion("properties", data.unicode_version); policy = prepared;
        refreshBase();
      })
    ]);
    loading = false;
    const failed = results.some(result => result.status === "rejected");
    if (!catalogueReady) {
      byId("catalogue-status").textContent = "結合文字データを取得できませんでした。";
      byId("catalogue").setAttribute("aria-busy", "false");
    } else if (!policy) {
      byId("catalogue-status").textContent = "おすすめデータを取得できませんでした。「すべて表示」か再読み込みをご利用ください。";
    }
    if (!normalizationReady) for (const view of normalizationViews) view.notice.textContent = "正規化データを取得できませんでした。再読み込みしてください。";
    byId("retry").hidden = !failed;
    status(failed ? "一部のデータを読み込めませんでした。再読み込みできます。" : "候補を押して結合文字を追加。同じ記号も繰り返し追加できます。");
  }
  makeNormalizations();
  base.addEventListener("input", refreshBase);
  base.addEventListener("compositionstart", () => { composing = true; refreshBase(); });
  base.addEventListener("compositionend", () => { composing = false; refreshBase(); });
  for (const name of ["search", "script", "category"]) byId(name).addEventListener(name === "search" ? "input" : "change", () => { page = 0; renderCatalogue(); });
  byId("show-all").addEventListener("change", () => { page = 0; renderCatalogue(); });
  byId("page-prev").addEventListener("click", () => { page--; renderCatalogue(); });
  byId("page-next").addEventListener("click", () => { page++; renderCatalogue(); });
  byId("clear").addEventListener("click", () => { selected = []; renderSelected(); updateResult(); status("追加した結合文字をすべて削除しました。"); });
  byId("copy-result").addEventListener("click", () => { const result = currentResult(); if (result) copy(result); });
  byId("copy-codes").addEventListener("click", () => { const result = currentResult(); if (result) copy(core.codePoints(result)); });
  byId("retry").addEventListener("click", load);
  window.addEventListener("unicode-site-device-font-change", () => {
    // Refresh existing text runs without rebuilding controls or changing the
    // selected marks, filters, pagination, focus, or normalization results.
    fontEpoch++;
    const groups = new Map();
    for (const node of document.querySelectorAll(".combining-text")) {
      if (node === base) continue;
      const text = node.textContent;
      node.style.fontFamily = "";
      delete node.dataset.fontFiles; delete node.dataset.fontReason;
      if (!text) continue;
      if (!groups.has(text)) groups.set(text, []);
      groups.get(text).push(node);
    }
    for (const [text, nodes] of groups) prepareFonts(nodes, text).catch(() => {});
  });
  renderSelected(); refreshBase(); load();
})();
