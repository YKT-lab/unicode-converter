/* =========================================
   Status label
========================================= */

function makeStatusSpan(
  text
) {

  const span =
    document.createElement(
      "span"
    );


  span.className =
    "character-status";


  span.textContent =
    text;


  return span;
}

/*
 * Status reasons derive from the Unicode 18 allocation and audited cmap,
 * not browser-only Unicode property data (which may be a different version).
 */
function withDisplayTimeout(task, milliseconds = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("Character display timed out");
      error.code = "timeout";
      reject(error);
    }, milliseconds);
    Promise.resolve(task).then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function unicodeNonGlyphReason(codePoint, index) {
  if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F))
    return {code:"control", message:"制御文字"};
  if (codePoint >= 0xD800 && codePoint <= 0xDFFF)
    return {code:"invalid", message:"無効なサロゲート"};
  if ((codePoint >= 0xE000 && codePoint <= 0xF8FF) ||
      (codePoint >= 0xF0000 && codePoint <= 0xFFFFD) ||
      (codePoint >= 0x100000 && codePoint <= 0x10FFFD))
    return {code:"private-use", message:"私用領域（標準の字形は未定義）"};
  if (index && !unicodeRangeLookup(index.script_ranges, codePoint))
    return {code:"unassigned", message:"Unicode 18.0で未割当"};
  const character = String.fromCodePoint(codePoint);
  if (/\p{Separator}/u.test(character))
    return {code:"space", message:"スペース・区切り文字（不可視）"};
  if (codePoint === 0x00AD)
    return {code:"invisible", message:"Soft Hyphen（通常は不可視）"};
  try {
    if (typeof isInvisibleCharacter === "function" && isInvisibleCharacter(codePoint, character))
      return {code:"invisible", message:"不可視文字"};
  } catch (error) {
    // Optional browser heuristics must not break even the error display path.
    console.warn("Invisible character detection unavailable:", error);
  }
  return null;
}

function unicodeFailureDetails(codePoint, context = {}) {
  const index = context.index || null;
  let reason = unicodeNonGlyphReason(codePoint, index);
  if (!reason) {
    const mapped = index && unicodeRangeLookup(index.script_ranges, codePoint);
    const covered = index && unicodeRangeLookup(index.ranges, codePoint);
    if (mapped?.[2] === "Gara" && !covered)
      reason = {code:"garay-unsupported", message:"Garay文字：現在利用可能なWebフォント未対応"};
    else if (mapped?.[2] === "Jurc" && !covered)
      reason = {code:"jurchen-unsupported", message:"Jurchen文字：現在利用可能なWebフォント未対応"};
    else if (!index)
      reason = {code:"coverage-unavailable", message:"Unicode対応データを取得できず、表示を確認できません"};
    else if (context.fontFailure?.code === "timeout")
      reason = {code:"font-timeout", message:"フォント読み込みが時間内に完了せず、通常表示も確認できません"};
    else if (!covered)
      reason = {code:"font-unsupported", message:"サイトのWebフォント未対応・この端末でも表示を確認できません"};
    else
      reason = {code:"display-error", message:"対応フォントがありますが、この端末または通信環境で表示を確認できません"};
  }
  let text = reason.message + ": U+" + codePoint.toString(16).toUpperCase().padStart(4, "0");
  if (context.svgFailure) text += "（" + context.svgFailure.reason + "）";
  return {...reason, text};
}

function attachSvgFailure(node, failure) {
  if (!failure) return;
  node.dataset.svgError = failure.code || failure.error?.code || "processing";
  if (failure.stage || failure.error?.stage)
    node.dataset.svgStage = failure.stage || failure.error.stage;
  if (failure.url || failure.error?.url)
    node.dataset.svgUrl = failure.url || failure.error.url;
  if (failure.phase || failure.error?.phase)
    node.dataset.svgPhase = failure.phase || failure.error.phase;
}

function makeUnicodeFailureSpan(codePoint, context) {
  const details = unicodeFailureDetails(codePoint, context);
  const span = makeStatusSpan(details.text);
  span.dataset.reason = details.code;
  attachSvgFailure(span, context.svgFailure);
  if (context.fontFailure) span.dataset.fontError = context.fontFailure.code || "processing";
  return span;
}

async function explainUnicodeDisplayFailure(codePoint, displayFailure = false, context = {}) {
  if (!("index" in context)) {
    let index = null;
    try {
      if (typeof getUnicodeCoverageIndex === "function")
        index = await withDisplayTimeout(getUnicodeCoverageIndex());
    } catch (_error) { /* An unavailable index is never proof of non-allocation. */ }
    context = {...context, index};
  }
  return unicodeFailureDetails(codePoint, context).text;
}
/* =========================================
   Character → Unicode
========================================= */

function convertCharacters() {

  const text =
    charInput.value;


  if (
    text.length ===
    0
  ) {

    unicodeOutput.textContent =
      "";


    return;
  }


  unicodeOutput.textContent =
    Array.from(
      text
    )
    .map(
      (character) => {

        return (
          "U+"
          +
          character
            .codePointAt(
              0
            )
            .toString(
              16
            )
            .toUpperCase()
        );

      }
    )
    .join(
      " "
    );
}

/* =========================================
   Unicode parser
========================================= */

function parseUnicodeToken(
  token
) {

  let value =
    token
      .trim()
      .replace(
        /^U\+/i,
        ""
      )
      .replace(
        /^0x/i,
        ""
      );


  if (
    !/^[0-9A-F]+$/i
      .test(
        value
      )
  ) {
    return null;
  }


  const codePoint =
    parseInt(
      value,
      16
    );


  if (
    !Number.isInteger(
      codePoint
    )
  ) {
    return null;
  }


  if (
    codePoint <
    0
    ||
    codePoint >
    0x10FFFF
  ) {
    return null;
  }


  if (
    codePoint >=
      0xD800
    &&
    codePoint <=
      0xDFFF
  ) {
    return null;
  }


  return codePoint;
}

/* =========================================
   History
========================================= */

const unicodeHistory =
  [];


function updateBackButton() {

  backUnicode.disabled =
    unicodeHistory.length ===
    0;
}


function saveUnicodeHistory() {

  if (
    typeof captureUnicodeHistoryState !==
      "function"
  ) {
    return;
  }


  const currentState =
    captureUnicodeHistoryState();


  const serialized =
    JSON.stringify(
      currentState
    );


  const lastEntry =
    unicodeHistory[
      unicodeHistory.length -
      1
    ];


  if (
    lastEntry
    &&
    lastEntry.serialized ===
      serialized
  ) {
    return;
  }


  unicodeHistory.push(
    {
      state:
        currentState,

      serialized
    }
  );


  if (
    unicodeHistory.length >
    50
  ) {

    unicodeHistory.shift();
  }


  updateBackButton();
}

/* =========================================
   Input timer
========================================= */

let unicodeRun =
  0;


let unicodeInputTimer =
  null;

/* =========================================
   Back
========================================= */

function goBackUnicode() {

  if (
    unicodeHistory.length ===
    0
  ) {
    return;
  }


  unicodeRun++;


  clearTimeout(
    unicodeInputTimer
  );


  const entry =
    unicodeHistory.pop();


  updateBackButton();


  if (
    typeof restoreUnicodeHistoryState ===
      "function"
  ) {

    restoreUnicodeHistoryState(
      entry.state
    );
  }
}

/* =========================================
   Glyph DOM
========================================= */

function createGlyphElement(
  codePoint,
  character
) {

  const wrapper =
    document.createElement(
      "span"
    );


  wrapper.className =
    "character-span "
    +
    getFontClass(
      codePoint
    );


  const inner =
    document.createElement(
      "span"
    );


  inner.className =
    "glyph-inner";


  inner.textContent =
    character;


  wrapper.appendChild(
    inner
  );


  return {
    wrapper,
    inner
  };
}

/* =========================================
   Unicode → Character
========================================= */

async function convertUnicode(rawOverride = null) {
  const currentRun = ++unicodeRun;
  const raw = (rawOverride === null ? unicodeInput.value : String(rawOverride)).trim();
  charOutput.className = "result character-result";
  charOutput.textContent = "";
  hideUnicodeScope();
  if (typeof updateSvgModeProgress === "function") updateSvgModeProgress("");
  if (!raw) return;

  let indexForStatus = null;
  let coverageFailure = null;
  try {
    if (typeof getUnicodeCoverageIndex === "function")
      indexForStatus = await withDisplayTimeout(getUnicodeCoverageIndex());
  } catch (error) {
    coverageFailure = error;
  }
  if (currentRun !== unicodeRun) return;

  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  // Release-wide failures should not delay every character in a batch.
  let svgReleaseFailure = null;
  let emojiUnavailable = false;
  let tokenIndex = 0;
  for (const token of tokens) {
    tokenIndex++;
    if (currentRun !== unicodeRun) return;
    const codePoint = parseUnicodeToken(token);
    if (codePoint === null) {
      const error = document.createElement("span");
      error.className = "invalid-unicode";
      error.dataset.reason = "invalid";
      error.textContent = "無効: " + token;
      charOutput.appendChild(error);
      await yieldToBrowser();
      continue;
    }

    let glyphWrapper = null;
    const failureContext = {index:indexForStatus, coverageFailure};
    try {
      const character = String.fromCodePoint(codePoint);
      const hex = codePoint.toString(16).toUpperCase();
      // A local cmap miss does not rule out an SVG or an OS font.
      if (unicodeNonGlyphReason(codePoint, indexForStatus)) {
        charOutput.appendChild(makeUnicodeFailureSpan(codePoint, failureContext));
        await yieldToBrowser();
        continue;
      }

      const {wrapper, inner} = createGlyphElement(codePoint, character);
      glyphWrapper = wrapper;
      inner.setAttribute("aria-label", "U+" + hex.padStart(4, "0"));
      if (typeof isSvgModeEnabled === "function" && isSvgModeEnabled()) {
        // Do not flash a device's missing-glyph symbol while SVG is loading.
        inner.textContent = "";
        wrapper.classList.add("loading-character");
        charOutput.appendChild(wrapper);
        updateSvgModeProgress("SVG描画中: " + tokenIndex + " / " + tokens.length);
        await yieldToBrowser();
        if (currentRun !== unicodeRun) return;
        try {
          const result = svgReleaseFailure ||
            await withDisplayTimeout(createSvgGlyph(codePoint, character), 18000);
          if (currentRun !== unicodeRun || !isSvgModeEnabled()) return;
          wrapper.classList.remove("loading-character");
          if (result.svg) {
            inner.textContent = "";
            inner.appendChild(result.svg);
            wrapper.classList.add("svg-character");
            wrapper.dataset.displayMode = "svg";
            await yieldToBrowser();
            continue;
          }
          failureContext.svgFailure = {...result, reason:result.reason || "SVG未対応"};
        } catch (error) {
          if (currentRun !== unicodeRun) return;
          console.warn("SVG render failed:", error);
          failureContext.svgFailure = {
            code:error.code || "processing", stage:error.stage, url:error.url,
            reason:error.code === "timeout" ? "SVG読み込みタイムアウト" : "SVG表示処理エラー",
            error
          };
        }
        // Reuse the normal path, including color emoji and specialist fonts.
        const failure = failureContext.svgFailure;
        const failureCode = failure.code || failure.error?.code;
        if (failureCode !== "unsupported" &&
            (["active", "manifest"].includes(failure.stage || failure.error?.stage) ||
             failureCode === "integrity"))
          svgReleaseFailure = failure;
        attachSvgFailure(wrapper, failure);
        wrapper.title = failure.reason + "：通常表示へ切り替えました";
        wrapper.classList.remove("loading-character");
        inner.textContent = character;
      }

      const fontNames = getWebFontNames(codePoint);
      if (fontNames.length > 0) wrapper.classList.add("loading-character");
      if (!wrapper.parentNode) charOutput.appendChild(wrapper);
      await yieldToBrowser();
      if (currentRun !== unicodeRun) return;

      // Preserve native full-color emoji before monochrome cmap fallbacks.
      let emojiPlan = null;
      if (!emojiUnavailable && typeof getNativeEmojiRenderPlan === "function") {
        try {
          emojiPlan = await withDisplayTimeout(getNativeEmojiRenderPlan(codePoint, character));
        } catch (error) {
          emojiUnavailable = true;
          console.warn("Native emoji plan unavailable:", error);
        }
      }
      if (currentRun !== unicodeRun) return;
      if (emojiPlan) {
        wrapper.classList.remove("loading-character");
        wrapper.classList.add("native-color-emoji");
        wrapper.dataset.displayMode = "normal";
        inner.textContent = emojiPlan.character;
        inner.dataset.codePoint = hex;
        inner.setAttribute("aria-label", "U+" + hex);
        let nativeVisible = true;
        if (failureContext.svgFailure) {
          // Unicode's emoji property does not mean this iOS version has the
          // glyph. After an SVG failure, keep trying if native emoji is tofu.
          try {
            const family = getComputedStyle(inner).fontFamily;
            nativeVisible = !isRenderedBlank(emojiPlan.character, family) &&
              !looksLikeMissingGlyph(emojiPlan.character, family);
          } catch (error) {
            nativeVisible = false;
            failureContext.fontFailure = error;
          }
        }
        if (nativeVisible) {
          if (emojiPlan.displayVariation)
            wrapper.title = (wrapper.title ? wrapper.title + " / " : "") +
              "U+" + hex + "（カラー表示用の U+FE0F を追加）";
          await yieldToBrowser();
          continue;
        }
        wrapper.classList.remove("native-color-emoji");
        inner.textContent = character;
      }

      let selectedFont = null;
      try {
        if (typeof selectUnicodeFont === "function")
          selectedFont = await withDisplayTimeout(selectUnicodeFont(codePoint, character));
        else if (fontNames.length > 0)
          await withDisplayTimeout(waitForCharacterFont(codePoint, character));
      } catch (error) {
        failureContext.fontFailure = error;
        console.warn("Indexed font selection failed", error);
      }
      if (currentRun !== unicodeRun) return;
      if (selectedFont) inner.style.fontFamily = '"' + selectedFont + '", sans-serif';
      wrapper.dataset.displayMode = selectedFont ? "web-font" : "normal";
      wrapper.classList.remove("loading-character");

      // Keep the eight audited specialist outlines: Safari Canvas heuristics
      // must not replace these verified glyphs with a missing-font status.
      if (selectedFont && typeof isVerifiedSpecialistSelection === "function" &&
          isVerifiedSpecialistSelection(codePoint, selectedFont)) {
        wrapper.title = (wrapper.title ? wrapper.title + " / " : "") +
          "U+" + hex + " · 検証済み専用フォント";
        await yieldToBrowser();
        continue;
      }

      if (document.fonts && document.fonts.status === "loading") {
        try {
          await withDisplayTimeout(document.fonts.ready);
        } catch (error) {
          failureContext.fontFailure = error;
        }
      }
      if (currentRun !== unicodeRun) return;
      const fontFamily = getComputedStyle(inner).fontFamily;
      let missing = isRenderedBlank(character, fontFamily) || looksLikeMissingGlyph(character, fontFamily);
      if (missing) {
        // A downloaded/CSS font may still fail on this device. Give the OS
        // font stack its own chance before replacing the glyph with a reason.
        inner.style.fontFamily = "system-ui, sans-serif";
        const systemFamily = getComputedStyle(inner).fontFamily;
        missing = isRenderedBlank(character, systemFamily) || looksLikeMissingGlyph(character, systemFamily);
        if (!missing) wrapper.dataset.displayMode = "normal";
      }
      if (missing) {
        wrapper.replaceWith(makeUnicodeFailureSpan(codePoint, failureContext));
        await yieldToBrowser();
        continue;
      }
      applyGlyphScale(wrapper, inner, codePoint, character);
      await yieldToBrowser();
    } catch (error) {
      if (currentRun !== unicodeRun) return;
      // Font/Canvas/DOM failures affect this character, not the whole batch.
      console.warn("Character rendering failed:", error);
      failureContext.fontFailure = error;
      const status = makeUnicodeFailureSpan(codePoint, failureContext);
      if (glyphWrapper?.parentNode) glyphWrapper.replaceWith(status);
      else charOutput.appendChild(status);
      await yieldToBrowser();
    }
  }
  if (currentRun === unicodeRun && typeof updateSvgModeProgress === "function")
    updateSvgModeProgress("");
}
