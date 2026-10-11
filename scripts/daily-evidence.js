"use strict";

/*
 * Eleven editorial headings (including the mandatory summary).
 * A character qualifies when summary + at least TWO other evidence-backed,
 * nonduplicated headings are available. Readings/transliterations appear in the existing
 * separate field and never count as a researched heading. A code point, Unicode
 * block or age alone does not count.
 */
const SECTION_DEFINITIONS = Object.freeze([
  {key: "usage", label: "使われ方"},
  {key: "examples", label: "使用例"},
  {key: "meaning", label: "意味"},
  {key: "etymology", label: "由来・語源"},
  {key: "history", label: "歴史"},
  {key: "structure", label: "字形・構造"},
  {key: "related", label: "関連文字"},
  {key: "culture", label: "文化的背景"},
  {key: "unicodeInfo", label: "Unicode情報"},
  {key: "trivia", label: "豆知識"}
]);
const SECTION_KEYS = Object.freeze(SECTION_DEFINITIONS.map(x => x.key));

function evidenceCategory(fact) {
  const kind = String(fact?.kind || "");
  const registered = /^registered:(usage|examples|meaning|etymology|history|structure|related|culture|unicodeInfo|trivia)$/.exec(kind);
  if (registered) return registered[1];
  // Compatibility with previously reviewed registry records.
  if (kind === "registered:supplementalInfo") return "history";
  if (kind === "registered:fact") return "structure";

  if (/^unihan:definition$/.test(kind) || /^function$/.test(kind)
      || /^emoji:jaName$/.test(kind) || /^smufl:glyph$/.test(kind)
      || /^historical:.*(?:Meaning|Definition|Function|Gloss|Translation|Use)$/i.test(kind))
    return "meaning";
  if (/^appearance$/.test(kind)
      || /^unihan:(?:totalStrokes|radicalStroke)$/.test(kind)
      || /^namesList:decomposition$/.test(kind))
    return "structure";
  if (/^unihan:(?:compatibilityVariant|japaneseNewVariant|japaneseOldVariant|semanticVariant|simplifiedVariant|traditionalVariant|zVariant)$/.test(kind)
      || /^namesList:(?:crossReference|variation)$/.test(kind)
      || /^math:(?:bidiBracket|bidiMirror)$/.test(kind))
    return "related";
  if (/^registered:fact$/.test(kind) || /^namesList:comment$/.test(kind)
      || /^unihan:(?:primaryNumeric|accountingNumeric|otherNumeric)$/.test(kind)
      || /^historical:.*(?:Numeric|Number|Variant|Alternate|CharacterType)$/i.test(kind))
    return "trivia";
  if (/^math:property$/.test(kind) || /^unicode:standardizedVariant$/.test(kind)
      || /^smufl:classes$/.test(kind))
    return "unicodeInfo";
  return null;
}

function categorizeEvidence(facts) {
  const result = Object.fromEntries(SECTION_KEYS.map(k => [k, []]));
  const used = new Set();
  for (const f of facts || []) {
    if (!f || typeof f.text !== "string" || !f.text.trim()) continue;
    const category = evidenceCategory(f);
    if (!category || !result[category]) continue;
    // One source fact may never qualify two headings.
    const key = f.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (used.has(key)) continue;
    used.add(key);
    result[category].push({
      kind: f.kind, text: f.text.trim(), source: f.source,
      sourceUrl: f.sourceUrl || null
    });
  }
  return result;
}

function availableFieldCount(evidence) {
  return SECTION_KEYS.filter(k => Array.isArray(evidence?.[k]) && evidence[k].length).length;
}
function cleanText(value, max = 240) {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}
function normalize(text) {
  return text.replace(/[\p{P}\p{S}\s]+/gu, "").toLowerCase();
}
function validateEditorialDescription(description, evidence) {
  if (!description || typeof description !== "object") return null;
  const summary = cleanText(description.summary, 240);
  if (!summary || !description.sections || typeof description.sections !== "object"
      || Array.isArray(description.sections)) return null;
  const sections = {};
  for (const key of SECTION_KEYS) {
    const raw = description.sections[key];
    if (typeof raw !== "string" || raw.trim().length > 260) return null;
    // Refuse facts written without registered field-specific evidence.
    sections[key] = Array.isArray(evidence?.[key]) && evidence[key].length
      ? cleanText(raw, 260) : "";
  }
  const filled = SECTION_KEYS.map(k => sections[k]).filter(Boolean);
  if (filled.length < 2) return null;
  // Prevent verbatim/format-only repetitions from passing two slots.
  const normalized = filled.map(normalize);
  if (new Set(normalized).size !== normalized.length) return null;
  return {summary, sections, fieldCount: filled.length};
}
function hasApprovedDescription(info) {
  if (!info || info.descriptionSchema !== 3 || typeof info.summary !== "string"
      || !info.summary.trim() || !info.sections) return false;
  return SECTION_KEYS.filter(key => typeof info.sections[key] === "string"
    && info.sections[key].trim()).length >= 2;
}

module.exports = {
  SECTION_DEFINITIONS, SECTION_KEYS, categorizeEvidence,
  availableFieldCount, validateEditorialDescription, hasApprovedDescription
};
