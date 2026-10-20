/* =========================================
   Secure random
========================================= */

function secureRandomInteger(
  max
) {

  const range =
    0x100000000;


  const limit =
    Math.floor(
      range /
      max
    )
    *
    max;


  const values =
    new Uint32Array(
      1
    );


  while (
    true
  ) {

    crypto.getRandomValues(
      values
    );


    if (
      values[0] <
      limit
    ) {

      return (
        values[0] %
        max
      );
    }
  }
}

/* =========================================
   Random filter
========================================= */

function isUsableRandomCharacter(
  codePoint
) {

  if (
    codePoint >=
      0xD800
    &&
    codePoint <=
      0xDFFF
  ) {
    return false;
  }


  /*
    Replacement Character は
    「不明な文字の代用品」なので
    ランダム生成の候補から除外する。
  */

  if (
    codePoint ===
      0xFFFD
  ) {
    return false;
  }


  const character =
    String.fromCodePoint(
      codePoint
    );


  if (
    isInvisibleCharacter(
      codePoint,
      character
    )
  ) {
    return false;
  }


  if (
    !/\p{Assigned}/u
      .test(
        character
      )
  ) {
    return false;
  }


  if (
    /\p{Cc}/u.test(
      character
    )
  ) {
    return false;
  }


  if (
    /\p{Cf}/u.test(
      character
    )
  ) {
    return false;
  }


  if (
    /\p{Co}/u.test(
      character
    )
  ) {
    return false;
  }


  if (
    /\p{M}/u.test(
      character
    )
  ) {
    return false;
  }


  if (
    /\p{Z}/u.test(
      character
    )
  ) {
    return false;
  }


  return true;
}


/*
 * Draw only from audited Unicode 18.0 codepoints that have an actual
 * on-site font cmap mapping. Never draw from bare Script ranges alone.
 * Eligibility remains separate from device-specific rendering success.
 */
let verifiedRandomPoolPromise = null;
function getVerifiedRandomPool() {
  if (!verifiedRandomPoolPromise) {
    verifiedRandomPoolPromise = (async () => {
      const index = await getUnicodeCoverageIndex();
      if (!index || !Array.isArray(index.ranges) ||
          !Array.isArray(index.script_ranges)) {
        throw new Error("Unicode対応範囲データを読み込めません");
      }
      // Exact intersection: installed cmap ∩ assigned Unicode 18.
      const pool = [];
      let j = 0, total = 0;
      for (const range of index.ranges) {
        while (j < index.script_ranges.length &&
               index.script_ranges[j][1] < range[0]) j++;
        for (let k = j; k < index.script_ranges.length &&
             index.script_ranges[k][0] <= range[1]; k++) {
          const assigned = index.script_ranges[k];
          const lo = Math.max(range[0], assigned[0]);
          const hi = Math.min(range[1], assigned[1]);
          if (lo > hi || assigned[2] === "Jurc") continue;
          const count = hi - lo + 1;
          total += count;
          pool.push([lo, hi, total]);
        }
      }
      if (!total) throw new Error("抽選できる文字がありません");
      return {pool, total};
    })().catch(error => {
      verifiedRandomPoolPromise = null;
      throw error;
    });
  }
  return verifiedRandomPoolPromise;
}
function sampleAuditedCodePoint(state) {
  const target = secureRandomInteger(state.total);
  let lo = 0, hi = state.pool.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (target < state.pool[mid][2]) hi = mid;
    else lo = mid + 1;
  }
  const group = state.pool[lo];
  const previous = lo ? state.pool[lo - 1][2] : 0;
  return group[0] + target - previous;
}
async function generateRandomCodePoint(poolState = null) {
  const state = poolState || await getVerifiedRandomPool();
  for (let attempts = 0; attempts < 100000; attempts++) {
    const codePoint = sampleAuditedCodePoint(state);
    if (isUsableRandomCharacter(codePoint)) return codePoint;
  }
  throw new Error("表示可能なランダム文字を選択できませんでした");
}

/* =========================================
   Random generation
========================================= */

async function generateRandomUnicode(
  count,
  compactSingle =
    false
) {

  const safeCount =
    Math.min(
      (typeof isSvgModeEnabled === "function" && isSvgModeEnabled() ? 100 : 500),
      Math.max(
        1,
        Math.trunc(
          Number(
            count
          )
          ||
          1
        )
      )
    );


  const poolState = await getVerifiedRandomPool();

  saveUnicodeHistory();

  const values =
    [];


  for (
    let index = 0;
    index < safeCount;
    index++
  ) {

    const codePoint =
      await generateRandomCodePoint(poolState);


    const code =
      codePoint
        .toString(
          16
        )
        .toUpperCase();


    values.push(
      compactSingle
      &&
      safeCount ===
        1
        ? code
        : "U+" +
          code
    );
  }


  unicodeInput.value =
    values.join(
      " "
    );


  convertUnicode();
}
