"use strict";

/*
 * Reviewed first-party documentation registry for Daily Unicode.
 * An entry makes a code-point range eligible for RESEARCH, never
 * automatically acceptable. The 2-of-3 content check happens later.
 *
 * Add new ranges only after verifying that the cited resource really
 * documents that range. Narrow ranges override broad categories.
 */
const SOURCE_RANGES = [
  {
    id: "katakana-phonetic-extensions",
    start: 0x31F0, end: 0x31FF,
    name: "Unicode Standard 18.4.3 — Katakana Phonetic Extensions",
    url: "https://www.unicode.org/versions/Unicode18.0.0/core-spec/chapter-18/",
    evidence: [
      {kind: "registered:usage", text: "アイヌ語やその他の言語の音声転写に用いる小書きカタカナです。"},
      {kind: "registered:supplementalInfo", text: "この文字範囲は JIS X 0213:2000 に基づいて制定されました。"},
      {kind: "registered:fact", text: "この範囲の小書きカタカナには、結合濁点・結合半濁点を添えて音を修飾できるものがあります。"}
    ]
  },
  {
    id: "cjk-unihan-basic", start: 0x3400, end: 0x4DBF,
    name: "Unicode Unihan Database", url: "https://www.unicode.org/reports/tr38/",
    provider: "unihan"
  },
  {
    id: "cjk-unihan-unified", start: 0x4E00, end: 0x9FFF,
    name: "Unicode Unihan Database", url: "https://www.unicode.org/reports/tr38/",
    provider: "unihan"
  },
  {
    id: "cjk-unihan-extensions", start: 0x20000, end: 0x2EE5F,
    name: "Unicode Unihan Database", url: "https://www.unicode.org/reports/tr38/",
    provider: "unihan"
  },
  {
    id: "cjk-unihan-compatibility", start: 0x2F800, end: 0x2FA1F,
    name: "Unicode Unihan Database", url: "https://www.unicode.org/reports/tr38/",
    provider: "unihan"
  },
  {
    id: "cjk-unihan-extensions-b", start: 0x30000, end: 0x3347F,
    name: "Unicode Unihan Database", url: "https://www.unicode.org/reports/tr38/",
    provider: "unihan"
  },
  {
    id: "egyptian-hieroglyphs", start: 0x13000, end: 0x1342F,
    name: "Unicode Egyptian Hieroglyph Database (Unikemet)",
    url: "https://www.unicode.org/reports/tr57/",
    provider: "unikemet"
  },
  {
    id: "egyptian-hieroglyphs-extended", start: 0x13460, end: 0x143FF,
    name: "Unicode Egyptian Hieroglyph Database (Unikemet)",
    url: "https://www.unicode.org/reports/tr57/",
    provider: "unikemet"
  },
  {
    id: "emoji-misc-symbols", start: 0x2600, end: 0x27BF,
    name: "Unicode CLDR Japanese Emoji Annotations",
    url: "https://cldr.unicode.org/translation/characters/emoji-annotations",
    provider: "emoji"
  },
  {
    id: "emoji-transport-symbols", start: 0x2300, end: 0x23FF,
    name: "Unicode CLDR Japanese Emoji Annotations",
    url: "https://cldr.unicode.org/translation/characters/emoji-annotations",
    provider: "emoji"
  },
  {
    id: "emoji-supplement", start: 0x1F000, end: 0x1FAFF,
    name: "Unicode CLDR Japanese Emoji Annotations",
    url: "https://cldr.unicode.org/translation/characters/emoji-annotations",
    provider: "emoji"
  },
  {
    id: "music-symbols", start: 0x1D100, end: 0x1D1FF,
    name: "W3C Community Group Standard Music Font Layout (SMuFL)",
    url: "https://www.w3.org/community/music-notation/",
    provider: "music"
  },
  {
    id: "music-basic", start: 0x2669, end: 0x266F,
    name: "W3C Community Group Standard Music Font Layout (SMuFL)",
    url: "https://www.w3.org/community/music-notation/",
    provider: "music"
  },
  {
    id: "nushu-sources", start: 0x1B170, end: 0x1B2FF,
    name: "Unicode NushuSources",
    url: "https://www.unicode.org/Public/UCD/latest/ucd/NushuSources.txt",
    provider: "historical"
  },
  {
    id: "tangut-sources", start: 0x17000, end: 0x18AFF,
    name: "Unicode TangutSources",
    url: "https://www.unicode.org/Public/UCD/latest/ucd/TangutSources.txt",
    provider: "historical"
  },
  {
    id: "jurchen-sources", start: 0x18D80, end: 0x18DFF,
    name: "Unicode JurchenSources",
    url: "https://www.unicode.org/Public/UCD/latest/ucd/JurchenSources.txt",
    provider: "historical"
  },
  {
    id: "unicode-math", start: 0x2200, end: 0x22FF,
    name: "Unicode NamesList and Mathematical Characters",
    url: "https://www.unicode.org/versions/Unicode18.0.0/core-spec/chapter-22/",
    provider: "namesList"
  },
  {
    id: "unicode-math-brackets", start: 0x2980, end: 0x29FF,
    name: "Unicode NamesList and Mathematical Characters",
    url: "https://www.unicode.org/versions/Unicode18.0.0/core-spec/chapter-22/",
    provider: "namesList"
  },
  {
    id: "unicode-arrows", start: 0x2190, end: 0x21FF,
    name: "Unicode NamesList — Arrows",
    url: "https://www.unicode.org/charts/nameslist/n_2190.html",
    provider: "namesList"
  },
  {
    id: "unicode-legacy-computing", start: 0x1CC00, end: 0x1CEBF,
    name: "Unicode NamesList — Symbols for Legacy Computing Supplement",
    url: "https://www.unicode.org/charts/nameslist/n_1CC00.html",
    provider: "namesList"
  }
];

function findRegisteredSource(codePoint) {
  return SOURCE_RANGES.find(item =>
    codePoint >= item.start && codePoint <= item.end
  ) || null;
}

function getRegisteredEvidence(source, data) {
  if (!source) return [];
  const available = ({
    unihan: Boolean(data.unihan && Object.keys(data.unihan).length),
    unikemet: Boolean(data.unikemet && Object.keys(data.unikemet).length),
    emoji: Boolean(data.emoji && data.emoji.shortName),
    music: Boolean(data.music && data.music.matches && data.music.matches.length),
    historical: Boolean(data.historical && Object.keys(data.historical.properties || {}).length),
    namesList: Boolean(data.namesList && data.namesList.length)
  });
  if (source.provider && !available[source.provider]) return [];
  return (source.evidence || []).map(item => ({
    kind: item.kind, text: item.text, source: source.name,
    strength: "strong", sourceUrl: source.url
  }));
}

module.exports = {SOURCE_RANGES, findRegisteredSource, getRegisteredEvidence};
