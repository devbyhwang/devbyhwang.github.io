(function () {
  const configs = document.querySelectorAll("[data-visitor-counter]");
  if (!configs.length) return;

  const storage = (() => {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  const baseUrl = "https://api.counterapi.dev/v1";
  const fmt = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "—";
  };

  const setText = (el, value) => {
    if (el) el.textContent = value;
  };

  const isLocalHost = (hostname) =>
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  const buildDateKey = (timeZone) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
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

  configs.forEach((node) => {
    const namespace = node.getAttribute("data-namespace");
    if (!namespace) return;

    const allowLocal = node.getAttribute("data-allow-local") === "true";
    const hostname = window.location.hostname;
    if (isLocalHost(hostname) && !allowLocal) return;

    const totalKey = node.getAttribute("data-total-key") || "total";
    const dailyPrefix = node.getAttribute("data-daily-prefix") || "daily";
    const timeZone = node.getAttribute("data-timezone") || "Asia/Seoul";

    const todayIdAttr = node.getAttribute("data-today-id");
    const totalIdAttr = node.getAttribute("data-total-id");
    const todayId = todayIdAttr === null ? "visitor-today" : todayIdAttr;
    const totalId = totalIdAttr === null ? "visitor-total" : totalIdAttr;
    const todayEl = todayId ? document.getElementById(todayId) : null;
    const totalEl = totalId ? document.getElementById(totalId) : null;
    const hasUI = Boolean(todayEl || totalEl);

    const dateKey = buildDateKey(timeZone);
    const dailyKey = `${dailyPrefix}-${dateKey}`;
    const countedKey = `visitorCounter:${namespace}:lastCountedDate`;
    const hasCountedToday = storage ? storage.getItem(countedKey) === dateKey : false;
    const mode = node.getAttribute("data-mode");
    const readOnly = mode === "read" || node.getAttribute("data-readonly") === "true";

    if (!hasUI && hasCountedToday && !readOnly) return;

    const urlFor = (counter, action) => {
      const ns = encodeURIComponent(namespace);
      const key = encodeURIComponent(counter);
      if (action === "up") return `${baseUrl}/${ns}/${key}/up`;
      return `${baseUrl}/${ns}/${key}/`;
    };

    const fetchCount = async (counter, action) => {
      const res = await fetch(urlFor(counter, action), { cache: "no-store" });
      if (!res.ok) {
        if (action === "get") return 0;
        throw new Error(`CounterAPI ${action} failed (${res.status})`);
      }
      const data = await res.json();
      return typeof data?.count === "number" ? data.count : 0;
    };

    (async () => {
      const action = readOnly ? "get" : hasCountedToday ? "get" : "up";
      const [today, total] = await Promise.all([
        fetchCount(dailyKey, action),
        fetchCount(totalKey, action),
      ]);

      if (storage && !hasCountedToday && !readOnly) {
        storage.setItem(countedKey, dateKey);
      }

      setText(todayEl, fmt(today));
      setText(totalEl, fmt(total));
    })().catch(() => {
    });
  });
})();
