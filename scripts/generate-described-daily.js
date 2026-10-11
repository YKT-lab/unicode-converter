const fs = require("fs");
const {findRegisteredSource, getRegisteredEvidence} = require("./source-registry.js");
const {
  SECTION_DEFINITIONS, SECTION_KEYS, categorizeEvidence, availableFieldCount,
  validateEditorialDescription, hasApprovedDescription
} = require("./daily-evidence.js");

const {
  UNIHAN_URL,
  loadUnihanData,
  buildHanProfile
} = require("./unihan-profile.js");

const {
  SMUFL_GLYPHNAMES_URL,
  SMUFL_CLASSES_URL,
  loadMusicData,
  buildMusicProfile
} = require("./music-profile.js");

const {
  EMOJI_DATA_URL,
  CLDR_JA_ANNOTATIONS_URL,
  loadEmojiData,
  buildEmojiProfile
} = require("./emoji-profile.js");

const {
  HISTORICAL_SOURCES,
  loadHistoricalData,
  buildHistoricalProfile
} = require("./historical-profile.js");

const {
  MATH_SOURCES,
  loadMathData,
  buildMathProfile
} = require("./math-profile.js");

const {
  UCD_BASE,
  COMMON_UCD_SOURCES,
  fetchText,
  loadCommonUcdData,
  buildCommonProfile
} = require("./ucd-profile.js");

const {
  DAILY_JSON_PATH,
  getJSTDateString,
  loadFonts,
  generateEntry,
  pickDailyCategory,
  loadExistingDailyData
} = require("./generate-daily.js");


const API_KEY =
  process.env.GEMINI_API_KEY;


const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];


const GEMINI_ATTEMPTS_PER_MODEL =
  2;


if (!API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is not set."
  );
}


const SOURCES = {
  ...COMMON_UCD_SOURCES,

  unikemet:
    UCD_BASE +
    "/Unikemet.txt"
};


function hex(
  codePoint
) {

  return codePoint
    .toString(16)
    .toUpperCase()
    .padStart(
      4,
      "0"
    );
}



async function loadResearchSources() {

  const [
    commonUcd,
    unikemet,
    unihan,
    music,
    emoji,
    historical,
    math
  ] =
    await Promise.all(
      [
        loadCommonUcdData(),

        fetchText(
          SOURCES.unikemet
        ),

        loadUnihanData(),

        loadMusicData(),

        loadEmojiData(),

        loadHistoricalData(),

        loadMathData()
      ]
    );


  return {
    commonUcd,
    unikemet,
    unihan,
    music,
    emoji,
    historical,
    math
  };
}

function findUnikemet(
  text,
  codePoint
) {

  const target =
    "U+" +
    hex(
      codePoint
    );


  const properties =
    {};


  for (
    const line
    of text.split(
      /\r?\n/
    )
  ) {

    if (
      !line
      ||
      line.startsWith(
        "#"
      )
    ) {
      continue;
    }


    const fields =
      line.split(
        "\t"
      );


    if (
      fields.length <
        3
      ||
      fields[
        0
      ].trim() !==
        target
    ) {
      continue;
    }


    const property =
      fields[
        1
      ].trim();


    const value =
      fields
        .slice(
          2
        )
        .join(
          "\t"
        )
        .trim();


    if (
      property
      &&
      value
    ) {

      properties[
        property
      ] =
        value;
    }
  }


  return properties;
}


function normalizeFactText(
  text
) {

  return String(
    text
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}


function makeFacts(
  namesList,
  unikemet,
  unihan
) {

  const facts =
    [];


  const seen =
    new Set();


  const push = (
    kind,
    text,
    source,
    strength =
      "strong"
  ) => {

    if (
      !text
    ) {
      return;
    }


    const normalized =
      normalizeFactText(
        text
      );


    if (
      !normalized
      ||
      seen.has(
        normalized
      )
    ) {
      return;
    }


    seen.add(
      normalized
    );


    facts.push(
      {
        kind,
        text,
        source,
        strength
      }
    );
  };


  push(
    "appearance",
    unikemet.kEH_Desc,
    "Unicode Unikemet",
    "strong"
  );


  push(
    "function",
    unikemet.kEH_Func,
    "Unicode Unikemet",
    "strong"
  );


  push(
    "functionValue",
    unikemet.kEH_FVal,
    "Unicode Unikemet",
    "strong"
  );


  for (
    const item
    of namesList
  ) {

    if (
      item.type ===
        "comment"
    ) {

      push(
        "namesList:comment",
        item.text,
        "Unicode NamesList",
        "strong"
      );

    } else if (
      [
        "alias",
        "formalAlias",
        "notice",
        "crossReference",
        "decomposition",
        "variation"
      ].includes(
        item.type
      )
    ) {

      push(
        "namesList:" +
          item.type,
        item.text,
        "Unicode NamesList",
        "supporting"
      );
    }
  }


  push(
    "unihan:definition",
    unihan.kDefinition,
    "Unicode Unihan",
    "strong"
  );


  push(
    "unihan:japaneseOn",
    unihan.kJapaneseOn,
    "Unicode Unihan",
    "strong"
  );


  push(
    "unihan:japaneseKun",
    unihan.kJapaneseKun,
    "Unicode Unihan",
    "strong"
  );


  push(
    "unihan:totalStrokes",
    unihan.kTotalStrokes,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:radicalStroke",
    unihan.kRSUnicode,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:compatibilityVariant",
    unihan.kCompatibilityVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:japaneseNewVariant",
    unihan.kJapaneseNewVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:japaneseOldVariant",
    unihan.kJapaneseOldVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:semanticVariant",
    unihan.kSemanticVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:simplifiedVariant",
    unihan.kSimplifiedVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:traditionalVariant",
    unihan.kTraditionalVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:zVariant",
    unihan.kZVariant,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "unihan:primaryNumeric",
    unihan.kPrimaryNumeric,
    "Unicode Unihan",
    "strong"
  );


  push(
    "unihan:accountingNumeric",
    unihan.kAccountingNumeric,
    "Unicode Unihan",
    "strong"
  );


  push(
    "unihan:otherNumeric",
    unihan.kOtherNumeric,
    "Unicode Unihan",
    "strong"
  );


  const irgSourceText =
    Object.entries(
      unihan
    )
      .filter(
        (
          [
            key
          ]
        ) =>
          /^kIRG_.+Source$/.test(
            key
          )
      )
      .map(
        (
          [
            key,
            value
          ]
        ) =>
          key +
          "=" +
          value
      )
      .join(
        "; "
      );


  push(
    "unihan:irgSources",
    irgSourceText,
    "Unicode Unihan",
    "supporting"
  );


  push(
    "catalogIndex",
    unikemet.kEH_UniK,
    "Unicode Unikemet",
    "supporting"
  );


  push(
    "taxonomyIndex",
    unikemet.kEH_Cat,
    "Unicode Unikemet",
    "supporting"
  );


  return facts;
}


function researchCharacter(
  sourceTexts,
  entry
) {

  const codePoint =
    parseInt(
      entry.codePoint,
      16
    );

  const registeredSource = findRegisteredSource(codePoint);

  const profile =
    buildCommonProfile(
      sourceTexts.commonUcd,
      codePoint
    );


  const {
    unicodeName,
    block,
    script,
    age,
    generalCategory,
    namesList
  } =
    profile;


  const unikemet =
    findUnikemet(
      sourceTexts.unikemet,
      codePoint
    );


  const hanProfile =
    buildHanProfile(
      sourceTexts.unihan,
      codePoint
    );


  const unihan =
    hanProfile.properties;


  const musicProfile =
    buildMusicProfile(
      sourceTexts.music,
      codePoint
    );


  const emojiProfile =
    buildEmojiProfile(
      sourceTexts.emoji,
      codePoint
    );


  const historicalProfile =
    buildHistoricalProfile(
      sourceTexts.historical,
      codePoint,
      script
    );


  const mathProfile =
    buildMathProfile(
      sourceTexts.math,
      codePoint
    );


  const facts =
    makeFacts(
      namesList,
      unikemet,
      unihan
    );


  const normalizedFactTexts =
    new Set(
      facts.map(
        (
          fact
        ) =>
          normalizeFactText(
            fact.text
          )
      )
    );


  const addFact = (
    kind,
    text,
    source,
    strength =
      "supporting"
  ) => {

    if (
      !text
    ) {
      return;
    }


    const normalized =
      normalizeFactText(
        text
      );


    if (
      !normalized
      ||
      normalizedFactTexts.has(
        normalized
      )
    ) {
      return;
    }


    normalizedFactTexts.add(
      normalized
    );


    facts.push(
      {
        kind,
        text,
        source,
        strength
      }
    );
  };


  if (
    musicProfile
  ) {

    for (
      const match
      of musicProfile.matches
    ) {

      addFact(
        "smufl:glyph",
        [
          match.glyphName,
          match.description
        ]
          .filter(
            Boolean
          )
          .join(
            ": "
          ),
        "SMuFL",
        "strong"
      );


      if (
        match.classes.length >
          0
      ) {

        addFact(
          "smufl:classes",
          match.classes.join(
            ", "
          ),
          "SMuFL",
          "supporting"
        );
      }
    }
  }


  if (
    emojiProfile
  ) {

    addFact(
      "emoji:jaName",
      emojiProfile.shortName,
      "CLDR Japanese annotations",
      "strong"
    );


    if (
      emojiProfile.keywords.length >
        0
    ) {

      addFact(
        "emoji:jaKeywords",
        emojiProfile.keywords.join(
          ", "
        ),
        "CLDR Japanese annotations",
        "supporting"
      );
    }


    if (
      emojiProfile.properties.length >
        0
    ) {

      addFact(
        "emoji:properties",
        emojiProfile.properties.join(
          ", "
        ),
        "Unicode Emoji data",
        "supporting"
      );
    }
  }


  if (
    historicalProfile
  ) {

    for (
      const [
        property,
        value
      ]
      of Object.entries(
        historicalProfile.properties
      )
    ) {

      addFact(
        "historical:" +
          property,
        value,
        historicalProfile.sourceName,
        /Reading|Definition|Meaning|Numeric|Desc|Func/i.test(
          property
        )
          ? "strong"
          : "supporting"
      );
    }
  }


  if (
    mathProfile
  ) {

    if (
      mathProfile.isMath
    ) {

      addFact(
        "math:property",
        "Math",
        "Unicode DerivedCoreProperties",
        "supporting"
      );
    }


    if (
      mathProfile.bracket
    ) {

      addFact(
        "math:bidiBracket",
        "paired U+" +
          mathProfile.bracket.pairedCodePoint +
          " (" +
          mathProfile.bracket.type +
          ")",
        "Unicode BidiBrackets",
        "supporting"
      );
    }


    if (
      mathProfile.mirroredCodePoint
    ) {

      addFact(
        "math:bidiMirror",
        "mirrored U+" +
          mathProfile.mirroredCodePoint,
        "Unicode BidiMirroring",
        "supporting"
      );
    }
  }


  // Only facts backed by this registered range and its data providers
  // can qualify the three editorial sections.
  for (const item of getRegisteredEvidence(registeredSource, {
    unihan, unikemet, emoji: emojiProfile, music: musicProfile,
    historical: historicalProfile, namesList
  })) {
    addFact(item.kind, item.text, item.source, item.strength);
  }

  const evidence = categorizeEvidence(facts);

  const strongFacts =
    facts.filter(
      (
        item
      ) =>
        item.strength ===
          "strong"
    );


  const category =
    entry.category
    ||
    "general";


  const isHan =
    category ===
      "han"
    ||
    script ===
      "Han";


  const isEgyptian =
    script ===
      "Egyptian_Hieroglyphs";


  const isSymbolLike =
    category ===
      "symbol"
    ||
    category ===
      "music"
    ||
    typeof generalCategory ===
      "string"
    &&
    /^[SP]/.test(
      generalCategory
    );


  const unihanFacts =
    facts.filter(
      (
        item
      ) =>
        item.kind.startsWith(
          "unihan:"
        )
    );


  const namesListFacts =
    facts.filter(
      (
        item
      ) =>
        item.kind.startsWith(
          "namesList:"
        )
    );


  const hasIdentity =
    Boolean(
      unicodeName
      &&
      block
      &&
      script
    );


  // A Unicode name or source catalog number alone is never sufficient.
  const researchType = registeredSource ? registeredSource.id : "unregistered";
  const accepted = Boolean(
    hasIdentity && registeredSource && availableFieldCount(evidence) >= 2
  );

  const sources = [
    {
      name:
        "Unicode DerivedName",

      url:
        SOURCES.derivedName
    },

    {
      name:
        "Unicode UnicodeData",

      url:
        SOURCES.unicodeData
    },

    {
      name:
        "Unicode NameAliases",

      url:
        SOURCES.nameAliases
    },

    {
      name:
        "Unicode ScriptExtensions",

      url:
        SOURCES.scriptExtensions
    },

    {
      name:
        "Unicode StandardizedVariants",

      url:
        SOURCES.standardizedVariants
    },

    {
      name:
        "Unicode NamesList",

      url:
        SOURCES.namesList
    }
  ];


  if (registeredSource) {
    sources.unshift({name: registeredSource.name, url: registeredSource.url});
  }

  if (
    Object.keys(
      unikemet
    ).length >
      0
  ) {

    sources.push(
      {
        name:
          "Unicode Unikemet",

        url:
          SOURCES.unikemet
      }
    );
  }


  if (
    Object.keys(
      unihan
    ).length >
      0
  ) {

    sources.push(
      {
        name:
          "Unicode Unihan",

        url:
          UNIHAN_URL
      }
    );
  }


  if (
    musicProfile
  ) {

    sources.push(
      {
        name:
          "SMuFL glyphnames",

        url:
          SMUFL_GLYPHNAMES_URL
      },

      {
        name:
          "SMuFL classes",

        url:
          SMUFL_CLASSES_URL
      }
    );
  }


  if (
    emojiProfile
  ) {

    sources.push(
      {
        name:
          "Unicode Emoji data",

        url:
          EMOJI_DATA_URL
      },

      {
        name:
          "CLDR Japanese annotations",

        url:
          CLDR_JA_ANNOTATIONS_URL
      }
    );
  }


  if (
    historicalProfile
  ) {

    sources.push(
      {
        name:
          historicalProfile.sourceName,

        url:
          historicalProfile.sourceUrl
      }
    );
  }


  if (
    mathProfile
  ) {

    sources.push(
      {
        name:
          "Unicode DerivedCoreProperties",

        url:
          MATH_SOURCES.derivedCoreProperties
      },

      {
        name:
          "Unicode BidiBrackets",

        url:
          MATH_SOURCES.bidiBrackets
      },

      {
        name:
          "Unicode BidiMirroring",

        url:
          MATH_SOURCES.bidiMirroring
      },

      {
        name:
          "Unicode UTR #25",

        url:
          MATH_SOURCES.utr25
      }
    );
  }


  return {
    accepted,

    researchType,

    metadata: {
      category,
      unicodeName,
      block,
      script,
      age,
      generalCategory,

      aliases:
        profile.nameAliases,

      scriptExtensions:
        profile.scriptExtensions,

      standardizedVariants:
        profile.standardizedVariants,

      music:
        musicProfile,

      emoji:
        emojiProfile,

      historical:
        historicalProfile
          ? {
              source:
                historicalProfile.key,

              properties:
                historicalProfile.properties
            }
          : null,

      math:
        mathProfile,

      han:
        isHan
          ? {
              definition:
                hanProfile.definition,

              japaneseOn:
                hanProfile.japaneseOn,

              japaneseKun:
                hanProfile.japaneseKun,

              strokes:
                hanProfile.strokes,

              variants:
                hanProfile.variants,

              numeric:
                hanProfile.numeric,

              irgSources:
                hanProfile.irgSources,

              dictionary:
                hanProfile.dictionary,

              sourceFiles:
                hanProfile.sourceFiles
            }
          : null,

      unicodeData: {
        combiningClass:
          profile.combiningClass,

        bidiClass:
          profile.bidiClass,

        decomposition:
          profile.decomposition,

        decimalValue:
          profile.decimalValue,

        digitValue:
          profile.digitValue,

        numericValue:
          profile.numericValue,

        bidiMirrored:
          profile.bidiMirrored,

        unicode1Name:
          profile.unicode1Name,

        simpleUppercase:
          profile.simpleUppercase,

        simpleLowercase:
          profile.simpleLowercase,

        simpleTitlecase:
          profile.simpleTitlecase
      }
    },

    facts,

    evidence,
    registeredSourceName: registeredSource && registeredSource.name,

    sources,

    diagnostics: {
      strongFactCount:
        strongFacts.length,

      unihanFactCount:
        unihanFacts.length,

      namesListFactCount:
        namesListFacts.length
    }
  };
}

function sleep(
  milliseconds
) {

  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


async function generateDescription(
  entry,
  research
) {

  const sectionLabels = SECTION_DEFINITIONS.map(x => x.key + " = " + x.label).join("\n");
  const prompt = [
    "あなたは厳密な資料根拠に基づくUnicode文字図鑑の編集者です。",
    "次の12項目を扱います: 概要（必須）と、残り11項目から最低2項目（最大3項目程度を優先）。",
    "基本は概要1文 + 有用な2〜3項目各1〜2文。情報が確かな場合は他の項目を埋めてもよいですが、長文や水増しは禁止です。",
    "使用可能な11項目は以下のとおり。sectionsの全キーを必ず返してください。",
    sectionLabels,
    "概要summaryには対象の意味や形を一文で書いてください。文字名やU+番号で始めないでください。",
    "usageは実際の使われ方、examplesは出典に明記された具体例、pronunciationは読み・翻字、meaningは意味や表語機能、etymologyは語源・起源、historyは文字史・規格成立、structureは視覚的構成、relatedは確認済みの異体字・対応文字、cultureは史料に明記された文化的背景、unicodeInfoは単なるU+番号やバージョン以外の特記事項、triviaは他の項目に入らない興味深い事実です。",
    "それぞれのsectionsキーには、対応する根拠のあるときだけ、簡潔な日本語を記入してください。その他は空文字列にしてください。",
    "根拠を持つ項目を優先的に2つ以上埋めてください。根拠が一種類しかない文字は合格しないため、推測で埋めてはいけません。",
    "同じ事実を別の項目で重複させないでください。同一情報を言い換えて項目数を稼ぐことは禁止です。",
    "Unicode名・コードポイント・ブロック名・カタログ番号・文字追加バージョンだけでは独立した解説項目としないでください。",
    "使用例や歴史、語源、発音の根拠がなければ書かないでください。名称だけから意味や用途を創作しないでください。",
    "確認できる根拠は下記に列挙された文字固有情報に限ります。基本メタデータは概要用です。",
    "",
    "対象文字:", entry.character + " U+" + entry.codePoint,
    "抽選カテゴリ:", entry.category,
    "調査タイプ:", research.researchType,
    "基本情報:", JSON.stringify(research.metadata, null, 2),
    "各項目の利用可能な根拠（列挙された項目以外には記入しない）:",
    JSON.stringify(research.evidence, null, 2)
  ].join("\n");

  const sectionProperties = Object.fromEntries(
    SECTION_KEYS.map(key => [key, {type:"string"}])
  );
  const baseBody = {
    input: prompt,
    response_format: {
      type: "text", mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          summary: {type:"string"},
          sections: {
            type:"object", properties:sectionProperties, required:[...SECTION_KEYS]
          }
        },
        required:["summary","sections"]
      }
    }
  };

  let lastError =
    null;


  for (
    const model
    of GEMINI_MODELS
  ) {

    for (
      let attempt = 1;
      attempt <=
        GEMINI_ATTEMPTS_PER_MODEL;
      attempt++
    ) {

      console.log(
        "Gemini model " +
        model +
        " attempt " +
        attempt +
        "/" +
        GEMINI_ATTEMPTS_PER_MODEL
      );


      let response;


      try {

        response =
          await fetch(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-goog-api-key":
                  API_KEY
              },

              body:
                JSON.stringify(
                  {
                    ...baseBody,
                    model
                  }
                ),

              signal:
                AbortSignal.timeout(
                  60000
                )
            }
          );

      } catch (
        error
      ) {

        lastError =
          error;


        console.warn(
          "Gemini request failed for " +
          model +
          ": " +
          error.message
        );


        if (
          attempt <
            GEMINI_ATTEMPTS_PER_MODEL
        ) {

          await sleep(
            1500 *
            attempt
          );
        }


        continue;
      }


      const raw =
        await response.text();


      if (
        response.ok
      ) {

        try {

          const data =
            JSON.parse(
              raw
            );


          const text =
            (
              data.steps
              ||
              []
            )
              .filter(
                (
                  step
                ) =>
                  step.type ===
                    "model_output"
              )
              .flatMap(
                (
                  step
                ) =>
                  step.content
                  ||
                  []
              )
              .filter(
                (
                  part
                ) =>
                  part.type ===
                    "text"
              )
              .map(
                (
                  part
                ) =>
                  part.text
                  ||
                  ""
              )
              .join(
                ""
              )
              .trim();


          if (
            !text
          ) {

            throw new Error(
              "Gemini returned no text."
            );
          }


          const parsed =
            JSON.parse(
              text
            );


          console.log(
            "Gemini description generated with " +
            model
          );


          return parsed;

        } catch (
          error
        ) {

          lastError =
            error;


          console.warn(
            "Gemini output parse failed for " +
            model +
            ": " +
            error.message
          );


          if (
            attempt <
              GEMINI_ATTEMPTS_PER_MODEL
          ) {

            await sleep(
              1000 *
              attempt
            );
          }


          continue;
        }
      }


      const apiError =
        new Error(
          "Gemini API error: " +
          response.status +
          " " +
          raw
        );


      lastError =
        apiError;


      if (
        response.status ===
          401
      ) {

        throw apiError;
      }


      const canRetrySameModel =
        [
          408,
          429,
          500,
          502,
          503,
          504
        ].includes(
          response.status
        )
        &&
        attempt <
          GEMINI_ATTEMPTS_PER_MODEL;


      if (
        canRetrySameModel
      ) {

        console.warn(
          "Gemini temporary error " +
          response.status +
          " on " +
          model +
          ". Retrying same model once..."
        );


        await sleep(
          1500 *
          Math.pow(
            2,
            attempt -
              1
          )
        );


        continue;
      }


      console.warn(
        "Gemini model " +
        model +
        " unavailable or exhausted (" +
        response.status +
        "). Falling back to the next free-tier model."
      );


      break;
    }
  }


  throw lastError
    ||
    new Error(
      "All configured Gemini free-tier models failed."
    );
}

// Upgrade an already-chosen character without changing today's glyph.
async function upgradeExistingEntry(entry, sourceTexts) {
  const research = researchCharacter(sourceTexts, entry);
  if (!research.accepted) return null;
  const description = await generateDescription(entry, research);
  const valid = validateEditorialDescription(description, research.evidence);
  if (!valid) return null;
  return {
    ...entry,
    info: {
      ...research.metadata,
      summary: valid.summary,
      descriptionSchema: 2,
      sections: valid.sections,
      facts: research.facts,
      sources: research.sources
    }
  };
}

async function generateAcceptedEntry(
  fonts,
  sourceTexts,
  date,
  avoidCodePoint =
    null
) {

  const MAX_RESEARCH_ATTEMPTS =
    500;


  for (
    let attempt = 1;
    attempt <=
      MAX_RESEARCH_ATTEMPTS;
    attempt++
  ) {

    // Re-pick the category as well as the code point upon rejection.
    const category = pickDailyCategory(fonts);
    const entry =
      generateEntry(
        fonts,
        date,
        avoidCodePoint,
        category
      );


    const research =
      researchCharacter(
        sourceTexts,
        entry
      );


    console.log(
      "Research attempt " +
      attempt +
      ": " +
      entry.character +
      " U+" +
      entry.codePoint +
      " -> " +
      (
        research.accepted
          ? "accepted"
          : "rejected"
      )
      +
      " [" +
      research.researchType +
      "; strong=" +
      research.diagnostics.strongFactCount +
      "; unihan=" +
      research.diagnostics.unihanFactCount +
      "; namesList=" +
      research.diagnostics.namesListFactCount +
      "]"
    );


    if (
      !research.accepted
    ) {
      continue;
    }


    const description =
      await generateDescription(
        entry,
        research
      );


    const valid = validateEditorialDescription(description, research.evidence);
    if (!valid) {
      console.warn("Description failed two-of-three quality gate for U+" + entry.codePoint);
      continue;
    }

    return {
      ...entry,

      info: {
        ...research.metadata,

        summary: valid.summary,
        descriptionSchema: 2,
        sections: valid.sections,
        facts: research.facts,

        sources:
          research.sources
      }
    };
  }


  throw new Error(
    "Could not find a sufficiently documented character within " +
    MAX_RESEARCH_ATTEMPTS +
    " attempts."
  );
}


async function main() {

  console.log(
    "Loading fonts..."
  );


  const fonts =
    loadFonts();


  console.log(
    "Loading Unicode official research data..."
  );


  const sourceTexts =
    await loadResearchSources();


  const currentDate =
    getJSTDateString(
      0
    );


  const nextDate =
    getJSTDateString(
      1
    );


  const existing =
    loadExistingDailyData();


  const hasDescription = entry => Boolean(
    entry && findRegisteredSource(parseInt(entry.codePoint,16))
    && hasApprovedDescription(entry.info)
  );

  let current;


  if (
    existing.current
    &&
    existing.current.date ===
      currentDate
    &&
    hasDescription(
      existing.current
    )
  ) {

    current =
      existing.current;


    console.log(
      "Keeping described current character."
    );

  } else if (
    existing.next
    &&
    existing.next.date ===
      currentDate
    &&
    hasDescription(
      existing.next
    )
  ) {

    current =
      existing.next;


    console.log(
      "Promoting described next character to current."
    );

  } else {
    // The description schema changed: keep today's existing character if
    // possible and regenerate ONLY the explanation from trusted evidence.
    const sameDay = [existing.current, existing.next].find(e =>
      e && e.date === currentDate && e.codePoint && findRegisteredSource(parseInt(e.codePoint, 16))
    );
    if (sameDay) {
      console.log("Upgrading existing current explanation while keeping glyph...");
      current = await upgradeExistingEntry(sameDay, sourceTexts);
    }
    if (!current) {
      console.log("Generating documented current character...");
      current = await generateAcceptedEntry(fonts, sourceTexts, currentDate);
    }
  }


  let next;


  if (
    existing.next
    &&
    existing.next.date ===
      nextDate
    &&
    hasDescription(
      existing.next
    )
    &&
    existing.next.codePoint !==
      current.codePoint
  ) {

    next =
      existing.next;


    console.log(
      "Keeping described next character."
    );

  } else {
    // Keep an already-selected next-day glyph whenever it has enough
    // 12-heading evidence; never shuffle tomorrow unnecessarily.
    const sameNext = existing.next
      && existing.next.date === nextDate
      && existing.next.codePoint !== current.codePoint
      && findRegisteredSource(parseInt(existing.next.codePoint, 16))
      ? existing.next : null;
    if (sameNext) {
      console.log("Upgrading tomorrow's existing glyph description...");
      next = await upgradeExistingEntry(sameNext, sourceTexts);
    }
    if (!next) {
      console.log("Generating documented next character...");
      next = await generateAcceptedEntry(
        fonts, sourceTexts, nextDate, parseInt(current.codePoint,16)
      );
    }
  }

  const data = {
    current,
    next
  };


  fs.writeFileSync(
    DAILY_JSON_PATH,
    JSON.stringify(
      data,
      null,
      2
    )
    +
    "\n",
    "utf8"
  );


  console.log(
    "Current: " +
    current.character +
    " U+" +
    current.codePoint +
    " [" +
    current.category +
    "]"
  );


  console.log(
    "Next: " +
    next.character +
    " U+" +
    next.codePoint +
    " [" +
    next.category +
    "]"
  );


  console.log(
    "daily.json updated with descriptions."
  );
}

main().catch(
  (
    error
  ) => {

    console.error(
      error
    );


    process.exit(
      1
    );
  }
);
