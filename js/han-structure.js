/*
 * Deterministic Han radical and stroke details from Unicode Unihan.
 * One source field must not be rewritten into multiple invented facts.
 * Works in the daily generator (Node) and today's character card (browser).
 */
(function (root) {
  "use strict";
  function formatHanStructure(strokes) {
    if (!strokes || typeof strokes !== "object") return "";
    const radicalStroke = typeof strokes.radicalStroke === "string"
      ? /^(\d{1,3})(['\u2019]?)\.(\d{1,2})$/.exec(strokes.radicalStroke.trim())
      : null;
    if (!radicalStroke) return "";
    const radicalNumber = Number(radicalStroke[1]);
    const otherStrokes = Number(radicalStroke[3]);
    if (radicalNumber < 1 || radicalNumber > 214 || otherStrokes > 60) return "";
    // Kangxi Radicals U+2F00–U+2FD5 have canonical Unicode compatibility
    // equivalents for the corresponding traditional 214 radicals.
    const radical = String.fromCodePoint(0x2F00 + radicalNumber - 1).normalize("NFKC");
    if ([...radical].length !== 1) return "";
    const variant = radicalStroke[2] ? "系" : "";
    let result = "部首は「" + radical + "」" + variant
      + "で、部首を除く画数は" + otherStrokes + "画です。";
    if (typeof strokes.total === "string" && /^\d{1,3}$/.test(strokes.total.trim())) {
      const total = Number(strokes.total.trim());
      if (total >= otherStrokes && total <= 80) {
        result = "部首は「" + radical + "」" + variant
          + "で、部首を除く画数は" + otherStrokes + "画、総画数は" + total + "画です。";
      }
    }
    return result;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = {formatHanStructure};
  else root.formatDailyHanStructure = formatHanStructure;
})(typeof globalThis !== "undefined" ? globalThis : this);
