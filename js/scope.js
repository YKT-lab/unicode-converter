/* =========================================
   Unicode Scope
========================================= */

let currentScopeCode =
  "";


let currentScopeCharacter =
  "";


let scopePointerStart =
  null;


/*
  この時間以上押した場合は
  Unicode Scopeではなく
  ブラウザ標準の長押しとして扱う
*/

const scopeLongPressThreshold =
  400;

/* =========================================
   Scope hide
========================================= */

function hideUnicodeScope() {

  if (
    !unicodeScope
  ) {
    return;
  }


  unicodeScope
    .classList
    .remove(
      "visible"
    );


  unicodeScope
    .setAttribute(
      "aria-hidden",
      "true"
    );


  currentScopeCode =
    "";


  currentScopeCharacter =
    "";


  if (
    unicodeScopeGlyph
  ) {

    unicodeScopeGlyph.style.transform =
      "none";
  }
}

/* =========================================
   Text node characters
========================================= */

function getCharacterPieces(
  text
) {

  const pieces =
    [];


  // Treat complete grapheme clusters (including joined emoji) as one
  // selectable unit. Range offsets remain UTF-16 positions.
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined,{granularity:"grapheme"});
    for (const {segment,index} of segmenter.segment(text)) {
      pieces.push({character:segment,start:index,end:index+segment.length});
    }
  } else {
    let utf16Index=0;
    for(const character of text){
      const start=utf16Index;
      utf16Index+=character.length;
      pieces.push({character,start,end:utf16Index});
    }
  }

  return pieces;
}

/* =========================================
   One character rectangle
========================================= */

function getCharacterRect(
  textNode,
  piece
) {

  try {

    const range =
      document.createRange();


    range.setStart(
      textNode,
      piece.start
    );


    range.setEnd(
      textNode,
      piece.end
    );


    const rect =
      range.getBoundingClientRect();


    if (
      rect.width <=
        0
      &&
      rect.height <=
        0
    ) {

      return null;
    }


    return rect;

  } catch (
    error
  ) {

    return null;
  }
}

/* =========================================
   Nearest character from tap point
========================================= */

function getCharacterFromPoint(
  x,
  y
) {

  let textNode =
    null;


  let offset =
    0;


  /*
    Safari / Chrome
  */

  if (
    document.caretRangeFromPoint
  ) {

    const range =
      document.caretRangeFromPoint(
        x,
        y
      );


    if (
      range
    ) {

      textNode =
        range.startContainer;


      offset =
        range.startOffset;
    }
  }


  /*
    Firefox
  */

  else if (
    document.caretPositionFromPoint
  ) {

    const position =
      document.caretPositionFromPoint(
        x,
        y
      );


    if (
      position
    ) {

      textNode =
        position.offsetNode;


      offset =
        position.offset;
    }
  }


  if (
    !textNode
  ) {
    return null;
  }


  if (
    textNode.nodeType ===
    Node.ELEMENT_NODE
  ) {

    const childIndex =
      Math.max(
        0,
        Math.min(
          offset,
          textNode.childNodes.length -
          1
        )
      );


    const child =
      textNode.childNodes[
        childIndex
      ];


    if (
      child
      &&
      child.nodeType ===
        Node.TEXT_NODE
    ) {

      textNode =
        child;


      offset =
        Math.min(
          offset,
          textNode.data.length
        );

    } else {

      return null;
    }
  }


  if (
    textNode.nodeType !==
    Node.TEXT_NODE
  ) {
    return null;
  }


  const text =
    textNode.data;


  if (
    !text
    ||
    text.trim() ===
      ""
  ) {
    return null;
  }


  const pieces =
    getCharacterPieces(
      text
    );


  if (
    pieces.length ===
    0
  ) {
    return null;
  }


  let best =
    null;


  let bestDistance =
    Infinity;


  for (
    const piece
    of pieces
  ) {

    if (
      /^\s+$/u.test(
        piece.character
      )
    ) {
      continue;
    }


    const rect =
      getCharacterRect(
        textNode,
        piece
      );


    if (
      !rect
    ) {
      continue;
    }


    const padding =
      7;


    const inside =
      x >=
        rect.left -
        padding
      &&
      x <=
        rect.right +
        padding
      &&
      y >=
        rect.top -
        padding
      &&
      y <=
        rect.bottom +
        padding;


    if (
      !inside
    ) {
      continue;
    }


    const centerX =
      rect.left +
      rect.width /
      2;


    const centerY =
      rect.top +
      rect.height /
      2;


    const distance =
      Math.hypot(
        x -
        centerX,
        y -
        centerY
      );


    if (
      distance <
      bestDistance
    ) {

      bestDistance =
        distance;


      best = {
        character:
          piece.character,

        rect,

        textNode
      };
    }
  }


  return best;
}

/* =========================================
   Scope glyph auto fit
========================================= */

function fitUnicodeScopeGlyph(
  character
) {

  if (
    !unicodeScopeGlyph
    ||
    !unicodeScope
    ||
    !unicodeScope.classList.contains(
      "visible"
    )
  ) {
    return;
  }


  unicodeScopeGlyph.style.transform =
    "none";


  const style =
    getComputedStyle(
      unicodeScopeGlyph
    );


  const fontFamily =
    style.fontFamily;


  const fontSize =
    parseFloat(
      style.fontSize
    )
    ||
    32;


  const analysis =
    analyseGlyphPixels(
      character,
      fontFamily,
      120
    );


  const maxInkWidth =
    42;


  const maxInkHeight =
    42;


  let scale =
    1;


  if (
    analysis.inkPixels >
    0
  ) {

    const expectedWidth =
      analysis.width
      *
      (
        fontSize /
        120
      );


    const expectedHeight =
      analysis.height
      *
      (
        fontSize /
        120
      );


    const scaleX =
      maxInkWidth /
      Math.max(
        expectedWidth,
        1
      );


    const scaleY =
      maxInkHeight /
      Math.max(
        expectedHeight,
        1
      );


    scale =
      Math.min(
        1.15,
        scaleX,
        scaleY
      );

  } else {

    const rect =
      unicodeScopeGlyph
        .getBoundingClientRect();


    const scaleX =
      maxInkWidth /
      Math.max(
        rect.width,
        1
      );


    const scaleY =
      maxInkHeight /
      Math.max(
        rect.height,
        1
      );


    scale =
      Math.min(
        1.15,
        scaleX,
        scaleY
      );
  }


  scale =
    Math.max(
      0.08,
      scale
    );


  unicodeScopeGlyph.style.transform =
    `scale(${scale})`;
}

/* =========================================
   Scope show
========================================= */

function showUnicodeScope(
  result
) {

  if (
    !unicodeScope
    ||
    !unicodeScopeGlyph
    ||
    !unicodeScopeCode
  ) {
    return;
  }


  const character =
    result.character;


  // Show every code point in a joined emoji while preserving the glyph.
  const code=Array.from(character,part=>
    "U+"+part.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")
  ).join(" + ");

  currentScopeCharacter =
    character;


  currentScopeCode =
    code;


  unicodeScopeGlyph.style.transform =
    "none";


  unicodeScopeGlyph.textContent =
    character;


  unicodeScopeCode.textContent =
    code;


  unicodeScopeCode.setAttribute(
    "aria-label",
    `${code} をコピー`
  );


  const parentElement =
    result.textNode
      .parentElement;


  if (
    parentElement
  ) {

    const style =
      getComputedStyle(
        parentElement
      );


    unicodeScopeGlyph.style.fontFamily =
      style.fontFamily;


    unicodeScopeGlyph.style.fontWeight =
      style.fontWeight;


    unicodeScopeGlyph.style.fontStyle =
      style.fontStyle;
  }


  const rect = result.rect;
  // Absolute document coordinates track the underlying glyph even after
  // iOS Safari pinch zoom. A fixed overlay anchored to the layout viewport
  // drifts as the visual viewport pans inside it.
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const visual = window.visualViewport;
  const viewLeft = visual ? visual.pageLeft : scrollX;
  const viewTop = visual ? visual.pageTop : scrollY;
  const viewWidth = visual ? visual.width : window.innerWidth;
  const viewHeight = visual ? visual.height : window.innerHeight;
  const viewRight = viewLeft + viewWidth;
  const viewBottom = viewTop + viewHeight;
  // Inverse scaling keeps the circle and copied code readable at the same
  // on-screen size even when the document itself is pinch-zoomed.
  const zoom = visual ? Math.max(1,visual.scale || 1) : 1;
  unicodeScope.style.setProperty("--scope-inverse-scale",String(1 / zoom));
  unicodeScope.style.setProperty("--scope-intro-scale",String(0.72 / zoom));
  unicodeScope.style.setProperty("--scope-active-scale",String(0.94 / zoom));

  const glyphX = rect.left + scrollX + rect.width / 2;
  const glyphY = rect.top + scrollY + rect.height / 2;
  const ringInset = Math.min(38 / zoom,viewWidth / 2);
  const minX = viewLeft + ringInset;
  const maxX = viewRight - ringInset;
  const centerX = Math.max(minX,Math.min(maxX,glyphX));
  const centerY = Math.max(viewTop + ringInset,Math.min(viewBottom - ringInset,glyphY));

  unicodeScope.style.left = centerX + "px";
  unicodeScope.style.top = centerY + "px";
  unicodeScope.style.setProperty(
    "--code-top",
    (centerY + 100 / zoom > viewBottom ? -56 : 46) / zoom + "px"
  );

  // The label is zoom-compensated too. The available CSS width must be
  // scaled back to screen pixels so that the actual rendered rectangle
  // stays within the current visual viewport.
  unicodeScopeCode.style.maxWidth =
    Math.max(24,Math.min(360,viewWidth * zoom - 16)) + "px";
  unicodeScopeCode.style.left = "0px";

  unicodeScope.classList.add("visible");
  unicodeScope.setAttribute("aria-hidden","false");

  // BoundingClientRect is in layout-viewport coordinates, whereas the
  // visible window on a pinch-zoomed page starts at visual.offsetLeft.
  const labelRect = unicodeScopeCode.getBoundingClientRect();
  const leftEdge = visual ? visual.offsetLeft : 0;
  const rightEdge = leftEdge + viewWidth;
  const margin = Math.min(8 / zoom,viewWidth / 8);
  let shift = 0;
  if (labelRect.left < leftEdge + margin) {
    shift = leftEdge + margin - labelRect.left;
  } else if (labelRect.right > rightEdge - margin) {
    shift = rightEdge - margin - labelRect.right;
  }
  unicodeScopeCode.style.left = shift + "px";

  requestAnimationFrame(
    () => {

      if (
        currentScopeCharacter ===
        character
      ) {

        fitUnicodeScopeGlyph(
          character
        );
      }

    }
  );


  if (
    document.fonts
    &&
    document.fonts.ready
  ) {

    document.fonts.ready
      .then(
        () => {

          if (
            currentScopeCharacter ===
              character
            &&
            unicodeScope.classList.contains(
              "visible"
            )
          ) {

            fitUnicodeScopeGlyph(
              character
            );
          }

        }
      )
      .catch(
        () => {}
      );
  }
}

/* =========================================
   Copy Scope Unicode
========================================= */

async function copyScopeCode() {

  if (
    !currentScopeCode
  ) {
    return;
  }


  const code =
    currentScopeCode;


  let copied =
    false;


  try {

    if (
      navigator.clipboard
      &&
      navigator.clipboard.writeText
    ) {

      await navigator.clipboard.writeText(
        code
      );


      copied =
        true;

    } else {

      throw new Error(
        "Clipboard API unavailable"
      );
    }

  } catch (
    error
  ) {

    const textarea =
      document.createElement(
        "textarea"
      );


    textarea.value =
      code;


    textarea.setAttribute(
      "readonly",
      ""
    );


    textarea.style.position =
      "fixed";


    textarea.style.left =
      "-9999px";


    textarea.style.top =
      "-9999px";


    textarea.style.opacity =
      "0";


    document.body.appendChild(
      textarea
    );


    textarea.select();


    try {

      copied =
        document.execCommand(
          "copy"
        );

    } catch (
      copyError
    ) {

      console.warn(
        "Copy failed:",
        copyError
      );
    }


    textarea.remove();
  }


  if (
    copied
  ) {

    unicodeScopeCode.textContent =
      "コピーしました ✓";

  } else {

    unicodeScopeCode.textContent =
      "コピー失敗";
  }


  setTimeout(
    () => {

      if (
        currentScopeCode ===
        code
      ) {

        unicodeScopeCode.textContent =
          code;
      }

    },
    900
  );
}

/* =========================================
   Native selection cleanup
========================================= */

function clearNativeSelection() {

  const selection =
    window.getSelection();


  if (
    selection
  ) {

    selection.removeAllRanges();
  }
}

/* Keep all editable fields and custom keyboard controls outside Scope.
 * The code-point digit cells are divs (not native inputs or buttons), so
 * excluding input and button tags alone is insufficient.
 * Normal text, including converter RESULTS, remains eligible.
 */
function isScopeInteractionArea(target) {
  return !!target?.closest?.(
    ".site-topbar, #dailyCharacter, " +
    ".unicode-single-tool, .unicode-bulk-section, .unicode-controls, " +
    "button, a, input, textarea, select, option, summary, label, " +
    "[role='button'], [contenteditable], [contenteditable='true']"
  );
}

/* =========================================
   Scope pointer detection
========================================= */

document.addEventListener(
  "pointerdown",
  (event) => {

    if (
      event.target.closest(
        "#unicodeScope"
      )
    ) {
      return;
    }


    hideUnicodeScope();

    // The entire shared header (including its padding and gaps) is outside
    // Unicode Scope. Do not start a tap from the header.
    if (isScopeInteractionArea(event.target)) {
      scopePointerStart = null;
      return;
    }

    scopePointerStart = {
      x:
        event.clientX,

      y:
        event.clientY,

      time:
        performance.now()
    };

  },
  {
    passive: true
  }
);


document.addEventListener(
  "pointerup",
  (event) => {

    if (
      event.target.closest(
        "#unicodeScope"
      )
    ) {
      return;
    }


    if (
      !scopePointerStart
    ) {
      return;
    }


    const start =
      scopePointerStart;


    scopePointerStart =
      null;

    // Also ignore a gesture ending in the header when it began below it.
    if (isScopeInteractionArea(event.target)) {
      return;
    }


    const movement =
      Math.hypot(
        event.clientX -
        start.x,

        event.clientY -
        start.y
      );


    const duration =
      performance.now() -
      start.time;


    /*
      長押しならブラウザ標準動作
    */

    if (
      duration >=
      scopeLongPressThreshold
    ) {
      return;
    }


    /*
      スクロール・スワイプ
    */

    if (
      movement >
      12
    ) {
      return;
    }


    const result =
      getCharacterFromPoint(
        event.clientX,
        event.clientY
      );


    if (
      !result
    ) {
      return;
    }


    clearNativeSelection();


    showUnicodeScope(
      result
    );

  },
  {
    passive: true
  }
);

/* =========================================
   Pointer cancel
========================================= */

document.addEventListener(
  "pointercancel",
  () => {

    scopePointerStart =
      null;

  },
  {
    passive: true
  }
);

/* =========================================
   Scope copy button
========================================= */

if (
  unicodeScopeCode
) {

  unicodeScopeCode.addEventListener(
    "pointerdown",
    (event) => {

      event.stopPropagation();

    }
  );


  unicodeScopeCode.addEventListener(
    "pointerup",
    (event) => {

      event.stopPropagation();

    }
  );


  unicodeScopeCode.addEventListener(
    "click",
    (event) => {

      event.stopPropagation();


      copyScopeCode();

    }
  );
}

/* =========================================
   Scope close conditions
========================================= */

window.addEventListener(
  "scroll",
  hideUnicodeScope,
  {
    passive: true
  }
);


window.addEventListener(
  "resize",
  hideUnicodeScope
);

// On iOS Safari pinch-zoom and pan operate on the visual viewport, which
// may change without a window scroll or resize event. Dismiss stale scopes
// until the next tap recomputes the correct geometry.
if (window.visualViewport) {
  window.visualViewport.addEventListener("scroll",hideUnicodeScope,{passive:true});
  window.visualViewport.addEventListener("resize",hideUnicodeScope,{passive:true});
}
