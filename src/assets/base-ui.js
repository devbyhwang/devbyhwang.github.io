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
  document.querySelectorAll(".tab-buttons").forEach(function (group) {
    const tabButtons = group.querySelectorAll(".tab-btn");
    const container = group.parentElement;
    if (!container) return;
    const tabContents = container.querySelectorAll(".post-list-tab[data-content]");

    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tabName = this.dataset.tab;
        tabButtons.forEach(function (button) {
          button.classList.remove("active");
        });
        tabContents.forEach(function (content) {
          content.classList.toggle("active", content.dataset.content === tabName);
        });
        this.classList.add("active");
      });
    });
  });
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
