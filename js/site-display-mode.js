"use strict";
/*
 * Site-wide device-font mode.
 *
 * This is intentionally stronger than the converter's ordinary font fallback:
 * when enabled, every textual element on every page is handed to the browser
 * with a generic sans-serif family, while site-specific Unicode fonts and
 * generated glyph SVGs are bypassed by the feature scripts that support them.
 */
(function(root) {
  const STORAGE_KEY = "unicode-converter-device-font-mode";
  const LEGACY_DISPLAY_KEY = "unicode-converter-svg-display";
  const ROOT_CLASS = "site-device-font-mode";
  const STYLE_ID = "site-device-font-policy";

  function storageGet(storage, key) {
    try { return storage?.getItem(key) ?? null; }
    catch (_error) { return null; }
  }
  function storageSet(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  let enabled = storageGet(root.localStorage, STORAGE_KEY) === "on";

  // Migrate the first implementation, which stored "browser" only in the
  // current tab's converter display-mode key.
  if (!enabled && storageGet(root.sessionStorage, LEGACY_DISPLAY_KEY) === "browser") {
    enabled = true;
    storageSet(root.localStorage, STORAGE_KEY, "on");
    storageSet(root.sessionStorage, LEGACY_DISPLAY_KEY, "normal");
  }

  function ensurePolicyStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
html.${ROOT_CLASS} body,
html.${ROOT_CLASS} body *,
html.${ROOT_CLASS} body *::before,
html.${ROOT_CLASS} body *::after {
  font-family: sans-serif !important;
  font-variant-emoji: normal !important;
}
`;
    document.head.appendChild(style);
  }

  function apply() {
    ensurePolicyStyle();
    document.documentElement.classList.toggle(ROOT_CLASS, enabled);
  }

  function notify() {
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("unicode-site-device-font-change", {
      detail: {enabled}
    }));
  }

  function setEnabled(next) {
    const value = Boolean(next);
    if (value === enabled) {
      apply();
      return enabled;
    }
    enabled = value;
    storageSet(root.localStorage, STORAGE_KEY, enabled ? "on" : "off");
    apply();
    notify();
    return enabled;
  }

  function isEnabled() { return enabled; }

  apply();

  root.UnicodeSiteDisplay = Object.freeze({
    storageKey: STORAGE_KEY,
    rootClass: ROOT_CLASS,
    isDeviceFontModeEnabled: isEnabled,
    isBrowserFontModeEnabled: isEnabled,
    setDeviceFontModeEnabled: setEnabled,
    setBrowserFontModeEnabled: setEnabled
  });
})(window);
