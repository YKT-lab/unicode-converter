/* UAX #15 normalization using the same pinned UCD as the combining catalogue.
 * Browser String#normalize can use an older Unicode version than the data.
 * Keep the whole string intact; rendering and grapheme shaping are separate.
 */
(function (root) {
"use strict";
const S_BASE = 0xAC00, L_BASE = 0x1100, V_BASE = 0x1161, T_BASE = 0x11A7;
const L_COUNT = 19, V_COUNT = 21, T_COUNT = 28;
const N_COUNT = V_COUNT * T_COUNT, S_COUNT = L_COUNT * N_COUNT;
const FORMS = new Set(["NFC", "NFD", "NFKC", "NFKD"]);

function scalar(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10FFFF &&
    !(value >= 0xD800 && value <= 0xDFFF);
}
function invalid() { throw new TypeError("Invalid Unicode normalization data"); }

function createNormalizer(data) {
  if (!data || data.schema_version !== 1 || typeof data.unicode_version !== "string" ||
      !Array.isArray(data.decompositions) || !Array.isArray(data.combining_classes) ||
      !Array.isArray(data.compositions)) invalid();
  const decompositions = new Map(), classes = new Map(), compositions = new Map();
  for (const entry of data.decompositions) {
    if (!Array.isArray(entry) || entry.length < 3 || !scalar(entry[0]) ||
        (entry[1] !== 0 && entry[1] !== 1) || !entry.slice(2).every(scalar) ||
        decompositions.has(entry[0])) invalid();
    decompositions.set(entry[0], {compatibility:entry[1] === 1, sequence:entry.slice(2)});
  }
  for (const entry of data.combining_classes) {
    if (!Array.isArray(entry) || entry.length !== 2 || !scalar(entry[0]) ||
        !Number.isInteger(entry[1]) || entry[1] < 1 || entry[1] > 255 || classes.has(entry[0])) invalid();
    classes.set(entry[0], entry[1]);
  }
  for (const entry of data.compositions) {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every(scalar)) invalid();
    const key = entry[0] * 0x110000 + entry[1];
    if (compositions.has(key)) invalid();
    compositions.set(key, entry[2]);
  }

  function decomposePoint(cp, compatibility, output, depth) {
    const syllable = cp - S_BASE;
    if (syllable >= 0 && syllable < S_COUNT) {
      output.push(L_BASE + Math.floor(syllable / N_COUNT),
        V_BASE + Math.floor((syllable % N_COUNT) / T_COUNT));
      const trailing = syllable % T_COUNT;
      if (trailing) output.push(T_BASE + trailing);
      return;
    }
    const mapping = decompositions.get(cp);
    if (!mapping || (mapping.compatibility && !compatibility)) {
      output.push(cp);
      return;
    }
    // Official decompositions are acyclic. Bound recursion if a damaged data
    // file is supplied rather than overflowing the browser's call stack.
    if (depth > 32) invalid();
    for (const part of mapping.sequence) decomposePoint(part, compatibility, output, depth + 1);
  }

  function orderedDecomposition(value, compatibility) {
    const decomposed = [];
    for (const character of value) decomposePoint(character.codePointAt(0), compatibility, decomposed, 0);
    const result = [];
    let buckets = null;
    function flush() {
      if (!buckets) return;
      for (const cc of Array.from(buckets.keys()).sort((a, b) => a - b)) {
        // Equal-CCC marks retain input order; do not let long mark sequences
        // turn canonical ordering into a quadratic insertion sort.
        for (const cp of buckets.get(cc)) result.push(cp);
      }
      buckets = null;
    }
    for (const cp of decomposed) {
      const cc = classes.get(cp) || 0;
      if (!cc) { flush(); result.push(cp); }
      else {
        if (!buckets) buckets = new Map();
        if (!buckets.has(cc)) buckets.set(cc, []);
        buckets.get(cc).push(cp);
      }
    }
    flush();
    return result;
  }

  function composePair(starter, cp) {
    const l = starter - L_BASE, v = cp - V_BASE;
    if (l >= 0 && l < L_COUNT && v >= 0 && v < V_COUNT)
      return S_BASE + (l * V_COUNT + v) * T_COUNT;
    const s = starter - S_BASE, t = cp - T_BASE;
    if (s >= 0 && s < S_COUNT && s % T_COUNT === 0 && t > 0 && t < T_COUNT)
      return starter + t;
    return compositions.get(starter * 0x110000 + cp);
  }

  function composed(points) {
    const result = [];
    let starterPosition = -1, starter = null, previousClass = 0;
    for (const cp of points) {
      const cc = classes.get(cp) || 0;
      const composite = starter !== null && (previousClass === 0 || previousClass < cc)
        ? composePair(starter, cp) : undefined;
      if (composite !== undefined) {
        result[starterPosition] = composite;
        starter = composite;
        // A consumed mark does not block a later composition.
      } else {
        if (cc === 0) { starterPosition = result.length; starter = cp; }
        result.push(cp);
        previousClass = cc;
      }
    }
    return result;
  }

  function normalize(value, form = "NFC") {
    if (!FORMS.has(form)) throw new RangeError("Unknown Unicode normalization form: " + form);
    if (typeof value !== "string") throw new TypeError("Unicode normalization requires a string");
    const points = orderedDecomposition(value, form === "NFKC" || form === "NFKD");
    const normalized = form === "NFC" || form === "NFKC" ? composed(points) : points;
    // Avoid apply/spread argument limits on long Unicode strings.
    return normalized.map(cp => String.fromCodePoint(cp)).join("");
  }
  return Object.freeze({normalize, unicodeVersion:data.unicode_version});
}

const api = Object.freeze({createNormalizer});
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.UnicodeCombiningNormalization = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
