/* Hand-drawn SVG charts (no chart library). Resize with their container. */
(function () {
  const C = (SY.charts = {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  C.esc = esc;
  const ms = (iso) => new Date(iso + "T12:00:00").getTime();

  function nice(max) {
    if (max <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
    return 10 * p;
  }

  function monthTicks(t0, t1, width) {
    const out = [];
    const d = new Date(t0);
    d.setDate(1); d.setHours(12, 0, 0, 0);
    if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1) { out.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
    const maxLabels = Math.max(2, Math.floor(width / 64));
    const step = Math.max(1, Math.ceil(out.length / maxLabels));
    return out.filter((_, i) => i % step === 0);
  }

  /* Cumulative line chart with crosshair, end labels and dotted projection. */
  C.line = function (el, o) {
    el.innerHTML = "";
    const pts = o.series[0].points;
    if (!pts.length || o.series.every((s) => s.points.every((p) => !p.v))) {
      el.innerHTML = `<p class="empty">${esc(o.emptyText)}</p>`;
      return;
    }
    const W = Math.max(260, el.clientWidth || 320);
    const narrow = W < 420;
    const H = narrow ? 210 : 250;
    const showEnd = W >= 300;
    const m = { t: 14, r: showEnd ? (narrow ? 58 : 76) : 12, b: 26, l: 38 };
    const t0 = ms(pts[0].date);
    const tLast = ms(pts[pts.length - 1].date);
    const t1 = o.projection && o.projection.date ? Math.max(tLast, ms(o.projection.date)) : tLast;
    const vmax = Math.max(1, o.yMax || 0, ...o.series.flatMap((s) => s.points.map((p) => p.v)));
    const yMax = nice(vmax);
    const X = (t) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.ariaLabel)}">`;
    s += `<g class="grid">`;
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `<text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    }
    s += `</g><g class="axis">`;
    monthTicks(t0, t1, W - m.l - m.r).forEach((d, i) => {
      const lbl = new Intl.DateTimeFormat(SY.i18n.locale(), d.getMonth() === 0 || i === 0 ? { month: "short", year: "2-digit" } : { month: "short" }).format(d);
      s += `<text x="${X(d.getTime())}" y="${H - 8}" text-anchor="middle">${esc(lbl)}</text>`;
    });
    s += `</g>`;
    const ends = [];
    o.series.forEach((se) => {
      const d = se.points.map((p, i) => `${i ? "L" : "M"}${X(ms(p.date)).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round"/>`;
      const last = se.points[se.points.length - 1];
      if (o.projection && o.projection.date && ms(o.projection.date) > tLast) {
        s += `<path d="M${X(tLast)},${Y(last.v)}L${X(ms(o.projection.date))},${Y(o.projection.value)}" stroke="${se.color}" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round" fill="none" opacity=".8"/>`;
      }
      ends.push({ y: Y(last.v), label: `${se.short || se.label} ${last.v}`, color: se.color, x: X(tLast) });
    });
    if (o.projection && o.projection.date && ms(o.projection.date) > tLast) {
      const px = X(ms(o.projection.date));
      s += `<text x="${Math.min(px, W - m.r) - 2}" y="${Y(o.projection.value) - 6}" text-anchor="end" font-size="10">${esc(o.projection.label)}</text>`;
    }
    if (showEnd) {
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
      const overflow = ends.length ? ends[ends.length - 1].y - (H - m.b) : 0;
      if (overflow > 0) ends.forEach((e) => (e.y -= overflow));
      ends.forEach((e) => {
        s += `<text class="endlabel" x="${W - m.r + 6}" y="${e.y + 4}" fill="${e.color}" style="fill:${e.color};font-weight:700">${esc(e.label)}</text>`;
      });
    }
    s += `<g class="xh" style="display:none"><line y1="${m.t}" y2="${H - m.b}" stroke="currentColor" opacity=".35"/>`;
    o.series.forEach((se) => (s += `<circle r="4" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`));
    s += `</g><rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" style="touch-action:pan-y"/></svg>`;
    const legend = `<div class="legend-inline">${o.series.map((se) => `<span><i style="background:${se.color}"></i>${esc(se.label)}</span>`).join("")}</div>`;
    el.innerHTML = legend + s + `<div class="tip" hidden></div>`;
    const svg = el.querySelector("svg");
    const xh = svg.querySelector(".xh");
    const tip = el.querySelector(".tip");
    const hit = svg.querySelector(".hit");
    function show(evt) {
      const r = svg.getBoundingClientRect();
      const x = ((evt.clientX - r.left) / r.width) * W;
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.abs(X(ms(p.date)) - x); if (d < bd) { bd = d; best = i; } });
      const px = X(ms(pts[best].date));
      xh.style.display = "";
      xh.querySelector("line").setAttribute("x1", px);
      xh.querySelector("line").setAttribute("x2", px);
      xh.querySelectorAll("circle").forEach((c, i) => { c.setAttribute("cx", px); c.setAttribute("cy", Y(o.series[i].points[best].v)); });
      tip.hidden = false;
      tip.innerHTML = `<strong>${esc(SY.i18n.date(pts[best].date))}</strong><br>` +
        o.series.map((se) => `<span style="color:${se.color}">●</span> ${esc(se.label)}: ${se.points[best].v}`).join("<br>");
      const leftPx = (px / W) * r.width;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, leftPx - tw / 2)) + "px";
      tip.style.top = svg.offsetTop + 4 + "px";
    }
    function hide() { xh.style.display = "none"; tip.hidden = true; }
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    document.addEventListener("pointerdown", (e) => { if (!el.contains(e.target)) hide(); });
  };

  /* Vertical bars (sites completed per month). */
  C.bars = function (el, o) {
    el.innerHTML = "";
    if (!o.items.length || o.items.every((i) => !i.v)) { el.innerHTML = `<p class="empty">${esc(o.emptyText)}</p>`; return; }
    const W = Math.max(240, el.clientWidth || 300);
    const H = 190;
    const m = { t: 16, r: 6, b: 26, l: 30 };
    const yMax = nice(Math.max(...o.items.map((i) => i.v)));
    const bw = (W - m.l - m.r) / o.items.length;
    const Y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
    const every = Math.max(1, Math.ceil(o.items.length / Math.floor((W - m.l) / 40)));
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.ariaLabel)}"><g class="grid">`;
    for (let i = 0; i <= 2; i++) {
      const v = (yMax / 2) * i;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    }
    s += `</g>`;
    o.items.forEach((it, i) => {
      const x = m.l + i * bw + bw * 0.15;
      const w = Math.max(2, bw * 0.7);
      s += `<rect x="${x}" y="${Y(it.v)}" width="${w}" height="${Math.max(0, H - m.b - Y(it.v))}" rx="2" fill="${o.color}"><title>${esc(it.title)}: ${it.v}</title></rect>`;
      if (w >= 16 && it.v) s += `<text x="${x + w / 2}" y="${Y(it.v) - 4}" text-anchor="middle">${it.v}</text>`;
      if (i % every === 0) s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
    });
    el.innerHTML = s + `</svg>`;
  };

})();
