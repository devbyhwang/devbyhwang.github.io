(function () {
  const script = document.querySelector("script[data-visitor-counter]");
  if (!script) return;

  const namespace = script.getAttribute("data-namespace");
  if (!namespace) return;

  const totalKey = script.getAttribute("data-total-key") || "total";
  const dailyPrefix = script.getAttribute("data-daily-prefix") || "daily";
  const timeZone = script.getAttribute("data-timezone") || "Asia/Seoul";

  const todayEl = document.getElementById("visitor-today");
  const totalEl = document.getElementById("visitor-total");
  const hasUI = Boolean(todayEl || totalEl);

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

  const dateKey = (() => {
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
  })();

  const dailyKey = `${dailyPrefix}-${dateKey}`;
  const countedKey = `visitorCounter:${namespace}:lastCountedDate`;
  const hasCountedToday = storage ? storage.getItem(countedKey) === dateKey : false;

  if (!hasUI && hasCountedToday) return;

  const baseUrl = "https://api.counterapi.dev/v1";
  const fmt = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "—";
  };

  const setText = (el, value) => {
    if (el) el.textContent = value;
  };

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
    const action = hasCountedToday ? "get" : "up";
    const [today, total] = await Promise.all([
      fetchCount(dailyKey, action),
      fetchCount(totalKey, action),
    ]);

    if (storage && !hasCountedToday) {
      storage.setItem(countedKey, dateKey);
    }

    setText(todayEl, fmt(today));
    setText(totalEl, fmt(total));
  })().catch(() => {
  });
})();
