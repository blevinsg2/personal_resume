/* QB throw map: targeted pass attempts by pass_location (thirds) and air-yard band.
   Data: "heat" in /assets/data/qb_network.json (scripts/build_qb_network.py, nflverse play-by-play).
   Listens for qn:load (center QB changed) and qn:pick (receiver clicked) from qbnet.js. */
(function () {
  "use strict";
  var svg = document.getElementById("qh-svg");
  if (!svg) return;
  var NS = "http://www.w3.org/2000/svg";
  var wrap = document.getElementById("qh-fieldwrap"), tip = document.getElementById("qh-tip");
  var recSel = document.getElementById("qh-rec"), statusEl = document.getElementById("qh-status");
  var D, H, QB = null, REC = "", METRIC = "att", CELLS = [], focusIdx = 0;
  // field geometry (viewBox 360 x 600): 3 columns between x0..x1, yards -5..40 bottom to top
  var X0 = 36, X1 = 336, CW = (X1 - X0) / 3, Y_LOS = 520, PX = 12.5;  // 12.5 units per yard
  var BAND_Y = [[-5, 0], [0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 40]];
  function yOf(yd) { return Y_LOS - yd * PX; }
  var LOCW = ["Left", "Middle", "Right"];
  var MIN_N = 3;

  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; }
  function sgn(v, d) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d); }
  function bandName(i) { return i === 0 ? "behind the line" : H.bands[i] + " air yards"; }
  function cellName(c) { return LOCW[c.l] + ", " + bandName(c.b); }
  function first(id) { return D.players[id] ? D.players[id].name.split(" ")[0] : ""; }
  function name(id) { return D.players[id] ? D.players[id].name : id; }

  function aggregate() {
    var g = [], i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < H.bands.length; j++) g.push({ l: i, b: j, att: 0, comp: 0, yds: 0, td: 0, int: 0, es: 0, en: 0, air: 0 });
    (H.cells[QB] || []).forEach(function (r) {
      if (REC && r[0] !== REC) return;
      var c = g[r[1] * H.bands.length + r[2]];
      c.att += r[3]; c.comp += r[4]; c.yds += r[5]; c.td += r[6]; c.int += r[7]; c.es += r[8]; c.en += r[9]; c.air += r[10];
    });
    g.forEach(function (c) { c.pct = c.att ? c.comp / c.att : null; c.ypa = c.att ? c.yds / c.att : null; c.epa = c.en ? c.es / c.en : null; });
    return g;
  }
  function value(c) { return METRIC === "att" ? (c.att || null) : c[METRIC]; }
  function label(c) {
    var v = value(c);
    if (v == null) return "";
    return METRIC === "att" ? String(v) : METRIC === "pct" ? Math.round(v * 100) + "%" : METRIC === "ypa" ? v.toFixed(1) : sgn(v, 2);
  }
  function scale(cells) {
    var vs = cells.map(value).filter(function (v) { return v != null; });
    if (METRIC === "att") return { lo: 0, hi: Math.max.apply(null, vs.concat([1])) };
    if (METRIC === "pct") return { lo: 0, hi: 1 };
    if (METRIC === "ypa") return { lo: 0, hi: Math.max(10, Math.ceil(Math.max.apply(null, vs.concat([0])))) };
    var m = Math.max(0.5, Math.max.apply(null, vs.map(Math.abs).concat([0]))); m = Math.ceil(m * 2) / 2;
    return { lo: -m, hi: m };
  }
  function fill(c, sc) {
    var v = value(c);
    if (v == null) return null;
    if (METRIC === "epa") { var t = Math.min(1, Math.abs(v) / sc.hi); return { col: v >= 0 ? "var(--accent)" : "var(--qh-neg)", op: 0.1 + 0.8 * t, dark: t > 0.55 }; }
    var u = sc.hi > sc.lo ? (v - sc.lo) / (sc.hi - sc.lo) : 0; u = Math.max(0, Math.min(1, u));
    return { col: "var(--accent)", op: 0.08 + 0.82 * u, dark: u > 0.55 };
  }

  function drawField() {
    svg.textContent = "";
    el("rect", { x: X0, y: yOf(40), width: X1 - X0, height: yOf(-5) - yOf(40), "class": "qh-turf", rx: 6 }, svg);
    var gl = el("g", { "class": "qh-lines" }, svg);
    for (var yd = -5; yd <= 40; yd++) {
      var y = yOf(yd);
      if (yd % 5 === 0 && yd !== 0) el("line", { x1: X0, x2: X1, y1: y, y2: y, "class": yd % 10 === 0 ? "qh-yl10" : "qh-yl5" }, gl);
      else if (yd !== 0 && yd > -5 && yd < 40) {
        // hash marks (NFL hashes sit ~44% / 56% across) and sideline ticks every yard
        [0.442, 0.558].forEach(function (f) { var x = X0 + (X1 - X0) * f; el("line", { x1: x - 4, x2: x + 4, y1: y, y2: y, "class": "qh-hash" }, gl); });
        el("line", { x1: X0, x2: X0 + 5, y1: y, y2: y, "class": "qh-hash" }, gl); el("line", { x1: X1 - 5, x2: X1, y1: y, y2: y, "class": "qh-hash" }, gl);
      }
    }
    [1, 2].forEach(function (k) { el("line", { x1: X0 + CW * k, x2: X0 + CW * k, y1: yOf(40), y2: yOf(-5), "class": "qh-third" }, gl); });
    [5, 10, 15, 20, 30].forEach(function (yd) { var t = el("text", { x: X0 - 8, y: yOf(yd) + 4, "class": "qh-yd" }, svg); t.textContent = String(yd); });
    var t0 = el("text", { x: X0 - 8, y: yOf(35) + 4, "class": "qh-yd" }, svg); t0.textContent = "30+";
    var g = el("g", { "class": "qh-cells" }, svg);
    CELLS.forEach(function (c, i) {
      var y1 = yOf(BAND_Y[c.b][1]), y2 = yOf(BAND_Y[c.b][0]);
      var cg = el("g", { "class": "qh-cell", tabindex: i === focusIdx ? "0" : "-1", role: "button", "data-i": i }, g);
      c.el = cg;
      c.rect = el("rect", { x: X0 + CW * c.l + 2, y: y1 + 2, width: CW - 4, height: y2 - y1 - 4, rx: 5 }, cg);
      c.txt = el("text", { x: X0 + CW * c.l + CW / 2, y: (y1 + y2) / 2 + 1, "class": "qh-v" }, cg);
      c.sub = el("text", { x: X0 + CW * c.l + CW / 2, y: (y1 + y2) / 2 + 15, "class": "qh-n" }, cg);
    });
    el("line", { x1: X0 - 4, x2: X1 + 4, y1: Y_LOS, y2: Y_LOS, "class": "qh-los" }, svg);
    var lt = el("text", { x: (X0 + X1) / 2, y: Y_LOS + 4, "class": "qh-los-t" }, svg); lt.textContent = "LINE OF SCRIMMAGE";
    var ar = el("text", { x: (X0 + X1) / 2, y: yOf(40) - 10, "class": "qh-dir" }, svg); ar.textContent = "↑ Downfield (air yards)";
    ["Left", "Middle", "Right"].forEach(function (s, k) { var t = el("text", { x: X0 + CW * k + CW / 2, y: yOf(-5) + 22, "class": "qh-col" }, svg); t.textContent = s; });
    var q = el("text", { x: (X0 + X1) / 2, y: yOf(-5) + 42, "class": "qh-qb" }, svg); q.textContent = "Quarterback's view";
  }
  function paint() {
    var sc = scale(CELLS);
    CELLS.forEach(function (c) {
      var f = fill(c, sc), low = c.att > 0 && c.att < MIN_N && METRIC !== "att";
      c.rect.setAttribute("class", "qh-r" + (f ? "" : " empty") + (low ? " low" : ""));
      if (f) { c.rect.style.fill = f.col; c.rect.style.fillOpacity = (low ? f.op * 0.55 : f.op).toFixed(3); } else { c.rect.style.fill = ""; c.rect.style.fillOpacity = ""; }
      c.txt.textContent = label(c) || (c.att ? "" : "·");
      c.txt.setAttribute("class", "qh-v" + (f && f.dark && !low ? " on" : ""));
      c.sub.textContent = METRIC !== "att" && c.att ? c.att + " att" : "";
      c.sub.setAttribute("class", "qh-n" + (f && f.dark && !low ? " on" : ""));
      c.el.setAttribute("aria-label", aria(c));
    });
    legend(sc);
  }
  function aria(c) {
    if (!c.att) return cellName(c) + ": no attempts";
    return cellName(c) + ": " + c.att + " attempts, " + c.comp + " completions (" + pct(c.comp, c.att) + "), " + fmt(c.yds) + " yards, " + c.td + " TD, " + c.int + " INT" + (c.en ? ", EPA per attempt " + sgn(c.es / c.en, 2) : "");
  }
  function tipHTML(c) {
    var h = '<div class="qn-tip-h"><b>' + esc(LOCW[c.l]) + " · " + esc(c.b === 0 ? "Behind the line" : H.bands[c.b] + " air yds") + "</b><span>" + esc(REC ? "to " + name(REC) : "all receivers") + "</span></div>";
    if (!c.att) return h + '<div class="qn-tip-r"><span>Attempts</span><b>0</b></div>';
    var rows = [["Attempts", c.att], ["Completions", c.comp + " (" + pct(c.comp, c.att) + ")"], ["Yards", fmt(c.yds)], ["Yds/att", (c.yds / c.att).toFixed(1)], ["TD / INT", c.td + " / " + c.int]];
    if (c.en) rows.push(["EPA/att", sgn(c.es / c.en, 2)]);
    h += rows.map(function (r) { return '<div class="qn-tip-r"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("");
    if (c.att < MIN_N) h += '<div class="qn-tip-note">Small sample</div>';
    return h;
  }
  function showTip(c) {
    tip.innerHTML = tipHTML(c); tip.hidden = false;
    var vb = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), k = vb.width / 360;
    var cx = vb.left - wr.left + (X0 + CW * c.l + CW / 2) * k, top = vb.top - wr.top + yOf(BAND_Y[c.b][1]) * k;
    var tw = tip.offsetWidth, th = tip.offsetHeight, W = wrap.clientWidth;
    var left = Math.max(4, Math.min(W - tw - 4, cx - tw / 2)), y = top - th - 8;
    if (y < 4) y = vb.top - wr.top + yOf(BAND_Y[c.b][0]) * k + 8;
    tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(y) + "px)";
    CELLS.forEach(function (d) { d.el.classList.toggle("sel", d === c); });
  }
  function hideTip() { tip.hidden = true; CELLS.forEach(function (d) { d.el.classList.remove("sel"); }); }

  function legend(sc) {
    var L = document.getElementById("qh-legend"), lab = { att: "Attempts", pct: "Completion %", ypa: "Yards per attempt", epa: "EPA per attempt" }[METRIC];
    var lo = METRIC === "pct" ? "0%" : METRIC === "epa" ? sgn(sc.lo, 1) : "0", hi = METRIC === "pct" ? "100%" : METRIC === "epa" ? sgn(sc.hi, 1) : METRIC === "ypa" ? sc.hi.toFixed(0) : String(sc.hi);
    L.innerHTML = '<span class="qh-lg-l">' + lab + '</span><span class="qh-lg-bar ' + (METRIC === "epa" ? "div" : "seq") + '"></span><span class="qh-lg-k"><span>' + lo + "</span>" + (METRIC === "epa" ? "<span>0</span>" : "") + "<span>" + hi + "</span></span>" +
      (METRIC !== "att" ? '<span class="qh-lg-s"><i></i>Lighter, dashed: fewer than ' + MIN_N + " attempts</span>" : "");
  }
  function stats() {
    var t = { att: 0, comp: 0, air: 0, deep: 0, sl: 0, sm: 0, sr: 0, l: [0, 0, 0], yds: 0, es: 0, en: 0 };
    CELLS.forEach(function (c) {
      t.att += c.att; t.comp += c.comp; t.air += c.air; t.yds += c.yds; t.es += c.es; t.en += c.en; t.l[c.l] += c.att;
      if (c.b >= 5) t.deep += c.att;
      if (c.b <= 2) { if (c.l === 0) t.sl += c.att; else if (c.l === 2) t.sr += c.att; else t.sm += c.att; }
    });
    var who = REC ? name(REC) : name(QB), poss = function (n) { return n + (/s$/.test(n) ? "'" : "'s"); };
    statusEl.textContent = REC ? "Showing " + t.att + " targets from " + name(QB) + " to " + who + "." : "Showing all " + t.att + " of " + poss(name(QB)) + " targeted attempts.";
    var dd = function (k, v, s) { return "<div><dt>" + k + "</dt><dd>" + v + (s ? "<span>" + s + "</span>" : "") + "</dd></div>"; };
    var shortTot = t.sl + t.sm + t.sr;
    document.getElementById("qh-stats").innerHTML = t.att ?
      dd("Attempts mapped", fmt(t.att), pct(t.comp, t.att) + " comp") +
      dd("Avg depth of target", (t.air / t.att).toFixed(1), "air yds") +
      dd("Deep (20+ air yds)", pct(t.deep, t.att), t.deep + " of " + t.att) +
      dd("Short throws: left / right", pct(t.sl, shortTot) + " / " + pct(t.sr, shortTot), "of " + shortTot + " under 10 yds") :
      dd("Attempts mapped", "0", "");
    var ex = (H.excluded[QB] || [0, 0, 0]);
    var parts = [];
    if (ex[0]) parts.push(ex[0] + " spike" + (ex[0] > 1 ? "s" : ""));
    if (ex[1]) parts.push(ex[1] + " incompletion" + (ex[1] > 1 ? "s" : "") + " with no intended receiver (throwaways or balls batted at the line)");
    if (ex[2]) parts.push(ex[2] + " missing location or air yards");
    document.getElementById("qh-excl").textContent = "Left out for " + name(QB) + ": " + (parts.length ? parts.join(", ") : "nothing") + ". Sacks and scrambles aren't pass attempts." + (REC ? " The receiver view counts only throws charted to him." : "");
    svg.setAttribute("aria-label", "Field map of " + poss(name(QB)) + " pass attempts" + (REC ? " to " + who : "") + " by direction and air yards. Use the arrow keys to move between zones.");
  }
  function fillRec() {
    var tot = {};
    (H.cells[QB] || []).forEach(function (r) { if (r[0]) tot[r[0]] = (tot[r[0]] || 0) + r[3]; });
    var ids = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a] || name(a).localeCompare(name(b)); });
    recSel.innerHTML = '<option value="">All receivers</option>' + ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(name(id)) + " · " + tot[id] + " target" + (tot[id] === 1 ? "" : "s") + "</option>"; }).join("");
    recSel.value = REC;
  }
  function render() { hideTip(); CELLS = aggregate(); drawField(); paint(); stats(); }
  function setRec(id) {
    REC = id && (H.cells[QB] || []).some(function (r) { return r[0] === id; }) ? id : "";
    recSel.value = REC; render();
  }

  // interactions
  svg.addEventListener("pointerover", function (e) { var g = e.target.closest(".qh-cell"); if (g && e.pointerType === "mouse") showTip(CELLS[+g.dataset.i]); });
  svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hideTip(); });
  // a tap focuses the cell (which opens its tip) before the click lands, so remember whether it was already open
  var wasOpen = false;
  svg.addEventListener("pointerdown", function (e) { var g = e.target.closest(".qh-cell"); wasOpen = !!g && !tip.hidden && g.classList.contains("sel"); });
  svg.addEventListener("click", function (e) { var g = e.target.closest(".qh-cell"); if (!g) { hideTip(); return; } if (wasOpen && e.pointerType !== "mouse") hideTip(); else showTip(CELLS[+g.dataset.i]); wasOpen = false; });
  svg.addEventListener("focusin", function (e) { var g = e.target.closest(".qh-cell"); if (g) { focusIdx = +g.dataset.i; showTip(CELLS[focusIdx]); } });
  svg.addEventListener("focusout", function () { setTimeout(function () { if (!svg.contains(document.activeElement)) hideTip(); }, 0); });
  svg.addEventListener("keydown", function (e) {
    var g = e.target.closest(".qh-cell"); if (!g) return;
    var c = CELLS[+g.dataset.i], l = c.l, b = c.b, nb = H.bands.length;
    if (e.key === "ArrowLeft") l = Math.max(0, l - 1); else if (e.key === "ArrowRight") l = Math.min(2, l + 1);
    else if (e.key === "ArrowUp") b = Math.min(nb - 1, b + 1); else if (e.key === "ArrowDown") b = Math.max(0, b - 1);
    else if (e.key === "Escape") { hideTip(); return; } else return;
    e.preventDefault();
    var n = l * nb + b; CELLS[focusIdx].el.setAttribute("tabindex", "-1"); focusIdx = n; CELLS[n].el.setAttribute("tabindex", "0"); CELLS[n].el.focus();
  });
  document.addEventListener("pointerdown", function (e) { if (!tip.hidden && !wrap.contains(e.target)) hideTip(); });
  document.querySelectorAll("[data-qh-m]").forEach(function (b) {
    b.addEventListener("click", function () {
      METRIC = b.dataset.qhM;
      document.querySelectorAll("[data-qh-m]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      hideTip(); paint();
    });
  });
  recSel.addEventListener("change", function () { setRec(recSel.value); });
  window.addEventListener("resize", hideTip);

  document.addEventListener("qn:load", function (e) {
    D = e.detail.data; H = D.heat;
    var box = document.getElementById("qh");
    if (!H || !H.cells) { if (box) box.hidden = true; return; }
    QB = e.detail.qb; REC = ""; focusIdx = 0;
    var hasEpa = Object.keys(H.cells).some(function (k) { return H.cells[k].some(function (r) { return r[9] > 0; }); });
    var eb = document.querySelector('[data-qh-m="epa"]'); if (eb) eb.hidden = !hasEpa;
    if (!hasEpa && METRIC === "epa") METRIC = "att";
    fillRec(); render();
  });
  document.addEventListener("qn:pick", function (e) { if (H && QB) setRec(e.detail.id || ""); });
})();
