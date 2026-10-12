"use strict";
/*
 * One canonical header for every route.
 * Existing HTML provides accessible non-JavaScript fallback markup;
 * the shared initializer normalizes it on all five pages.
 */
(function () {
  const bar = document.querySelector(".site-topbar");
  if (!bar) return;

  const logo = bar.querySelector(".site-logo-link");
  const navigation = bar.querySelector(".site-nav");
  if (!logo || !navigation) return;

  const siteRoot = new URL(logo.getAttribute("href") || "./", window.location.href);
  logo.href = siteRoot.href;
  logo.setAttribute("aria-label", "トップページへ");
  const logoImage = logo.querySelector("img.site-logo");
  if (logoImage) logoImage.alt = "文字 ⇄ Unicode";

  const menu = [
    ["", "トップページ"],
    ["about/", "Unicodeとは"],
    ["emoji/", "絵文字"],
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
