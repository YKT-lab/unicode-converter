/* Whole-string normal-font adapter. It never constructs single-glyph SVGs. */
(function(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UnicodeCombiningFonts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(root) {
  "use strict";
  const FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const script = root.document?.currentScript?.src ||
    Array.from(root.document?.scripts || []).find(item =>
      /\/js\/combining-fonts\.js(?:[?#]|$)/.test(item.src || ""))?.src;
  function createAdapter(options = {}) {
    const doc = options.documentObj || root.document;
    const fetcher = options.fetchFn || root.fetch?.bind(root);
    const Font = options.FontFace || root.FontFace;
    const Abort = options.AbortController || root.AbortController;
    const policy = options.fontPolicy || root.UnicodeFontPolicy;
    const origin = options.scriptUrl || script;
    const base = origin ? new URL("../", origin) : null;
    const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 6000;
    const maxLoads = 12;
    const loads = new Map();
    let indexPromise;
    function deadline(task, controller) {
      let timer;
      const expired = new Promise(resolve => {
        timer = setTimeout(() => {
          resolve(null);
          try { controller?.abort(); } catch (_) { /* Timeout already resolved. */ }
        }, timeout);
      });
      return Promise.race([Promise.resolve().then(task).catch(() => null), expired])
        .finally(() => clearTimeout(timer));
    }
    function index() {
      if (!indexPromise) indexPromise = (async () => {
        if (!base || !fetcher || !policy?.getCandidateFontIds) return null;
        const controller = typeof Abort === "function" ? new Abort() : null;
        return deadline(async () => {
          const init = {cache: "force-cache"};
          if (controller) init.signal = controller.signal;
          const response = await fetcher(new URL("data/unicode18_font_coverage_index.json", base).href, init);
          if (!response.ok) return null;
          const data = await response.json();
          if (data?.schema_version !== 2 || !Array.isArray(data.font_families) ||
              !Array.isArray(data.ranges) || !Array.isArray(data.script_ranges) ||
              !Array.isArray(data.combinations)) return null;
          return data;
        }, controller);
      })().catch(() => null);
      return indexPromise;
    }
    function font(id, entry) {
      if (!loads.has(id)) loads.set(id, (async () => {
        if (!base || !doc?.fonts?.add || typeof Font !== "function" || !entry ||
            typeof entry.file !== "string" ||
            !/^fonts\/[\w.-]+(?:\/[\w.-]+)*\.(?:ttf|otf|woff2?)$/i.test(entry.file) ||
            entry.file.split("/").includes("..")) return null;
        const family = "Unicode Combining " + id;
        const face = new Font(family, 'url("' + new URL(entry.file, base).href + '")',
          {style: "normal", weight: "400"});
        const loaded = await deadline(() => face.load());
        if (!loaded) return null;
        doc.fonts.add(loaded);
        return {id, family, file: entry.file, sourceFamily: entry.family || ""};
      })().catch(() => null));
      return loads.get(id);
    }
    // Format characters affect shaping but require no independent visible glyph.
    // Keep them in the original text; ignore only for nominal cmap selection.
    function needsGlyph(cp) {
      return !(cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x034f ||
        cp === 0x061c || cp === 0x180e || (cp >= 0x200b && cp <= 0x200f) ||
        (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) ||
        (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff ||
        (cp >= 0xe0000 && cp <= 0xe007f) || (cp >= 0xe0100 && cp <= 0xe01ef));
    }
    const result = (selected, reason) => ({
      fontFamily: selected.map(item => '"' + item.family + '"').concat(FALLBACK).join(", "),
      files: selected.map(item => item.file),
      sourceFamilies: selected.map(item => item.sourceFamily),
      reason, svgReason: "whole-string-shaping-unavailable"
    });
    async function prepare(text) {
      try {
        if (root.UnicodeSiteDisplay?.isDeviceFontModeEnabled?.()) {
          return {
            fontFamily: "sans-serif",
            files: [],
            sourceFamilies: [],
            reason: "site-device-font",
            svgReason: "whole-string-shaping-unavailable"
          };
        }
        const points = [...new Set(Array.from(String(text), character => character.codePointAt(0)))].filter(needsGlyph);
        if (!points.length) return result([], "native-font-fallback");
        const data = await index();
        if (!data) return result([], "font-index-unavailable");
        const candidates = points.map(cp => policy.getCandidateFontIds(data, cp));
        const sets = candidates.map(ids => new Set(ids));
        const common = candidates[0].filter(id => sets.every(ids => ids.has(id)));
        const attempted = new Set();
        // Try a small ranked batch first. Each face is cached, including failure.
        const commonBatch = common.slice(0, 3);
        commonBatch.forEach(id => attempted.add(id));
        const commonFaces = await Promise.all(commonBatch.map(id => font(id, data.font_families[id])));
        const complete = commonFaces.find(Boolean);
        if (complete) return result([complete], "common-web-font");
        // Mixed scripts remain a single browser text run. A bounded font stack
        // lets the browser choose fallback runs without inserting spans.
        const planned = [];
        for (const ids of candidates) {
          if (ids.some(id => planned.includes(id))) continue;
          const id = ids.find(value => !attempted.has(value));
          if (id === undefined || attempted.size >= maxLoads) continue;
          attempted.add(id);
          planned.push(id);
        }
        const selected = (await Promise.all(planned.map(id => font(id, data.font_families[id])))).filter(Boolean);
        const covered = sets.every(ids => selected.some(item => ids.has(item.id)));
        return result(selected, selected.length ? (covered ? "mixed-web-fonts" : "partial-web-fonts") : "native-font-fallback");
      } catch (_) {
        return result([], "native-font-fallback");
      }
    }
    return Object.freeze({prepare});
  }
  let adapter;
  return Object.freeze({
    createAdapter,
    prepare(text) {
      if (!adapter) adapter = createAdapter();
      return adapter.prepare(text);
    }
  });
});
