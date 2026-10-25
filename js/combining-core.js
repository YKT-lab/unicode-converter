/* Pure data and string operations shared by the maker and its tests. */
(function (root) {
  "use strict";
  const categories = Object.freeze({Mn: "非前進結合文字", Mc: "前進結合文字", Me: "囲み結合文字"});
  function codePoint(cp) { return "U+" + cp.toString(16).toUpperCase().padStart(4, "0"); }
  function codePoints(text) { return Array.from(text, char => codePoint(char.codePointAt(0))).join(" "); }
  function parseBase(value) {
    const points = Array.from(value);
    if (!points.length) return {valid:false, message:"基本文字を1コードポイント入力してください。"};
    if (points.length !== 1) return {valid:false, message:"基本文字は1コードポイントだけ指定できます。結合済み文字列やZWJ列は使えません。"};
    const cp = points[0].codePointAt(0);
    if (cp >= 0xD800 && cp <= 0xDFFF) return {valid:false, message:"有効なUnicode文字を入力してください。"};
    return {valid:true, codepoint:cp};
  }
  function prepareCatalogue(data) {
    if (!data || data.schema_version !== 1 || typeof data.unicode_version !== "string" ||
        !Array.isArray(data.marks) || data.count !== data.marks.length) throw Error("Invalid combining catalogue");
    let previous = -1;
    return data.marks.map(mark => {
      if (!Number.isInteger(mark.codepoint) || mark.codepoint <= previous || mark.codepoint > 0x10FFFF ||
          (mark.codepoint >= 0xD800 && mark.codepoint <= 0xDFFF) || !categories[mark.category] ||
          typeof mark.name !== "string" || typeof mark.script !== "string" || typeof mark.script_code !== "string" ||
          !Array.isArray(mark.script_extensions) || !mark.script_extensions.every(x => typeof x === "string") ||
          !Number.isInteger(mark.combining_class) || mark.combining_class < 0 || mark.combining_class > 255) {
        throw Error("Invalid combining record");
      }
      previous = mark.codepoint;
      return Object.freeze({...mark, search: [mark.name, codePoint(mark.codepoint), mark.script,
        mark.script.replace(/_/g, " "), mark.script_code, ...mark.script_extensions,
        mark.category, categories[mark.category], "CCC " + mark.combining_class].join(" ").toLowerCase()});
    });
  }
  function search(marks, query, script = "", category = "") {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return marks.filter(mark => (!script || mark.script_code === script || mark.script_extensions.includes(script)) &&
      (!category || mark.category === category) && tokens.every(token => {
        if (/^(?:u\+|0x)[0-9a-f]{1,6}$/.test(token)) {
          const hex = token.replace(/^(?:u\+|0x)/, "");
          return mark.codepoint === parseInt(hex, 16) || mark.codepoint.toString(16).padStart(4, "0").startsWith(hex);
        }
        if (/^[0-9a-f]{4,6}$/.test(token)) return mark.codepoint === parseInt(token, 16);
        return mark.search.includes(token);
      }));
  }
  function compose(base, selected) { return base + selected.map(mark => String.fromCodePoint(mark.codepoint)).join(""); }
  function move(selected, index, delta) {
    const destination = index + delta;
    if (!Number.isInteger(index) || !Number.isInteger(delta) || index < 0 || index >= selected.length || destination < 0 || destination >= selected.length) return selected.slice();
    const result = selected.slice(), mark = result.splice(index, 1)[0];
    result.splice(destination, 0, mark);
    return result;
  }
  const api = Object.freeze({categories, codePoint, codePoints, parseBase, prepareCatalogue, search, compose, move});
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UnicodeCombiningCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
