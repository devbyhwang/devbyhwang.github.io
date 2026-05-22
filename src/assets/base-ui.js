(function () {
  const menuBtns = document.querySelectorAll(".menu-btn");
  const drawerClose = document.getElementById("drawer-close");
  const sidebarDrawer = document.getElementById("sidebar-drawer");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  let lastMenuTrigger = null;

  function setMenuExpanded(value) {
    menuBtns.forEach(function (btn) {
      btn.setAttribute("aria-expanded", value);
    });
  }

  function openDrawer() {
    if (!sidebarDrawer || !sidebarOverlay) return;
    sidebarDrawer.classList.add("open");
    sidebarOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setMenuExpanded("true");
  }

  function closeDrawer() {
    if (!sidebarDrawer || !sidebarOverlay) return;
    sidebarDrawer.classList.remove("open");
    sidebarOverlay.classList.remove("open");
    document.body.style.overflow = "";
    setMenuExpanded("false");
    const restoreTarget = lastMenuTrigger || menuBtns[0];
    if (restoreTarget && typeof restoreTarget.focus === "function") {
      restoreTarget.focus();
    }
    lastMenuTrigger = null;
  }

  menuBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      lastMenuTrigger = btn;
      openDrawer();
    });
  });
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeDrawer);
})();

(function () {
  document.querySelectorAll(".prose pre").forEach(function (pre) {
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "코드 복사하기");
    const icon = document.createElement("span");
    icon.className = "code-copy-icon";
    icon.setAttribute("aria-hidden", "true");
    const tooltip = document.createElement("span");
    tooltip.className = "code-copy-tooltip";
    tooltip.textContent = "복사하기";
    btn.appendChild(icon);
    btn.appendChild(tooltip);
    btn.addEventListener("click", function () {
      const code = pre.querySelector("code");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        btn.setAttribute("aria-label", "코드 복사됨");
        tooltip.textContent = "복사됨";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.setAttribute("aria-label", "코드 복사하기");
          tooltip.textContent = "복사하기";
          btn.classList.remove("copied");
        }, 2000);
      });
    });
    pre.appendChild(btn);
  });
})();

(function () {
  const toggles = Array.prototype.slice.call(document.querySelectorAll("[data-ai-post-toggle]"));
  const postItems = Array.prototype.slice.call(document.querySelectorAll("[data-ai-generated]"));
  if (!toggles.length || !postItems.length) return;

  const storageKey = "devbyhwang:show-ai-posts";

  function readInitialState() {
    const params = new URLSearchParams(window.location.search);
    const aiParam = params.get("ai");
    if (aiParam === "0") return false;
    if (aiParam === "1") return true;
    return window.localStorage.getItem(storageKey) !== "false";
  }

  function updateEmptyStates() {
    document.querySelectorAll(".writing-feed-list").forEach(function (list) {
      const visiblePosts = list.querySelectorAll("[data-ai-generated]:not([hidden])").length;
      const emptyMessage = list.querySelector(".ai-filter-empty");
      const feedAds = list.querySelectorAll("[data-ad-kind='in-feed']");

      if (emptyMessage) emptyMessage.hidden = visiblePosts > 0;
      feedAds.forEach(function (ad) {
        ad.hidden = visiblePosts === 0;
      });
    });
  }

  function updatePostLists(showAiPosts) {
    document.querySelectorAll(".writing-feed-list").forEach(function (list) {
      const limit = Number(list.dataset.feedLimit || 0);
      let visibleCount = 0;

      list.querySelectorAll("[data-ai-generated]").forEach(function (item) {
        const hideByAiFilter = !showAiPosts && item.dataset.aiGenerated === "true";
        const hideByLimit = limit > 0 && !hideByAiFilter && visibleCount >= limit;

        item.hidden = hideByAiFilter || hideByLimit;

        if (!item.hidden) {
          visibleCount += 1;
        }
      });
    });
  }

  function updateCounts(showAiPosts) {
    document.querySelectorAll("[data-ai-count]").forEach(function (count) {
      const nextCount = showAiPosts ? count.dataset.totalCount : count.dataset.humanCount;
      count.textContent = "(" + (nextCount || "0") + ")";
    });
  }

  function applyState(showAiPosts, shouldPersist) {
    toggles.forEach(function (toggle) {
      toggle.checked = showAiPosts;
    });

    updatePostLists(showAiPosts);
    updateEmptyStates();
    updateCounts(showAiPosts);

    if (shouldPersist) {
      window.localStorage.setItem(storageKey, String(showAiPosts));
    }
  }

  toggles.forEach(function (toggle) {
    toggle.addEventListener("change", function () {
      applyState(toggle.checked, true);
    });
  });

  applyState(readInitialState(), false);
})();

(function () {
  const tocLinks = Array.from(document.querySelectorAll(".post-toc-link"));
  if (!tocLinks.length) return;
  const tocMarkers = Array.from(document.querySelectorAll(".post-toc-rail-marker"));

  const headings = tocLinks
    .map(function (link) {
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return target ? { link: link, target: target } : null;
    })
    .filter(Boolean);
  if (!headings.length) return;

  let ticking = false;

  function syncActiveTocLink() {
    ticking = false;
    const targetLine = Math.max(96, window.innerHeight * 0.16);
    let active = null;

    headings.forEach(function (entry) {
      if (entry.target.getBoundingClientRect().top <= targetLine) {
        active = entry;
      }
    });

    if (!active) active = headings[0];

    const activeId = active && active.target.id;

    tocLinks.forEach(function (link) {
      link.classList.toggle("active", Boolean(active) && link === active.link);
    });

    tocMarkers.forEach(function (marker) {
      marker.classList.toggle("active", Boolean(activeId) && marker.dataset.tocTarget === activeId);
    });
  }

  function requestSync() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncActiveTocLink);
  }

  syncActiveTocLink();
  window.addEventListener("scroll", requestSync, { passive: true });
  window.addEventListener("resize", requestSync);
})();
