(function () {
  const configNode = document.querySelector("[data-post-views-config]");
  if (!configNode) return;

  const namespace = configNode.getAttribute("data-namespace");
  if (!namespace) return;

  const counterPrefix = configNode.getAttribute("data-counter-prefix") || "pv";
  const timeZone = configNode.getAttribute("data-timezone") || "Asia/Seoul";
  const pathPrefix = configNode.getAttribute("data-path-prefix") || "/";
  const baseUrl = "https://api.counterapi.dev/v1";

  const storage = (() => {
    try {
      const testKey = "__post_views_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const formatCount = (value) => toNumber(value).toLocaleString("ko-KR");

  const buildDateKey = (zone) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  };

  const normalizePostKey = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\/+/, "/").replace(/\/+/g, "/");
  };

  const normalizePathPrefix = (value) => {
    if (typeof value !== "string") return "/";
    const trimmed = value.trim();
    if (!trimmed || trimmed === "/") return "/";
    const noTrailing = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
  };

  const toBase64UrlUtf8 = (value) => {
    if (typeof value !== "string" || !value) return "";
    try {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch {
      return "";
    }
  };

  const normalizedPathPrefix = normalizePathPrefix(pathPrefix);

  const applyPathPrefix = (value) => {
    if (typeof value !== "string" || !value) return normalizedPathPrefix === "/" ? "/" : `${normalizedPathPrefix}/`;
    const normalized = value.startsWith("/") ? value : `/${value}`;
    if (normalizedPathPrefix === "/") return normalized;
    if (normalized === normalizedPathPrefix || normalized.startsWith(`${normalizedPathPrefix}/`)) {
      return normalized;
    }
    if (normalized === "/") return `${normalizedPathPrefix}/`;
    return `${normalizedPathPrefix}${normalized}`;
  };

  const setText = (el, value) => {
    if (el) el.textContent = value;
  };

  const fallbackSeedText = (seed) => (seed > 0 ? formatCount(seed) : "—");

  const counterKeyFor = (postKey) => {
    const normalized = normalizePostKey(postKey);
    const encoded = toBase64UrlUtf8(normalized);
    if (!encoded) return "";
    return `${counterPrefix}:v2:${encoded}`;
  };

  const urlFor = (counterKey, action) => {
    const ns = encodeURIComponent(namespace);
    const key = encodeURIComponent(counterKey);
    if (action === "up") return `${baseUrl}/${ns}/${key}/up`;
    return `${baseUrl}/${ns}/${key}/`;
  };

  const fetchCount = async (counterKey, action) => {
    const res = await fetch(urlFor(counterKey, action), { cache: "no-store" });
    if (!res.ok) {
      if (action === "get") return 0;
      throw new Error(`CounterAPI ${action} failed (${res.status})`);
    }
    const data = await res.json();
    return typeof data?.count === "number" ? data.count : 0;
  };

  const dateKey = buildDateKey(timeZone);

  const renderPostViewTrackers = async () => {
    const trackers = document.querySelectorAll("[data-post-view-track]");
    if (!trackers.length) return;

    await Promise.all(
      [...trackers].map(async (node) => {
        const postKey = normalizePostKey(node.getAttribute("data-post-key"));
        const seed = toNumber(node.getAttribute("data-post-seed"), 0);
        const targetId = node.getAttribute("data-post-view-target");
        const targetEl = targetId ? document.getElementById(targetId) : null;

        if (!postKey) {
          setText(targetEl, fallbackSeedText(seed));
          return;
        }
        const counterKey = counterKeyFor(postKey);
        if (!counterKey) {
          setText(targetEl, fallbackSeedText(seed));
          return;
        }

        const dedupeKey = `postViews:counted:${postKey}:${dateKey}`;
        const hasCountedToday = storage ? storage.getItem(dedupeKey) === "1" : false;
        const action = hasCountedToday ? "get" : "up";

        try {
          const runtime = await fetchCount(counterKey, action);
          if (storage && action === "up" && !hasCountedToday) {
            storage.setItem(dedupeKey, "1");
          }
          const effective = seed + runtime;
          setText(targetEl, formatCount(effective));
          node.setAttribute("data-post-view-effective", String(effective));
        } catch {
          setText(targetEl, fallbackSeedText(seed));
        }
      })
    );
  };

  const parseCandidates = (brand) => {
    if (!brand) return null;
    const script = document.querySelector(`script[data-popular-candidates="${brand}"]`);
    if (!script) return null;

    try {
      const payload = JSON.parse(script.textContent || "[]");
      return Array.isArray(payload) ? payload : null;
    } catch {
      return null;
    }
  };

  const renderPopularLists = async () => {
    const lists = document.querySelectorAll("[data-popular-list][data-popular-brand]");
    if (!lists.length) return;

    await Promise.all(
      [...lists].map(async (listNode) => {
        const brand = listNode.getAttribute("data-popular-brand");
        const candidates = parseCandidates(brand);
        if (!candidates || !candidates.length) return;

        const scored = await Promise.all(
          candidates.map(async (candidate) => {
            const postKey = normalizePostKey(candidate?.postKey || candidate?.url || "");
            const seed = toNumber(candidate?.seedViews, 0);
            const dateMs = toNumber(candidate?.dateMs, 0);
            const title = typeof candidate?.title === "string" ? candidate.title : "";
            const url = typeof candidate?.url === "string" ? candidate.url : "";

            if (!postKey || !url || !title) {
              return { title, url, effective: seed, dateMs };
            }

            const counterKey = counterKeyFor(postKey);
            if (!counterKey) {
              return { title, url, dateMs, effective: seed };
            }
            const runtime = await fetchCount(counterKey, "get").catch(() => 0);
            return {
              title,
              url,
              dateMs,
              effective: seed + runtime,
            };
          })
        );

        const ranked = scored
          .filter((item) => item.url && item.title)
          .sort((a, b) => b.effective - a.effective || b.dateMs - a.dateMs)
          .slice(0, 5);

        if (!ranked.length) return;

        listNode.innerHTML = "";
        ranked.forEach((item) => {
          const li = document.createElement("li");
          const link = document.createElement("a");
          link.href = applyPathPrefix(item.url);
          link.textContent = item.title;
          li.appendChild(link);
          listNode.appendChild(li);
        });
      })
    );
  };

  renderPostViewTrackers();
  renderPopularLists();
})();
