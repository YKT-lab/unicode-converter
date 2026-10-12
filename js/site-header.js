"use strict";
/* Keep content below the fixed header at any font size or viewport width. */
(function () {
  const bar = document.querySelector(".site-topbar");
  if (!bar) return;
  const adjust = () => {
    const height = Math.ceil(bar.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--site-topbar-height", height + "px");
  };
  adjust();
  window.addEventListener("resize", adjust, {passive:true});
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(adjust);
    observer.observe(bar);
  }
})();
