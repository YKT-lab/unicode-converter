/* =========================================
   Unicode single input
========================================= */

const MAX_RANDOM_COUNT =
  500;

function currentRandomLimit() {
  return isSvgModeEnabled() ? 100 : MAX_RANDOM_COUNT;
}


const unicodeDigitCount =
  document.getElementById(
    "unicodeDigitCount"
  );


const unicodeDigitBoxes =
  document.getElementById(
    "unicodeDigitBoxes"
  );


const unicodeHexKeypad =
  document.getElementById(
    "unicodeHexKeypad"
  );


const randomCountSelect =
  document.getElementById(
    "randomCountSelect"
  );


const randomCustomWrap =
  document.getElementById(
    "randomCustomWrap"
  );


const randomCustomCount =
  document.getElementById(
    "randomCustomCount"
  );


const generateRandomButton =
  document.getElementById(
    "generateRandomButton"
  );


let singleHexDigits =
  [];


let activeHexIndex =
  0;


let lastUnicodeOutputSource =
  null;


let randomCustomHasDefaultValue =
  randomCustomCount.value ===
  "150";


/* =========================================
   Unified Unicode history state
========================================= */

function captureUnicodeHistoryState() {

  return {
    digitCount:
      getUnicodeDigitLength(),

    digits:
      [
        ...singleHexDigits
      ],

    activeHexIndex,

    bulkValue:
      unicodeInput.value,

    bulkExpanded:
      unicodeInput
        .classList
        .contains(
          "input-expanded"
        ),

    outputSource:
      lastUnicodeOutputSource
  };
}


function restoreUnicodeHistoryState(
  state
) {

  if (
    !state
  ) {
    return;
  }


  const digitCount =
    [
      4,
      5,
      6
    ].includes(
      Number(
        state.digitCount
      )
    )
      ? Number(
          state.digitCount
        )
      : 4;


  unicodeDigitCount.value =
    String(
      digitCount
    );


  singleHexDigits =
    Array.from(
      {
        length:
          digitCount
      },
      (
        _,
        index
      ) => {

        const digit =
          state.digits?.[
            index
          ];


        return /^[0-9A-F]$/
          .test(
            digit
            ||
            ""
          )
          ? digit
          : "";
      }
    );


  activeHexIndex =
    Math.max(
      0,
      Math.min(
        digitCount -
          1,
        Number(
          state.activeHexIndex
        )
        ||
        0
      )
    );


  unicodeInput.value =
    String(
      state.bulkValue
      ||
      ""
    );


  setBulkInputExpanded(
    Boolean(
      state.bulkExpanded
    )
  );


  lastUnicodeOutputSource =
    state.outputSource ===
      "single"
      ||
      state.outputSource ===
      "bulk"
      ? state.outputSource
      : null;


  renderUnicodeDigitBoxes();
  bulkRenderedValue = unicodeInput.value;
  updateBulkApplyUI();

  if (
    lastUnicodeOutputSource ===
    "single"
    &&
    singleHexDigits.every(
      Boolean
    )
  ) {

    convertUnicode(
      "U+" +
      singleHexDigits.join(
        ""
      )
    );


    return;
  }


  if (
    lastUnicodeOutputSource ===
    "bulk"
    &&
    unicodeInput.value.trim()
  ) {

    convertUnicode();


    return;
  }


  charOutput.textContent =
    "";


  hideUnicodeScope();
}


/* =========================================
   Bulk input expansion
========================================= */

function resizeExpandedTextarea(
  textarea
) {

  if (
    !textarea
    ||
    !textarea.classList.contains(
      "input-expanded"
    )
  ) {
    return;
  }


  textarea.style.height =
    "auto";


  textarea.style.height =
    textarea.scrollHeight +
    "px";
}


function setBulkInputExpanded(
  expanded
) {

  unicodeInput.classList.toggle(
    "input-expanded",
    expanded
  );


  toggleUnicodeView.textContent =
    expanded
      ? "閉じる"
      : "全表示";


  toggleUnicodeView.setAttribute(
    "aria-expanded",
    String(expanded)
  );


  if (
    expanded
  ) {

    requestAnimationFrame(
      () => {
        resizeExpandedTextarea(
          unicodeInput
        );
      }
    );

  } else {

    unicodeInput.style.height =
      "";


    unicodeInput.scrollTop =
      0;


    unicodeInput.scrollLeft =
      0;
  }
}


/* =========================================
   Segmented Unicode boxes
========================================= */

function getUnicodeDigitLength() {

  const count =
    Number(
      unicodeDigitCount.value
    );


  return [
    4,
    5,
    6
  ].includes(
    count
  )
    ? count
    : 4;
}


function renderUnicodeDigitBoxes() {

  unicodeDigitBoxes.replaceChildren();


  singleHexDigits.forEach(
    (
      digit,
      index
    ) => {

      const box =
        document.createElement(
          "div"
        );


      box.className =
        "unicode-digit-box";


      if (
        digit
      ) {

        box.classList.add(
          "filled"
        );
      }


      if (
        index ===
        activeHexIndex
      ) {

        box.classList.add(
          "active"
        );
      }


      box.dataset.index =
        String(
          index
        );


      box.textContent =
        digit;


      box.addEventListener(
        "click",
        () => {

          activeHexIndex =
            index;


          renderUnicodeDigitBoxes();


          unicodeDigitBoxes.focus();
        }
      );


      unicodeDigitBoxes.appendChild(
        box
      );
    }
  );
}


function clearSinglePreview() {

  unicodeRun++;


  clearTimeout(
    unicodeInputTimer
  );


  if (
    lastUnicodeOutputSource ===
    "single"
  ) {

    charOutput.textContent =
      "";


    lastUnicodeOutputSource =
      null;
  }


  hideUnicodeScope();
}


function updateSingleUnicodePreview() {

  const complete =
    singleHexDigits.length >
      0
    &&
    singleHexDigits.every(
      Boolean
    );


  if (
    !complete
  ) {

    clearSinglePreview();


    return;
  }


  const value =
    singleHexDigits.join(
      ""
    );


  lastUnicodeOutputSource =
    "single";


  convertUnicode(
    "U+" +
    value
  );
}


function resetSingleUnicodeInput(
  {
    clearOutput = true
  } = {}
) {

  const length =
    getUnicodeDigitLength();


  singleHexDigits =
    Array(
      length
    )
      .fill(
        ""
      );


  activeHexIndex =
    0;


  renderUnicodeDigitBoxes();


  if (
    clearOutput
  ) {

    clearSinglePreview();
  }
}


function enterSingleHexDigit(
  digit
) {

  saveUnicodeHistory();


  if (
    unicodeInput.value
  ) {

    unicodeInput.value =
      "";


    setBulkInputExpanded(
      false
    );
    bulkRenderedValue = "";
    updateBulkApplyUI();


    if (
      lastUnicodeOutputSource ===
      "bulk"
    ) {

      lastUnicodeOutputSource =
        null;
    }


    updateBackButton();
  }


  const normalized =
    String(
      digit
      ||
      ""
    )
      .toUpperCase();


  if (
    !/^[0-9A-F]$/
      .test(
        normalized
      )
  ) {
    return;
  }


  singleHexDigits[
    activeHexIndex
  ] =
    normalized;


  if (
    activeHexIndex <
      singleHexDigits.length -
      1
  ) {

    activeHexIndex++;
  }


  renderUnicodeDigitBoxes();


  updateSingleUnicodePreview();
}


function backspaceSingleHexDigit() {

  saveUnicodeHistory();


  if (
    singleHexDigits[
      activeHexIndex
    ]
  ) {

    singleHexDigits[
      activeHexIndex
    ] =
      "";

  } else if (
    activeHexIndex >
      0
  ) {

    activeHexIndex--;


    singleHexDigits[
      activeHexIndex
    ] =
      "";
  }


  renderUnicodeDigitBoxes();


  updateSingleUnicodePreview();
}


function setSingleUnicodeCodePoint(
  codePoint
) {

  const hex =
    codePoint
      .toString(
        16
      )
      .toUpperCase();


  const length =
    hex.length <=
      4
      ? 4
      : hex.length ===
          5
        ? 5
        : 6;


  unicodeDigitCount.value =
    String(
      length
    );


  singleHexDigits =
    hex
      .padStart(
        length,
        "0"
      )
      .split(
        ""
      );


  activeHexIndex =
    length -
    1;


  renderUnicodeDigitBoxes();


  updateSingleUnicodePreview();
}


/* =========================================
   Segmented input events
========================================= */

unicodeDigitCount.addEventListener(
  "change",
  () => {

    saveUnicodeHistory();


    resetSingleUnicodeInput();


    unicodeDigitBoxes.focus();
  }
);


unicodeDigitBoxes.addEventListener(
  "keydown",
  (
    event
  ) => {

    const key =
      event.key;


    if (
      /^[0-9A-Fa-f]$/
        .test(
          key
        )
    ) {

      event.preventDefault();


      enterSingleHexDigit(
        key
      );


      return;
    }


    if (
      key ===
      "Backspace"
    ) {

      event.preventDefault();


      backspaceSingleHexDigit();


      return;
    }


    if (
      key ===
      "Delete"
    ) {

      event.preventDefault();


      saveUnicodeHistory();


      singleHexDigits[
        activeHexIndex
      ] =
        "";


      renderUnicodeDigitBoxes();


      updateSingleUnicodePreview();


      return;
    }


    if (
      key ===
      "ArrowLeft"
    ) {

      event.preventDefault();


      activeHexIndex =
        Math.max(
          0,
          activeHexIndex -
            1
        );


      renderUnicodeDigitBoxes();


      return;
    }


    if (
      key ===
      "ArrowRight"
    ) {

      event.preventDefault();


      activeHexIndex =
        Math.min(
          singleHexDigits.length -
            1,
          activeHexIndex +
            1
        );


      renderUnicodeDigitBoxes();


      return;
    }


    // A physical keyboard can explicitly confirm the single codepoint.
    // Hex digits are already previewed as they are typed.
    if (
      key === "Enter" &&
      !event.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      if (!event.repeat) updateSingleUnicodePreview();
      return;
    }

    if (
      key.length ===
      1
    ) {

      event.preventDefault();
    }
  }
);


unicodeHexKeypad.addEventListener(
  "click",
  (
    event
  ) => {

    const keyButton =
      event.target.closest(
        "[data-hex-key]"
      );


    if (
      keyButton
    ) {

      enterSingleHexDigit(
        keyButton.dataset.hexKey
      );


      unicodeDigitBoxes.focus();


      return;
    }


    const actionButton =
      event.target.closest(
        "[data-hex-action]"
      );


    if (
      !actionButton
    ) {
      return;
    }


    const action =
      actionButton.dataset.hexAction;


    if (
      action ===
      "backspace"
    ) {

      backspaceSingleHexDigit();

    } else if (
      action ===
      "clear"
    ) {

      saveUnicodeHistory();


      resetSingleUnicodeInput();
    }


    unicodeDigitBoxes.focus();
  }
);


/* =========================================
   Character → Unicode
========================================= */

charInput.addEventListener(
  "input",
  () => {

    convertCharacters();
  }
);

// Enter confirms the conversion; Shift+Enter inserts a real newline.
// Never intercept the Enter used to finalize Japanese IME composition.
charInput.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing ||
      event.keyCode === 229 || event.altKey) return;
  event.preventDefault();
  if (!event.repeat) convertCharacters();
});


/* =========================================
   Bulk Unicode input
========================================= */

toggleUnicodeView.setAttribute(
  "aria-controls",
  "unicodeInput"
);


toggleUnicodeView.addEventListener(
  "click",
  () => {

    setBulkInputExpanded(
      !unicodeInput.classList.contains(
        "input-expanded"
      )
    );
  }
);


const applyBulkUnicodeButton = document.getElementById("applyBulkUnicode");
const bulkUnicodeUpdateStatus = document.getElementById("bulkUnicodeUpdateStatus");
let bulkRenderedValue = "";

function updateBulkApplyUI() {
  const raw = unicodeInput.value;
  const dirty = raw !== bulkRenderedValue;
  const tokenCount = countBulkUnicodeTokens(raw);
  const manual = bulkUnicodeRequiresManualApply(raw);
  const waiting = dirty && raw.trim().length > 0;
  applyBulkUnicodeButton.hidden = !waiting;
  applyBulkUnicodeButton.disabled = !waiting;
  bulkUnicodeUpdateStatus.hidden = !waiting;
  bulkUnicodeUpdateStatus.textContent = manual
    ? tokenCount + "件：編集中は再生成しません。編集後に「表示を更新」を押してください。"
    : "入力が止まったら表示を更新します。";
}
function applyBulkUnicodeNow() {
  clearTimeout(unicodeInputTimer);
  unicodeRun++;
  bulkRenderedValue = unicodeInput.value;
  lastUnicodeOutputSource = "bulk";
  updateBulkApplyUI();
  convertUnicode();
}
let bulkInputComposing = false;
unicodeInput.addEventListener("compositionstart", () => {
  bulkInputComposing = true;
  clearTimeout(unicodeInputTimer);
});
unicodeInput.addEventListener("compositionend", () => {
  bulkInputComposing = false;
  unicodeInput.dispatchEvent(new Event("input"));
});
unicodeInput.addEventListener("input", () => {
  unicodeRun++;
  clearTimeout(unicodeInputTimer);
  hideUnicodeScope();
  resizeExpandedTextarea(unicodeInput);
  updateBulkApplyUI();
  if (!unicodeInput.value.trim()) {
    if (lastUnicodeOutputSource === "bulk") {
      charOutput.textContent = "";
      lastUnicodeOutputSource = null;
    }
    bulkRenderedValue = "";
    updateBulkApplyUI();
    return;
  }
  if (bulkInputComposing || bulkUnicodeRequiresManualApply(unicodeInput.value)) return;
  unicodeInputTimer = setTimeout(() => {
    if (bulkUnicodeRequiresManualApply(unicodeInput.value)) return;
    applyBulkUnicodeNow();
  }, BULK_AUTO_RENDER_DELAY_MS);
});
applyBulkUnicodeButton.addEventListener("click", applyBulkUnicodeNow);
// Plain Enter confirms a batch (also supports Ctrl/Command+Enter).
// Shift+Enter deliberately remains available for multiline input.
unicodeInput.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing ||
      bulkInputComposing || event.keyCode === 229 || event.altKey) return;
  event.preventDefault();
  if (!event.repeat) applyBulkUnicodeNow();
});

/* =========================================
   Random controls
========================================= */

function syncRandomCustomVisibility() {

  randomCustomWrap.hidden =
    randomCountSelect.value !==
    "custom";
}


function getSelectedRandomCount() {

  if (
    randomCountSelect.value !==
    "custom"
  ) {

    return Math.min(
      currentRandomLimit(),
      Math.max(
        1,
        Number(
          randomCountSelect.value
        )
      )
    );
  }


  const parsed =
    Number.parseInt(
      randomCustomCount.value,
      10
    );


  const count =
    Number.isFinite(
      parsed
    )
      ? Math.min(
          currentRandomLimit(),
          Math.max(
            1,
            parsed
          )
        )
      : 1;


  randomCustomCount.value =
    String(
      count
    );


  return count;
}


randomCountSelect.addEventListener(
  "change",
  () => {

    syncRandomCustomVisibility();


    if (
      !randomCustomWrap.hidden
    ) {

      randomCustomCount.focus();
    }
  }
);


randomCustomCount.addEventListener(
  "beforeinput",
  (
    event
  ) => {

    if (
      !randomCustomHasDefaultValue
    ) {
      return;
    }


    const inputType =
      event.inputType
      ||
      "";


    if (
      inputType.startsWith(
        "insert"
      )
    ) {

      const inserted =
        event.data;


      randomCustomHasDefaultValue =
        false;


      if (
        inserted
        &&
        /^\d+$/.test(
          inserted
        )
      ) {

        event.preventDefault();


        randomCustomCount.value =
          inserted;


        return;
      }


      randomCustomCount.value =
        "";


      return;
    }


    if (
      inputType.startsWith(
        "delete"
      )
    ) {

      event.preventDefault();


      randomCustomHasDefaultValue =
        false;


      randomCustomCount.value =
        "";
    }
  }
);


randomCustomCount.addEventListener(
  "input",
  () => {

    randomCustomHasDefaultValue =
      false;
  }
);


randomCustomCount.addEventListener(
  "blur",
  () => {

    getSelectedRandomCount();
  }
);


// Enter from the custom amount behaves exactly like clicking 生成.
randomCustomCount.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing ||
      event.keyCode === 229 || event.altKey || event.shiftKey) return;
  event.preventDefault();
  if (!event.repeat) generateRandomButton.click();
});

generateRandomButton.addEventListener(
  "click",
  () => {

    const count =
      getSelectedRandomCount();


    if (
      count ===
      1
    ) {

      saveUnicodeHistory();


      const codePoint =
        generateRandomCodePoint();


      setSingleUnicodeCodePoint(
        codePoint
      );


      return;
    }


    lastUnicodeOutputSource =
      "bulk";


    generateRandomUnicode(
      count,
      false
    );
    bulkRenderedValue = unicodeInput.value;
    updateBulkApplyUI();


    setBulkInputExpanded(
      false
    );
  }
);


/* =========================================
   History / clear
========================================= */

backUnicode.addEventListener(
  "click",
  () => {

    goBackUnicode();
  }
);


clearChar.addEventListener(
  "click",
  () => {

    charInput.value =
      "";


    unicodeOutput.textContent =
      "";


    hideUnicodeScope();


    charInput.focus();
  }
);


clearUnicode.addEventListener(
  "click",
  () => {

    unicodeRun++;


    clearTimeout(
      unicodeInputTimer
    );


    unicodeInput.value =
      "";


    if (
      lastUnicodeOutputSource ===
      "bulk"
    ) {

      charOutput.textContent =
        "";


      lastUnicodeOutputSource =
        null;
    }


    setBulkInputExpanded(
      false
    );


    hideUnicodeScope();


    unicodeInput.focus();
  }
);


/* =========================================
   Resize
========================================= */

window.addEventListener(
  "resize",
  () => {

    resizeExpandedTextarea(
      unicodeInput
    );
  },
  {
    passive:
      true
  }
);


/* =========================================
   Startup
========================================= */

setBulkInputExpanded(
  false
);
updateBulkApplyUI();

syncRandomCustomVisibility();


resetSingleUnicodeInput(
  {
    clearOutput:
      false
  }
);


updateBackButton();


loadDailyCharacter();


let lastJSTDate =
  getJSTDateString();


setInterval(
  () => {

    const now =
      getJSTDateString();


    if (
      now !==
      lastJSTDate
    ) {

      lastJSTDate =
        now;


      hideUnicodeScope();


      loadDailyCharacter();
    }
  },
  60000
);
