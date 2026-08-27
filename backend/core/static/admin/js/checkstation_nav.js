"use strict";

function checkstationSetDefaultOpen(details) {
  details.open = details.hasAttribute("data-cs-default-open");
}

function checkstationSyncNavFilter() {
  const nav = document.getElementById("nav-filter");
  const sidebar = document.getElementById("nav-sidebar");
  if (!nav || !sidebar) {
    return;
  }

  const value = (nav.value || "").trim().toLowerCase();
  sidebar.querySelectorAll("details.cs-nav-module, details.cs-nav-submodule").forEach((details) => {
    if (!value) {
      checkstationSetDefaultOpen(details);
      return;
    }
    const match = [...details.querySelectorAll("th[scope=row] a, .cs-nav-parent-link")].some(
      (link) => link.textContent.toLowerCase().includes(value)
    );
    if (match) {
      details.open = true;
      const outerRow = details.closest("tr");
      if (outerRow) {
        outerRow.style.display = "";
      }
    }
  });
}

function checkstationBindSubmenuLinks() {
  document.querySelectorAll("#nav-sidebar .cs-nav-sub-toggle").forEach((summary) => {
    summary.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || !summary.contains(link)) {
        return;
      }
      event.preventDefault();
      window.location.assign(link.href);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  checkstationBindSubmenuLinks();
  const nav = document.getElementById("nav-filter");
  if (!nav) {
    return;
  }
  ["input", "change", "keyup"].forEach((eventName) => {
    nav.addEventListener(eventName, checkstationSyncNavFilter);
  });
  checkstationSyncNavFilter();
});
