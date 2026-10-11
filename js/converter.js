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

async function convertUnicode(
  rawOverride =
    null
) {

  const currentRun =
    ++unicodeRun;


  const raw =
    (
      rawOverride ===
        null
        ? unicodeInput.value
        : String(
            rawOverride
          )
    )
      .trim();


  charOutput.className =
    "result character-result";


  charOutput.textContent =
    "";


  hideUnicodeScope();


  if (
    raw.length ===
    0
  ) {
    return;
  }


  const tokens =
    raw
      .split(
        /[\s,]+/
      )
      .filter(
        Boolean
      );


  for (
    const token
    of tokens
  ) {

    if (
      currentRun !==
      unicodeRun
    ) {
      return;
    }


    const codePoint =
      parseUnicodeToken(
        token
      );


    if (
      codePoint ===
      null
    ) {

      const error =
        document.createElement(
          "span"
        );


      error.className =
        "invalid-unicode";


      error.textContent =
        "無効: "
        +
        token;


      charOutput.appendChild(
        error
      );


      await yieldToBrowser();


      continue;
    }


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


    if (
      isInvisibleCharacter(
        codePoint,
        character
      )
    ) {

      charOutput.appendChild(
        makeStatusSpan(
          "不可視: U+"
          +
          hex
        )
      );


      await yieldToBrowser();


      continue;
    }


    const {
      wrapper,
      inner
    } =
      createGlyphElement(
        codePoint,
        character
      );


    const fontNames =
      getWebFontNames(
        codePoint
      );


    if (
      fontNames.length >
      0
    ) {

      wrapper.classList.add(
        "loading-character"
      );
    }


    charOutput.appendChild(
      wrapper
    );


    await yieldToBrowser();


    if (
      currentRun !==
      unicodeRun
    ) {
      return;
    }


    // Preserve full-color native emoji instead of letting Unicode cmap
    // fallback fonts (Noto Symbols / Unifont) force monochrome glyphs.
    // This runs before the specialized black-and-white font selection.
    let emojiPlan = null;
    if (typeof getNativeEmojiRenderPlan === "function") {
      emojiPlan = await getNativeEmojiRenderPlan(codePoint, character);
    }
    if (currentRun !== unicodeRun) return;
    if (emojiPlan) {
      wrapper.classList.remove("loading-character");
      wrapper.classList.add("native-color-emoji");
      inner.textContent = emojiPlan.character;
      inner.dataset.codePoint = hex;
      inner.setAttribute("aria-label", "U+" + hex);
      if (emojiPlan.displayVariation) {
        wrapper.title = "U+" + hex + "（カラー表示用の U+FE0F を追加）";
      }
      await yieldToBrowser();
      continue;
    }

    // The audited cmap index chooses a concrete font for this code point.
    // The old path remains available if this optional script fails to load.
    let selectedFont = null;
    if (typeof selectUnicodeFont === "function") {
      try {
        selectedFont = await selectUnicodeFont(codePoint, character);
      } catch (error) {
        console.warn("Indexed font selection failed", error);
      }
    } else if (fontNames.length > 0) {
      await waitForCharacterFont(codePoint, character);
    }

    if (selectedFont) {
      inner.style.fontFamily = '"' + selectedFont + '", sans-serif';
    }


    if (
      currentRun !==
      unicodeRun
    ) {
      return;
    }


    wrapper.classList.remove(
      "loading-character"
    );

    // The exact font and the real, non-.notdef glyph outline of these eight
    // characters were verified at build time. Do not replace them with a
    // bitmap fallback because of device-dependent Canvas heuristics.
    if (selectedFont &&
        typeof isVerifiedSpecialistSelection === "function" &&
        isVerifiedSpecialistSelection(codePoint, selectedFont)) {
      wrapper.title = "U+" + hex + " · 検証済み専用フォント";
      await yieldToBrowser();
      continue;
    }

    // Avoid false "unsupported" reports while a font is still downloading.
    if (document.fonts && document.fonts.status === "loading") {
      await Promise.race([document.fonts.ready, sleep(8000)]);
    }

    if (document.fonts && document.fonts.status === "loading") {
      wrapper.title = "フォントの読み込みが継続中のため、表示可否をまだ判定できません";
      await yieldToBrowser();
      continue;
    }

    const fontFamily =
      getComputedStyle(
        inner
      )
      .fontFamily;


    if (
      isRenderedBlank(
        character,
        fontFamily
      )
    ) {

      wrapper.replaceWith(
        makeStatusSpan(
          "空白: U+"
          +
          hex
        )
      );


      await yieldToBrowser();


      continue;
    }


    if (
      looksLikeMissingGlyph(
        character,
        fontFamily
      )
    ) {

      wrapper.replaceWith(
        makeStatusSpan(
          "未対応: U+"
          +
          hex
        )
      );


      await yieldToBrowser();


      continue;
    }


    applyGlyphScale(
      wrapper,
      inner,
      codePoint,
      character
    );


    await yieldToBrowser();
  }
}
