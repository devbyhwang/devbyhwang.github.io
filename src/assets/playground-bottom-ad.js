(function () {
  const BANNER_ID = "playground-bottom-ad-banner";
  const ROOT_FLAG = "playgroundBottomAdMounted";
  const SCRIPT_SELECTOR = 'script[src*="playground-bottom-ad.js"]';

  if (document.body && document.body.dataset && document.body.dataset[ROOT_FLAG] === "1") {
    return;
  }
  if (document.getElementById(BANNER_ID)) return;

  const hasPlaygroundMarker = Boolean(document.querySelector("[data-playground-page]"));
  const pathname = window.location.pathname || "";
  const isPlaygroundDemoPath = /\/playground(\/|$)/.test(pathname) && !/\/devbyhwang\/playground(\/|$)/.test(pathname);
  if (!hasPlaygroundMarker && !isPlaygroundDemoPath) return;

  const getScriptUrl = function () {
    if (document.currentScript && document.currentScript.src) {
      return new URL(document.currentScript.src, window.location.href);
    }
    const loadedScript = document.querySelector(SCRIPT_SELECTOR);
    if (loadedScript && loadedScript.src) {
      return new URL(loadedScript.src, window.location.href);
    }
    return new URL("/assets/playground-bottom-ad.js", window.location.origin);
  };

  const scriptUrl = getScriptUrl();
  const configUrl = new URL("playground-ad-config.json", scriptUrl).toString();

  const ensureAdScript = function (client) {
    return new Promise(function (resolve, reject) {
      if (!client) {
        reject(new Error("Missing Google Ads client."));
        return;
      }
      const existing = document.querySelector('script[src*="pagead/js/adsbygoogle.js"]');
      if (existing) {
        if (existing.dataset.playgroundAdReady === "1" || typeof window.adsbygoogle !== "undefined") {
          existing.dataset.playgroundAdReady = "1";
          resolve();
        } else {
          existing.addEventListener(
            "load",
            function () {
              existing.dataset.playgroundAdReady = "1";
              resolve();
            },
            { once: true }
          );
          existing.addEventListener(
            "error",
            function () {
              reject(new Error("Google Ads script failed to load."));
            },
            { once: true }
          );
        }
        return;
      }

      const adScript = document.createElement("script");
      adScript.async = true;
      adScript.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
      adScript.crossOrigin = "anonymous";
      adScript.addEventListener(
        "load",
        function () {
          adScript.dataset.playgroundAdReady = "1";
          resolve();
        },
        { once: true }
      );
      adScript.addEventListener(
        "error",
        function () {
          reject(new Error("Google Ads script failed to load."));
        },
        { once: true }
      );
      document.head.appendChild(adScript);
    });
  };

  const mountBanner = function (config) {
    if (document.getElementById(BANNER_ID)) return;

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "complementary");
    banner.setAttribute("aria-label", "Advertisement");
    banner.style.position = "fixed";
    banner.style.left = "0";
    banner.style.right = "0";
    banner.style.bottom = "0";
    banner.style.zIndex = "2147483000";
    banner.style.display = "block";
    banner.style.padding = "8px 48px 8px 12px";
    banner.style.borderTop = "1px solid rgba(0, 0, 0, 0.2)";
    banner.style.background = "rgba(18, 18, 18, 0.94)";
    banner.style.backdropFilter = "blur(4px)";
    banner.style.minHeight = "64px";
    banner.style.boxShadow = "0 -10px 24px rgba(0, 0, 0, 0.28)";
    banner.style.color = "#f3f3f3";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close advertisement");
    closeButton.textContent = "×";
    closeButton.style.position = "absolute";
    closeButton.style.top = "8px";
    closeButton.style.right = "10px";
    closeButton.style.width = "28px";
    closeButton.style.height = "28px";
    closeButton.style.border = "1px solid rgba(255, 255, 255, 0.4)";
    closeButton.style.borderRadius = "999px";
    closeButton.style.background = "rgba(0, 0, 0, 0.4)";
    closeButton.style.color = "#fff";
    closeButton.style.fontSize = "18px";
    closeButton.style.lineHeight = "1";
    closeButton.style.cursor = "pointer";
    closeButton.addEventListener("click", function () {
      banner.remove();
      if (document.body && document.body.dataset) {
        document.body.dataset[ROOT_FLAG] = "0";
      }
    });

    const content = document.createElement("div");
    content.style.minHeight = "50px";
    content.style.width = "100%";
    content.style.display = "flex";
    content.style.alignItems = "center";
    content.style.justifyContent = "center";

    banner.appendChild(closeButton);
    banner.appendChild(content);
    document.body.appendChild(banner);

    if (document.body && document.body.dataset) {
      document.body.dataset[ROOT_FLAG] = "1";
    }

    const slot = config && typeof config.slot === "string" ? config.slot.trim() : "";
    const hasValidSlot = Boolean(slot) && slot !== "0000000000";

    if (config && config.shouldServeAds && config.client && hasValidSlot) {
      const adSlot = document.createElement("ins");
      adSlot.className = "adsbygoogle";
      adSlot.style.display = "block";
      adSlot.style.width = "100%";
      adSlot.style.minHeight = "50px";
      adSlot.setAttribute("data-ad-client", config.client);
      adSlot.setAttribute("data-ad-slot", slot);
      adSlot.setAttribute("data-ad-format", "horizontal");
      adSlot.setAttribute("data-full-width-responsive", "true");
      content.appendChild(adSlot);

      ensureAdScript(config.client)
        .then(function () {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            adSlot.dataset.adsInitialized = "1";
          } catch {
            content.innerHTML = "";
            const fallback = document.createElement("div");
            fallback.textContent = "광고 영역";
            fallback.style.fontSize = "13px";
            fallback.style.color = "#d0d0d0";
            content.appendChild(fallback);
          }
        })
        .catch(function () {
          content.innerHTML = "";
          const fallback = document.createElement("div");
          fallback.textContent = "광고 영역";
          fallback.style.fontSize = "13px";
          fallback.style.color = "#d0d0d0";
          content.appendChild(fallback);
        });
      return;
    }

    const placeholder = document.createElement("div");
    placeholder.textContent = "광고 영역 · Google AdSense 설정 후 활성화됩니다.";
    placeholder.style.fontSize = "13px";
    placeholder.style.color = "#d0d0d0";
    content.appendChild(placeholder);
  };

  fetch(configUrl, { credentials: "same-origin" })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load ad config.");
      return res.json();
    })
    .then(function (config) {
      mountBanner(config || {});
    })
    .catch(function () {
      mountBanner({
        shouldServeAds: false,
      });
    });
})();
