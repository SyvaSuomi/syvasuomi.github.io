/* App core: full-screen Leaflet map, floating search + status
   chips, collapsible sidebar (KPIs, layers, charts, recent activity, site list),
   site details in the sidebar (desktop) or a bottom sheet (phone). */
(function () {
  const t = (k, v) => SY.i18n.t(k, v);
  const esc = SY.charts.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const ID_RE = /^SYSU-MT-\d{3}[a-z]?$/;  // a permitted, not started site is shown per alternative: SYSU-MT-006a
  const STATUSES = ["complete", "progress", "permitted"];
  const A = (SY.app = { state: null });

  /* ---------- site symbols (same on map, chips, list, details) ----------
     One circle per site, built from the two recordings:
       outer circle = LMT    grey ring = not measured yet, green = done, green + pulsing halo = recording
       inner dot    = BBMT   none = not measured yet, dark blue = done, dark blue blinking = recording
     e.g. LMT and BBMT done = green circle with a dark-blue centre.                                    */
  const isOpen = (r) => !r.end || r.end > A.state.meta.today;
  /* null | "rec" | "done" for one list of recordings */
  const recState = (list) => (!list || !list.length ? null : list.some(isOpen) ? "rec" : "done");
  A.recStates = (p) => ({ lmt: recState(p.lmt), bbmt: recState(p.bbmt) });

  function circleSVG(lmt, bbmt, size) {
    const c = SY.config.statusColors;
    const outer = lmt
      ? `<circle cx="8" cy="8" r="6.6" fill="${c.lmt}" stroke="#fff" stroke-width="1.3"/>`
      : `<circle cx="8" cy="8" r="5.8" fill="rgba(255,255,255,.9)" stroke="${c.permitted}" stroke-width="2.2"/>`;
    const inner = bbmt
      ? `<circle${bbmt === "rec" ? ' class="blink"' : ""} cx="8" cy="8" r="3.1" fill="${c.bbmt}" stroke="#fff" stroke-width="${lmt ? 0.9 : 0}"/>`
      : "";
    return `<svg class="sym" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${outer}${inner}</svg>`;
  }
  /* symbol of one site */
  A.siteSym = function (p, size) {
    const st = A.recStates(p);
    return circleSVG(st.lmt, st.bbmt, size || 16);
  };
  /* typical symbol of a status, for the chips */
  A.sym = function (status) {
    if (status === "complete") return circleSVG("done", "done", 16);
    if (status === "progress") return circleSVG("rec", null, 16);
    return circleSVG(null, null, 16);
  };
  function markerIcon(f) {
    const p = f.properties, st = A.recStates(p);
    const pulse = st.lmt === "rec" ? " pulse pulse-lmt" : st.bbmt === "rec" ? " pulse pulse-bbmt" : "";
    return L.divIcon({
      className: "mk-wrap",
      iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="mk mk-${p.status}${pulse}">${A.siteSym(p, 20)}</div>`,
    });
  }
  /* "In progress · LMT done, BBMT recording" */
  const statusText = (p) => {
    if (p.status !== "progress") return t("status." + p.status);
    const st = A.recStates(p), word = (k) => t(k === "rec" ? "ui.state_rec" : "ui.state_done");
    const parts = [st.lmt && `LMT ${word(st.lmt)}`, st.bbmt && `BBMT ${word(st.bbmt)}`].filter(Boolean);
    return t("status.progress") + (parts.length ? ` · ${parts.join(", ")}` : "");
  };
  A.statusText = statusText;

  /* ---------- helpers ---------- */
  const today = () => A.state.meta.today;
  const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  const recDays = (r) => (r.days !== null && r.days !== undefined ? r.days : daysBetween(r.start, today()));
  A.isPhone = () => matchMedia(SY.config.phoneQuery).matches;
  A.copy = async function (text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* ignore */ } ta.remove();
    }
    if (btn) { const old = btn.textContent; btn.textContent = t("ui.copied"); setTimeout(() => (btn.textContent = old), 1500); }
  };
  function recSummary(list) {
    if (!list.length) return "";
    const r = list[list.length - 1];
    return `${r.start} – ${r.end || ""} (${r.end ? t("ui.days", { n: recDays(r) }) : t("ui.days_so_far", { n: recDays(r) })})`;
  }

  /* ---------- boot ---------- */
  A.start = async function (opts) {
    const files = ["meta.json", "stats.json", "sites.geojson", "grid.geojson"];
    let offline = false;

    const [meta, stats, sites, grid] = await Promise.all(files.map(async (f) => {
      const r = await fetch(`data/${f}`, { cache: "no-cache" });
      if (r.headers.get("X-From-Cache") === "1") offline = true;
      return r.json();
    }));

    const S = (A.state = {
      meta, stats, grid, offline, opts,
      sites: sites.features, byId: {},
      visible: new Set(STATUSES), q: "", from: "", to: "",
      sortKey: "site_id", sortDir: 1, openId: null, showAll: false,
    });
    S.sites.forEach((f) => (S.byId[f.properties.site_id] = f));
    const embed = new URLSearchParams(location.search).get("embed") === "1";
    if (embed) document.body.classList.add("embed");
    await SY.i18n.load(SY.i18n.initialLang(meta.default_language));

    // computers start with the sidebar open; on phones it would cover the map
    if (!embed && !A.isPhone()) openSide();

    buildMap();
    bindUI();
    renderAll();
    if (opts.onReady) opts.onReady(A);
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderCharts, 150); });
  };

  function renderAll() {
    const S = A.state;
    SY.i18n.apply();
    document.title = S.meta.title;
    $("#title").textContent = S.meta.title;
    $("#subtitle").textContent = S.meta.subtitle || "";
    $("#updated").textContent = t("ui.updated", { date: SY.i18n.date(S.meta.built) });
    $("#demo").hidden = !S.meta.demo_banner;
    const off = $("#offline");
    if (off) { off.hidden = !S.offline; off.textContent = t("ui.offline", { date: SY.i18n.date(S.meta.built) }); }
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === SY.i18n.lang)));
    renderKPIs();
    renderLegend();
    renderLayers();
    renderList();
    renderCharts();
    renderRecent();
    if (S.openId) A.openSite(S.openId, { keepView: true });
  }

  /* ---------- KPIs + summary pill ---------- */
  function renderKPIs() {
    const s = A.state.stats;
    const pct = s.pct_complete || 0;
    const fin = s.projected_finish ? SY.i18n.date(s.projected_finish, { month: "short", year: "numeric" }) : t("ui.kpi_finish_none");
    const cards = [
      ["wide", t("ui.kpi_complete"), `${s.complete} <small>/ ${s.n} · ${SY.i18n.num(pct)} %</small>`,
        `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`],
      ["", t("ui.kpi_lmt_done"), `${s.lmt_done}`],
      ["", t("ui.kpi_bbmt_done"), `${s.bbmt_done}`],
      ["", t("ui.kpi_lmt_field"), `${s.lmt_in_field} <small>/ ${s.lmt_fleet}</small>`],
      ["", t("ui.kpi_bbmt_field"), `${s.bbmt_in_field} <small>/ ${s.bbmt_fleet}</small>`],
      ["", t("ui.kpi_remaining"), `${s.remaining}`],
      ["", t("ui.kpi_finish"), s.projected_finish ? esc(fin) : `<small>${esc(fin)}</small>`],
    ];
    $("#kpis").innerHTML = cards.map(([cls, label, value, extra]) =>
      `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${extra || ""}</div>`).join("");
    $("#summary").textContent = `${t("ui.kpi_complete")}: ${s.complete} / ${s.n} · ${t("ui.updated", { date: SY.i18n.date(A.state.meta.built, { day: "numeric", month: "short" }) })}`;
  }

  /* ---------- map ---------- */
  function baseLayer(key) {
    const c = SY.config.baseMaps[key];
    return L.layerGroup(c.layers.map((url, i) => L.tileLayer(url, {
      attribution: i === 0 ? c.attribution : "", subdomains: c.subdomains || "abc", maxZoom: 19, maxNativeZoom: c.maxZoom,
      opacity: SY.config.baseOpacity,
    })));
  }
  function buildMap() {
    const S = A.state;
    const renderer = L.canvas({ padding: 0.5, tolerance: matchMedia("(pointer: coarse)").matches ? 10 : 3 });
    const map = (S.map = L.map("map", { renderer, preferCanvas: true, zoomControl: false, zoomSnap: 0.5, maxZoom: SY.config.maxZoom }));
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    S.bases = {};
    S.baseDefs = {};
    const key = S.meta.mml_api_key;
    if (key) {
      Object.entries(SY.config.mmlMaps).forEach(([k, m]) => {
        const url = SY.config.mmlUrl.replace("{layer}", m.layer).replace("{ext}", m.ext).replace("{key}", encodeURIComponent(key));
        S.baseDefs[k] = m;
        S.bases[k] = L.tileLayer(url, { attribution: SY.config.mmlAttribution, maxZoom: 19, maxNativeZoom: 16, opacity: SY.config.baseOpacity });
      });
    }
    Object.keys(SY.config.baseMaps).forEach((k) => { S.baseDefs[k] = SY.config.baseMaps[k]; S.bases[k] = baseLayer(k); });
    S.base = S.bases[SY.config.defaultBase] ? SY.config.defaultBase : Object.keys(S.bases)[0];
    S.bases[S.base].addTo(map);
    S.overlays = {
      grid: { label: "ui.grid", layer: L.geoJSON(S.grid, { renderer, interactive: false, style: { color: "#7d8590", weight: 0.7, opacity: 0.7, fill: false } }), on: false },
    };
    if (S.meta.geology_wms_url && S.meta.geology_wms_layer) {
      S.overlays.geology = { label: "ui.geology", on: false, layer: L.tileLayer.wms(S.meta.geology_wms_url, {
        layers: S.meta.geology_wms_layer, format: "image/png", transparent: true, opacity: 0.55, attribution: S.meta.geology_attribution || "" }) };
    }
    S.group = L.featureGroup().addTo(map);
    S.markers = {};
    const order = { permitted: 0, complete: 1, progress: 2 };  // in progress drawn on top
    S.sites.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const mk = L.marker([lat, lon], {
        icon: markerIcon(f), bubblingMouseEvents: false, keyboard: true, riseOnHover: true,
        title: `${p.site_id} — ${statusText(p)}`, alt: `${p.site_id} — ${statusText(p)}`,
        zIndexOffset: order[p.status] * 1000,
      });
      mk.on("click", () => A.openSite(p.site_id));
      S.markers[p.site_id] = mk;
    });
    fitDefault();
    applyFilters();
  }

  /* the starting view (SY.config.defaultBounds), framed in the part of the map the sidebar leaves free */
  function fitDefault() {
    const sideOpen = document.body.classList.contains("side-open");
    const sideW = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--side-w"), 10) || 0;
    const topLeft = A.isPhone() ? [0, 110] : [sideOpen ? sideW : 0, 0];
    A.state.map.fitBounds(SY.config.defaultBounds, { paddingTopLeft: topLeft });
  }

  function passesNonStatus(f) {
    const S = A.state;
    const p = f.properties;
    if (S.q && !p.site_id.toLowerCase().includes(S.q.toLowerCase())) return false;
    if (S.from || S.to) {
      const lo = S.from || "0000", hi = S.to || "9999";
      if (!p.lmt.concat(p.bbmt).some((r) => r.start <= hi && (r.end || today()) >= lo)) return false;
    }
    return true;
  }
  const filtered = () => A.state.sites.filter((f) => passesNonStatus(f) && A.state.visible.has(f.properties.status));
  A.filtered = filtered;
  function applyFilters() {
    const S = A.state;
    const show = new Set(filtered().map((f) => f.properties.site_id));
    S.sites.forEach((f) => {
      const id = f.properties.site_id, mk = S.markers[id], on = S.group.hasLayer(mk);
      if (show.has(id) && !on) S.group.addLayer(mk);
      else if (!show.has(id) && on) S.group.removeLayer(mk);
    });
  }
  function refresh() { applyFilters(); renderLegend(); renderList(); }

  /* ---------- chips ---------- */
  function renderLegend() {
    const S = A.state;
    const counts = Object.fromEntries(STATUSES.map((k) => [k, 0]));
    // Permitted counts site numbers: alternatives 006a/b/c of one site count once
    const seen = new Set();
    S.sites.forEach((f) => {
      if (!passesNonStatus(f)) return;
      const p = f.properties, key = p.status === "permitted" ? p.site_id.slice(0, 11) : p.site_id;
      if (seen.has(key)) return;
      seen.add(key);
      counts[p.status]++;
    });
    $("#legend").innerHTML = STATUSES.map((k) =>
      `<button type="button" class="chip" data-status="${k}" aria-pressed="${S.visible.has(k)}">${A.sym(k)}<span>${esc(t("status." + k))}</span><span class="n">${counts[k]}</span></button>`).join("");
  }

  /* ---------- layers (in the sidebar) ---------- */
  function renderLayers() {
    const S = A.state;
    const base = Object.entries(S.baseDefs).map(([k, c]) =>
      `<label><input type="radio" name="base" value="${k}"${S.base === k ? " checked" : ""}>${esc(t("ui." + c.label))}</label>`).join("");
    const ov = Object.entries(S.overlays).map(([k, o]) =>
      `<label><input type="checkbox" data-overlay="${k}"${o.on ? " checked" : ""}>${esc(t(o.label))}</label>`).join("");
    $("#layers").innerHTML = `<div class="group" role="radiogroup" aria-label="${esc(t("ui.base_map"))}">${base}</div><div class="group">${ov}</div>`;
  }

  /* ---------- sidebar ---------- */
  function openSide() {
    document.body.classList.add("side-open");
    $("#menu").setAttribute("aria-expanded", "true");
    requestAnimationFrame(renderCharts);
  }
  function closeSide() {
    document.body.classList.remove("side-open");
    $("#menu").setAttribute("aria-expanded", "false");
    showMain();
  }
  function showMain() { $("#side-detail").hidden = true; $("#side-main").hidden = false; }
  A.openSide = openSide;

  /* Show any HTML panel: in the sidebar on desktop, in the bottom sheet on phones. */
  A.showPanel = function (html, keepView) {
    if (A.isPhone()) {
      closeSide();
      $("#sheet-body").innerHTML = html;
      $("#sheet").hidden = false;
      $("#sheet").style.transform = "";
      if (!keepView) $("#sheet .close").focus({ preventScroll: true });
    } else {
      const d = $("#side-detail");
      d.innerHTML = `<div class="detail-head"><button type="button" class="icon-btn" data-act="back" aria-label="${esc(t("ui.back"))}">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button>
        <span class="muted">${esc(t("ui.back"))}</span></div>` + html;
      $("#side-main").hidden = true;
      d.hidden = false;
      d.scrollTop = 0;
      openSide();
    }
  };

  /* ---------- site details ---------- */
  function recBlock(title, list) {
    let h = `<div class="rec"><h4>${esc(title)}</h4>`;
    if (!list.length) return h + `<div class="muted">${esc(t("ui.no_recordings"))}</div></div>`;
    list.forEach((r) => {
      const dd = r.end ? t("ui.days", { n: recDays(r) }) : t("ui.days_so_far", { n: recDays(r) });
      h += `<div class="item"><dl><dt>${esc(t("ui.dates"))}</dt><dd>${esc(r.start)} – ${esc(r.end || "…")} · ${esc(dd)}</dd>`;
      if (r.ns_m !== null || r.ew_m !== null) h += `<dt>${esc(t("ui.dipoles"))}</dt><dd>${r.ns_m ?? "—"} m / ${r.ew_m ?? "—"} m</dd>`;
      h += `</dl></div>`;
    });
    return h + `</div>`;
  }
  function siteHTML(f) {
    const S = A.state;
    const p = f.properties;
    let h = `<div class="site"><h3>${esc(p.site_id)}</h3><div class="st">${A.siteSym(p)}${esc(statusText(p))}</div>`;
    h += recBlock(t("ui.lmt"), p.lmt) + recBlock(t("ui.bbmt"), p.bbmt);
    h += `<div class="actions"><button type="button" class="btn" data-act="link" data-id="${esc(p.site_id)}">${esc(t("ui.copy_link"))}</button>`;
    return h + `</div></div>`;
  }
  A.openSite = function (id, o) {
    const S = A.state;
    const f = S.byId[id];
    if (!f) return;
    o = o || {};
    S.openId = id;
    if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);
    const [lon, lat] = f.geometry.coordinates;
    if (o.zoom) S.map.setView([lat, lon], Math.max(S.map.getZoom(), 9));
    if (S.highlight) S.highlight.remove();
    S.highlight = L.circleMarker([lat, lon], { radius: 17, color: "#1a73e8", weight: 2.5, fill: false, interactive: false }).addTo(S.map);
    A.showPanel(siteHTML(f), o.keepView);
  };
  function clearOpen() {
    const S = A.state;
    S.openId = null;
    if (S.highlight) { S.highlight.remove(); S.highlight = null; }
    if (ID_RE.test(location.hash.slice(1))) history.replaceState(null, "", location.pathname + location.search);
  }
  function closeSheet() { $("#sheet").hidden = true; clearOpen(); }
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (ID_RE.test(id) && A.state.byId[id]) A.openSite(id, { zoom: true });
  }

  /* ---------- charts ---------- */
  function renderCharts() {
    const s = A.state.stats;
    const el1 = $("#chart-cum");
    if (!el1 || !el1.offsetParent) return;
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    SY.charts.line(el1, {
      ariaLabel: `${t("ui.chart_cum")}: LMT ${s.lmt_done}, BBMT ${s.bbmt_done} / ${s.n}`,
      emptyText: t("ui.chart_empty"), yMax: s.projected_finish ? s.n : 0,
      series: [
        { label: t("ui.kpi_lmt_done"), short: "LMT", color: css("--line-lmt"), points: s.timeline.map((p) => ({ date: p.date, v: p.lmt })) },
        { label: t("ui.kpi_bbmt_done"), short: "BBMT", color: css("--line-bbmt"), points: s.timeline.map((p) => ({ date: p.date, v: p.bbmt })) },
      ],
      projection: s.projected_finish ? { date: s.projected_finish, value: s.n, label: t("ui.chart_projection") } : null,
    });
    SY.charts.bars($("#chart-monthly"), {
      ariaLabel: t("ui.chart_monthly"), emptyText: t("ui.chart_empty"), color: css("--c-complete"),
      items: s.monthly.map((m) => ({ label: SY.i18n.date(m.month + "-15", { month: "short" }), title: SY.i18n.date(m.month + "-15", { month: "long", year: "numeric" }), v: m.n })),
    });
  }

  /* ---------- recent activity ---------- */
  function renderRecent() {
    const list = A.state.stats.recent;
    $("#recent-list").innerHTML = list.length
      ? list.map((e) => `<li><time datetime="${e.date}">${esc(SY.i18n.date(e.date, { day: "numeric", month: "short" }))}</time><span><a href="#${esc(e.site_id)}">${esc(e.site_id)}</a> · ${esc(t("event." + e.type))}</span></li>`).join("")
      : `<li class="empty">${esc(t("ui.recent_empty"))}</li>`;
  }

  /* ---------- site list ---------- */
  // get() returning null = no value: always listed last, whichever direction.
  const recs = (p) => p.lmt.concat(p.bbmt);
  const SORTS = {
    site_id: { label: "ui.col_id", get: (p) => p.site_id },
    installed: { label: "ui.col_installed", get: (p) => recs(p).map((r) => r.start).sort()[0] || null },
    // a recording still running counts as the latest end
    ended: { label: "ui.col_ended", get: (p) => {
      const r = recs(p);
      return !r.length ? null : r.some((x) => !x.end) ? "9999-12-31" : r.map((x) => x.end).sort().pop();
    } },
    status: { label: "ui.col_status", get: (p) => STATUSES.indexOf(p.status) },
  };
  function renderList() {
    const S = A.state;
    $("#sortbar").innerHTML = Object.entries(SORTS).map(([k, o]) =>
      `<button type="button" data-sort="${k}" aria-pressed="${S.sortKey === k}">${esc(t(o.label))}${S.sortKey === k ? (S.sortDir > 0 ? " ↑" : " ↓") : ""}</button>`).join("");
    const get = SORTS[S.sortKey].get;
    const rows = filtered().slice().sort((a, b) => {
      const va = get(a.properties), vb = get(b.properties);
      if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
      return (va < vb ? -1 : va > vb ? 1 : a.properties.site_id < b.properties.site_id ? -1 : 1) * S.sortDir;
    });
    const limit = S.showAll ? rows.length : 150;
    $("#site-list").innerHTML = rows.slice(0, limit).map((f) => {
      const p = f.properties;
      const l2 = [p.lmt.length ? `LMT ${recSummary(p.lmt)}` : "", p.bbmt.length ? `BBMT ${recSummary(p.bbmt)}` : ""].filter(Boolean).join(" · ");
      return `<li><button type="button" class="site-row" data-id="${esc(p.site_id)}"><span class="l1">${esc(p.site_id)}<span class="st">${A.siteSym(p)}${esc(statusText(p))}</span></span>` +
        `${l2 ? `<span class="l2">${esc(l2)}</span>` : ""}</button></li>`;
    }).join("");
    // alternatives a/b/c of one permitted site count as one site
    const nSites = (list) => new Set(list.map((f) => f.properties.site_id.slice(0, 11))).size;
    $("#count").textContent = t("ui.shown", { n: nSites(rows), total: nSites(S.sites) });
    const more = $("#more");
    more.hidden = rows.length <= limit;
    more.textContent = `+${rows.length - limit}`;
  }

  /* ---------- events ---------- */
  function bindUI() {
    const S = A.state;
    $("#menu").addEventListener("click", () => (document.body.classList.contains("side-open") ? closeSide() : (showMain(), openSide())));
    $("#side-close").addEventListener("click", () => { closeSide(); clearOpen(); });
    $("#scrim").addEventListener("click", closeSide);
    document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", async () => {
      await SY.i18n.load(b.dataset.lang);
      renderAll();
    }));
    $("#legend").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const k = b.dataset.status;
      if (S.visible.has(k)) S.visible.delete(k); else S.visible.add(k);
      if (!S.visible.size) STATUSES.forEach((s) => S.visible.add(s));
      refresh();
    });
    const search = $("#f-search");
    search.addEventListener("input", () => { S.q = search.value.trim(); refresh(); });
    search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const hits = filtered();
      const hit = hits.find((f) => f.properties.site_id.toLowerCase() === S.q.toLowerCase()) || (hits.length === 1 ? hits[0] : null);
      if (hit) A.openSite(hit.properties.site_id, { zoom: true });
      else { showMain(); openSide(); $("#list-section").scrollIntoView({ block: "start" }); }
    });
    $("#layers").addEventListener("change", (e) => {
      const el = e.target;
      if (el.name === "base") {
        S.map.removeLayer(S.bases[S.base]);
        S.base = el.value;
        S.bases[S.base].addTo(S.map);
        const b = S.bases[S.base];
        (b.eachLayer ? b.getLayers() : [b]).forEach((l) => l.bringToBack && l.bringToBack());
      } else if (el.dataset.overlay) {
        const o = S.overlays[el.dataset.overlay];
        o.on = el.checked;
        if (o.on) o.layer.addTo(S.map); else S.map.removeLayer(o.layer);
      }
    });
    $("#f-from").addEventListener("change", (e) => { S.from = e.target.value; refresh(); });
    $("#f-to").addEventListener("change", (e) => { S.to = e.target.value; refresh(); });
    $("#f-reset").addEventListener("click", () => {
      S.q = S.from = S.to = "";
      S.visible = new Set(STATUSES);
      ["#f-search", "#f-from", "#f-to"].forEach((s) => ($(s).value = ""));
      refresh();
    });
    $("#sortbar").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-sort]");
      if (!b) return;
      if (S.sortKey === b.dataset.sort) S.sortDir *= -1; else { S.sortKey = b.dataset.sort; S.sortDir = 1; }
      renderList();
    });
    $("#site-list").addEventListener("click", (e) => {
      const b = e.target.closest(".site-row");
      if (b) A.openSite(b.dataset.id, { zoom: true });
    });
    $("#more").addEventListener("click", () => { S.showAll = true; renderList(); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "link") {
        const base = S.meta.public_url ? S.meta.public_url.replace(/\/?$/, "/") : location.origin + location.pathname;
        A.copy(base + "#" + b.dataset.id, b);
      } else if (b.dataset.act === "back") { showMain(); clearOpen(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#sheet").hidden) closeSheet();
      else if (document.body.classList.contains("side-open")) { closeSide(); clearOpen(); }
    });
    // bottom sheet: close button or swipe down
    const sheet = $("#sheet");
    $("#sheet .close").addEventListener("click", closeSheet);
    let y0 = null, dy = 0;
    sheet.addEventListener("touchstart", (e) => { if (sheet.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener("touchend", () => {
      if (y0 === null) return;
      if (dy > 80) closeSheet();
      sheet.style.transform = "";
      y0 = null;
    });
    S.map.on("click", () => { if (!$("#sheet").hidden) closeSheet(); });
  }
})();
