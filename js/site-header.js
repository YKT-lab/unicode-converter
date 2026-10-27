"use strict";
/*
 * Shared site header: centered logo, hamburger navigation, and display settings.
 * Existing HTML remains as a non-JavaScript fallback; this initializer normalizes it.
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
  logo.setAttribute("draggable", "false");
  const logoImage = logo.querySelector("img.site-logo");
  if (logoImage) {
    logoImage.alt = "文字 ⇄ Unicode";
    logoImage.draggable = false;
  }

  const menuItems = [
    ["", "トップページ"],
    ["about/", "Unicodeとは"],
    ["emoji/", "絵文字"],
    ["combining/", "結合文字メーカー"],
    ["unicode/", "Unicode一覧"],
    ["url-checker/", "URLチェッカー"],
    ["news/", "News"]
  ];

  const normalizePath = path => path.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
  const currentPath = normalizePath(window.location.pathname);

  navigation.classList.add("unicode-scope-excluded");
  navigation.setAttribute("aria-label", "サイト内メニュー");
  const fragment = document.createDocumentFragment();
  for (const [path, label] of menuItems) {
    const address = new URL(path, siteRoot);
    const link = document.createElement("a");
    link.href = address.href;
    link.textContent = label;
    if (
      normalizePath(address.pathname) === currentPath ||
      (path === "news/" && currentPath.startsWith(normalizePath(address.pathname)))
    ) {
      link.setAttribute("aria-current", "page");
    }
    fragment.append(link);
  }
  navigation.replaceChildren(fragment);

  const menuToggle = document.createElement("button");
  menuToggle.id = "siteMenuToggle";
  menuToggle.className = "site-menu-toggle";
  menuToggle.type = "button";
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-controls", "siteNavigation");
  menuToggle.setAttribute("aria-label", "メニューを開く");
  navigation.id = "siteNavigation";

  const menuIcon = document.createElement("span");
  menuIcon.className = "site-menu-icon";
  menuIcon.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) menuIcon.append(document.createElement("span"));
  menuToggle.append(menuIcon);
  header.prepend(menuToggle);

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
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("site-settings-icon");

    if (kind === "close") {
      const first = document.createElementNS(ns, "path");
      first.setAttribute("d", "M9 9 23 23");
      const second = document.createElementNS(ns, "path");
      second.setAttribute("d", "M23 9 9 23");
      svg.append(first, second);
      return svg;
    }

    // Original vector gear: generated in code; no image asset is used.
    const points = [];
    const rootRadius = 9.3;
    const outerRadius = 12.25;
    const offsets = [
      [-22.5, rootRadius],
      [-13.5, rootRadius],
      [-8.0, outerRadius],
      [8.0, outerRadius],
      [13.5, rootRadius],
      [22.5, rootRadius]
    ];
    for (let tooth = 0; tooth < 8; tooth++) {
      const centerAngle = -90 + tooth * 45;
      for (const [offset, radius] of offsets) {
        const radians = (centerAngle + offset) * Math.PI / 180;
        points.push(
          (16 + Math.cos(radians) * radius).toFixed(2) + "," +
          (16 + Math.sin(radians) * radius).toFixed(2)
        );
      }
    }
    const gear = document.createElementNS(ns, "polygon");
    gear.setAttribute("points", points.join(" "));
    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "16");
    ring.setAttribute("cy", "16");
    ring.setAttribute("r", "4.15");
    svg.append(gear, ring);
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
  const headingMain = document.createElement("span");
  headingMain.textContent = "表示設定";
  const headingSub = document.createElement("span");
  headingSub.textContent = "DISPLAY";
  heading.append(headingMain, headingSub);

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

  function setMenuOpen(open) {
    const next = Boolean(open);
    bar.classList.toggle("menu-open", next);
    menuToggle.setAttribute("aria-expanded", String(next));
    menuToggle.setAttribute("aria-label", next ? "メニューを閉じる" : "メニューを開く");
    navigation.setAttribute("aria-hidden", String(!next));
    navigation.querySelectorAll("a").forEach(link => {
      link.tabIndex = next ? 0 : -1;
    });
  }

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

  bar.classList.add("site-menu-ready");
  setMenuOpen(false);
  setSettingsOpen(false);

  menuToggle.addEventListener("click", event => {
    event.stopPropagation();
    const opening = menuToggle.getAttribute("aria-expanded") !== "true";
    if (opening) setSettingsOpen(false);
    setMenuOpen(opening);
  });

  settingsToggle.addEventListener("click", event => {
    event.stopPropagation();
    const opening = settingsToggle.getAttribute("aria-expanded") !== "true";
    if (opening) setMenuOpen(false);
    setSettingsOpen(opening);
  });

  navigation.addEventListener("click", event => {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  document.addEventListener("click", event => {
    if (!bar.contains(event.target)) {
      setMenuOpen(false);
      setSettingsOpen(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (settingsToggle.getAttribute("aria-expanded") === "true") {
      setSettingsOpen(false);
      settingsToggle.focus();
      return;
    }
    if (menuToggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });

  const adjust = () => {
    const height = Math.ceil(header.getBoundingClientRect().height + 16);
    if (height > 0) document.documentElement.style.setProperty("--site-topbar-height", height + "px");
  };
  adjust();
  window.addEventListener("resize", adjust, {passive: true});
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(adjust);
    observer.observe(header);
  }
})();