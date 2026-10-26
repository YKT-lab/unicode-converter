"use strict";
/*
 * One canonical header for every route.
 * Existing HTML provides accessible non-JavaScript fallback markup;
 * the shared initializer normalizes it on every page.
 */
(function () {
  const bar = document.querySelector(".site-topbar");
  if (!bar) return;

  const header = bar.querySelector(".site-header");
  const logo = bar.querySelector(".site-logo-link");
  const navigation = bar.querySelector(".site-nav");
  if (!header || !logo || !navigation) return;

  const siteRoot = new URL(logo.getAttribute("href") || "./", window.location.href);
  logo.href = siteRoot.href;
  logo.setAttribute("aria-label", "トップページへ");
  const logoImage = logo.querySelector("img.site-logo");
  if (logoImage) logoImage.alt = "文字 ⇄ Unicode";

  const menu = [
    ["", "トップページ"],
    ["about/", "Unicodeとは"],
    ["emoji/", "絵文字"],
    ["combining/", "結合文字メーカー"],
    ["unicode/", "Unicode一覧"],
    ["news/", "News"]
  ];
  const normalizePath = path => path.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
  const currentPath = normalizePath(window.location.pathname);

  navigation.classList.add("unicode-scope-excluded");
  navigation.setAttribute("aria-label", "サイト内メニュー");
  const fragment = document.createDocumentFragment();
  for (const [path, label] of menu) {
    const address = new URL(path, siteRoot);
    const link = document.createElement("a");
    link.href = address.href;
    link.textContent = label;
    if (normalizePath(address.pathname) === currentPath || (path === "news/" && currentPath.startsWith(normalizePath(address.pathname)))) {
      link.setAttribute("aria-current", "page");
    }
    fragment.append(link);
  }
  navigation.replaceChildren(fragment);

  // One compact settings entry point on every route. The actual state owners
  // remain UnicodeSiteDisplay (device font) and scope.js (Unicode Scope).
  const existingQuickModes = document.querySelector(".home-quick-modes");
  const settings = document.createElement("div");
  settings.className = "site-settings unicode-scope-excluded";

  const settingsToggle = document.createElement("button");
  settingsToggle.id = "siteSettingsToggle";
  settingsToggle.className = "site-settings-toggle";
  settingsToggle.type = "button";
  settingsToggle.setAttribute("aria-expanded", "false");
  settingsToggle.setAttribute("aria-controls", "siteSettingsPanel");
  settingsToggle.setAttribute("aria-label", "表示設定を開く");
  settingsToggle.title = "表示設定";

  function settingsIcon(kind) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("site-settings-icon");

    if (kind === "close") {
      const first = document.createElementNS(ns, "path");
      first.setAttribute("d", "M6.5 6.5 17.5 17.5");
      const second = document.createElementNS(ns, "path");
      second.setAttribute("d", "M17.5 6.5 6.5 17.5");
      svg.append(first, second);
      return svg;
    }

    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "12");
    ring.setAttribute("cy", "12");
    ring.setAttribute("r", "3.15");
    svg.append(ring);
    for (let angle = 0; angle < 360; angle += 45) {
      const spoke = document.createElementNS(ns, "path");
      spoke.setAttribute("d", "M12 3.3v2.25");
      spoke.setAttribute("transform", "rotate(" + angle + " 12 12)");
      svg.append(spoke);
    }
    return svg;
  }

  function renderSettingsIcon(open) {
    settingsToggle.replaceChildren(settingsIcon(open ? "close" : "settings"));
  }
  renderSettingsIcon(false);

  const panel = document.createElement("div");
  panel.id = "siteSettingsPanel";
  panel.className = "site-settings-panel";
  panel.setAttribute("aria-hidden", "true");

  const heading = document.createElement("div");
  heading.className = "site-settings-heading";
  heading.textContent = "表示設定";

  function settingButton(id, label, title) {
    const existing = document.getElementById(id);
    const button = existing || document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "site-settings-option";
    button.textContent = label;
    button.title = title;
    if (!button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", "false");
    return button;
  }

  const deviceFont = settingButton(
    "browserFontModeToggle",
    "端末フォント",
    "サイト内のすべての文字表示を端末・ブラウザに任せる"
  );
  const scopeOff = settingButton(
    "scopeModeToggle",
    "Scope OFF",
    "Unicode Scopeを無効にする"
  );

  const refreshDeviceFont = () => {
    const enabled = Boolean(window.UnicodeSiteDisplay?.isDeviceFontModeEnabled?.());
    deviceFont.setAttribute("aria-pressed", String(enabled));
  };
  refreshDeviceFont();

  deviceFont.addEventListener("click", () => {
    const display = window.UnicodeSiteDisplay;
    if (!display?.setDeviceFontModeEnabled) return;
    display.setDeviceFontModeEnabled(!display.isDeviceFontModeEnabled());
    refreshDeviceFont();
  });
  window.addEventListener("unicode-site-device-font-change", refreshDeviceFont);

  panel.append(heading, deviceFont, scopeOff);
  settings.append(settingsToggle, panel);
  header.append(settings);
  existingQuickModes?.remove();

  function setSettingsOpen(open) {
    const next = Boolean(open);
    settingsToggle.setAttribute("aria-expanded", String(next));
    settingsToggle.setAttribute("aria-label", next ? "表示設定を閉じる" : "表示設定を開く");
    settingsToggle.title = next ? "閉じる" : "表示設定";
    panel.setAttribute("aria-hidden", String(!next));
    deviceFont.tabIndex = next ? 0 : -1;
    scopeOff.tabIndex = next ? 0 : -1;
    renderSettingsIcon(next);
    settings.classList.toggle("open", next);
  }
  setSettingsOpen(false);

  settingsToggle.addEventListener("click", event => {
    event.stopPropagation();
    setSettingsOpen(settingsToggle.getAttribute("aria-expanded") !== "true");
  });
  panel.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", event => {
    if (settingsToggle.getAttribute("aria-expanded") === "true" && !settings.contains(event.target))
      setSettingsOpen(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || settingsToggle.getAttribute("aria-expanded") !== "true") return;
    setSettingsOpen(false);
    settingsToggle.focus();
  });

  // Avoid obscuring the page with the fixed bar, on desktop and mobile.
  const adjust = () => {
    const height = Math.ceil(bar.getBoundingClientRect().height);
    if (height > 0) {
      document.documentElement.style.setProperty("--site-topbar-height", height + "px");
    }
  };
  adjust();
  window.addEventListener("resize", adjust, {passive: true});
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(adjust);
    observer.observe(bar);
  }
})();
