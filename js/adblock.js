(function () {
  // Intercepta requests YouTube
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function getUrlFromFetchArgs(args) {
    const input = args && args[0];
    if (!input) return "";
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url || "";
    if (input && typeof input.url === "string") return input.url;
    return String(input);
  }

  function shouldBlock(url) {
    if (!url) return false;
    // Bloqueios específicos para endpoints de ads/telemetria de ads
    return (
      url.includes("youtube.com/api/stats/ads") ||
      url.includes("doubleclick.net") ||
      url.includes("googlesyndication.com")
    );
  }

  if (originalFetch) {
    window.fetch = function (...args) {
      const url = getUrlFromFetchArgs(args);

      if (shouldBlock(url)) {
        return Promise.resolve(
          new Response("", {
            status: 204,
            statusText: "No Content",
            headers: { "content-type": "text/plain" }
          })
        );
      }

      return originalFetch(...args);
    };
  }

  // MutationObserver menos agressivo
  function startObserver() {
    const root = document.body || document.documentElement;
    if (!root) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== 1) continue;

          // Remove apenas seletores específicos
          if (node.matches && node.matches(".ytp-ad-module, .video-ads, ytd-ad-slot-renderer")) {
            node.remove();
            continue;
          }

          if (node.querySelector) {
            const adNode = node.querySelector(".ytp-ad-module, .video-ads, ytd-ad-slot-renderer");
            if (adNode) adNode.remove();
          }
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  const style = document.createElement("style");
  style.textContent = `
    .ytp-ad-module, .video-ads, ytd-ad-slot-renderer, [data-layer="8"] { display: none !important; }
    .ytp-ad-skip-button { visibility: hidden !important; }
  `;
  document.head.appendChild(style);

  // CSS rules anti-ads
  const style2 = document.createElement('style');
  style2.textContent = `
    .ytp-ad-module, .ad-showing, .video-ads, [data-layer="8"] { display: none !important; }
    ytd-ad-slot-renderer, .ytp-ad-skip-button { visibility: hidden !important; }
  `;
  document.head.appendChild(style2);
})();
