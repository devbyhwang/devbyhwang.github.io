(function () {
  const menuBtn = document.getElementById("menu-btn");
  const drawerClose = document.getElementById("drawer-close");
  const sidebarDrawer = document.getElementById("sidebar-drawer");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function openDrawer() {
    if (!sidebarDrawer || !sidebarOverlay) return;
    sidebarDrawer.classList.add("open");
    sidebarOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    if (!sidebarDrawer || !sidebarOverlay) return;
    sidebarDrawer.classList.remove("open");
    sidebarOverlay.classList.remove("open");
    document.body.style.overflow = "";
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.focus();
    }
  }

  if (menuBtn) menuBtn.addEventListener("click", openDrawer);
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeDrawer);
})();

(function () {
  document.querySelectorAll(".prose pre").forEach(function (pre) {
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      const code = pre.querySelector("code");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.textContent = "Copy";
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
