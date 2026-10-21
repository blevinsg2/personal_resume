/* Box office explorer. Data: /assets/data/box_office.json (built by scripts/build_box_office.py from Wikipedia, Wikidata and BLS CPI-U). Vanilla JS + SVG. */
(function () {
  "use strict";
  var root = document.getElementById("bo");
  if (!root) return;
  var NS = "http://www.w3.org/2000/svg";
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COL = { "Animation": "#f08a24", "Superhero": "#e5484d", "Sci-fi & fantasy": "#3e7bfa", "Horror": "#8e5bd6", "Action & adventure": "#14a38b", "Thriller & crime": "#7f8ea3", "Comedy": "#e8b10e", "Drama": "#c76a8f", "Other": "#a8adb5" };
  var ACOL = ["#3e7bfa", "#f08a24", "#14a38b"];
  var D, F, CPI, BASE, G, YMIN, YMAX;
  var st = { tab: "genre", real: true, y0: 0, y1: 0, share: false, iso: null, race: "year", cm: "med", qm: "rt", dec: 2010,
    actors: ["Tom Hanks", "Tom Cruise", "Robert Downey Jr."], sel: null, cur: {}, hov: null };
  var players = {};

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function el(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function val(v, y) { return v == null ? null : st.real ? v * CPI[BASE] / CPI[y] : v; }
  function money(v) { if (v == null) return "—"; var a = Math.abs(v); return a >= 1e9 ? "$" + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B" : a >= 1e6 ? "$" + Math.round(v / 1e6) + "M" : a >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v); }
  function pct(v) { return (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%"; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function years() { var r = []; for (var y = st.y0; y <= st.y1; y++) r.push(y); return r; }
  function inRange(f) { return f.y >= st.y0 && f.y <= st.y1; }
  function nice(max) { if (!(max > 0)) return [0, 1]; var p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p, s = m <= 1 ? .2 : m <= 2 ? .5 : m <= 5 ? 1 : 2; s *= p; var t = []; for (var v = 0; v <= max + s * .999; v += s) t.push(v); return t; }
  function dollarsNote() { return st.real ? BASE + " dollars" : "nominal dollars"; }
  function svgPoint(svg, e) { var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; return { x: (e.clientX - r.left) / r.width * vb.width, y: (e.clientY - r.top) / r.height * vb.height }; }
  function tipAt(tip, svg, x, y, html) {
    var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), px = x / vb.width * r.width, py = y / vb.height * r.height;
    tip.innerHTML = html; tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight, left = px + 14, top = py - th - 10;
    if (left + tw > r.width) left = Math.max(0, px - tw - 14);
    if (top < 0) top = Math.min(r.height - th, py + 14);
    tip.style.left = left + "px"; tip.style.top = Math.max(0, top) + "px";
  }
  function axisY(svg, ticks, yS, L, W, R, fmt) {
    ticks.forEach(function (t) {
      el("line", { x1: L, x2: W - R, y1: yS(t), y2: yS(t), class: "bo-gl" }, svg);
      var tx = el("text", { x: L - 8, y: yS(t) + 4, class: "bo-ax", "text-anchor": "end" }, svg); tx.textContent = fmt(t);
    });
  }
  function axisX(svg, xS, H, B, step) {
    years().forEach(function (y) {
      if ((y % step) && y !== st.y0) return;
      if (y !== st.y0 && y - st.y0 < step / 2) return;
      var tx = el("text", { x: xS(y), y: H - B + 18, class: "bo-ax", "text-anchor": "middle" }, svg); tx.textContent = y;
    });
  }
  function xStep() { var n = st.y1 - st.y0; return n > 30 ? 10 : n > 14 ? 5 : n > 6 ? 2 : 1; }

  /* ---------------- race bars ---------------- */
  function race(box, items, n, pick) {
    var rowH = 30, max = items.length ? items[0].v : 1;
    box._rows = box._rows || {};
    box.style.height = n * rowH + "px";
    var seen = {};
    items.slice(0, n).forEach(function (it, i) {
      var r = box._rows[it.k];
      if (!r) {
        r = document.createElement(pick ? "button" : "div"); r.className = "bo-row";
        if (pick) { r.type = "button"; r.dataset.sel = it.k; }
        r.innerHTML = '<span class="bo-rl"></span><span class="bo-rb"><i></i></span><span class="bo-rv"></span>';
        r.style.transform = "translateY(" + n * rowH + "px)"; r.style.opacity = 0;
        box.appendChild(r); box._rows[it.k] = r; void r.offsetWidth;
      }
      seen[it.k] = 1;
      r.style.transform = "translateY(" + i * rowH + "px)"; r.style.opacity = 1;
      r.querySelector(".bo-rl").textContent = it.label;
      var b = r.querySelector("i"); b.style.width = Math.max(.5, it.v / max * 100) + "%"; b.style.background = it.color;
      r.querySelector(".bo-rv").textContent = money(it.v);
      r.title = it.sub || "";
      if (pick) { r.tabIndex = 0; r.removeAttribute("aria-hidden"); r.classList.toggle("on", it.k === pick.sel); r.setAttribute("aria-pressed", it.k === pick.sel ? "true" : "false"); r.setAttribute("aria-label", "Show films for " + it.label + ", " + money(it.v) + ", " + (it.sub || "")); }
    });
    Object.keys(box._rows).forEach(function (k) {
      if (!seen[k]) { var r = box._rows[k]; r.style.opacity = 0; r.style.transform = "translateY(" + n * rowH + "px)"; if (pick) { r.tabIndex = -1; r.setAttribute("aria-hidden", "true"); } }
    });
    box.setAttribute("aria-label", items.slice(0, n).map(function (it, i) { return (i + 1) + ". " + it.label + " " + money(it.v); }).join(", "));
  }

  /* ---------------- player (play axis) ---------------- */
  function Player(name, onYear) {
    var box = $('[data-player="' + name + '"]'), btn = $(".bo-play", box), rng = $(".bo-scrub", box), out = $(".bo-yl", box), spd = $("select", box);
    var timer = null, self = this;
    this.year = YMAX;
    function set(y, fromPlay) { self.year = Math.max(st.y0, Math.min(st.y1, y)); rng.value = self.year; out.textContent = self.year; onYear(self.year, fromPlay); }
    function tick() { if (self.year >= st.y1) { self.stop(); return; } set(self.year + 1, true); }
    this.stop = function () { if (timer) { clearInterval(timer); timer = null; } btn.textContent = "▶"; btn.setAttribute("aria-label", "Play"); box.classList.remove("on"); };
    this.play = function () {
      if (self.year >= st.y1) set(st.y0, true);
      timer = setInterval(tick, 900 / (+spd.value || 1)); btn.textContent = "❚❚"; btn.setAttribute("aria-label", "Pause"); box.classList.add("on");
    };
    this.toggle = function () { timer ? self.stop() : self.play(); };
    this.step = function (d) { self.stop(); set(self.year + d); };
    this.reset = function () { self.stop(); rng.min = st.y0; rng.max = st.y1; set(st.y1); };
    this.set = set;
    btn.addEventListener("click", function () { self.toggle(); });
    rng.addEventListener("input", function () { self.stop(); set(+rng.value); });
    spd.addEventListener("change", function () { if (timer) { self.stop(); self.play(); } });
    rng.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); self.toggle(); } });
  }

  /* ---------------- genre view ---------------- */
  function aggGenre() {
    var A = {};
    years().forEach(function (y) { A[y] = { tot: 0, g: {} }; });
    F.forEach(function (f) {
      if (!inRange(f) || !f.ww) return;
      var v = val(f.ww, f.y), a = A[f.y], g = a.g[f.g] || (a.g[f.g] = { v: 0, n: 0, top: null });
      a.tot += v; g.v += v; g.n++;
      if (!g.top || v > g.top.v) g.top = { t: f.t, v: v };
    });
    return A;
  }
  var GS = null;
  function drawGenre() {
    var svg = $("#bo-g-svg"); svg.innerHTML = "";
    var W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, L = 56, R = 12, T = 14, B = 30, ys = years(), A = aggGenre(), cur = players.genre ? players.genre.year : st.y1;
    var gens = st.iso ? [st.iso] : G;
    function v(y, g) { var x = A[y].g[g] ? A[y].g[g].v : 0; return st.share ? (A[y].tot ? x / A[y].tot : 0) : x; }
    var max = 0;
    ys.forEach(function (y) { var s = 0; gens.forEach(function (g) { s += v(y, g); }); max = Math.max(max, s); });
    if (st.share && !st.iso) max = 1;
    var ticks = st.share ? (st.iso ? nice(max) : [0, .25, .5, .75, 1]) : nice(max), top = ticks[ticks.length - 1] || 1;
    var xS = function (y) { return ys.length < 2 ? L : L + (y - st.y0) / (st.y1 - st.y0) * (W - L - R); };
    var yS = function (x) { return H - B - x / top * (H - B - T); };
    axisY(svg, ticks, yS, L, W, R, st.share ? function (t) { return Math.round(t * 100) + "%"; } : money);
    axisX(svg, xS, H, B, xStep());
    var defs = el("defs", {}, svg), cp = el("clipPath", { id: "bo-gclip" }, defs);
    el("rect", { x: 0, y: 0, width: Math.min(W, xS(cur) + 1), height: H }, cp);
    var g0 = el("g", { "clip-path": "url(#bo-gclip)" }, svg);
    var base = ys.map(function () { return 0; }), bands = {};
    gens.forEach(function (g) {
      var lo = base.slice(), hi = ys.map(function (y, i) { return (base[i] += v(y, g)); });
      bands[g] = { lo: lo, hi: hi };
      var d = "M" + ys.map(function (y, i) { return xS(y).toFixed(1) + "," + yS(hi[i]).toFixed(1); }).join("L") +
        "L" + ys.slice().reverse().map(function (y, j) { var i = ys.length - 1 - j; return xS(y).toFixed(1) + "," + yS(lo[i]).toFixed(1); }).join("L") + "Z";
      var p = el("path", { d: d, fill: COL[g], class: "bo-area", "data-g": g }, g0);
      p.addEventListener("click", function () { isolate(g); });
    });
    el("line", { x1: xS(cur), x2: xS(cur), y1: T, y2: H - B, class: "bo-cur" }, svg);
    var hl = el("line", { x1: 0, x2: 0, y1: T, y2: H - B, class: "bo-hl", visibility: "hidden" }, svg);
    GS = { A: A, ys: ys, gens: gens, bands: bands, xS: xS, yS: yS, top: top, L: L, R: R, W: W, H: H, B: B, T: T, hl: hl };
    drawGenreRace(cur, A);
  }
  function drawGenreRace(cur, A) {
    A = A || GS.A;
    var items = (st.iso ? [st.iso] : G).map(function (g) {
      var v = 0, top = null;
      for (var y = st.race === "cum" ? st.y0 : cur; y <= cur; y++) { var x = A[y] && A[y].g[g]; if (x) { v += x.v; if (!top || x.top.v > top.v) top = x.top; } }
      return { k: g, label: g, v: v, color: COL[g], sub: top ? "Top film: " + top.t : "" };
    }).filter(function (i) { return i.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    $("#bo-g-rlabel").textContent = st.race === "cum" ? st.y0 + "–" + cur : String(cur);
    race($("#bo-g-race"), items, st.iso ? 1 : G.length);
  }
  function genreTip(y, g) {
    var tip = $("#bo-g-tip"), svg = $("#bo-g-svg");
    if (y == null) { tip.hidden = true; GS.hl.setAttribute("visibility", "hidden"); return; }
    var a = GS.A[y], x = GS.xS(y), html = '<b>' + y + '</b> · all genres ' + money(a.tot);
    if (g && a.g[g]) {
      var s = a.g[g];
      html += '<div class="bo-tg"><i style="background:' + COL[g] + '"></i>' + esc(g) + ": <b>" + money(s.v) + "</b> (" + pct(a.tot ? s.v / a.tot : 0) + ", " + s.n + " film" + (s.n > 1 ? "s" : "") + ')</div><div class="bo-tf">Top film: ' + esc(s.top.t) + " · " + money(s.top.v) + "</div>";
    } else {
      var arr = Object.keys(a.g).map(function (k) { return [k, a.g[k]]; }).sort(function (p, q) { return q[1].v - p[1].v; }).slice(0, 3);
      html += arr.map(function (p) { return '<div class="bo-tg"><i style="background:' + COL[p[0]] + '"></i>' + esc(p[0]) + ": " + money(p[1].v) + "</div>"; }).join("");
    }
    GS.hl.setAttribute("x1", x); GS.hl.setAttribute("x2", x); GS.hl.setAttribute("visibility", "visible");
    var gy = g && GS.bands[g] ? GS.yS(GS.bands[g].hi[GS.ys.indexOf(y)]) : GS.T + 20;
    tipAt(tip, svg, x, gy, html);
    st.hov = { y: y, g: g };
  }
  function genreHit(e) {
    var svg = $("#bo-g-svg"), p = svgPoint(svg, e);
    if (p.x < GS.L - 4 || p.x > GS.W - GS.R + 4) return genreTip(null);
    var y = Math.round(st.y0 + (p.x - GS.L) / (GS.W - GS.L - GS.R) * (st.y1 - st.y0)); y = Math.max(st.y0, Math.min(st.y1, y));
    var i = GS.ys.indexOf(y), vv = (GS.H - GS.B - p.y) / (GS.H - GS.B - GS.T) * GS.top, hit = null;
    GS.gens.forEach(function (g) { var b = GS.bands[g]; if (vv >= b.lo[i] && vv <= b.hi[i]) hit = g; });
    genreTip(y, hit);
  }
  function isolate(g) {
    st.iso = st.iso === g ? null : g;
    $$("#bo-legend button").forEach(function (b) { b.setAttribute("aria-pressed", st.iso === b.dataset.g ? "true" : "false"); b.classList.toggle("dim", !!st.iso && st.iso !== b.dataset.g); });
    drawGenre();
  }

  /* ---------------- actor view ---------------- */
  var LEADS = {};
  function leadFilms(name, all) { return (LEADS[name] || []).filter(function (f) { return inRange(f) && (all || f.ww); }).sort(function (a, b) { return a.y - b.y || (b.ww || 0) - (a.ww || 0); }); }
  var AS = null;
  function drawActors() {
    var svg = $("#bo-a-svg"); svg.innerHTML = "";
    var W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, L = 56, R = 12, T = 14, B = 30, cur = players.actor ? players.actor.year : st.y1;
    var xS = function (y) { return st.y1 === st.y0 ? L : L + (y - st.y0) / (st.y1 - st.y0) * (W - L - R); };
    var series = st.actors.map(function (a) { var c = 0; return { a: a, pts: leadFilms(a).map(function (f) { c += val(f.ww, f.y); return { f: f, c: c, v: val(f.ww, f.y) }; }) }; });
    var max = 0, maxv = 0; series.forEach(function (s) { s.pts.forEach(function (p) { max = Math.max(max, p.c); maxv = Math.max(maxv, p.v); }); });
    var ticks = nice(max || 1), top = ticks[ticks.length - 1];
    var yS = function (v) { return H - B - v / top * (H - B - T); };
    axisY(svg, ticks, yS, L, W, R, money); axisX(svg, xS, H, B, xStep());
    var cp = el("clipPath", { id: "bo-aclip" }, el("defs", {}, svg)); el("rect", { x: 0, y: 0, width: Math.min(W, xS(cur) + 12), height: H }, cp);
    var g0 = el("g", { "clip-path": "url(#bo-aclip)" }, svg);
    series.forEach(function (s, si) {
      var d = "M" + xS(st.y0) + "," + yS(0), c = 0;
      s.pts.forEach(function (p) { d += "H" + xS(p.f.y).toFixed(1) + "V" + yS(p.c).toFixed(1); c = p.c; });
      d += "H" + xS(st.y1);
      var dim = st.sel && st.sel !== s.a ? " bo-dim" : st.sel === s.a ? " on" : "";
      el("path", { d: d, class: "bo-step" + dim, stroke: ACOL[si] }, g0);
      s.pts.forEach(function (p) {
        var r = 3 + Math.sqrt(p.v / (maxv || 1)) * 8;
        var dot = el("circle", { cx: xS(p.f.y), cy: yS(p.c), r: r, fill: ACOL[si], class: "bo-dot" + dim }, g0);
        dot.addEventListener("pointerenter", function () { tipAt($("#bo-a-tip"), svg, xS(p.f.y), yS(p.c), "<b>" + esc(p.f.t) + "</b> (" + p.f.y + ")<div>" + esc(s.a) + " · " + money(p.v) + " worldwide</div><div class='bo-tf'>" + esc(p.f.g) + (p.f.bud ? " · budget " + money(val(p.f.bud, p.f.y)) : "") + "</div><div class='bo-tf'>Running total " + money(p.c) + "</div>"); });
        dot.addEventListener("pointerleave", function () { $("#bo-a-tip").hidden = true; });
      });
    });
    el("line", { x1: xS(cur), x2: xS(cur), y1: T, y2: H - B, class: "bo-cur" }, svg);
    // end labels, nudged apart so they don't overlap
    var labs = [];
    series.forEach(function (s, si) {
      var last = null; s.pts.forEach(function (p) { if (p.f.y <= cur) last = p; });
      if (last) labs.push({ si: si, y: yS(last.c) - 8, txt: s.a.split(" ").filter(function (w) { return !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w); }).slice(-1)[0] + " " + money(last.c) });
    });
    labs.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 16) labs[i].y = labs[i - 1].y + 16;
    labs.forEach(function (l) { var t = el("text", { x: Math.min(xS(cur), W - R) - 4, y: Math.max(T + 10, l.y), class: "bo-lab" + (st.sel && st.sel !== series[l.si].a ? " bo-dim" : ""), "text-anchor": "end", fill: ACOL[l.si] }, svg); t.textContent = l.txt; });
    AS = { series: series };
    drawActorRace(cur); drawActorTable(); drawChips();
  }
  function drawActorRace(cur) {
    var tot = {}, n = {};
    F.forEach(function (f) { if (f.lead && f.ww && f.y >= st.y0 && f.y <= cur) { tot[f.lead] = (tot[f.lead] || 0) + val(f.ww, f.y); n[f.lead] = (n[f.lead] || 0) + 1; } });
    var items = Object.keys(tot).map(function (k) { var i = st.actors.indexOf(k); return { k: k, label: k, v: tot[k], color: i >= 0 ? ACOL[i] : "var(--muted)", sub: n[k] + " films" }; }).sort(function (a, b) { return b.v - a.v; });
    $("#bo-a-rlabel").textContent = cur;
    race($("#bo-a-race"), items, 10, { sel: st.sel });
  }
  function drawActorTable() {
    var rows = [], who = st.sel ? [st.sel] : st.actors;
    who.forEach(function (a) { var i = st.actors.indexOf(a); leadFilms(a, true).forEach(function (f) { rows.push([f, a, i]); }); });
    rows.sort(function (p, q) { return p[0].y - q[0].y || (q[0].ww || 0) - (p[0].ww || 0); });
    $("#bo-a-table tbody").innerHTML = rows.map(function (r) { return '<tr><td>' + esc(r[0].t) + '</td><td><button type="button" class="bo-tname" data-sel="' + esc(r[1]) + '" aria-pressed="' + (st.sel === r[1]) + '" aria-label="' + (st.sel === r[1] ? "Show all selected actors" : "Show only " + esc(r[1]) + "'s films") + '"><i class="bo-sw" style="background:' + (ACOL[r[2]] || "var(--muted)") + '"></i>' + esc(r[1]) + '</button></td><td class="n">' + r[0].y + '</td><td class="n">' + money(val(r[0].ww, r[0].y)) + "</td></tr>"; }).join("") ||
      '<tr><td colspan="4" class="bo-muted">No films in this year range.</td></tr>';
    var yr = st.y0 === st.y1 ? st.y0 : st.y0 + "–" + st.y1, n = rows.length;
    $("#bo-a-status").innerHTML = (st.sel
      ? '<span>Showing <b>' + n + "</b> film" + (n === 1 ? "" : "s") + " with <b>" + esc(st.sel) + "</b> as lead, " + yr + '</span> <button type="button" class="bo-btn sm" id="bo-a-all">All selected actors</button>'
      : '<span>Showing <b>' + n + "</b> film" + (n === 1 ? "" : "s") + " for " + (["no actors", "1 selected actor", "both selected actors", "all 3 selected actors"][st.actors.length]) + ", " + yr + ". Click a name to filter.</span>");
    $("#bo-a-table caption").textContent = st.sel ? "Films with " + st.sel + " as lead, " + yr : "Films of the selected actors, " + yr;
  }
  function drawChips() {
    $("#bo-chips").innerHTML = st.actors.map(function (a, i) { var n = leadFilms(a, true).length, on = st.sel === a; return '<span class="bo-chip' + (on ? " on" : st.sel ? " off" : "") + '" style="--c:' + ACOL[i] + '"><button type="button" class="bo-cname" data-sel="' + esc(a) + '" aria-pressed="' + on + '" title="' + esc(a) + " · " + n + " film" + (n === 1 ? "" : "s") + (on ? " (showing only this actor; click again for all)" : " (show only this actor)") + '"><i aria-hidden="true"></i><span class="nm">' + esc(a) + '</span><small>' + n + " film" + (n === 1 ? "" : "s") + '</small></button><button type="button" class="bo-cx" data-rm="' + esc(a) + '" aria-label="Remove ' + esc(a) + '" title="Remove ' + esc(a) + '">×</button></span>'; }).join("");
  }
  function canon(name) {
    var q = String(name || "").trim().toLowerCase(); if (!q) return null;
    var m = Object.keys(LEADS).filter(function (k) { return k.toLowerCase() === q; })[0];
    if (!m) m = Object.keys(LEADS).filter(function (k) { return k.toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return LEADS[b].length - LEADS[a].length; })[0];
    return m || null;
  }
  // Click a name anywhere: add it to the compare set if needed and filter the table to that actor alone.
  // Clicking the active actor again goes back to all selected actors.
  function selectActor(name, opts) {
    var m = canon(name); if (!m) return false;
    opts = opts || {};
    if (st.sel === m && !opts.keep) st.sel = null;
    else {
      if (st.actors.indexOf(m) < 0) { if (st.actors.length >= 3) st.actors.shift(); st.actors.push(m); }
      st.sel = m;
    }
    drawActors(); drawBoard();
    var wrap = $("#bo-p-actor .bo-tablewrap"); wrap.scrollTop = 0;
    var r = wrap.getBoundingClientRect(), vh = window.innerHeight || 800;
    if (r.top < 70 || r.top > vh - 120) $("#bo-a-status").scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
    return true;
  }
  function clearSel() { st.sel = null; drawActors(); drawBoard(); }
  function drawBoard() {
    var decs = []; for (var d = Math.floor(YMIN / 10) * 10; d <= YMAX; d += 10) decs.push(d);
    $("#bo-dec").innerHTML = decs.map(function (d) { return '<button type="button" data-dec="' + d + '" aria-pressed="' + (d === st.dec) + '">' + d + "s</button>"; }).join("");
    var tot = {}, n = {}, top = {};
    F.forEach(function (f) {
      if (!f.lead || !f.ww || f.y < st.dec || f.y > st.dec + 9) return;
      var v = val(f.ww, f.y); tot[f.lead] = (tot[f.lead] || 0) + v; n[f.lead] = (n[f.lead] || 0) + 1;
      if (!top[f.lead] || v > top[f.lead].v) top[f.lead] = { t: f.t, v: v };
    });
    var arr = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; }).slice(0, 8);
    $("#bo-board").innerHTML = arr.map(function (k) { return '<li><button type="button" class="bo-lead" data-sel="' + esc(k) + '" title="' + esc(k) + '" aria-pressed="' + (st.sel === k) + '" aria-label="Show films for ' + esc(k) + '"><span class="nm">' + esc(k) + '</span><span class="v">' + money(tot[k]) + '</span><small>' + n[k] + " film" + (n[k] > 1 ? "s" : "") + " · top: " + esc(top[k].t) + "</small></button></li>"; }).join("");
  }

  /* ---------------- cost view ---------------- */
  function yearStats(y) {
    var fs = F.filter(function (f) { return f.y === y; }), b = fs.filter(function (f) { return f.bud; }).map(function (f) { return val(f.bud, f.y); });
    var big = fs.filter(function (f) { return f.bud; }).sort(function (p, q) { return q.bud - p.bud; })[0];
    return { n: fs.length, nb: b.length, med: median(b), tot: b.reduce(function (s, x) { return s + x; }, 0), s100: b.length ? b.filter(function (x) { return x >= 1e8; }).length / b.length : null, big: big };
  }
  function cohort(a, b) {
    var fs = F.filter(function (f) { return f.y >= a && f.y <= b; });
    var bud = fs.filter(function (f) { return f.bud; }).map(function (f) { return val(f.bud, f.y); });
    return { n: fs.length / (b - a + 1), med: median(bud), s100: bud.length ? bud.filter(function (x) { return x >= 1e8; }).length / bud.length : null,
      rt: median(fs.filter(function (f) { return f.rt != null; }).map(function (f) { return f.rt; })),
      roi: median(fs.filter(function (f) { return f.bud && f.ww; }).map(function (f) { return f.ww / f.bud; })) };
  }
  function drawKpis() {
    var span = st.y1 - st.y0 + 1, w = span >= 10 ? 5 : Math.max(1, Math.floor(span / 2));
    var a = cohort(st.y0, st.y0 + w - 1), b = cohort(st.y1 - w + 1, st.y1);
    var la = w > 1 ? st.y0 + "–" + (st.y0 + w - 1) : String(st.y0), lb = w > 1 ? (st.y1 - w + 1) + "–" + st.y1 : String(st.y1);
    $("#bo-c-cmp").textContent = "First " + (w > 1 ? w + " years" : "year") + " of your range (" + la + ") vs the last (" + lb + "), " + dollarsNote() + ".";
    function ch(x, y, fmtd) { if (x == null || y == null) return ""; var d = (y / x - 1) * 100; return '<span class="bo-chg ' + (d >= 0 ? "up" : "dn") + '">' + (fmtd ? fmtd(y - x) : (d >= 0 ? "+" : "") + d.toFixed(0) + "%") + "</span>"; }
    var pts = function (d) { return (d >= 0 ? "+" : "") + Math.round(d * 100) + " pts"; }, rtp = function (d) { return (d >= 0 ? "+" : "") + Math.round(d) + " pts"; };
    var k = [
      ["Median budget", money(a.med), money(b.med), ch(a.med, b.med)],
      ["$100M+ budgets", a.s100 == null ? "—" : pct(a.s100), b.s100 == null ? "—" : pct(b.s100), ch(a.s100, b.s100, pts)],
      ["Median critics' score", a.rt == null ? "—" : Math.round(a.rt) + "%", b.rt == null ? "—" : Math.round(b.rt) + "%", ch(a.rt, b.rt, rtp)],
      ["Median gross ÷ budget", a.roi == null ? "—" : a.roi.toFixed(1) + "×", b.roi == null ? "—" : b.roi.toFixed(1) + "×", ch(a.roi, b.roi)],
      ["Films tracked a year", a.n.toFixed(0), b.n.toFixed(0), ch(a.n, b.n)]
    ];
    $("#bo-kpis").innerHTML = k.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd><span class='a'>" + r[1] + "</span><span class='ar' aria-hidden='true'>→</span><b>" + r[2] + "</b> " + r[3] + "</dd></div>"; }).join("");
  }
  var CS = null;
  function drawCost() {
    var svg = $("#bo-c-svg"); svg.innerHTML = "";
    var W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, L = 56, R = 10, T = 14, B = 30, ys = years(), S = ys.map(yearStats), cur = players.cost ? players.cost.year : st.y1;
    var key = st.cm, get = function (s) { return s[key]; };
    var max = Math.max.apply(null, S.map(function (s) { return get(s) || 0; }));
    var ticks = key === "s100" ? [0, .25, .5, .75, 1] : nice(max), top = ticks[ticks.length - 1] || 1;
    var bw = (W - L - R) / ys.length, xS = function (y) { return L + (y - st.y0 + .5) * bw; }, yS = function (v) { return H - B - v / top * (H - B - T); };
    var fmt = key === "s100" ? function (t) { return Math.round(t * 100) + "%"; } : key === "n" ? function (t) { return String(Math.round(t)); } : money;
    axisY(svg, ticks, yS, L, W, R, fmt);
    axisX(svg, xS, H, B, xStep());
    S.forEach(function (s, i) {
      var v = get(s) || 0, y = ys[i];
      el("rect", { x: xS(y) - bw * .38, width: bw * .76, y: yS(v), height: Math.max(0, H - B - yS(v)), rx: 2, class: "bo-cbar" + (y === cur ? " on" : "") }, svg);
    });
    CS = { S: S, ys: ys, xS: xS, yS: yS, get: get, fmt: fmt, L: L, W: W, R: R, bw: bw };
    drawQuality(); drawKpis(); drawBubbles(cur);
  }
  function costTip(i) {
    var tip = $("#bo-c-tip"), svg = $("#bo-c-svg");
    if (i == null || i < 0 || i >= CS.ys.length) { tip.hidden = true; return; }
    var s = CS.S[i], y = CS.ys[i];
    tipAt(tip, svg, CS.xS(y), CS.yS(CS.get(s) || 0), "<b>" + y + "</b> · " + s.n + " films (" + s.nb + " with budgets)<div>Median " + money(s.med) + " · total " + money(s.tot) + "</div><div>$100M+ " + (s.s100 == null ? "—" : pct(s.s100)) + "</div>" + (s.big ? "<div class='bo-tf'>Priciest: " + esc(s.big.t) + " · " + money(val(s.big.bud, s.big.y)) + "</div>" : ""));
    st.hovC = i;
  }
  function drawQuality() {
    var svg = $("#bo-q-svg"); svg.innerHTML = "";
    var W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, L = 48, R = 14, T = 18, B = 30, bins = [];
    for (var e2 = st.y1; e2 >= st.y0; e2 -= 5) bins.unshift([Math.max(st.y0, e2 - 4), e2]);  // anchored to the last year so the newest group is full
    if (bins.length > 1 && bins[0][1] - bins[0][0] < 2) bins.shift();
    var m = st.qm;
    var data = bins.map(function (b) {
      var fs = F.filter(function (f) { return f.y >= b[0] && f.y <= b[1] && f.bud; });
      function grp(big) {
        var g = fs.filter(function (f) { return (val(f.bud, f.y) >= 1e8) === big; });
        var v = m === "rt" ? g.filter(function (f) { return f.rt != null; }).map(function (f) { return f.rt; }) : g.filter(function (f) { return f.ww; }).map(function (f) { return f.ww / f.bud; });
        return { v: v.length >= 3 ? median(v) : null, n: v.length };
      }
      return { b: b, big: grp(true), small: grp(false) };
    });
    var max = 0; data.forEach(function (d) { max = Math.max(max, d.big.v || 0, d.small.v || 0); });
    var ticks = m === "rt" ? [0, 25, 50, 75, 100] : nice(max), top = ticks[ticks.length - 1] || 1;
    var xS = function (i) { return data.length < 2 ? (L + W - R) / 2 : L + 20 + i / (data.length - 1) * (W - L - R - 40); }, yS = function (v) { return H - B - v / top * (H - B - T); };
    axisY(svg, ticks, yS, L, W, R, m === "rt" ? function (t) { return t + "%"; } : function (t) { return t + "×"; });
    if (m === "roi") { el("line", { x1: L, x2: W - R, y1: yS(1), y2: yS(1), class: "bo-ref" }, svg); var rt = el("text", { x: W - R, y: yS(1) - 5, class: "bo-ax", "text-anchor": "end" }, svg); rt.textContent = "1× = gross equals budget"; }
    var narrow = svg.getBoundingClientRect().width < 480;
    data.forEach(function (d, i) { if (narrow && i % 2) return; var t = el("text", { x: xS(i), y: H - B + 18, class: "bo-ax", "text-anchor": "middle" }, svg); t.textContent = d.b[0] === d.b[1] ? d.b[0] : d.b[0] + "–" + String(d.b[1]).slice(2); });
    [["big", "k-big"], ["small", "k-small"]].forEach(function (k) {
      var pts = data.map(function (d, i) { return d[k[0]].v == null ? null : [xS(i), yS(d[k[0]].v), d, i]; }).filter(Boolean);
      if (pts.length > 1) el("path", { d: "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"), class: "bo-qline " + k[1] }, svg);
      pts.forEach(function (p) {
        var c = el("circle", { cx: p[0], cy: p[1], r: 5, class: "bo-qdot " + k[1] }, svg);
        c.addEventListener("pointerenter", function () {
          var g = p[2][k[0]], lb = p[2].b[0] + "–" + p[2].b[1];
          tipAt($("#bo-q-tip"), svg, p[0], p[1], "<b>" + lb + "</b> · " + (k[0] === "big" ? "$100M+ budgets" : "under $100M") + "<div>Median " + (m === "rt" ? Math.round(g.v) + "% on Rotten Tomatoes" : g.v.toFixed(1) + "× gross ÷ budget") + "</div><div class='bo-tf'>" + g.n + " films</div>");
        });
        c.addEventListener("pointerleave", function () { $("#bo-q-tip").hidden = true; });
      });
    });
    $("#bo-q-note").textContent = "$100M in " + dollarsNote() + ". Groups need 3+ films.";
  }
  var BUB = {};
  function drawBubbles(cur) {
    var svg = $("#bo-b-svg"), W = 900, H = 420, L = 66, R = 20, T = 16, B = 40;
    $("#bo-b-yr").textContent = cur;
    if (!svg._init || svg._real !== st.real) {
      svg.innerHTML = ""; BUB = {}; svg._init = 1; svg._real = st.real;
      var bmin = 5e6, bmax = 6e8, gmin = 2e7, gmax = 4e9;
      var lx = function (v) { return L + (Math.log(v) - Math.log(bmin)) / (Math.log(bmax) - Math.log(bmin)) * (W - L - R); };
      var ly = function (v) { return H - B - (Math.log(v) - Math.log(gmin)) / (Math.log(gmax) - Math.log(gmin)) * (H - B - T); };
      svg._lx = lx; svg._ly = ly;
      [1e7, 3e7, 1e8, 3e8].forEach(function (t) { el("line", { x1: lx(t), x2: lx(t), y1: T, y2: H - B, class: "bo-gl" }, svg); var tx = el("text", { x: lx(t), y: H - B + 18, class: "bo-ax", "text-anchor": "middle" }, svg); tx.textContent = money(t); });
      [3e7, 1e8, 3e8, 1e9, 3e9].forEach(function (t) { el("line", { x1: L, x2: W - R, y1: ly(t), y2: ly(t), class: "bo-gl" }, svg); var tx = el("text", { x: L - 8, y: ly(t) + 4, class: "bo-ax", "text-anchor": "end" }, svg); tx.textContent = money(t); });
      var xt = el("text", { x: (L + W - R) / 2, y: H - 6, class: "bo-ax bo-axt", "text-anchor": "middle" }, svg); xt.textContent = "Median budget (" + dollarsNote() + ", log scale)";
      var yt = el("text", { x: 14, y: (T + H - B) / 2, class: "bo-ax bo-axt", "text-anchor": "middle", transform: "rotate(-90 14 " + (T + H - B) / 2 + ")" }, svg); yt.textContent = "Median worldwide gross";
      [[1, "1×"], [3, "3×"]].forEach(function (m) { el("line", { x1: lx(Math.max(bmin, gmin / m[0])), y1: ly(Math.max(bmin, gmin / m[0]) * m[0]), x2: lx(Math.min(bmax, gmax / m[0])), y2: ly(Math.min(bmax, gmax / m[0]) * m[0]), class: "bo-ref" }, svg); var t = el("text", { x: lx(4e8) + 4, y: ly(4e8 * m[0]) - 6, class: "bo-ax" }, svg); t.textContent = m[1]; });
      G.forEach(function (g) {
        var gg = el("g", { class: "bo-bub", tabindex: "0", role: "img", "data-g": g }, svg);
        el("circle", { r: 10, fill: COL[g] }, gg);
        var t = el("text", { class: "bo-blab", x: 0, y: 0, "text-anchor": "middle" }, gg); t.textContent = g;
        function show() { var b = BUB[g]; if (!b || !b.n) return; tipAt($("#bo-b-tip"), svg, b.x, b.y, "<b>" + esc(g) + "</b> · " + b.lbl + "<div>" + b.n + " film" + (b.n > 1 ? "s" : "") + "</div><div>Median budget " + money(b.mb) + "</div><div>Median gross " + money(b.mg) + " (" + (b.mg / b.mb).toFixed(1) + "×)</div><div class='bo-tf'>Biggest: " + esc(b.top) + "</div>"); }
        gg.addEventListener("pointerenter", show); gg.addEventListener("focus", show);
        gg.addEventListener("pointerleave", function () { $("#bo-b-tip").hidden = true; }); gg.addEventListener("blur", function () { $("#bo-b-tip").hidden = true; });
        BUB[g] = { node: gg };
      });
    }
    var lx = svg._lx, ly = svg._ly, a = Math.max(YMIN, cur - 2);
    G.forEach(function (g) {
      var fs = F.filter(function (f) { return f.g === g && f.y >= a && f.y <= cur && f.bud && f.ww; });
      var b = BUB[g], node = b.node;
      if (!fs.length) { node.style.opacity = 0; b.n = 0; node.setAttribute("aria-hidden", "true"); return; }
      var mb = median(fs.map(function (f) { return val(f.bud, f.y); })), mg = median(fs.map(function (f) { return val(f.ww, f.y); }));
      var x = lx(Math.max(5e6, Math.min(6e8, mb))), y = ly(Math.max(2e7, Math.min(4e9, mg))), r = 5 + Math.sqrt(fs.length) * 5;
      var top = fs.slice().sort(function (p, q) { return q.ww - p.ww; })[0];
      Object.assign(b, { x: x, y: y, n: fs.length, mb: mb, mg: mg, top: top.t, lbl: a + "–" + cur });
      node.style.opacity = 1; node.removeAttribute("aria-hidden");
      node.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      node.firstChild.setAttribute("r", r.toFixed(1));
      node.lastChild.setAttribute("y", (-r - 6).toFixed(1));
      node.setAttribute("aria-label", g + ", " + a + " to " + cur + ": " + fs.length + " films, median budget " + money(mb) + ", median gross " + money(mg));
    });
    // keep labels from colliding: if a label would overlap one above it, put it under its bubble
    var placed = [];
    G.map(function (g) { return BUB[g]; }).filter(function (b) { return b.n; }).sort(function (p, q) { return p.y - q.y; }).forEach(function (b) {
      var r = +b.node.firstChild.getAttribute("r"), w = b.node.lastChild.textContent.length * 6.6, ly0 = b.y - r - 6;
      var hit = placed.some(function (q) { return Math.abs(q.x - b.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - ly0) < 15; });
      var ly = hit ? b.y + r + 15 : ly0;
      b.node.lastChild.setAttribute("y", (ly - b.y).toFixed(1));
      placed.push({ x: b.x, y: ly, w: w });
    });
    if (CS) $$("#bo-c-svg .bo-cbar").forEach(function (r, i) { r.classList.toggle("on", CS.ys[i] === cur); });
  }

  /* ---------------- wiring ---------------- */
  function drawAll() { drawGenre(); drawActors(); drawBoard(); $("#bo-b-svg")._init = 0; drawCost(); }
  function setTab(t) {
    st.tab = t;
    $$(".bo-tabs [role=tab]").forEach(function (b) { var on = b.dataset.tab === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    $$(".bo-panel").forEach(function (p) { p.hidden = p.id !== "bo-p-" + t; });
    Object.keys(players).forEach(function (k) { if (k !== t) players[k].stop(); });
  }
  function seg(sel, attr, fn) {
    $$(sel).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(sel).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        fn(b.getAttribute(attr));
      });
    });
  }
  function init(d) {
    D = d; F = d.films; CPI = d.cpi; BASE = d.cpi_base; YMIN = d.years[0]; YMAX = d.years[1];
    st.y0 = YMIN; st.y1 = YMAX;
    var cnt = {}; F.forEach(function (f) { cnt[f.g] = 1; if (f.lead) (LEADS[f.lead] = LEADS[f.lead] || []).push(f); });
    G = d.genres.filter(function (g) { return cnt[g]; });
    $("#bo-actors").innerHTML = Object.keys(LEADS).sort().map(function (k) { return '<option value="' + esc(k) + '">'; }).join("");
    $("#bo-legend").innerHTML = G.map(function (g) { return '<button type="button" data-g="' + esc(g) + '" aria-pressed="false"><i style="background:' + COL[g] + '"></i>' + esc(g) + "</button>"; }).join("");
    $$("#bo-legend button").forEach(function (b) { b.addEventListener("click", function () { isolate(b.dataset.g); }); });

    players.genre = new Player("genre", function (y) { if (!GS) return; $("#bo-gclip rect") && $("#bo-gclip rect").setAttribute("width", Math.min(GS.W, GS.xS(y) + 1)); var c = $("#bo-g-svg .bo-cur"); if (c) { c.setAttribute("x1", GS.xS(y)); c.setAttribute("x2", GS.xS(y)); } drawGenreRace(y); });
    players.actor = new Player("actor", function () { if (AS) drawActors(); });
    players.cost = new Player("cost", function (y) { drawBubbles(y); });
    Object.keys(players).forEach(function (k) { players[k].reset(); });

    $$(".bo-tabs [role=tab]").forEach(function (b, i, all) {
      b.addEventListener("click", function () { setTab(b.dataset.tab); });
      b.addEventListener("keydown", function (e) {
        var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : null;
        if (j == null) return; e.preventDefault(); j = (j + all.length) % all.length; all[j].focus(); setTab(all[j].dataset.tab);
      });
    });
    seg("[data-real]", "data-real", function (v) { st.real = v === "1"; drawAll(); });
    seg("[data-share]", "data-share", function (v) { st.share = v === "1"; drawGenre(); });
    seg("[data-race]", "data-race", function (v) { st.race = v; drawGenreRace(players.genre.year); });
    seg("[data-cm]", "data-cm", function (v) { st.cm = v; drawCost(); });
    seg("[data-qm]", "data-qm", function (v) { st.qm = v; drawQuality(); });
    var y0 = $("#bo-y0"), y1 = $("#bo-y1");
    function rangeChange(e) {
      var a = +y0.value, b = +y1.value;
      if (b - a < 4) { if (e && e.target === y0) a = Math.min(a, YMAX - 4), b = a + 4; else b = Math.max(b, YMIN + 4), a = b - 4; }
      y0.value = a; y1.value = b; st.y0 = a; st.y1 = b; $("#bo-y0o").textContent = a; $("#bo-y1o").textContent = b;
      Object.keys(players).forEach(function (k) { players[k].stop(); var p = players[k]; var box = $('[data-player="' + k + '"] .bo-scrub'); box.min = a; box.max = b; p.year = b; $('[data-player="' + k + '"] .bo-yl').textContent = b; box.value = b; });
      drawAll();
    }
    y0.addEventListener("input", rangeChange); y1.addEventListener("input", rangeChange);

    var gs = $("#bo-g-svg");
    gs.addEventListener("pointermove", genreHit); gs.addEventListener("pointerdown", genreHit);
    gs.addEventListener("pointerleave", function () { genreTip(null); });
    gs.addEventListener("blur", function () { genreTip(null); });
    gs.addEventListener("keydown", function (e) {
      var h = st.hov || { y: players.genre.year, g: null }, gi = h.g ? GS.gens.indexOf(h.g) : -1;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); players.genre.step(e.key === "ArrowLeft" ? -1 : 1); genreTip(players.genre.year, h.g); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); gi = (gi + (e.key === "ArrowUp" ? 1 : -1) + GS.gens.length + 1) % (GS.gens.length + 1); genreTip(players.genre.year, gi === GS.gens.length ? null : GS.gens[gi]); }
      else if (e.key === "Enter" && h.g) { e.preventDefault(); isolate(h.g); }
      else if (e.key === "Escape") genreTip(null);
    });
    gs.addEventListener("focus", function () { genreTip(players.genre.year, null); });
    var cs = $("#bo-c-svg");
    function cHit(e) { var p = svgPoint(cs, e), i = Math.floor((p.x - CS.L) / CS.bw); costTip(i); }
    cs.addEventListener("pointermove", cHit); cs.addEventListener("pointerdown", cHit); cs.addEventListener("pointerleave", function () { costTip(null); });
    cs.addEventListener("focus", function () { costTip(st.hovC != null ? st.hovC : CS.ys.length - 1); }); cs.addEventListener("blur", function () { costTip(null); });
    cs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault();
      var i = (st.hovC != null ? st.hovC : CS.ys.length - 1) + (e.key === "ArrowLeft" ? -1 : 1); costTip(Math.max(0, Math.min(CS.ys.length - 1, i)));
    });
    // Space / arrows anywhere in a panel (not in a text field or on a button) drive that panel's player
    $$(".bo-panel").forEach(function (p) {
      p.addEventListener("keydown", function (e) {
        var t = e.target, tag = t.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON" || tag === "TEXTAREA" || e.defaultPrevented) return;
        var pl = players[p.id.replace("bo-p-", "")];
        if (e.key === " ") { e.preventDefault(); pl.toggle(); }
        else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t.id !== "bo-c-svg") { e.preventDefault(); pl.step(e.key === "ArrowLeft" ? -1 : 1); }
      });
    });
    $("#bo-pick").addEventListener("submit", function (e) { e.preventDefault(); var i = $("#bo-actor-in"); if (selectActor(i.value, { keep: true })) i.value = ""; else i.setAttribute("aria-invalid", "true"); });
    $("#bo-actor-in").addEventListener("input", function () { this.removeAttribute("aria-invalid"); });
    // one delegated handler for every clickable name: chips, race bars, decade board, table
    $("#bo-p-actor").addEventListener("click", function (e) {
      var a = e.target.closest("#bo-a-all"); if (a) { clearSel(); var c = $("#bo-chips .bo-cname"); if (c) c.focus(); return; }
      var b = e.target.closest("[data-sel]"); if (!b) return;
      var name = b.dataset.sel, fromTable = !!b.closest("#bo-a-table"), fromRace = !!b.closest("#bo-a-race");
      selectActor(name);
      // re-rendered controls lose focus; put it back on the matching control
      var sel = fromRace ? "#bo-a-race" : fromTable ? "#bo-a-table" : b.closest("#bo-board") ? "#bo-board" : "#bo-chips";
      var nb = $$(sel + " [data-sel]").filter(function (x) { return x.dataset.sel === name; })[0] || $("#bo-a-all") || $("#bo-chips .bo-cname");
      if (nb && document.activeElement !== nb) nb.focus({ preventScroll: true });
    });
    $("#bo-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; st.actors = st.actors.filter(function (a) { return a !== b.dataset.rm; }); if (st.sel === b.dataset.rm) st.sel = null; drawActors(); drawBoard(); var f = $("#bo-chips button") || $("#bo-actor-in"); f.focus(); });
    $("#bo-dec").addEventListener("click", function (e) { var b = e.target.closest("[data-dec]"); if (!b) return; st.dec = +b.dataset.dec; drawBoard(); var nb = $('#bo-dec [data-dec="' + st.dec + '"]'); if (nb) nb.focus(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) Object.keys(players).forEach(function (k) { players[k].stop(); }); });
    var rs; window.addEventListener("resize", function () { clearTimeout(rs); rs = setTimeout(function () { $$(".bo-tip").forEach(function (t) { t.hidden = true; }); }, 100); });
    if (RM) root.classList.add("bo-rm");
    drawAll();
    root.classList.add("ready");
  }
  fetch("/assets/data/box_office.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(init).catch(function (err) {
    if (window.console) console.warn("box office:", err && err.message);
    root.insertAdjacentHTML("afterbegin", '<p class="bo-err" role="alert">The box office data didn\'t load. Refresh to try again.</p>');
  });
})();
