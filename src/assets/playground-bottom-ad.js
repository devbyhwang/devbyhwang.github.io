(function () {
  const BANNER_ID = "playground-bottom-ad-banner";
  const ROOT_FLAG = "playgroundBottomAdMounted";
  const SCRIPT_SELECTOR = 'script[src*="playground-bottom-ad.js"]';
  const CSS_ID = "playground-bottom-ad-css";
  const BODY_ACTIVE_CLASS = "playground-ad-active";
  const DEMO_ACTIVE_CLASS = "playground-ad-demo";
  const SAFE_SPACE_VAR = "--playground-ad-safe-space";
  const SAFE_SPACE_EXTRA = 8;
  const FALLBACK_TEXT = "광고 영역 · Google AdSense 설정 후 활성화됩니다.";

  if (document.body && document.body.dataset && document.body.dataset[ROOT_FLAG] === "1") {
    return;
  }
  if (document.getElementById(BANNER_ID)) return;

  const hasPlaygroundMarker = Boolean(document.querySelector("[data-playground-page]"));
  const pathname = window.location.pathname || "";
  const isPlaygroundDemoPath = /\/devbyhwang\/playground\/[^/]+(\/|$)/.test(pathname);
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
  const cssUrl = new URL("playground-bottom-ad.css", scriptUrl).toString();

  const ensureAdStyles = function () {
    return new Promise(function (resolve) {
      const existing = document.getElementById(CSS_ID);
      if (existing) {
        resolve();
        return;
      }
      const link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = cssUrl;
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true });
      document.head.appendChild(link);
    });
  };

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

  const setBannerMounted = function (isMounted) {
    if (!document.body || !document.body.dataset) return;
    document.body.dataset[ROOT_FLAG] = isMounted ? "1" : "0";
    document.body.classList.toggle(BODY_ACTIVE_CLASS, isMounted);
  };

  const setDemoCompensation = function (isEnabled) {
    const root = document.documentElement;
    if (root) {
      root.classList.toggle(DEMO_ACTIVE_CLASS, isEnabled);
    }
    if (document.body) {
      document.body.classList.toggle(DEMO_ACTIVE_CLASS, isEnabled);
    }
  };

  const setSafeSpace = function (value) {
    const root = document.documentElement;
    if (!root) return;
    if (Number.isFinite(value) && value > 0) {
      root.style.setProperty(SAFE_SPACE_VAR, Math.ceil(value) + "px");
      return;
    }
    root.style.setProperty(SAFE_SPACE_VAR, "0px");
  };

  const updateSafeSpace = function (banner) {
    if (!banner) {
      setSafeSpace(0);
      return;
    }
    const rect = banner.getBoundingClientRect();
    const safeSpace = Math.max(0, rect.height + SAFE_SPACE_EXTRA);
    setSafeSpace(safeSpace);
  };

  const appendFallback = function (container, text) {
    container.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.className = "playground-ad-placeholder";
    fallback.textContent = text || FALLBACK_TEXT;
    container.appendChild(fallback);
  };

  const mountBanner = function (config) {
    if (document.getElementById(BANNER_ID)) return;
    if (!document.body) return;

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.className = "playground-ad-shell playground-ad-fixed";
    banner.setAttribute("role", "complementary");
    banner.setAttribute("aria-label", "Advertisement");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "playground-ad-close";
    closeButton.setAttribute("aria-label", "Close advertisement");
    closeButton.textContent = "×";
    let bannerResizeObserver = null;
    const handleViewportChange = function () {
      updateSafeSpace(banner);
    };
    const teardownBanner = function () {
      banner.remove();
      setBannerMounted(false);
      setSafeSpace(0);
      setDemoCompensation(false);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      if (bannerResizeObserver) {
        bannerResizeObserver.disconnect();
      }
    };
    closeButton.addEventListener("click", teardownBanner);

    const content = document.createElement("div");
    content.className = "playground-ad-content";

    banner.appendChild(closeButton);
    banner.appendChild(content);
    document.body.appendChild(banner);
    setBannerMounted(true);
    setDemoCompensation(isPlaygroundDemoPath);
    updateSafeSpace(banner);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    if (typeof ResizeObserver !== "undefined") {
      bannerResizeObserver = new ResizeObserver(function () {
        updateSafeSpace(banner);
      });
      bannerResizeObserver.observe(banner);
    }

    const slot = config && typeof config.slot === "string" ? config.slot.trim() : "";
    const hasValidSlot = Boolean(slot) && slot !== "0000000000";

    if (config && config.shouldServeAds && config.client && hasValidSlot) {
      const adSlot = document.createElement("ins");
      adSlot.className = "adsbygoogle";
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
            appendFallback(content, "광고 영역");
          }
        })
        .catch(function () {
          appendFallback(content, "광고 영역");
        });
      return;
    }

    appendFallback(content, FALLBACK_TEXT);
  };

  ensureAdStyles()
    .then(function () {
      return fetch(configUrl, { credentials: "same-origin" });
    })
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
