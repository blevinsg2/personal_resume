/* QB Network: a small force-directed graph (no libraries).
   Data: /assets/data/qb_network.json built by scripts/build_qb_network.py from nflverse.
   Play axis: the layout is solved once for the full season, then each week only changes which
   lines and players are shown and how big they are, so the network builds in place. */
(function () {
  "use strict";
  var svg = document.getElementById("qn-svg");
  if (!svg) return;
  var stage = document.getElementById("qn-stage"), tip = document.getElementById("qn-tip");
  var select = document.getElementById("qn-qb");
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D, nodes = [], links = [], byId = {}, alpha = 0, alphaTarget = 0, raf = 0;
  var view = { k: 1, x: 0, y: 0 }, W = 0, H = 0, AY = 1;
  var gRoot, gLinks, gNodes, sel = null, hoverId = null, G = {};

  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function initials(name) { var p = name.split(" "); return (p[0][0] + (p[p.length - 1][0] || "")).toUpperCase(); }

  /* ---------------------------------------------------------------- data -> graph */
  function buildGraph(qb) {
    var P = D.players, E = D.edges;
    var rec = E.filter(function (e) { return e[0] === qb; });
    var rids = {}; rec.forEach(function (e) { rids[e[1]] = 1; });
    var oth = E.filter(function (e) { return rids[e[1]] && e[0] !== qb; });
    var maxC = Math.max.apply(null, rec.map(function (e) { return e[2]; }).concat([1]));
    var maxL = Math.max.apply(null, rec.concat(oth).map(function (e) { return e[2]; }).concat([1]));
    var small = W < 560;
    AY = small ? Math.max(1, Math.min(2, 1.2 * (H - 60) / W)) : 1;
    nodes = []; links = []; byId = {};
    function add(id, type, extra) {
      if (byId[id]) return byId[id];
      var p = P[id], n = { id: id, type: type, name: p.name, short: p.short, pos: p.pos, teams: p.teams, comp: 0, yds: 0, out: [], x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null };
      for (var k in extra) n[k] = extra[k];
      nodes.push(n); byId[id] = n; return n;
    }
    var c = add(qb, "center", { r: small ? 24 : 30, fx: 0, fy: 0 });
    rec.forEach(function (e, i) {
      var a = (i / rec.length) * Math.PI * 2;
      var n = add(e[1], "rec", { ring: small ? 110 : 150, rb: small ? 6 : 7, rk: small ? 10 : 13, r: (small ? 6 : 7) + (small ? 10 : 13) * Math.sqrt(e[2] / maxC), x: Math.cos(a) * 140, y: Math.sin(a) * 140 });
      n.comp = e[2]; n.yds = e[3];
      links.push({ s: c, t: n, c: e[2], y: e[3], w: 1 + 6 * Math.sqrt(e[2] / maxL), kind: "main", d: (small ? 92 : 120) + 40 * (1 - e[2] / maxC) });
      c.comp += e[2]; c.yds += e[3];
    });
    var tot = {};
    oth.forEach(function (e) { tot[e[0]] = (tot[e[0]] || 0) + e[2]; });
    var maxO = Math.max.apply(null, Object.keys(tot).map(function (k) { return tot[k]; }).concat([1]));
    oth.forEach(function (e) {
      var t = byId[e[1]];
      if (byId[e[0]] && byId[e[0]].type === "rec") {  // a receiver who also threw one (trick play)
        var rq = byId[e[0]]; rq.out.push({ id: e[1], c: e[2], y: e[3] });
        links.push({ s: rq, t: t, c: e[2], y: e[3], w: 1 + 6 * Math.sqrt(e[2] / maxL), kind: "oth", d: small ? 70 : 92 });
        return;
      }
      var o = add(e[0], P[e[0]].pos === "QB" ? "qb" : "np", { ring: small ? 185 : 255, rb: small ? 6 : 7, rk: small ? 7 : 9, r: (small ? 6 : 7) + (small ? 7 : 9) * Math.sqrt(tot[e[0]] / maxO), x: t.x * 1.8 + (rnd() - .5) * 40, y: t.y * 1.8 + (rnd() - .5) * 40 });
      if (o.ring && !o.out.length) { var a0 = Math.atan2(o.y, o.x); o.x = Math.cos(a0) * o.ring; o.y = Math.sin(a0) * o.ring; }
      o.comp = tot[e[0]];
      o.out.push({ id: e[1], c: e[2], y: e[3] });
      links.push({ s: o, t: t, c: e[2], y: e[3], w: 1 + 6 * Math.sqrt(e[2] / maxL), kind: "oth", d: small ? 70 : 92 });
    });
    nodes.forEach(function (n) { n.deg = 0; n.rd = n.r; n.op = 1; n.vis = true; });
    links.forEach(function (l) { l.s.deg++; l.t.deg++; l.wd = l.w; l.op = 1; l.vis = true; });
    G = { qb: qb, maxC: maxC, maxL: maxL, maxO: maxO };
    return { rec: rec, oth: Object.keys(tot) };
  }

  /* ---------------------------------------------------------------- physics */
  function tick() {
    var i, j, n, m, dx, dy, l2, l, w, k = alpha;
    // links (spring)
    for (i = 0; i < links.length; i++) {
      var L = links[i], s = L.s, t = L.t;
      dx = (t.x + t.vx) - (s.x + s.vx) || 1e-6; dy = (t.y + t.vy) - (s.y + s.vy) || 1e-6;
      l = Math.sqrt(dx * dx + dy * dy);
      var str = (L.kind === "oth" ? 0.18 : 1) / Math.min(s.deg, t.deg);
      l = (l - L.d) / l * k * str * 0.9;
      dx *= l; dy *= l;
      var b = s.deg / (s.deg + t.deg);
      t.vx -= dx * b; t.vy -= dy * b; s.vx += dx * (1 - b); s.vy += dy * (1 - b);
    }
    // many-body repulsion (n^2 is fine for a few dozen nodes)
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        m = nodes[j];
        dx = m.x - n.x || (rnd() - .5) * 1e-3; dy = m.y - n.y || (rnd() - .5) * 1e-3;
        l2 = dx * dx + dy * dy; if (l2 < 100) l2 = 100;
        w = -(W < 560 ? 340 : 520) * k / l2;
        n.vx += dx * w; n.vy += dy * w; m.vx -= dx * w; m.vy -= dy * w;
        // collision
        var rr = n.r + m.r + 6, d = Math.sqrt(l2);
        if (d < rr) { var o = (rr - d) / d * 0.5; n.vx -= dx * o * 0.5; n.vy -= dy * o * 0.5; m.vx += dx * o * 0.5; m.vy += dy * o * 0.5; }
      }
      // radial rings: receivers around the QB, other passers on an outer ring
      if (n.ring) {
        l = Math.sqrt(n.x * n.x + n.y * n.y) || 1e-6;
        w = (n.ring - l) / l * 0.5 * k;
        n.vx += n.x * w; n.vy += n.y * w;
      }
    }
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.home) { n.fx *= 0.9; n.fy *= 0.9; if (Math.abs(n.fx) + Math.abs(n.fy) < 0.5) { n.fx = n.fy = 0; n.home = false; } }
      if (n.fx != null) { n.x = n.fx; n.vx = 0; } else { n.vx *= 0.6; n.x += n.vx; }
      if (n.fy != null) { n.y = n.fy; n.vy = 0; } else { n.vy *= 0.6; n.y += n.vy; }
    }
    alpha += (alphaTarget - alpha) * 0.0228;
  }
  function loop() {
    tick(); draw();
    if (alpha > 0.002 || alphaTarget > 0) raf = requestAnimationFrame(loop); else raf = 0;
  }
  function heat(a, target) {
    alpha = Math.max(alpha, a); if (target != null) alphaTarget = target;
    if (reduce) { for (var i = 0; i < 200 && alpha > 0.002; i++) tick(); draw(); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- render */
  function size() {
    var r = stage.getBoundingClientRect(); W = r.width; H = r.height;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  }
  function applyView() { gRoot.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")"); }
  function fit(animate) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(function (n) { x0 = Math.min(x0, n.x - n.r - 8); x1 = Math.max(x1, n.x + n.r + 70); y0 = Math.min(y0, n.y * AY - n.r - 8); y1 = Math.max(y1, n.y * AY + n.r + 22); });
    x0 -= 50;
    var pad = W < 560 ? 12 : 28;
    var k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2 - 30) / (y1 - y0), 1.6);
    var to = { k: k, x: W / 2 - k * (x0 + x1) / 2, y: (H - 24) / 2 - k * (y0 + y1) / 2 };
    if (!animate || reduce) { view = to; applyView(); return; }
    var from = { k: view.k, x: view.x, y: view.y }, t0 = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - t, 3);
      view = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      applyView(); if (t < 1) requestAnimationFrame(step);
    })(t0);
  }
  function render() {
    svg.textContent = "";
    gRoot = el("g", {}, svg);
    gLinks = el("g", { "class": "qn-links" }, gRoot);
    gNodes = el("g", { "class": "qn-nodes" }, gRoot);
    links.forEach(function (L) { L.el = el("line", { "class": "qn-link " + L.kind, "stroke-width": L.w.toFixed(2) }, gLinks); });
    // draw other passers and receivers first, center last (on top)
    nodes.slice().sort(function (a, b) { return (a.type === "center") - (b.type === "center"); }).forEach(function (n) {
      var g0 = n.el = el("g", { "class": "qn-node " + n.type + (n.type === "rec" && n.out.length ? " thrower" : ""), tabindex: "0", role: "button", "aria-label": label(n) }, gNodes);
      var g = n.w = el("g", { "class": "qn-w" }, g0);   // inner group: the play axis fades and resizes this
      n.cEl = el("circle", { r: n.r }, g);
      if (n.type === "center") {
        var t = el("text", { "class": "qn-ini", dy: "0.35em" }, g); t.textContent = initials(n.name);
        var t2 = el("text", { "class": "qn-lbl qn-lbl-c", y: n.r + 16 }, g); t2.textContent = n.name;
      } else {
        var t3 = n.lEl = el("text", { "class": "qn-lbl", x: n.r + 5, dy: "0.35em" }, g); t3.textContent = n.short;
      }
      bindNode(n);
    });
    applyView(); draw();
  }
  function draw() {
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      L.el.setAttribute("x1", L.s.x.toFixed(1)); L.el.setAttribute("y1", (L.s.y * AY).toFixed(1));
      L.el.setAttribute("x2", L.t.x.toFixed(1)); L.el.setAttribute("y2", (L.t.y * AY).toFixed(1));
    }
    for (i = 0; i < nodes.length; i++) nodes[i].el.setAttribute("transform", "translate(" + nodes[i].x.toFixed(1) + "," + (nodes[i].y * AY).toFixed(1) + ")");
    if (sel) placeTip(sel);
  }
  function label(n) {
    var center = nodes[0];
    if (n.type === "center") return n.name + ", " + n.teams.join("/") + ": " + n.comp + " completions for " + fmt(n.yds) + " yards";
    if (n.type === "rec") return n.name + ", " + n.pos + ": " + n.comp + " catches for " + fmt(n.yds) + " yards from " + center.name;
    return n.name + " (" + (n.pos || "?") + ", " + n.teams.join("/") + ") completed " + n.comp + " to these receivers";
  }

  /* ---------------------------------------------------------------- tooltip + highlight */
  function tipHTML(n) {
    var c = nodes[0], h = '<div class="qn-tip-h"><b>' + esc(n.name) + '</b><span>' + esc([n.pos, n.teams.join(" / ")].filter(Boolean).join(" · ")) + "</span></div>";
    if (n.type === "center") return h + (PW.on ? '<div class="qn-tip-note qn-tip-wk">' + esc(winLabel()) + "</div>" : "") + '<div class="qn-tip-r"><span>Completions</span><b>' + n.comp + '</b></div><div class="qn-tip-r"><span>Yards</span><b>' + fmt(n.yds) + '</b></div><div class="qn-tip-r"><span>Receivers</span><b>' + (nodes.filter(function (x) { return x.type === "rec" && x.vis; }).length) + "</b></div>";
    if (n.type === "rec") {
      h += '<div class="qn-tip-r acc"><span>From ' + esc(c.short) + '</span><b>' + n.comp + " · " + fmt(n.yds) + " yds</b></div>";
      h += '<div class="qn-tip-note qn-tip-map">Tap, click, or press Enter to map his targets below</div>';
      links.forEach(function (L) { if (L.t === n && L.kind === "oth" && L.vis) h += '<div class="qn-tip-r"><span>From ' + esc(L.s.short) + "</span><b>" + L.c + " · " + fmt(L.y) + " yds</b></div>"; });
      n.out.forEach(function (o) { if (o.c) h += '<div class="qn-tip-r"><span>Threw to ' + esc(byId[o.id].short) + "</span><b>" + o.c + " · " + fmt(o.y) + " yds</b></div>"; });
      return h;
    }
    h += n.type === "np" ? '<div class="qn-tip-note">Non-QB passer (trick play)</div>' : "";
    n.out.filter(function (o) { return o.c; }).sort(function (a, b) { return b.c - a.c; }).forEach(function (o) { h += '<div class="qn-tip-r"><span>To ' + esc(byId[o.id].short) + "</span><b>" + o.c + " · " + fmt(o.y) + " yds</b></div>"; });
    return h;
  }
  function placeTip(n) {
    var x = view.x + n.x * view.k, y = view.y + n.y * AY * view.k, tw = tip.offsetWidth, th = tip.offsetHeight;
    var nr = n.rd != null ? n.rd : n.r;
    var left = x + nr * view.k + 12, top = y - th / 2;
    if (left + tw > W - 8) left = x - nr * view.k - 12 - tw;
    if (left < 8) { left = Math.max(8, Math.min(W - tw - 8, x - tw / 2)); top = y + nr * view.k + 10; if (top + th > H - 8) top = y - nr * view.k - 10 - th; }
    top = Math.max(8, Math.min(H - th - 8, top));
    tip.style.transform = "translate(" + left.toFixed(0) + "px," + top.toFixed(0) + "px)";
  }
  // a click/tap/Enter on a receiver tells the throw map (qbheat.js) to show only his targets; the center resets it
  function pick(n) {
    if (n.type !== "rec" && n.type !== "center") return;
    document.dispatchEvent(new CustomEvent("qn:pick", { detail: { id: n.type === "rec" ? n.id : null } }));
  }
  function showTip(n) { sel = n; tip.innerHTML = tipHTML(n); tip.hidden = false; placeTip(n); highlight(n); }
  function hideTip() { sel = null; tip.hidden = true; highlight(null); }
  function highlight(n) {
    var on = {};
    if (n) { on[n.id] = 1; links.forEach(function (L) { if (L.s === n || L.t === n) { on[L.s.id] = on[L.t.id] = 1; } }); }
    svg.classList.toggle("is-focus", !!n);
    nodes.forEach(function (m) { if (m.el) m.el.classList.toggle("on", !!on[m.id]); });
    links.forEach(function (L) { if (L.el) L.el.classList.toggle("on", !!n && (L.s === n || L.t === n)); });
  }

  /* ---------------------------------------------------------------- pointer: drag, pan, pinch, wheel */
  var pts = {}, drag = null, pan = null, pinch = null;
  function local(e) { var r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function toGraph(p) { return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k / AY }; }
  function bindNode(n) {
    n.el.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.stopPropagation(); e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      pts[e.pointerId] = local(e);
      var g = toGraph(pts[e.pointerId]);
      drag = { n: n, id: e.pointerId, ox: n.x - g.x, oy: n.y - g.y, moved: 0, start: pts[e.pointerId] };
      n.home = false; n.fx = n.x; n.fy = n.y;
      svg.classList.add("is-drag");
    });
    n.el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !drag) { hoverId = n.id; showTip(n); } });
    n.el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !drag && hoverId === n.id) { hoverId = null; hideTip(); } });
    n.el.addEventListener("focus", function () { showTip(n); });
    n.el.addEventListener("blur", function () { hideTip(); });
    n.el.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { n.el.blur(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n); }
    });
  }
  svg.addEventListener("pointerdown", function (e) {
    if (e.button > 0) return;
    svg.setPointerCapture(e.pointerId);
    pts[e.pointerId] = local(e);
    var ids = Object.keys(pts);
    if (ids.length === 2 && !drag) {
      var a = pts[ids[0]], b = pts[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y }; pan = null;
    } else if (!drag) { pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0 }; }
  });
  svg.addEventListener("pointermove", function (e) {
    if (!(e.pointerId in pts)) return;
    pts[e.pointerId] = local(e);
    if (drag && drag.id === e.pointerId) {
      var p = pts[e.pointerId], g = toGraph(p);
      drag.moved = Math.max(drag.moved, Math.hypot(p.x - drag.start.x, p.y - drag.start.y));
      if (drag.moved < 4) return;
      drag.n.fx = g.x + drag.ox; drag.n.fy = g.y + drag.oy;
      if (sel && e.pointerType !== "mouse") hideTip();
      heat(0.3, 0.3);
    } else if (pinch) {
      var ids = Object.keys(pts); if (ids.length < 2) return;
      var a = pts[ids[0]], b = pts[ids[1]], k = Math.max(0.3, Math.min(4, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      view.k = k; view.x = cx - (pinch.cx - pinch.vx) * k / pinch.k; view.y = cy - (pinch.cy - pinch.vy) * k / pinch.k;
      applyView(); if (sel) placeTip(sel);
    } else if (pan) {
      pan.moved = Math.max(pan.moved, Math.hypot(e.clientX - pan.x, e.clientY - pan.y));
      view.x = pan.vx + e.clientX - pan.x; view.y = pan.vy + e.clientY - pan.y; applyView(); if (sel) placeTip(sel);
      svg.classList.add("is-pan");
    }
  });
  function end(e) {
    delete pts[e.pointerId];
    if (drag && drag.id === e.pointerId) {
      var n = drag.n;
      if (n.type === "center") { n.home = true; } else { n.fx = n.fy = null; }
      if (drag.moved < 5 && e.pointerType !== "mouse") { sel === n ? hideTip() : showTip(n); }
      if (drag.moved < 5) pick(n);
      var wasDrag = drag.moved >= 4; drag = null; alphaTarget = 0; if (wasDrag) heat(0.1);
      svg.classList.remove("is-drag");
    } else if (pan && !Object.keys(pts).length) {
      if (pan.moved < 5 && e.type === "pointerup") hideTip();
      pan = null;
    }
    if (Object.keys(pts).length < 2) pinch = null;
    svg.classList.remove("is-pan");
  }
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoomAt(local(e), Math.pow(2, -e.deltaY * (e.deltaMode ? 0.05 : 0.002)));
  }, { passive: false });
  function zoomAt(p, f) {
    var k = Math.max(0.3, Math.min(4, view.k * f));
    view.x = p.x - (p.x - view.x) * k / view.k; view.y = p.y - (p.y - view.y) * k / view.k; view.k = k;
    applyView(); if (sel) placeTip(sel);
  }
  document.querySelectorAll("[data-qn-zoom]").forEach(function (b) {
    b.addEventListener("click", function () { zoomAt({ x: W / 2, y: H / 2 }, parseFloat(b.getAttribute("data-qn-zoom"))); });
  });
  var resetBtn = document.querySelector("[data-qn-reset]");
  if (resetBtn) resetBtn.addEventListener("click", function () { hideTip(); load(select.value, true); });


  /* ---------------------------------------------------------------- "what you learn from the shape" (mirrors qb_shape in build.py) */
  var NICK = { ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
    DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LA: "Rams",
    LAR: "Rams", LAC: "Chargers", LV: "Raiders", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets",
    PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders" };
  var WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function nword(n) { return n >= 0 && n <= 10 ? WORDS[n] : String(n); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function article(pos) { return (pos && "AEFHILMNORSX".indexOf(pos.charAt(0)) >= 0 ? "an " : "a ") + (pos || "player"); }
  function nameList(ns) { return ns.length === 1 ? ns[0] : ns.length === 2 ? ns.join(" and ") : ns.slice(0, -1).join(", ") + ", and " + ns[ns.length - 1]; }
  function byName(P) { return function (a, b) { return P[a].name < P[b].name ? -1 : P[a].name > P[b].name ? 1 : 0; }; }
  function shapeTexts(qb, E) {
    var P = D.players, first = P[qb].name.split(" ")[0]; E = E || D.edges;
    var rec = {}, passersOf = {}, tot = {}, reach = {}, pcomp = {}, R = [];
    E.forEach(function (e) { if (e[0] === qb) { rec[e[1]] = e; R.push(e[1]); passersOf[e[1]] = {}; passersOf[e[1]][qb] = 1; tot[e[1]] = e[2]; } });
    E.forEach(function (e) {
      if (!rec[e[1]] || e[0] === qb) return;
      passersOf[e[1]][e[0]] = 1; tot[e[1]] += e[2];
      (reach[e[0]] = reach[e[0]] || {})[e[1]] = 1; pcomp[e[0]] = (pcomp[e[0]] || 0) + e[2];
    });
    var np = function (r) { return Object.keys(passersOf[r]).length; };
    if (!R.length) { var none = " No completions from " + first + " in this view yet, so there's nothing to read here. Move the week slider forward."; return { hubs: "Big, well-connected nodes." + none, bridges: "Nodes that reach the same people as the center." + none, outliers: "Small nodes hanging by a single thin line." + none }; }
    var others = Object.keys(reach), allp = [qb].concat(others), teams = {};
    allp.forEach(function (x) { P[x].teams.forEach(function (t) { teams[t] = 1; }); });
    var tk = Object.keys(teams), nick = tk.length === 1 ? (NICK[tk[0]] || tk[0]) + " " : "";
    var tailH = " At work, it's the person or system everything runs through.", hubs, bridges, outliers;
    var m = Math.max.apply(null, R.map(np));
    if (m < 2) hubs = "Big, well-connected nodes. So far every one of " + first + (/s$/.test(first) ? "'" : "'s") + " receivers has caught passes from him alone, so " + first + " is the only hub." + tailH;
    else {
      var hs = R.filter(function (r) { return np(r) === m; }).sort(function (a, b) { return tot[b] - tot[a] || byName(P)(a, b); });
      var frm = "caught passes from " + (m === allp.length ? "all " + nword(m) : nword(m) + " different") + " " + nick + "passers";
      var who = hs.length <= 3 ? nameList(hs.map(function (r) { return P[r].name; })) + (hs.length > 1 ? " each " : " ") + frm
        : cap(nword(hs.length)) + " receivers, led by " + P[hs[0]].name + " and " + P[hs[1]].name + ", " + frm;
      hubs = "Big, well-connected nodes. " + who + "." + tailH;
    }
    if (!others.length) bridges = "Nodes that reach the same people as the center. No one else has thrown to " + first + (/s$/.test(first) ? "'" : "'s") + " receivers yet, so this network has no bridges, like a team with no backup.";
    else {
      var ct = {}; P[qb].teams.forEach(function (t) { ct[t] = 1; });
      var tag = function (x) {
        var bits = P[x].pos === "QB" ? [] : [P[x].pos || "non-QB"];
        if (!P[x].teams.some(function (t) { return ct[t]; })) bits.push(P[x].teams.join("/"));
        return P[x].name + (bits.length ? " (" + bits.join(", ") + ")" : "");
      };
      var rn = function (x) { return Object.keys(reach[x]).length; };
      var bs = others.sort(function (a, b) { return rn(b) - rn(a) || pcomp[b] - pcomp[a] || byName(P)(a, b); });
      var t = tag(bs[0]) + " reached " + nword(rn(bs[0])) + " of " + first + (/s$/.test(first) ? "'" : "'s") + " " + nword(R.length) + " receivers";
      if (bs.length > 1) t += ", and " + tag(bs[1]) + " reached " + nword(rn(bs[1]));
      bridges = "Nodes that reach the same people as the center. " + t + ", like a team where work routes through a backup when the key person is out. Better to see that before you need it.";
    }
    var tailO = " At work, that's the one-off vendor or the report nobody else uses, worth a cleanup or a closer look.";
    var ones = R.filter(function (r) { return rec[r][2] === 1; }).sort(function (a, b) { return np(a) - np(b) || byName(P)(a, b); });
    if (ones.length) {
      var r = ones[0], line = np(r) === 1 ? "hanging by a single thin line" : "on a thin line to the center";
      var more = ones.length > 1 ? " " + cap(nword(ones.length)) + " of his receivers have just one." : "";
      outliers = "Small nodes " + line + ", like " + P[r].name + ", " + article(P[r].pos) + " with one catch from " + first + "." + more + tailO;
    } else outliers = "Small nodes hanging by a single thin line. None of " + first + (/s$/.test(first) ? "'" : "'s") + " receivers has just one catch from him yet; everyone on this graph has at least two." + tailO;
    return { hubs: hubs, bridges: bridges, outliers: outliers };
  }

  /* ---------------------------------------------------------------- page text */
  function setText(sel, v) { document.querySelectorAll(sel).forEach(function (e) { e.textContent = v; }); }
  function updateText(info) {
    var c = nodes[0];
    var poss = function (t) { return t + (/s$/.test(t) ? "'" : "'s"); };
    setText("[data-qn-name]", c.name); setText("[data-qn-first]", c.name.split(" ")[0]); setText("[data-qn-firstp]", poss(c.name.split(" ")[0]));
    var sh = shapeTexts(c.id, info.E);
    ["hubs", "bridges", "outliers"].forEach(function (k) { setText('[data-qn-shape="' + k + '"]', sh[k]); });
    document.title = "QB Network: who catches " + c.name + (/s$/.test(c.name) ? "'" : "'s") + " passes? · Gary Blevins";
    setText('[data-qn-stat="rec"]', info.rec.length); setText('[data-qn-stat="comp"]', fmt(c.comp));
    setText('[data-qn-stat="yds"]', fmt(c.yds)); setText('[data-qn-stat="oth"]', info.oth.length);
    var hasNp = nodes.some(function (n) { return n.vis && (n.type === "np" || (n.type === "rec" && n.out.some(function (o) { return o.c; }))); });
    var lg = document.querySelector(".lg-np"); if (lg) lg.parentNode.hidden = !hasNp;
    var hasQb = nodes.some(function (n) { return n.vis && n.type === "qb"; });
    var lq = document.querySelector(".lg-qb"); if (lq) lq.parentNode.hidden = !hasQb;
    svg.setAttribute("aria-label", "Network graph of " + poss(c.name) + " completions and the other passers who completed passes to the same receivers");
    var P = D.players, tb = document.querySelector("#qn-table-rec tbody"), to = document.querySelector("#qn-table-oth tbody");
    if (tb) tb.innerHTML = !info.rec.length ? '<tr><td colspan="4">' + esc(noneLine()) + "</td></tr>" : info.rec.slice().sort(function (a, b) { return b[2] - a[2] || b[3] - a[3]; }).map(function (e) {
      return "<tr><td>" + esc(P[e[1]].name) + "</td><td>" + esc(P[e[1]].pos || "—") + '</td><td class="n">' + e[2] + '</td><td class="n">' + fmt(e[3]) + "</td></tr>";
    }).join("");
    if (to) {
      var o = nodes.filter(function (n) { if (!n.vis) return false; if (n.type === "rec" && n.out.length) { n.thr = n.out.reduce(function (a, x) { return a + x.c; }, 0); return n.thr > 0; } return n.type === "qb" || n.type === "np"; }).sort(function (a, b) { return (b.type === "rec" ? b.thr : b.comp) - (a.type === "rec" ? a.thr : a.comp); });
      to.innerHTML = o.length ? o.map(function (n) {
        return "<tr><td>" + esc(n.name) + ' <span class="qn-tm">' + esc(n.teams.join("/")) + "</span></td><td>" + esc(n.pos || "—") + '</td><td class="n">' + (n.type === "rec" ? n.thr : n.comp) + "</td><td>" +
          esc(n.out.filter(function (x) { return x.c; }).sort(function (a, b) { return b.c - a.c; }).map(function (x) { return byId[x.id].short + " " + x.c; }).join(", ")) + "</td></tr>";
      }).join("") : '<tr><td colspan="4">' + (PW.on && !isFull() ? (PW.mode === "one" ? "None in Week " + PW.wk + "." : "None through Week " + PW.wk + ".") : "None yet this season.") + "</td></tr>";
    }
  }

  /* ---------------------------------------------------------------- play axis: week by week */
  var PW = { on: false, wk: null, mode: "cum", playing: false, timer: 0, anim: 0, weeks: [], byWeek: {}, teams: {}, att: {}, max: {} };
  var ppB = document.getElementById("qn-pp"), wkIn = document.getElementById("qn-wk"), wkLbl = document.getElementById("qn-wk-lbl"),
    wkSub = document.getElementById("qn-wk-sub"), ticks = document.getElementById("qn-ticks"), wnote = document.getElementById("qn-wnote"),
    status = document.getElementById("qn-status"), seasonLbl = "";
  function lastWk() { return PW.weeks[PW.weeks.length - 1]; }
  function isFull() { return PW.mode === "cum" && PW.wk === lastWk(); }
  function partialWk() { var p = D.meta.partial_week; return p && p.week === PW.wk ? p : null; }
  function winLabel() { return PW.mode === "one" ? "Week " + PW.wk + " only" : isFull() ? seasonLbl : "Through Week " + PW.wk; }
  function attOf(w) { return PW.att[w] || 0; }
  // why a week has no attempts, straight from the build script (nflverse schedule, rosters, injuries, snaps); never inferred here
  var TICK = { bye: "BYE", out: "OUT", ir: "IR", ina: "INA", act: "ACT", ps: "PS", res: "RES", cut: "CUT", tbd: "TBD", dnp: "DNP" };
  function whyOf(w) { var x = PW.why[w]; return x ? { k: x[0], t: x[1] } : { k: "dnp", t: "Did not play" }; }
  function attThrough(w) { var t = 0; for (var k in PW.att) if (+k <= w) t += PW.att[k]; return t; }
  function first() { return D.players[G.qb].name; }
  function noneLine() { return PW.on ? (PW.mode === "one" ? (attOf(PW.wk) ? "No completions in Week " + PW.wk + "." : "No pass attempts in Week " + PW.wk + ".") : "No completions through Week " + PW.wk + ".") : "None yet this season."; }
  function initPlay() {
    var bar = document.getElementById("qn-play");
    if (!PW.on || !bar) return;
    PW.weeks = D.meta.weeks.slice();
    D.edges.forEach(function (e) { PW.teams[e[0] + "|" + e[1]] = e[4]; });
    D.wedges.forEach(function (e) { (PW.byWeek[e[2]] = PW.byWeek[e[2]] || []).push(e); });
    seasonLbl = (document.querySelector("[data-qn-asof]") || {}).textContent || "Season to date";
    if (PW.wk == null) PW.wk = lastWk();
    wkIn.min = PW.weeks[0]; wkIn.max = lastWk(); wkIn.value = PW.wk;
    bar.hidden = false;
    ppB.addEventListener("click", function () { setPlay(!PW.playing); });
    wkIn.addEventListener("input", function () { setPlay(false); PW.wk = nearestWk(+wkIn.value); sync(true); });
    document.querySelectorAll("[data-qn-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        PW.mode = b.getAttribute("data-qn-mode");
        document.querySelectorAll("[data-qn-mode]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        sync(true);
      });
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) setPlay(false); });
  }
  function nearestWk(v) { var b = PW.weeks[0]; PW.weeks.forEach(function (w) { if (Math.abs(w - v) < Math.abs(b - v)) b = w; }); return b; }
  function prepQb(qb) {
    // per-QB scales for "this week only": the biggest single-week numbers, so a week can be compared with any other week
    var rids = {}; nodes.forEach(function (n) { if (n.type === "rec") rids[n.id] = 1; });
    var mc = 1, ml = 1, mo = 1, po = {};
    D.wedges.forEach(function (e) {
      if (!rids[e[1]]) return;
      if (e[0] === qb) mc = Math.max(mc, e[3]);
      ml = Math.max(ml, e[3]);
      if (e[0] !== qb) { var k = e[0] + "|" + e[2]; po[k] = (po[k] || 0) + e[3]; mo = Math.max(mo, po[k]); }
    });
    PW.max = { c: mc, l: ml, o: mo };
    PW.att = {}; (D.watt[qb] || []).forEach(function (a) { PW.att[a[0]] = a[1]; });
    PW.why = (D.wwhy && D.wwhy[qb]) || {};
  }
  function winEdges() {
    var m = {}, out = [];
    PW.weeks.forEach(function (w) {
      if (PW.mode === "one" ? w !== PW.wk : w > PW.wk) return;
      (PW.byWeek[w] || []).forEach(function (e) { var k = e[0] + "|" + e[1], x = m[k]; if (!x) { x = m[k] = [e[0], e[1], 0, 0, PW.teams[k] || []]; out.push(x); } x[2] += e[3]; x[3] += e[4]; });
    });
    return { m: m, E: out };
  }
  function applyWeek(dur) {
    var W_ = winEdges(), M = W_.m, c = nodes[0], one = PW.mode === "one";
    var nC = one ? PW.max.c : G.maxC, nL = one ? PW.max.l : G.maxL, nO = one ? PW.max.o : G.maxO, rec = [];
    c.comp = 0; c.yds = 0;
    nodes.forEach(function (n) { if (n.type !== "center") { n.vis = false; n.comp = 0; n.yds = 0; } });
    links.forEach(function (L) {
      if (L.kind !== "main") return;
      var e = M[c.id + "|" + L.t.id]; L.c = e ? e[2] : 0; L.y = e ? e[3] : 0; L.vis = L.c > 0;
      if (L.vis) { L.t.vis = true; L.t.comp = L.c; L.t.yds = L.y; c.comp += L.c; c.yds += L.y; rec.push([c.id, L.t.id, L.c, L.y]); }
    });
    var tot = {};
    links.forEach(function (L) {
      if (L.kind !== "oth") return;
      var e = M[L.s.id + "|" + L.t.id]; L.c = e ? e[2] : 0; L.y = e ? e[3] : 0;
      L.vis = L.c > 0 && L.t.vis && (L.s.type !== "rec" || L.s.vis);
      if (L.vis && L.s.type !== "rec") tot[L.s.id] = (tot[L.s.id] || 0) + L.c;
    });
    nodes.forEach(function (n) {
      n.out.forEach(function (o) { var e = M[n.id + "|" + o.id]; o.c = e && byId[o.id].vis && (n.type !== "rec" || n.vis) ? e[2] : 0; o.y = o.c ? e[3] : 0; });
      if (n.type === "qb" || n.type === "np") { n.comp = tot[n.id] || 0; n.vis = n.comp > 0; }
      n.oT = n.type === "center" || n.vis ? 1 : 0;
      n.rT = n.type === "center" ? n.r : n.vis ? n.rb + n.rk * Math.sqrt(Math.min(1, n.comp / (n.type === "rec" ? nC : nO))) : 0;
      if (n.el) n.el.setAttribute("aria-label", label(n));
    });
    links.forEach(function (L) { L.oT = L.vis ? 1 : 0; L.wT = L.vis ? 1 + 6 * Math.sqrt(Math.min(1, L.c / nL)) : L.wd; });
    if (sel && sel.type !== "center" && !sel.vis) hideTip(); else if (sel) { tip.innerHTML = tipHTML(sel); placeTip(sel); }
    tween(dur);
    var oth = nodes.filter(function (n) { return n.vis && (n.type === "qb" || n.type === "np"); }).map(function (n) { return n.id; });
    return { rec: rec, oth: oth, E: W_.E };
  }
  function tween(dur) {
    cancelAnimationFrame(PW.anim); PW.anim = 0;
    nodes.forEach(function (n) { n.r0 = n.rd; n.o0 = n.op; if (n.oT && !n.o0) n.r0 = reduce ? n.rT : 0; if (!n.oT && reduce) n.rT = n.rd; if (n.oT) setVis(n.el, true); });
    links.forEach(function (L) { L.w0 = L.wd; L.o0 = L.op; if (L.oT && !L.o0) L.w0 = reduce ? L.wT : 0.5; if (L.oT) setVis(L.el, true); });
    var t0 = performance.now();
    function frameT(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = reduce ? t : 1 - Math.pow(1 - t, 3);
      nodes.forEach(function (n) {
        n.rd = n.r0 + (n.rT - n.r0) * e; n.op = n.o0 + (n.oT - n.o0) * e;
        n.cEl.setAttribute("r", Math.max(0.01, n.rd).toFixed(2)); if (n.lEl) n.lEl.setAttribute("x", (n.rd + 5).toFixed(1));
        n.w.setAttribute("opacity", n.op.toFixed(3));
        if (t >= 1) { setVis(n.el, n.oT > 0); n.el.setAttribute("tabindex", n.oT ? "0" : "-1"); }
      });
      links.forEach(function (L) {
        L.wd = L.w0 + (L.wT - L.w0) * e; L.op = L.o0 + (L.oT - L.o0) * e;
        L.el.setAttribute("stroke-width", L.wd.toFixed(2)); L.el.setAttribute("stroke-opacity", L.op.toFixed(3));
        if (t >= 1) setVis(L.el, L.oT > 0);
      });
      if (sel) placeTip(sel);
      if (t < 1) PW.anim = requestAnimationFrame(frameT); else PW.anim = 0;
    }
    if (dur) PW.anim = requestAnimationFrame(frameT); else frameT(t0);
  }
  function setVis(e, on) { if (e) { e.style.visibility = on ? "" : "hidden"; if (on) e.removeAttribute("aria-hidden"); else e.setAttribute("aria-hidden", "true"); } }
  function weekUI() {
    var a = attOf(PW.wk), pw = partialWk(), fn = first();
    wkIn.value = PW.wk;
    wkLbl.textContent = PW.mode === "one" ? "Week " + PW.wk + " only" : "Through Week " + PW.wk;
    var why = a ? null : whyOf(PW.wk);
    var sub = a ? a + " pass attempt" + (a === 1 ? "" : "s") + " in Week " + PW.wk : "Week " + PW.wk + ": " + why.t;
    if (pw) sub += " · week in progress";
    wkSub.textContent = sub;
    wkIn.setAttribute("aria-valuetext", wkLbl.textContent + ". " + fn + ": " + sub + ".");
    var note = "";
    var wl = why ? " " + why.t + (/\.$/.test(why.t) ? "" : ".") : "";
    if (PW.mode === "one") note = a ? (nodes[0].comp ? "" : "No completions by " + fn + " in Week " + PW.wk + ".") : "No pass attempts by " + fn + " in Week " + PW.wk + "." + wl;
    else if (!attThrough(PW.wk)) note = "No pass attempts by " + fn + " through Week " + PW.wk + "." + wl;
    else if (!a) note = "No pass attempts by " + fn + " in Week " + PW.wk + "." + wl + " Showing his totals through Week " + PW.wk + ".";
    wnote.textContent = note; wnote.hidden = !note;
    var n = PW.weeks.length, w0 = PW.weeks[0], span = Math.max(1, lastWk() - w0);
    wkIn.style.setProperty("--p", ((PW.wk - w0) / span * 100).toFixed(2) + "%");
    ticks.innerHTML = PW.weeks.map(function (w) {
      var has = attOf(w) > 0, y = has ? null : whyOf(w);
      return '<span class="' + (has ? "has" : "none k-" + y.k) + (w === PW.wk ? " cur" : "") + (PW.mode === "cum" && w <= PW.wk ? " in" : "") + '" style="--f:' + (n > 1 ? (w - w0) / span : 0.5).toFixed(4) +
        '" title="Week ' + w + (has ? "" : ": " + esc(y.t)) + '"><i></i><b>' + w + "</b>" + (has ? "" : "<em>" + TICK[y.k] + "</em>") + "</span>";
    }).join("");
    var lab = winLabel();
    setText("[data-qn-asof]", lab); setText("[data-qn-cap]", lab);
  }
  function sync(animate) {
    if (!PW.on || !nodes.length) return;
    var info = applyWeek(animate ? (reduce ? 300 : 650) : 0);
    weekUI(); updateText(info);
    status.textContent = winLabel() + ": " + fmt(nodes[0].comp) + " completions to " + info.rec.length + " receivers" + (wnote.hidden ? "" : ". " + wnote.textContent);
  }
  function setPlay(on) {
    if (!PW.on) return;
    clearTimeout(PW.timer); PW.playing = on;
    ppB.textContent = on ? "❚❚" : "▶"; ppB.setAttribute("aria-label", on ? "Pause" : "Play the season week by week");
    if (!on) return;
    if (PW.wk >= lastWk()) { PW.wk = PW.weeks[0]; sync(true); }
    PW.timer = setTimeout(stepPlay, reduce ? 1900 : 1500);
  }
  function stepPlay() {
    var i = PW.weeks.indexOf(PW.wk);
    if (i < 0 || i >= PW.weeks.length - 1) { setPlay(false); return; }
    PW.wk = PW.weeks[i + 1]; sync(true);
    if (PW.wk >= lastWk()) setPlay(false); else PW.timer = setTimeout(stepPlay, reduce ? 1900 : 1500);
  }

  /* ---------------------------------------------------------------- boot */
  function load(qb, animateFit) {
    if (!D.players[qb]) qb = D.meta.default_qb;
    cancelAnimationFrame(raf); raf = 0; hideTip();
    size(); seed = 7;
    var info = buildGraph(qb);
    render();
    alpha = 1; alphaTarget = 0;
    for (var i = 0; i < 260; i++) tick();   // settle off-screen, then let it breathe
    draw(); fit(animateFit);
    if (PW.on) { prepQb(qb); info = applyWeek(0); weekUI(); }
    updateText(info);
    document.dispatchEvent(new CustomEvent("qn:load", { detail: { qb: qb, data: D } }));
    alpha = 0.08; heat(0.08);
  }
  function fillSelect() {
    var P = D.players, tot = {};
    D.edges.forEach(function (e) { if (P[e[0]].pos === "QB") tot[e[0]] = (tot[e[0]] || 0) + e[2]; });
    var qbs = Object.keys(tot).filter(function (id) { return tot[id] >= 20 || id === D.meta.default_qb; })
      .sort(function (a, b) { return P[a].teams[0].localeCompare(P[b].teams[0]) || tot[b] - tot[a]; });
    select.innerHTML = qbs.map(function (id) { return '<option value="' + id + '">' + esc(P[id].teams.join("/") + " · " + P[id].name) + "</option>"; }).join("");
  }
  fetch("/assets/data/qb_network.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
    D = d; fillSelect(); PW.on = !!(D.wedges && D.watt && D.meta.weeks && D.meta.weeks.length); initPlay();
    var q = new URLSearchParams(location.search).get("qb");
    var qb = q && D.players[q] ? q : D.meta.default_qb;
    select.value = qb;
    load(qb, false);
    stage.classList.add("is-ready");
    select.addEventListener("change", function () {
      setPlay(false);
      var u = new URL(location.href);
      if (select.value === D.meta.default_qb) u.searchParams.delete("qb"); else u.searchParams.set("qb", select.value);
      history.replaceState(null, "", u);
      load(select.value, true);
    });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { var w = W; size(); if (Math.abs(w - W) > 40) load(select.value, false); else fit(false); }, 150); });
  }).catch(function () { stage.classList.add("is-error"); });
})();
