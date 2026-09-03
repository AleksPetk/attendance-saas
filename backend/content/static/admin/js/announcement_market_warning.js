(() => {
  function initializeMarketWarning() {
    const select = document.getElementById("id_market");
    const warning = document.getElementById("announcement-market-all-warning");
    if (!select || !warning) return;

    const update = () => {
      warning.hidden = select.value !== "all";
    };
    select.addEventListener("change", update);
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMarketWarning);
  } else {
    initializeMarketWarning();
  }
})();
