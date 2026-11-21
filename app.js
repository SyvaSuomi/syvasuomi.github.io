/* Public map: progress, statuses, site locations, recording dates. Installable, works offline. */
SY.app.start({
  onReady: () => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
    }
  },
}).catch((e) => {
  console.error(e);
  document.getElementById("kpis").textContent = "Could not load data.";
});
