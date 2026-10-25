/* Recommendations are Unicode-property heuristics, never rendering guarantees. */
(function (root) {
  "use strict";
  const GROUPS = Object.freeze([
    {id:"accents", label:"アクセント"},
    {id:"pronunciation", label:"発音・声調"},
    {id:"vowels", label:"母音・文字体系"},
    {id:"enclosing", label:"囲み・装飾"},
    {id:"music", label:"音楽"},
    {id:"variation", label:"異体字・表示"},
    {id:"other", label:"その他"}
  ].map(Object.freeze));
  const NEUTRAL = new Set(["Zyyy", "Zinh", "Zzzz"]);
  const NAMED_SCRIPTS = Object.freeze([
    [/\bGREEK\b/, ["Grek"]], [/\bCYRILLIC\b/, ["Cyrl"]], [/\bLATIN\b/, ["Latn"]],
    [/\bDEVANAGARI\b/, ["Deva"]], [/\bKATAKANA|HIRAGANA\b/, ["Kana", "Hira"]],
    [/\bCOPTIC\b/, ["Copt"]], [/\bARABIC\b/, ["Arab"]], [/\bHEBREW\b/, ["Hebr"]]
  ]);
  function lookup(ranges, cp) {
    let low = 0, high = ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1, range = ranges[middle];
      if (cp < range[0]) high = middle - 1;
      else if (cp > range[1]) low = middle + 1;
      else return range[2];
    }
    return null;
  }
  function validateRanges(rows, validValue) {
    if (!Array.isArray(rows)) throw TypeError("Invalid base-character ranges");
    let previous = -1;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 3 || !Number.isInteger(row[0]) || !Number.isInteger(row[1]) ||
          row[0] <= previous || row[1] < row[0] || row[1] > 0x10FFFF || !validValue(row[2]))
        throw TypeError("Invalid base-character range");
      previous = row[1];
    }
  }
  function classify(mark) {
    const name = mark.name || "";
    if (/VARIATION SELECTOR|GRAPHEME JOINER/.test(name)) return "variation";
    if (/MUSICAL|ZNAMENNY|NEUME|COMBINING (?:SHARP|FLAT) SIGN/.test(name)) return "music";
    if (mark.category === "Me" || /ENCLOSING|OVERLAY|ARROW|HARPOON/.test(name)) return "enclosing";
    if (/TONE|STRESS|CANTILLATION|TITLO|BREATHING|LENGTH|PHONETIC/.test(name)) return "pronunciation";
    if (mark.category === "Mc" || /VOWEL|VIRAMA|NUKTA|BINDU|ANUSVARA|VISARGA|HEBREW POINT|ARABIC (?:FATH|KASR|DAMM|SUKUN|SHADDA)/.test(name)) return "vowels";
    if (/^COMBINING /.test(name)) return "accents";
    if (mark.script_code && !NEUTRAL.has(mark.script_code)) return "vowels";
    return "other";
  }
  function createPolicy(properties) {
    if (!properties || properties.schema_version !== 1 || typeof properties.unicode_version !== "string" ||
        !properties.script_names || typeof properties.script_names !== "object") throw TypeError("Invalid base-character data");
    const knownScript = value => typeof value === "string" && typeof properties.script_names[value] === "string";
    validateRanges(properties.script_ranges, knownScript);
    validateRanges(properties.script_extension_ranges, value => Array.isArray(value) && value.length > 0 && value.every(knownScript));
    validateRanges(properties.category_ranges, value => typeof value === "string" && /^[A-Z][a-z]$/.test(value));
    validateRanges(properties.music_ranges, value => value === true);

    function describeBase(value) {
      if (typeof value !== "string") return {valid:false, error:"invalid-input"};
      const points = Array.from(value);
      if (!points.length) return {valid:false, error:"empty"};
      if (points.length !== 1) return {valid:false, error:"multiple-codepoints"};
      const cp = points[0].codePointAt(0);
      if (cp >= 0xD800 && cp <= 0xDFFF) return {valid:false, error:"invalid-scalar"};
      const script = lookup(properties.script_ranges, cp) || "Zzzz";
      return {valid:true, codepoint:cp, script:properties.script_names[script] || "Unknown", script_code:script,
        script_extensions:(lookup(properties.script_extension_ranges, cp) || [script]).slice(),
        category:lookup(properties.category_ranges, cp) || "Cn", music:!!lookup(properties.music_ranges, cp)};
    }
    function rank(mark, base, group) {
      const baseScripts = new Set([base.script_code, ...base.script_extensions].filter(script => !NEUTRAL.has(script)));
      const markScripts = [mark.script_code, ...(mark.script_extensions || [])].filter(script => !NEUTRAL.has(script));
      const matching = markScripts.some(script => baseScripts.has(script));
      if (group === "variation") return null; // Without a registered sequence, applicability is unknown.
      if (group === "music") return base.music ? {priority:0, reason:"musical-use"} : null;
      if (matching) return {priority:baseScripts.has(mark.script_code) ? 0 : 1, reason:"script-match"};
      if (!markScripts.length && NAMED_SCRIPTS.some(([pattern, scripts]) => pattern.test(mark.name || "") && scripts.some(script => baseScripts.has(script))))
        return {priority:1, reason:"named-script-use"};
      // Shared, non-script-named accent/decoration marks are useful across
      // scripts even when Scx records only historically documented uses.
      // Do not equate Inherited with universal: script names and dedicated
      // marks (Arabic, Vedic, Greek, kana, etc.) remain script-restricted.
      const genericName = /^COMBINING /.test(mark.name || "") &&
        !/GREEK|CYRILLIC|LATIN|DEVANAGARI|VEDIC|KATAKANA|HIRAGANA|SYLLABLE|PHAISTOS|COPTIC|ARABIC|HEBREW|BINDU/.test(mark.name || "");
      if (NEUTRAL.has(mark.script_code) && genericName && ["accents", "enclosing", "pronunciation"].includes(group))
        return {priority:2, reason:"general-mark"};
      // General enclosing marks may not all use COMBINING in their name.
      if (NEUTRAL.has(mark.script_code) && mark.category === "Me" && !markScripts.length)
        return {priority:2, reason:"general-mark"};
      return null;
    }
    function select(marks, value, options = {}) {
      const base = typeof value === "string" ? describeBase(value) : value;
      if (!base?.valid || !Number.isInteger(base.codepoint)) return [];
      const group = options.group || "";
      if (group && !GROUPS.some(item => item.id === group)) return [];
      const candidates = [];
      for (const mark of marks) {
        const use = classify(mark);
        if (group && group !== use) continue;
        const recommendation = rank(mark, base, use);
        if (!recommendation && !options.all) continue;
        candidates.push({mark, group:use, ...(recommendation || {priority:3, reason:"all-marks"})});
      }
      return candidates.sort((a,b) => a.priority - b.priority || a.mark.codepoint - b.mark.codepoint);
    }
    return Object.freeze({describeBase, select, unicodeVersion:properties.unicode_version});
  }
  const api = Object.freeze({GROUPS, classify, createPolicy});
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UnicodeCombiningCandidates = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
