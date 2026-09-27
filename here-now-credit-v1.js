/* Keep authored credits; the fallback serves demos without their own chrome. */
(() => {
  const script = document.currentScript;
  const mark = new URL("here-now-mark-ede45bce.svg", script.src).href;
  const selector = 'a[href="https://here.now/r/signals"]';
  let scheduled = false;
  function positionFallback() {
    scheduled = false;
    const credit = document.getElementById("hn-host-credit");
    if (!credit) return;
    const box = credit.getBoundingClientRect();
    const controls = [...document.querySelectorAll('button, input, select, textarea, a, [role="button"]')]
      .filter(e => e !== credit && !credit.contains(e) && getComputedStyle(e).visibility !== "hidden")
      .map(e => e.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0 && r.width < innerWidth * .9 && r.height < innerHeight * .6);
    // Prefer the existing lower-right placement; move clear of game toolbars.
    const candidates = [
      ...[10, 64, 118].map(gap => ({ right: 12, bottom: gap })),
      ...[10, 64, 118].map(gap => ({ left: 12, bottom: gap })),
      { right: 12, top: 12 }, { left: 12, top: 12 },
    ];
    function collisions(pos) {
      const x = pos.left ?? innerWidth - pos.right - box.width;
      const y = pos.top ?? innerHeight - pos.bottom - box.height;
      return controls.reduce((sum, r) => sum + Math.max(0, Math.min(x + box.width + 6, r.right) - Math.max(x - 6, r.left)) * Math.max(0, Math.min(y + box.height + 6, r.bottom) - Math.max(y - 6, r.top)), 0);
    }
    const chosen = candidates.reduce((best, pos) => collisions(pos) < collisions(best) ? pos : best);
    for (const side of ["left", "right", "top", "bottom"]) {
      credit.style[side] = side in chosen ? `max(${chosen[side]}px, env(safe-area-inset-${side}))` : "auto";
    }
  }
  function schedulePosition() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(positionFallback); }
  }
  function refresh() {
    const authored = [...document.querySelectorAll(selector)].filter(a => a.id !== "hn-host-credit");
    let fallback = document.getElementById("hn-host-credit");
    if (authored.length && fallback) { fallback.remove(); fallback = null; }
    if (!authored.length && !fallback) {
      fallback = document.createElement("a");
      fallback.id = "hn-host-credit";
      fallback.className = "hn-host-credit";
      fallback.href = "https://here.now/r/signals";
      fallback.innerHTML = '<img alt="" aria-hidden="true" width="28" height="28"><span><small>Hosted by</small><strong>here.now</strong></span>';
      document.body.append(fallback);
    }
    for (const credit of document.querySelectorAll(selector)) {
      credit.target = "_blank";
      credit.rel = "noopener noreferrer";
      credit.setAttribute("aria-label", "Hosted by here.now");
      credit.setAttribute("data-here-now-credit", "");
      const icon = credit.querySelector("img");
      if (icon) { icon.src = mark; icon.alt = ""; icon.setAttribute("aria-hidden", "true"); }
    }
    schedulePosition();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  window.addEventListener("load", refresh, { once: true });
  window.addEventListener("resize", schedulePosition, { passive: true });
  document.addEventListener("click", schedulePosition, { passive: true });
  document.addEventListener("keyup", schedulePosition, { passive: true });
})();
