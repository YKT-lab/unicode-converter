const fs =
  require("fs");

const path =
  require("path");

const crypto =
  require("crypto");

const fontkit =
  require("@cantoo/fontkit");


/* =========================================
   Paths
========================================= */

const ROOT =
  path.resolve(
    __dirname,
    ".."
  );


const DAILY_JSON_PATH =
  path.join(
    ROOT,
    "daily.json"
  );


/* =========================================
   Daily用に使うローカルフォント
========================================= */

const FONT_FILES = [
  {
    name:
      "Tangut Extended",

    file:
      "tangut-extended.woff2"
  },

  {
    name:
      "Plangothic P1",

    file:
      "fonts/han/PlangothicP1-Regular.woff2"
  },

  {
    name:
      "Plangothic P2",

    file:
      "fonts/han/PlangothicP2-Regular.woff2"
  },

  {
    name:
      "Egyptology Extended",

    file:
      "fonts/hieroglyphs/EgyptologyExtended.woff2"
  },

  {
    name:
      "UniHieroglyphica",

    file:
      "fonts/hieroglyphs/UniHieroglyphica.ttf"
  },

  {
    name:
      "BabelStone Pseudographica",

    file:
      "fonts/symbols/BabelStonePseudographica.woff2"
  },

  {
    name:
      "Noto Sans Symbols 2",

    file:
      "fonts/symbols/NotoSansSymbols2-Regular.ttf"
  },

  {
    name:
      "Noto Sans Phonetics",

    file:
      "fonts/phonetics/NotoSans-Regular.ttf"
  },

  {
    name:
      "Noto Sans JP",

    directory:
      "node_modules/@fontsource/noto-sans-jp/files",

    fileSuffix:
      "-400-normal.woff2"
  },

  {
    name:
      "Noto Music",

    file:
      "fonts/music/NotoMusic-Regular.ttf"
  }
];


/* =========================================
   JST date
========================================= */

function getJSTDateString(
  dayOffset = 0
) {

  const JST_OFFSET =
    9 *
    60 *
    60 *
    1000;


  const DAY =
    24 *
    60 *
    60 *
    1000;


  const date =
    new Date(
      Date.now()
      +
      JST_OFFSET
      +
      dayOffset *
      DAY
    );


  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


/* =========================================
   Random
========================================= */

function randomIndex(
  length
) {

  return crypto.randomInt(
    length
  );
}


/* =========================================
   Character filter
========================================= */

const knownInvisible =
  new Set([
    0x115F,
    0x1160,
    0x2800,
    0x3164,
    0xFFA0,
    0xFFFD
  ]);


/*
 * Node.js Unicode regex tables may be older than Unicode 18.0.
 * Use the repository's pinned official UCD for all assigned-codepoint
 * decisions, especially newly encoded Seal/Jurchen/Proto-Cuneiform.
 */
let dailyUnicode18Ranges = null;
function getDailyUnicode18Record(codePoint) {
  if (!dailyUnicode18Ranges) {
    const file=path.join(ROOT,"data/unicode18_all_ranges.json");
    dailyUnicode18Ranges=JSON.parse(fs.readFileSync(file,"utf8")).ranges;
  }
  let low=0,high=dailyUnicode18Ranges.length-1;
  while(low<=high){
    const mid=(low+high)>>>1,r=dailyUnicode18Ranges[mid];
    const start=parseInt(r.start,16),end=parseInt(r.end,16);
    if(codePoint<start)high=mid-1;
    else if(codePoint>end)low=mid+1;
    else return r;
  }
  return null;
}
function isGoodDailyCharacter(codePoint) {
  if(!Number.isInteger(codePoint)||codePoint<0||codePoint>0x10FFFF ||
    (codePoint>=0xD800&&codePoint<=0xDFFF) ||
    knownInvisible.has(codePoint))return false;
  const record=getDailyUnicode18Record(codePoint);
  if(!record)return false;
  const cat=record.category;
  if(cat==="Cn"||cat==="Co"||cat==="Cs"||cat==="Cc"||cat==="Cf"||
     cat==="Zl"||cat==="Zp"||cat==="Zs"||cat.startsWith("M"))return false;
  try{
    if(/\p{Default_Ignorable_Code_Point}/u.test(String.fromCodePoint(codePoint)))return false;
  }catch(error){ /* Unicode 18 General_Category checks remain authoritative. */ }
  return true;
}

/* =========================================
   Daily categories
========================================= */

const DAILY_CATEGORY_CONFIG = {
  han: {
    weight:
      0.90
  },

  kana: {
    weight:
      0.70
  },

  number: {
    weight:
      0.75
  },

  punctuation: {
    weight:
      0.75
  },

  symbol: {
    weight:
      0.90
  },

  math: {
    weight:
      1.10
  },

  emoji: {
    weight:
      0.90
  },

  arrows: {
    weight:
      1.10
  },

  legacy: {
    weight:
      1.30
  },

  music: {
    weight:
      1.20
  },

  phonetics: {
    weight:
      1.10
  },

  ancient: {
    weight:
      1.35
  }
};


const DAILY_CATEGORIES =
  Object.keys(
    DAILY_CATEGORY_CONFIG
  );


const MAX_RARITY_WEIGHT =
  1.40;


function isInRange(
  codePoint,
  start,
  end
) {

  return (
    codePoint >=
      start
    &&
    codePoint <=
      end
  );
}


function isPhoneticsCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x0250,
      0x02FF
    )
    ||
    isInRange(
      codePoint,
      0x0300,
      0x036F
    )
    ||
    isInRange(
      codePoint,
      0x1D00,
      0x1DBF
    )
    ||
    isInRange(
      codePoint,
      0x1DC0,
      0x1DFF
    )
    ||
    isInRange(
      codePoint,
      0x1E00,
      0x1EFF
    )
    ||
    isInRange(
      codePoint,
      0xA700,
      0xA7FF
    )
    ||
    isInRange(
      codePoint,
      0xAB30,
      0xAB6F
    )
    ||
    isInRange(
      codePoint,
      0x10780,
      0x107BF
    )
    ||
    isInRange(
      codePoint,
      0x1DF00,
      0x1DFFF
    )
  );
}


function isKanaCodePoint(
  codePoint
) {

  const inKanaRange =
    (
      isInRange(
        codePoint,
        0x3040,
        0x30FF
      )
      ||
      isInRange(
        codePoint,
        0x31F0,
        0x31FF
      )
      ||
      isInRange(
        codePoint,
        0x1AFF0,
        0x1AFFF
      )
      ||
      isInRange(
        codePoint,
        0x1B000,
        0x1B16F
      )
    );


  if (
    !inKanaRange
  ) {
    return false;
  }


  const character =
    String.fromCodePoint(
      codePoint
    );


  return (
    /\p{Script=Hiragana}/u.test(
      character
    )
    ||
    /\p{Script=Katakana}/u.test(
      character
    )
  );
}


function isCommonHanCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x3400,
      0x4DBF
    )
    ||
    isInRange(
      codePoint,
      0x4E00,
      0x9FFF
    )
  );
}


function isHanCodePoint(
  codePoint
) {

  return (
    isCommonHanCodePoint(
      codePoint
    )
    ||
    isInRange(
      codePoint,
      0xF900,
      0xFAFF
    )
    ||
    isInRange(
      codePoint,
      0x20000,
      0x2EE5F
    )
    ||
    isInRange(
      codePoint,
      0x2F800,
      0x2FA1F
    )
    ||
    isInRange(
      codePoint,
      0x30000,
      0x3347F
    )
  );
}


function isJapaneseDisplayCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x3000,
      0x30FF
    )
    ||
    isInRange(
      codePoint,
      0x31F0,
      0x31FF
    )
    ||
    isCommonHanCodePoint(
      codePoint
    )
    ||
    isInRange(
      codePoint,
      0x1AFF0,
      0x1AFFF
    )
    ||
    isInRange(
      codePoint,
      0x1B000,
      0x1B16F
    )
  );
}


function isMusicCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x1D000,
      0x1D24F
    )
    ||
    isInRange(
      codePoint,
      0x2669,
      0x266F
    )
  );
}


function isAncientCodePoint(
  codePoint
) {

  return isInRange(
    codePoint,
    0x13000,
    0x143FF
  );
}


function isLegacyCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x1CC00,
      0x1CEBF
    )
    ||
    isInRange(
      codePoint,
      0x1FB00,
      0x1FBFF
    )
  );
}


function isArrowCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x2190,
      0x21FF
    )
    ||
    isInRange(
      codePoint,
      0x27F0,
      0x27FF
    )
    ||
    isInRange(
      codePoint,
      0x2900,
      0x297F
    )
    ||
    isInRange(
      codePoint,
      0x1F800,
      0x1F8FF
    )
  );
}


function isMathCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x2200,
      0x22FF
    )
    ||
    isInRange(
      codePoint,
      0x27C0,
      0x27EF
    )
    ||
    isInRange(
      codePoint,
      0x2980,
      0x29FF
    )
    ||
    isInRange(
      codePoint,
      0x2A00,
      0x2AFF
    )
    ||
    isInRange(
      codePoint,
      0x1EE00,
      0x1EEFF
    )
  );
}


function isEmojiCodePoint(
  codePoint
) {

  return (
    isInRange(
      codePoint,
      0x2600,
      0x26FF
    )
    ||
    isInRange(
      codePoint,
      0x2700,
      0x27BF
    )
    ||
    isInRange(
      codePoint,
      0x1F300,
      0x1F6FF
    )
    ||
    isInRange(
      codePoint,
      0x1F900,
      0x1FAFF
    )
  );
}


function getDailyCategory(
  codePoint
) {

  if (
    isMusicCodePoint(
      codePoint
    )
  ) {
    return "music";
  }


  if (
    isPhoneticsCodePoint(
      codePoint
    )
  ) {
    return "phonetics";
  }


  if (
    isKanaCodePoint(
      codePoint
    )
  ) {
    return "kana";
  }


  if (
    isHanCodePoint(
      codePoint
    )
  ) {
    return "han";
  }


  if (
    isAncientCodePoint(
      codePoint
    )
  ) {
    return "ancient";
  }


  if (
    isLegacyCodePoint(
      codePoint
    )
  ) {
    return "legacy";
  }


  if (
    isArrowCodePoint(
      codePoint
    )
  ) {
    return "arrows";
  }


  if (
    isMathCodePoint(
      codePoint
    )
  ) {
    return "math";
  }


  if (
    isEmojiCodePoint(
      codePoint
    )
  ) {
    return "emoji";
  }


  const character =
    String.fromCodePoint(
      codePoint
    );


  if (
    /\p{N}/u.test(
      character
    )
  ) {
    return "number";
  }


  if (
    /\p{P}/u.test(
      character
    )
  ) {
    return "punctuation";
  }


  if (
    /\p{S}/u.test(
      character
    )
  ) {
    return "symbol";
  }


  return null;
}


function getRarityWeight(
  category,
  codePoint
) {

  let weight =
    codePoint <=
      0x007F
      ? 0.35
      : codePoint <=
          0x00FF
        ? 0.55
        : codePoint <=
            0xFFFF
          ? 0.90
          : 1.15;


  if (
    category ===
      "han"
  ) {

    if (
      isInRange(
        codePoint,
        0x4E00,
        0x9FFF
      )
    ) {
      weight =
        0.75;

    } else if (
      isInRange(
        codePoint,
        0x3400,
        0x4DBF
      )
    ) {
      weight =
        1.05;

    } else if (
      codePoint >=
        0x20000
    ) {
      weight =
        1.35;
    }

  } else if (
    category ===
      "kana"
  ) {

    if (
      isInRange(
        codePoint,
        0x3040,
        0x30FF
      )
    ) {
      weight =
        0.75;

    } else if (
      isInRange(
        codePoint,
        0x31F0,
        0x31FF
      )
    ) {
      weight =
        1.10;

    } else {
      weight =
        1.35;
    }

  } else if (
    category ===
      "number"
  ) {

    if (
      isInRange(
        codePoint,
        0x0030,
        0x0039
      )
    ) {
      weight =
        0.30;

    } else if (
      isInRange(
        codePoint,
        0xFF10,
        0xFF19
      )
    ) {
      weight =
        0.55;

    } else if (
      codePoint >
        0xFFFF
    ) {
      weight =
        1.30;
    }

  } else if (
    category ===
      "punctuation"
  ) {

    if (
      codePoint <=
        0x007F
    ) {
      weight =
        0.35;

    } else if (
      codePoint >
        0xFFFF
    ) {
      weight =
        1.30;
    }

  } else if (
    category ===
      "music"
  ) {

    weight =
      isInRange(
        codePoint,
        0x2669,
        0x266F
      )
        ? 0.75
        : 1.20;

  } else if (
    category ===
      "phonetics"
  ) {

    if (
      isInRange(
        codePoint,
        0x0250,
        0x02FF
      )
    ) {
      weight =
        0.80;

    } else if (
      codePoint >
        0xFFFF
    ) {
      weight =
        1.35;

    } else {
      weight =
        1.10;
    }

  } else if (
    category ===
      "math"
  ) {

    weight =
      isInRange(
        codePoint,
        0x2200,
        0x22FF
      )
        ? 0.80
        : 1.15;

  } else if (
    category ===
      "arrows"
  ) {

    weight =
      isInRange(
        codePoint,
        0x2190,
        0x21FF
      )
        ? 0.80
        : 1.25;

  } else if (
    category ===
      "legacy"
  ) {

    weight =
      isInRange(
        codePoint,
        0x1CC00,
        0x1CEBF
      )
        ? 1.35
        : 1.20;

  } else if (
    category ===
      "ancient"
  ) {

    weight =
      isInRange(
        codePoint,
        0x13460,
        0x143FF
      )
        ? 1.35
        : 1.20;

  } else if (
    category ===
      "emoji"
  ) {

    weight =
      codePoint >
        0xFFFF
        ? 1.05
        : 0.85;

  } else if (
    category ===
      "symbol"
    &&
    codePoint >
      0xFFFF
  ) {

    weight =
      1.25;
  }


  return Math.max(
    0.10,
    Math.min(
      MAX_RARITY_WEIGHT,
      weight
    )
  );
}


function randomUnit() {

  return crypto.randomInt(
    1000000
  ) /
  1000000;
}


function weightedChoice(
  entries
) {

  const scale =
    1000;


  const weighted =
    entries.map(
      (
        entry
      ) => ({
        ...entry,

        integerWeight:
          Math.max(
            1,
            Math.round(
              entry.weight *
              scale
            )
          )
      })
    );


  const total =
    weighted.reduce(
      (
        sum,
        entry
      ) =>
        sum +
        entry.integerWeight,
      0
    );


  let cursor =
    crypto.randomInt(
      total
    );


  for (
    const entry
    of weighted
  ) {

    if (
      cursor <
        entry.integerWeight
    ) {

      return entry.value;
    }


    cursor -=
      entry.integerWeight;
  }


  return weighted[
    weighted.length -
      1
  ].value;
}


const categoryPoolCache =
  new WeakMap();


const {findRegisteredSource} = require("./source-registry.js");

function getCategoryPools(
  fonts
) {

  const cached =
    categoryPoolCache.get(
      fonts
    );


  if (
    cached
  ) {
    return cached;
  }


  const sets =
    Object.fromEntries(
      DAILY_CATEGORIES.map(
        (
          category
        ) => [
          category,
          new Set()
        ]
      )
    );


  for (
    const fontRecord
    of fonts
  ) {

    for (
      const codePoint
      of fontRecord.candidates
    ) {

      // A documented Unicode range is required for daily draws.
      if (!findRegisteredSource(codePoint)) continue;

      const category =
        getDailyCategory(
          codePoint
        );


      if (
        category
        &&
        sets[
          category
        ]
      ) {

        sets[
          category
        ].add(
          codePoint
        );
      }
    }
  }


  const pools =
    Object.fromEntries(
      DAILY_CATEGORIES.map(
        (
          category
        ) => [
          category,
          Array.from(
            sets[
              category
            ]
          )
        ]
      )
    );


  categoryPoolCache.set(
    fonts,
    pools
  );


  return pools;
}


function pickDailyCategory(
  fonts =
    null
) {

  if (
    !fonts
  ) {

    return weightedChoice(
      DAILY_CATEGORIES.map(
        (
          category
        ) => ({
          value:
            category,

          weight:
            DAILY_CATEGORY_CONFIG[
              category
            ].weight
        })
      )
    );
  }


  const pools =
    getCategoryPools(
      fonts
    );


  const available =
    DAILY_CATEGORIES
      .filter(
        (
          category
        ) =>
          pools[
            category
          ]
          &&
          pools[
            category
          ].length >
            0
      )
      .map(
        (
          category
        ) => ({
          value:
            category,

          weight:
            DAILY_CATEGORY_CONFIG[
              category
            ].weight
        })
      );


  if (
    available.length ===
      0
  ) {

    throw new Error(
      "No daily categories have drawable candidates."
    );
  }


  return weightedChoice(
    available
  );
}


/* =========================================
   Load fonts
========================================= */

function loadFonts() {

  const fonts =
    [];


  const fontItems =
    [];


  for (
    const item
    of FONT_FILES
  ) {

    if (
      item.directory
    ) {

      const absoluteDirectory =
        path.join(
          ROOT,
          item.directory
        );


      if (
        !fs.existsSync(
          absoluteDirectory
        )
      ) {

        console.warn(
          `Font directory not found: ${item.directory}`
        );


        continue;
      }


      const fileNames =
        fs.readdirSync(
          absoluteDirectory
        )
        .filter(
          (
            fileName
          ) =>
            !item.fileSuffix
            ||
            fileName.endsWith(
              item.fileSuffix
            )
        );


      for (
        const fileName
        of fileNames
      ) {

        fontItems.push(
          {
            name:
              item.name,

            file:
              path.join(
                item.directory,
                fileName
              )
          }
        );
      }


      continue;
    }


    fontItems.push(
      item
    );
  }


  /*
   * Keep the historic FONT_FILES entries first (and their names unchanged).
   * Pick up any newly uploaded font in fonts/** automatically.
   * The Unicode 18 cmap audit uses exactly the same folder.
   */
  const knownFiles = new Set(fontItems.map(item =>
    item.file.split(path.sep).join("/")
  ));
  const scannedFamilies = new Map();
  try {
    const index = JSON.parse(fs.readFileSync(
      path.join(ROOT,"data/unicode18_font_coverage_index.json"),"utf8"
    ));
    for (const entry of index.font_families || []) {
      scannedFamilies.set(entry.file,entry.family);
    }
  } catch(error) {
    console.warn("Audited font index unavailable; scanning the font files anyway.");
  }
  function scanFontFolder(folder) {
    if(!fs.existsSync(folder))return;
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const full=path.join(folder,entry.name);
      if(entry.isDirectory())scanFontFolder(full);
      else if(entry.isFile() && /\.(?:ttf|otf|woff2?)$/i.test(entry.name)) {
        const file=path.relative(ROOT,full).split(path.sep).join("/");
        if(knownFiles.has(file))continue;
        knownFiles.add(file);
        const fallback=entry.name.replace(/\.(?:ttf|otf|woff2?)$/i,"")
          .replace(/-Regular$/i,"").replace(/([a-z])([A-Z])/g,"$1 $2");
        fontItems.push({name:scannedFamilies.get(file)||fallback,file});
      }
    }
  }
  scanFontFolder(path.join(ROOT,"fonts"));

  for (
    const item
    of fontItems
  ) {

    const absolutePath =
      path.join(
        ROOT,
        item.file
      );


    if (
      !fs.existsSync(
        absolutePath
      )
    ) {

      console.warn(
        `Font not found: ${item.file}`
      );


      continue;
    }


    try {

      const font =
        fontkit.openSync(
          absolutePath
        );


      const candidates =
        font.characterSet
          .filter(
            isGoodDailyCharacter
          );


      if (
        candidates.length ===
          0
      ) {

        continue;
      }


      let notdefPath =
        "";


      try {

        const notdef =
          font.getGlyph(
            0
          );


        if (
          notdef
          &&
          notdef.path
        ) {

          notdefPath =
            notdef.path.toSVG();
        }

      } catch (
        error
      ) {

        /*
          .notdefが取得できなくても
          glyph.id === 0 で判定できる
        */
      }


      fonts.push(
        {
          name:
            item.name,

          file:
            item.file,

          font,

          candidates,

          notdefPath
        }
      );

    } catch (
      error
    ) {

      console.error(
        `Failed to load ${item.file}`,
        error
      );
    }
  }


  if (
    fonts.length ===
      0
  ) {

    throw new Error(
      "No usable fonts found."
    );
  }


  const counts =
    new Map();


  for (
    const fontRecord
    of fonts
  ) {

    counts.set(
      fontRecord.name,
      (
        counts.get(
          fontRecord.name
        )
        ||
        0
      )
      +
      fontRecord.candidates.length
    );
  }


  for (
    const [
      name,
      count
    ]
    of counts
  ) {

    console.log(
      `${name}: ${count} candidates`
    );
  }


  return fonts;
}

/* =========================================
   Glyph → SVG data
========================================= */

function makeSvgGlyph(
  fontRecord,
  codePoint
) {

  const {
    font,
    notdefPath
  } =
    fontRecord;


  /*
    cmapに存在するか
  */

  if (
    !font.hasGlyphForCodePoint(
      codePoint
    )
  ) {

    return null;
  }


  let glyph;


  try {

    glyph =
      font.glyphForCodePoint(
        codePoint
      );

  } catch (
    error
  ) {

    return null;
  }


  /*
    glyph 0 は通常 .notdef
  */

  if (
    !glyph
    ||
    glyph.id ===
      0
    ||
    !glyph.path
  ) {

    return null;
  }


  let svgPath;


  try {

    svgPath =
      glyph.path.toSVG();

  } catch (
    error
  ) {

    return null;
  }


  /*
    輪郭が無いなら不採用
  */

  if (
    !svgPath
    ||
    svgPath.trim() ===
      ""
  ) {

    return null;
  }


  /*
    万一 .notdef と同じ輪郭なら不採用
  */

  if (
    notdefPath
    &&
    svgPath ===
      notdefPath
  ) {

    return null;
  }


  let bbox;


  try {

    bbox =
      glyph.path.bbox;

  } catch (
    error
  ) {

    return null;
  }


  if (
    !bbox
  ) {
    return null;
  }


  const width =
    bbox.maxX -
    bbox.minX;


  const height =
    bbox.maxY -
    bbox.minY;


  /*
    形が無い・点しかないものは除外
  */

  if (
    !Number.isFinite(
      width
    )
    ||
    !Number.isFinite(
      height
    )
    ||
    width <=
      0
    ||
    height <=
      0
  ) {

    return null;
  }


  /*
    字面の周囲に8%ほど余白
  */

  const padding =
    Math.max(
      width,
      height
    )
    *
    0.08;


  /*
    フォント座標はYが上向き。

    SVGはYが下向きなので、
    scale(1 -1) して表示する。

    反転後のY範囲は
    -maxY ～ -minY
  */

  const viewBoxX =
    bbox.minX -
    padding;


  const viewBoxY =
    -bbox.maxY -
    padding;


  const viewBoxWidth =
    width +
    padding *
    2;


  const viewBoxHeight =
    height +
    padding *
    2;


  return {
    path:
      svgPath,

    viewBox:
      [
        viewBoxX,
        viewBoxY,
        viewBoxWidth,
        viewBoxHeight
      ].join(
        " "
      )
  };
}


/* =========================================
   Unicode → 文字 と同じフォント優先順位
========================================= */

function inCodePointRange(
  codePoint,
  start,
  end
) {

  return (
    codePoint >=
      start
    &&
    codePoint <=
      end
  );
}


function getDisplayFontPriority(
  codePoint
) {

  /*
    js/fonts.js の getWebFontNames() と
    同じ優先順位にする。

    ここで先頭に来るフォントが、
    Unicode → 文字 で最初に試される
    フォントと一致する。
  */

  if (
    isMusicCodePoint(
      codePoint
    )
  ) {

    return [
      "Noto Music"
    ];
  }


  if (
    isPhoneticsCodePoint(
      codePoint
    )
  ) {

    return [
      "Noto Sans Phonetics"
    ];
  }


  if (
    isJapaneseDisplayCodePoint(
      codePoint
    )
  ) {

    return [
      "Noto Sans JP"
    ];
  }


  if (
    inCodePointRange(
      codePoint,
      0x13000,
      0x143FF
    )
  ) {

    return [
      "UniHieroglyphica",
      "Egyptology Extended",
      "Noto Sans Egyptian Hieroglyphs"
    ];
  }


  if (
    inCodePointRange(
      codePoint,
      0x187F8,
      0x187FF
    )
    ||
    inCodePointRange(
      codePoint,
      0x18D09,
      0x18D1E
    )
    ||
    inCodePointRange(
      codePoint,
      0x18D80,
      0x18DFF
    )
  ) {

    return [
      "Tangut Extended",
      "Noto Serif Tangut"
    ];
  }


  if (
    inCodePointRange(
      codePoint,
      0x1CC00,
      0x1CEBF
    )
  ) {

    return [
      "BabelStone Pseudographica",
      "Noto Sans Symbols 2 Local",
      "Noto Sans Symbols 2"
    ];
  }


  if (
    inCodePointRange(
      codePoint,
      0x101D0,
      0x101FF
    )
    ||
    inCodePointRange(
      codePoint,
      0x10E60,
      0x10E7F
    )
    ||
    inCodePointRange(
      codePoint,
      0x1D2C0,
      0x1D2DF
    )
    ||
    inCodePointRange(
      codePoint,
      0x1F500,
      0x1F5FF
    )
    ||
    inCodePointRange(
      codePoint,
      0x1F650,
      0x1F67F
    )
    ||
    inCodePointRange(
      codePoint,
      0x1F780,
      0x1F7FF
    )
    ||
    inCodePointRange(
      codePoint,
      0x1F800,
      0x1F8FF
    )
    ||
    inCodePointRange(
      codePoint,
      0x1FB00,
      0x1FBFF
    )
  ) {

    return [
      "Noto Sans Symbols 2 Local",
      "Noto Sans Symbols 2"
    ];
  }


  if (
    inCodePointRange(
      codePoint,
      0xF900,
      0xFAFF
    )
    ||
    inCodePointRange(
      codePoint,
      0x20000,
      0x2EE5F
    )
    ||
    inCodePointRange(
      codePoint,
      0x2F800,
      0x2FA1F
    )
    ||
    inCodePointRange(
      codePoint,
      0x30000,
      0x3347F
    )
  ) {

    return [
      "Plangothic P1",
      "Plangothic P2",
      "BabelStone Han"
    ];
  }


  const character =
    String.fromCodePoint(
      codePoint
    );


  if (
    /\p{N}/u.test(
      character
    )
  ) {

    return [
      "Noto Sans Phonetics",
      "Noto Sans JP",
      "Noto Sans Symbols 2"
    ];
  }


  if (
    /(?:\p{S}|\p{P})/u.test(
      character
    )
  ) {

    return [
      "Noto Sans Symbols 2",
      "Noto Sans JP",
      "Noto Sans Phonetics"
    ];
  }


  return [];
}


function getLocalFontRecordsByDisplayName(
  fonts,
  displayName
) {

  const aliases = {
    "Noto Sans Symbols 2 Local":
      "Noto Sans Symbols 2"
  };


  const recordName =
    aliases[
      displayName
    ]
    ||
    displayName;


  return fonts.filter(
    (
      item
    ) =>
      item.name ===
        recordName
  );
}

/*
 * Resolve daily SVG from exactly the same audited font order used by the
 * web converter. Keep legacy priorities first to preserve earlier styling.
 * Only fonts with a genuine outline survive makeSvgGlyph().
 */
let dailyCoverageIndex = null;
let dailyCoverageRead = false;
function getDailyCoverageIndex() {
  if (dailyCoverageRead) return dailyCoverageIndex;
  dailyCoverageRead = true;
  try {
    const raw = JSON.parse(fs.readFileSync(
      path.join(ROOT,"data/unicode18_font_coverage_index.json"),"utf8"
    ));
    if(raw.schema_version===2&&Array.isArray(raw.ranges)&&
       Array.isArray(raw.combinations))dailyCoverageIndex=raw;
  } catch(error) { /* old release: use original priorities */ }
  return dailyCoverageIndex;
}
function findDailyFontRange(ranges, cp) {
  let lo=0,hi=ranges.length-1;
  while(lo<=hi){
    const mid=(lo+hi)>>>1, r=ranges[mid];
    if(cp<r[0])hi=mid-1;
    else if(cp>r[1])lo=mid+1;
    else return r;
  }
  return null;
}
function resolveDisplaySvg(fonts,codePoint){
  const tried = new Set();
  const attempts = [];
  const add=(record)=>{
    if(record&&!tried.has(record.file)){
      tried.add(record.file);
      attempts.push(record);
    }
  };
  for(const family of getDisplayFontPriority(codePoint))
    for(const record of getLocalFontRecordsByDisplayName(fonts,family))add(record);
  const index=getDailyCoverageIndex();
  if(index){
    const rg=findDailyFontRange(index.ranges,codePoint);
    for(const id of rg ? index.combinations[rg[2]]||[] : []){
      const found=index.font_families[id];
      if(found)for(const record of fonts)if(record.file===found.file)add(record);
    }
  }
  // Fallback also covers newly uploaded files before their first audit run.
  for(const record of fonts)
    if(record.font.hasGlyphForCodePoint(codePoint))add(record);
  for(const record of attempts){
    const svg=makeSvgGlyph(record,codePoint);
    if(svg)return {fontRecord:record,svg};
  }
  return null;
}

/* =========================================
   Generate one entry
========================================= */

function generateEntry(
  fonts,
  date,
  avoidCodePoint = null,
  preferredCategory = null
) {

  const category =
    preferredCategory
    ||
    pickDailyCategory(
      fonts
    );


  const pools =
    getCategoryPools(
      fonts
    );


  const candidates =
    pools[
      category
    ]
    ||
    [];


  if (
    candidates.length ===
      0
  ) {

    throw new Error(
      "No drawable candidates for daily category: " +
      category
    );
  }


  /*
    第1段階:
      カテゴリをカテゴリweightで抽選する。

    第2段階:
      そのカテゴリ内ではコードポイントを
      一度均等に候補化したうえで、
      rarity weightによる拒否サンプリングを行う。

    これにより、よく見る文字を完全には消さず、
    拡張面・珍しいブロックを少し出やすくする。
  */

  for (
    let attempt = 0;
    attempt < 10000;
    attempt++
  ) {

    const codePoint =
      candidates[
        randomIndex(
          candidates.length
        )
      ];


    if (
      codePoint ===
      avoidCodePoint
    ) {
      continue;
    }


    const rarityWeight =
      getRarityWeight(
        category,
        codePoint
      );


    if (
      randomUnit() >
        rarityWeight /
        MAX_RARITY_WEIGHT
    ) {
      continue;
    }


    const resolved =
      resolveDisplaySvg(
        fonts,
        codePoint
      );


    if (
      !resolved
    ) {
      continue;
    }


    const {
      fontRecord:
        displayFontRecord,
      svg
    } =
      resolved;


    const character =
      String.fromCodePoint(
        codePoint
      );


    const hex =
      codePoint
        .toString(
          16
        )
        .toUpperCase();


    return {
      date,

      category,

      codePoint:
        hex,

      character,

      font:
        displayFontRecord.name,

      svg
    };
  }


  throw new Error(
    "Could not generate a drawable daily character for category: " +
    category
  );
}


/* =========================================
   Existing daily data
========================================= */

function loadExistingDailyData() {

  try {

    return JSON.parse(
      fs.readFileSync(
        DAILY_JSON_PATH,
        "utf8"
      )
    );

  } catch (
    error
  ) {

    return {};
  }
}


/* =========================================
   Main
========================================= */

function main() {

  const forceRegenerateCurrent =
    process.env.FORCE_REGENERATE_CURRENT ===
      "true";


  const fonts =
    loadFonts();


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


  let current;


  if (
    forceRegenerateCurrent
  ) {

    console.log(
      "Manual test mode: regenerating current character."
    );


    current =
      generateEntry(
        fonts,
        currentDate
      );

  } else if (
    existing.current
    &&
    existing.current.date ===
      currentDate
  ) {

    current =
      existing.current;

  } else if (
    existing.next
    &&
    existing.next.date ===
      currentDate
  ) {

    current =
      existing.next;

  } else {

    current =
      generateEntry(
        fonts,
        currentDate
      );
  }


  const next =
    generateEntry(
      fonts,
      nextDate,
      parseInt(
        current.codePoint,
        16
      )
    );


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
    `Current: ${current.character} U+${current.codePoint} (${current.font})`
  );


  console.log(
    `Next: ${next.character} U+${next.codePoint} (${next.font})`
  );


  console.log(
    "daily.json updated."
  );
}



if (
  require.main === module
) {
  main();
}


module.exports = {
  DAILY_JSON_PATH,
  getJSTDateString,
  loadFonts,
  generateEntry,
  pickDailyCategory,
  getDailyCategory,
  loadExistingDailyData
};
