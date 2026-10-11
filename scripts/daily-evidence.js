"use strict";

/*
 * Eleven editorial headings (including the mandatory summary).
 * A character qualifies when summary + AT LEAST TWO evidence-backed,
 * nonduplicated headings are available. Publish exactly the best two.
 * Readings/transliterations appear in the existing
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
      strength: f.strength || null,
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
/*
 * Always keep exactly two headings, even when Gemini finds three or more.
 * Favor concrete meanings, examples and uses, then context over metadata.
 * Evidence strength and specificity are tie-breakers, not substitute facts.
 * The choice is deterministic, so today's glyph remains stable.
 */
const SECTION_PRIORITY = Object.freeze({
  examples: 12, usage: 11, meaning: 11, etymology: 9,
  history: 9, culture: 8, structure: 8, related: 7,
  trivia: 5, unicodeInfo: 4
});

function textOverlap(left,right) {
  const a=normalize(String(left||"")), b=normalize(String(right||""));
  if(!a||!b)return 0;
  if(a===b||a.includes(b)||b.includes(a))return 1;
  const grams=value=>new Set(Array.from({length:Math.max(0,value.length-1)},(_,i)=>value.slice(i,i+2)));
  const one=grams(a),two=grams(b);
  if(!one.size||!two.size)return 0;
  const common=[...one].filter(x=>two.has(x)).length;
  return 2*common/(one.size+two.size);
}
const overlapsSummary=(summary,sections)=>SECTION_KEYS.some(key=>
  sections?.[key]&&textOverlap(summary,sections[key])>=0.33
);
function selectBestTwoSections(sections, evidence = null, summary = "") {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return null;
  const ranked = SECTION_KEYS.map((key, index) => {
    const value = cleanText(sections[key], 260);
    if (!value) return null;
    const notes = Array.isArray(evidence?.[key]) ? evidence[key] : [];
    if (evidence && notes.length === 0) return null;
    const hasStrong = notes.some(fact => fact.strength === "strong");
    const score = (SECTION_PRIORITY[key] || 0) * 10
      + Math.min(notes.length, 3) * 2
      + (hasStrong ? 2 : 0)
      + Math.min(value.length, 160) / 160;
    return {key, value, index, score};
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.index - b.index);

  // Score complete pairs against the overview and one another, not
  // solely by section quality; prefer distinct information.
  let best = null;
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const x = ranked[i], y = ranked[j];
      const across = textOverlap(x.value,y.value);
      if (across >= 0.55) continue;
      const summaryOverlap = textOverlap(summary,x.value)
        + textOverlap(summary,y.value);
      const score=x.score+y.score - across*90 - summaryOverlap*110;
      if(!best||score>best.score)best={score,x,y};
    }
  }
  if(!best)return null;
  const picked=new Map([[best.x.key,best.x.value],[best.y.key,best.y.value]]);
  return Object.fromEntries(SECTION_KEYS.map(key => [key, picked.get(key) || ""]));
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
    // Do not count claims without registered field-specific evidence.
    sections[key] = Array.isArray(evidence?.[key]) && evidence[key].length
      ? cleanText(raw, 260) : "";
  }
  const selected = selectBestTwoSections(sections,evidence,summary);
  if(!selected)return null;
  return {summary,sections:selected,fieldCount:2,
    needsRevision:overlapsSummary(summary,selected)};
}
function hasApprovedDescription(info) {
  return Boolean(info && info.descriptionSchema === 4
    && typeof info.summary === "string" && info.summary.trim()
    && selectBestTwoSections(info.sections,null,info.summary)
    && !overlapsSummary(info.summary,info.sections));
}

module.exports = {
  SECTION_DEFINITIONS, SECTION_KEYS, categorizeEvidence,
  availableFieldCount, textOverlap, overlapsSummary, selectBestTwoSections,
  validateEditorialDescription, hasApprovedDescription
};
