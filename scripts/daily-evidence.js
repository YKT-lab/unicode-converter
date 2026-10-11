"use strict";

/*
 * Research-backed editorial eligibility for Daily Unicode.
 * These are three DIFFERENT types of information, not three paraphrases
 * of the Unicode character name. Metadata such as code point, version,
 * block name, catalog number and IRG source ID never counts.
 */
function evidenceCategory(fact) {
  const kind = String(fact && fact.kind || "");
  if (/^registered:usage$/.test(kind)
      || /^unihan:definition$/.test(kind)
      || /^function$/.test(kind)
      || /^smufl:glyph$/.test(kind)
      || /^emoji:jaName$/.test(kind)
      || /^historical:.*(?:Meaning|Definition|Function|Gloss|Translation|Use)$/i.test(kind))
    return "usage";

  if (/^registered:supplementalInfo$/.test(kind)
      || /^unihan:japanese(?:On|Kun)$/.test(kind)
      || /^smufl:classes$/.test(kind)
      || /^emoji:jaKeywords$/.test(kind)
      || /^namesList:(?:formalAlias|alias|notice|decomposition|variation)$/.test(kind)
      || /^historical:.*(?:Reading|Pronunciation|Phonetic|Transliteration)$/i.test(kind))
    return "supplementalInfo";

  if (/^registered:fact$/.test(kind)
      || /^appearance$/.test(kind)
      || /^functionValue$/.test(kind)
      || /^unihan:(?:totalStrokes|primaryNumeric|accountingNumeric|otherNumeric|compatibilityVariant|japaneseNewVariant|japaneseOldVariant|semanticVariant|simplifiedVariant|traditionalVariant|zVariant)$/.test(kind)
      || /^math:(?:bidiBracket|bidiMirror)$/.test(kind)
      || /^namesList:comment$/.test(kind)
      || /^historical:.*(?:Numeric|Number|Variant|Alternate|CharacterType)$/i.test(kind))
    return "facts";
  return null;
}

function categorizeEvidence(facts) {
  const result = {usage: [], supplementalInfo: [], facts: []};
  const used = new Set();
  for (const f of facts || []) {
    if (!f || typeof f.text !== "string" || !f.text.trim()) continue;
    const category = evidenceCategory(f);
    if (!category) continue;
    const key = f.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (used.has(key)) continue;
    used.add(key);
    result[category].push({
      kind: f.kind,
      text: f.text,
      source: f.source,
      sourceUrl: f.sourceUrl || null
    });
  }
  return result;
}

function availableFieldCount(evidence) {
  return ["usage", "supplementalInfo", "facts"]
    .filter(field => Array.isArray(evidence[field]) && evidence[field].length > 0)
    .length;
}
function cleanText(value, max = 220) {
  return typeof value === "string" && value.trim().length <= max
    ? value.trim() : "";
}
function normalize(text) {
  return text.replace(/[\p{P}\p{S}\s]+/gu, "").toLowerCase();
}
function validateEditorialDescription(description, evidence) {
  if (!description || typeof description !== "object") return null;
  const summary = cleanText(description.summary, 240);
  if (!summary) return null;
  const usage = cleanText(description.usage, 260);
  const supplementalInfo = cleanText(description.supplementalInfo, 260);
  const facts = Array.isArray(description.facts)
    ? description.facts.map(item => cleanText(item, 145)).filter(Boolean)
    : [];
  if (facts.length > 2) return null;
  const contents = {
    usage: usage && evidence.usage.length > 0 ? usage : "",
    supplementalInfo: supplementalInfo && evidence.supplementalInfo.length > 0
      ? supplementalInfo : "",
    facts: evidence.facts.length > 0 ? facts : []
  };
  const sections = [contents.usage, contents.supplementalInfo, ...contents.facts]
    .map(normalize).filter(Boolean);
  if (new Set(sections).size !== sections.length) return null;
  const count = Number(Boolean(contents.usage))
    + Number(Boolean(contents.supplementalInfo))
    + Number(contents.facts.length > 0);
  if (count < 2) return null;
  return {summary, ...contents, fieldCount: count};
}
module.exports = {categorizeEvidence, availableFieldCount, validateEditorialDescription};
