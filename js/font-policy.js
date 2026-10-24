/* Shared, side-effect-free font ordering for browser text and SVG builds. */
(function(root) {
"use strict";
function lookup(ranges, codePoint) {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, range = ranges[middle];
    if (codePoint < range[0]) high = middle - 1;
    else if (codePoint > range[1]) low = middle + 1;
    else return range;
  }
  return null;
}
function getCandidateFontIds(index, codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF ||
      !index || !Array.isArray(index.ranges) || !Array.isArray(index.script_ranges) ||
      !Array.isArray(index.combinations) || !Array.isArray(index.font_families)) return [];
  const range = lookup(index.ranges, codePoint);
  if (!range) return [];
  const coveredIds = index.combinations[range[2]];
  if (!Array.isArray(coveredIds)) return [];
  const covered = new Set(coveredIds);
  const script = lookup(index.script_ranges, codePoint)?.[2];
  const preferred = index.script_font_candidates?.[script];
  const ordered = [], selected = new Set();
  for (const id of [...(Array.isArray(preferred) ? preferred : []), ...coveredIds]) {
    if (!Number.isInteger(id) || id < 0 || id >= index.font_families.length ||
        !covered.has(id) || selected.has(id)) continue;
    ordered.push(id);
    selected.add(id);
  }
  return ordered;
}
const api = Object.freeze({getCandidateFontIds});
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.UnicodeFontPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
