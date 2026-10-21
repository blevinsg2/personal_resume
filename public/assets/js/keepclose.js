/* Keep-or-close kiosk profitability dashboard. Data: /assets/data/kiosks.json
   (fictional kiosks; road legs precomputed with OSRM on OpenStreetMap). All money is example data. */
(function () {
  "use strict";
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(n) { var a = Math.abs(n), s = n < 0 ? "−$" : "$"; return s + (a >= 1e5 ? Math.round(a / 1000) + "k" : Math.round(a).toLocaleString("en-US")); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var PERIODS = [30, 60, 90, 180];
  var PRICE = [2.0, 3.5, 1.25], CC = [0.55, 0.5, 0.2], ON_M = 20, ON_T = 60;
  var MIXN = ["New movies", "New games", "Older catalog"];
  var FIELDS = [
    { k: "labor", label: "Labor, $/hr", min: 12, max: 45, step: 1, v: 24, f: function (v) { return "$" + v; } },
    { k: "mile", label: "Vehicle, $/mile", min: 0.3, max: 1.2, step: 0.02, v: 0.62, f: function (v) { return "$" + v.toFixed(2); } },
    { k: "vpw", label: "Restock visits / week", min: 0.5, max: 3, step: 0.5, v: 1, f: function (v) { return v + "×"; } },
    { k: "keep", label: "Keep at margin ≥ / mo", min: 0, max: 600, step: 25, v: 200, f: function (v) { return "$" + v; } },
    { k: "close", label: "Close below margin / mo", min: -300, max: 300, step: 25, v: 0, f: function (v) { return (v < 0 ? "−$" : "$") + Math.abs(v); } }
  ];
  var P = {}; FIELDS.forEach(function (f) { P[f.k] = f.v; });
  var st = { zone: "wtx", period: 90, sel: null, sort: "margin", dir: 1 };
  var D, Z = {}, ALL = [], map, tiles, layer, fitted = {};

  /* ------------------------------------------------ model */
  function calc(k, N, o) {
    o = o || {}; var vpw = o.vpw != null ? o.vpw : P.vpw;
    var r = k.rpd * (1 + k.trend * (180 - N) / 150) + (o.extra || 0);
    var stock = vpw >= 2 ? 1 : vpw >= 1 ? 0.85 + 0.15 * (vpw - 1) : 0.85 - 0.4 * (1 - vpw);   /* empty slots between visits */
    var rr = [r * k.mix[0] * stock, r * k.mix[1] * stock, r * k.mix[2]];
    var rev = 0, cont = 0;
    for (var i = 0; i < 3; i++) { rev += rr[i] * PRICE[i] * N; cont += rr[i] * PRICE[i] * CC[i] * N; }
    var drive = 2 * k.nn_mi * P.mile + 2 * k.nn_min / 60 * P.labor;
    var mVisits = vpw * N / 7, tVisits = k.tech * N / 30;
    var merch = (drive + ON_M / 60 * P.labor) * mVisits, serv = (drive + ON_T / 60 * P.labor) * tVisits;
    var margin = rev - cont - merch - serv, mo = margin * 30 / N;
    return { rpd: rr[0] + rr[1] + rr[2], rentals: (rr[0] + rr[1] + rr[2]) * N, rev: rev, cont: cont, merch: merch, serv: serv, cts: merch + serv,
      margin: margin, mo: mo, drive: drive, mVisits: mVisits, tVisits: tVisits, verdict: mo >= P.keep ? "keep" : mo < P.close ? "close" : "watch",
      mixRev: [rr[0] * PRICE[0], rr[1] * PRICE[1], rr[2] * PRICE[2]] };
  }
  var VN = { keep: "Keep", watch: "Watch", close: "Close" };
  function chip(v) { return '<span class="kc-v ' + v + '">' + VN[v] + "</span>"; }
  function zoneRows() { return Z[st.zone].kiosks.map(function (k) { return { k: k, c: calc(k, st.period) }; }); }

  /* ------------------------------------------------ toolbar */
  function renderToolbar() {
    $("#kc-zones").innerHTML = D.zones.map(function (z) { return '<button type="button" aria-pressed="' + (z.id === st.zone) + '" data-z="' + z.id + '" title="' + esc(z.desc) + '">' + esc(z.name) + "</button>"; }).join("");
    $("#kc-periods").innerHTML = PERIODS.map(function (p) { return '<button type="button" aria-pressed="' + (p === st.period) + '" data-p="' + p + '">' + p + "d</button>"; }).join("");
  }

  /* ------------------------------------------------ KPIs */
  function renderKPIs(rows) {
    var t = { rev: 0, cts: 0, margin: 0, n: { keep: 0, watch: 0, close: 0 } };
    rows.forEach(function (r) { t.rev += r.c.rev; t.cts += r.c.cts; t.margin += r.c.margin; t.n[r.c.verdict]++; });
    var z = Z[st.zone];
    $("#kc-kpis").innerHTML =
      kpi("Kiosks", rows.length, esc(z.desc)) +
      kpi("Zone revenue", money(t.rev), "last " + st.period + " days") +
      kpi("Cost to serve", money(t.cts), Math.round(t.cts / t.rev * 100) + "% of revenue · restock + tech") +
      kpi("Margin", money(t.margin), "after content and cost to serve", t.margin < 0 ? "neg" : "") +
      '<div class="sf-kpi kc-counts"><span>Verdicts</span><div>' + ["keep", "watch", "close"].map(function (v) { return '<em class="' + v + '"><b>' + t.n[v] + "</b>" + VN[v] + "</em>"; }).join("") + "</div><small>at margin / 30 days</small></div>";
  }
  function kpi(l, v, s, cls) { return '<div class="sf-kpi' + (cls ? " " + cls : "") + '"><span>' + l + "</span><b>" + v + "</b><small>" + s + "</small></div>"; }

  /* ------------------------------------------------ map */
  function initMap() {
    map = L.map("kc-map", { zoomControl: true, scrollWheelZoom: false, attributionControl: true, tap: true });
    tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, className: "tr-tiles", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes OSRM' }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function renderMap(rows, fit) {
    layer.clearLayers(); map.invalidateSize();
    var z = Z[st.zone], sel = rows.filter(function (r) { return r.k.id === st.sel; })[0];
    if (sel) {
      var k = sel.k, nn = k.nn_depot ? z.depot : z.kiosks.filter(function (x) { return x.name === k.nn; })[0];
      L.polyline([[k.lat, k.lon], [nn.lat, nn.lon]], { className: "tr-crow", weight: 1.5, dashArray: "4 5", interactive: false }).addTo(layer);
      L.polyline(k.nn_geom, { className: "tr-line on", weight: 4, interactive: false }).addTo(layer);
    }
    var maxR = 34;
    rows.forEach(function (r) {
      var on = r.k.id === st.sel;
      var m = L.circleMarker([r.k.lat, r.k.lon], { radius: 5 + 7 * Math.sqrt(r.k.rpd / maxR), className: "kc-dot " + r.c.verdict + (on ? " on" : ""), weight: on ? 3 : 1.5 }).addTo(layer);
      m.bindTooltip(esc(r.k.name) + " · " + VN[r.c.verdict] + " · " + money(r.c.mo) + "/mo", { direction: "top", offset: [0, -6], className: "kc-tip" });
      m.on("click", function () { select(r.k.id); }); if (m.getElement()) m.getElement().setAttribute("tabindex", "-1");
    });
    L.marker([z.depot.lat, z.depot.lon], { icon: L.divIcon({ className: "kc-depot", html: "<span>Depot</span>", iconSize: [54, 22], iconAnchor: [27, 11] }), title: z.depot.name, zIndexOffset: 500 }).addTo(layer);
    if (fit || !fitted[st.zone]) {
      var pts = rows.map(function (r) { return [r.k.lat, r.k.lon]; }).concat([[z.depot.lat, z.depot.lon]]);
      map.fitBounds(pts, { padding: [24, 24] }); fitted[st.zone] = true;
    }
  }

  /* ------------------------------------------------ detail */
  function spark(vals, cls, fmt) {
    var W = 150, H = 40, mn = Math.min.apply(null, vals.concat(cls === "m" ? [0] : [])), mx = Math.max.apply(null, vals.concat(cls === "m" ? [0] : []));
    if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
    function X(i) { return 6 + i * (W - 12) / (vals.length - 1); }
    function Y(v) { return 6 + (1 - (v - mn) / (mx - mn)) * (H - 12); }
    var d = vals.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" ");
    var zero = cls === "m" ? '<line class="z" x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>' : "";
    return '<svg class="kc-spark ' + cls + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' + zero + '<path d="' + d + '"/>' +
      vals.map(function (v, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (i === vals.length - 1 ? 3.2 : 2.2) + '"/>'; }).join("") + "</svg>";
  }
  function renderDetail(rows) {
    var r = rows.filter(function (x) { return x.k.id === st.sel; })[0];
    if (!r) { $("#kc-detail").innerHTML = '<p class="kc-empty">Tap a kiosk on the map or in the table.</p>'; return; }
    var k = r.k, c = r.c, z = Z[st.zone];
    var order = [180, 90, 60, 30], hist = order.map(function (p) { return calc(k, p); });
    var half = calc(k, st.period, { vpw: P.vpw / 2 }), dbl = calc(k, st.period, { vpw: Math.min(3, P.vpw * 2) });
    var nk = z.kiosks.filter(function (x) { return x.id === k.nk_id; })[0];
    var keepPct = Math.max(0, 40 - k.nk_mi) / 100, moved = c.rpd * keepPct;
    var nkBase = calc(nk, st.period), nkNew = calc(nk, st.period, { extra: moved });
    var zoneDelta = -c.margin + (nkNew.margin - nkBase.margin);
    var mixT = c.mixRev[0] + c.mixRev[1] + c.mixRev[2];
    $("#kc-detail").innerHTML =
      '<div class="kc-dh"><div><h3>' + esc(k.name) + "</h3><small>" + esc(z.name) + " · " + c.rpd.toFixed(1) + " rentals/day, last " + st.period + " days</small></div>" + chip(c.verdict) + "</div>" +
      '<p class="kc-leg">Nearest stop: <b>' + esc(k.nn) + "</b>, " + k.nn_mi + " road mi · " + Math.round(k.nn_min) + " min <span>(" + k.nn_crow_mi + " mi straight line)</span></p>" +
      '<dl class="kc-pl">' +
        pl("Rentals", Math.round(c.rentals).toLocaleString("en-US"), "") + pl("Revenue", money(c.rev), "") + pl("Content costs", "−" + money(c.cont), "") +
        pl("Restocking", "−" + money(c.merch), c.mVisits.toFixed(1) + " visits × " + money(c.drive + ON_M / 60 * P.labor)) +
        pl("Tech service", "−" + money(c.serv), c.tVisits.toFixed(1) + " visits × " + money(c.drive + ON_T / 60 * P.labor)) +
        '<div class="tot' + (c.margin < 0 ? " neg" : "") + '"><dt>Margin, ' + st.period + " days</dt><dd>" + money(c.margin) + "<small>" + money(c.mo) + " / 30 days</small></dd></div>" +
      "</dl>" +
      '<p class="kc-mixh">Revenue by content</p><div class="kc-mixbar" aria-label="Revenue by content type">' + c.mixRev.map(function (v, i) { return '<i class="x' + i + '" style="width:' + (v / mixT * 100).toFixed(1) + '%"></i>'; }).join("") + "</div>" +
      '<p class="kc-mixl">' + MIXN.map(function (n, i) { return '<span><i class="x' + i + '"></i>' + n + " " + Math.round(c.mixRev[i] / mixT * 100) + "%</span>"; }).join("") + "</p>" +
      '<div class="kc-trend"><div><span>Rentals / day</span>' + spark(hist.map(function (h) { return h.rpd; }), "r") + "<small>" + hist[0].rpd.toFixed(1) + " → " + hist[3].rpd.toFixed(1) + "</small></div>" +
        "<div><span>Margin / 30 days</span>" + spark(hist.map(function (h) { return h.mo; }), "m") + "<small>" + money(hist[0].mo) + " → " + money(hist[3].mo) + "</small></div></div>" +
      '<p class="kc-axis">180d · 90d · 60d · 30d windows</p>' +
      '<div class="kc-whatif"><span>What if</span><ul>' +
        "<li>Restock " + (P.vpw / 2) + "× a week instead of " + P.vpw + "×: margin " + money(half.mo) + "/mo " + chip(half.verdict) + "</li>" +
        (P.vpw < 3 ? "<li>Restock " + Math.min(3, P.vpw * 2) + "× a week: margin " + money(dbl.mo) + "/mo " + chip(dbl.verdict) + "</li>" : "") +
        "<li>Close it: " + esc(nk.name) + " (" + k.nk_mi + " road mi) absorbs about " + Math.round(keepPct * 100) + "% of its rentals. Zone margin " + (zoneDelta >= 0 ? "+" : "") + money(zoneDelta) + " over " + st.period + " days.</li>" +
      "</ul></div>";
  }
  function pl(l, v, s) { return "<div><dt>" + l + (s ? "<small>" + s + "</small>" : "") + "</dt><dd>" + v + "</dd></div>"; }

  /* ------------------------------------------------ table */
  var COLS = [
    { k: "name", t: "Kiosk", v: function (r) { return r.k.name; } },
    { k: "nn", t: "Nearest stop", v: function (r) { return r.k.nn_mi; }, f: function (r) { return r.k.nn_mi + " mi"; } },
    { k: "rpd", t: "Rentals / day", v: function (r) { return r.c.rpd; }, f: function (r) { return r.c.rpd.toFixed(1); } },
    { k: "mix", t: "Mix", v: function (r) { return r.c.mixRev[2] / (r.c.mixRev[0] + r.c.mixRev[1] + r.c.mixRev[2]); }, f: function (r) { var t = r.c.mixRev[0] + r.c.mixRev[1] + r.c.mixRev[2]; return '<span class="kc-mixbar sm" title="New movies / new games / older catalog">' + r.c.mixRev.map(function (v, i) { return '<i class="x' + i + '" style="width:' + (v / t * 100).toFixed(1) + '%"></i>'; }).join("") + "</span>"; } },
    { k: "rev", t: "Revenue", v: function (r) { return r.c.rev; }, f: function (r) { return money(r.c.rev); } },
    { k: "merch", t: "Restock", v: function (r) { return r.c.merch; }, f: function (r) { return money(r.c.merch); } },
    { k: "serv", t: "Service", v: function (r) { return r.c.serv; }, f: function (r) { return money(r.c.serv); } },
    { k: "margin", t: "Margin", v: function (r) { return r.c.margin; }, f: function (r) { return '<b class="' + (r.c.margin < 0 ? "neg" : "") + '">' + money(r.c.margin) + "</b>"; } },
    { k: "verdict", t: "Verdict", v: function (r) { return { keep: 2, watch: 1, close: 0 }[r.c.verdict] + r.c.mo / 1e6; }, f: function (r) { return chip(r.c.verdict); } }
  ];
  function renderTable(rows) {
    var col = COLS.filter(function (c) { return c.k === st.sort; })[0];
    rows = rows.slice().sort(function (a, b) { var x = col.v(a), y = col.v(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * (st.sort === "name" ? 1 : -1) * st.dir; });
    $("#kc-zname").textContent = Z[st.zone].name;
    $("#kc-tsub").textContent = "Last " + st.period + " days. Tap a header to sort, or a row for details.";
    $("#kc-table").innerHTML = "<thead><tr>" + COLS.map(function (c) {
      var on = c.k === st.sort;
      return '<th scope="col"' + (on ? ' aria-sort="' + ((st.dir === 1) === (c.k !== "name") ? "descending" : "ascending") + '"' : "") + '><button type="button" data-sort="' + c.k + '">' + c.t + (on ? '<i aria-hidden="true">' + ((st.dir === 1) === (c.k !== "name") ? "↓" : "↑") + "</i>" : "") + "</button></th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return '<tr class="' + (r.k.id === st.sel ? "on" : "") + '" data-id="' + r.k.id + '" tabindex="0">' + COLS.map(function (c, i) { return (i ? "<td>" : '<th scope="row">') + (c.f ? c.f(r) : esc(c.v(r))) + (i ? "</td>" : "</th>"); }).join("") + "</tr>";
    }).join("") + "</tbody>";
  }

  /* ------------------------------------------------ insight (across all zones) */
  function renderInsight() {
    var all = ALL.map(function (k) { return { k: k, c: calc(k, st.period), z: k._z }; });
    var bad = all.filter(function (r) { return r.c.verdict !== "keep"; }).sort(function (a, b) { return b.c.rpd - a.c.rpd; })[0];
    var good = all.filter(function (r) { return r.c.verdict === "keep" && r.z === "dfw"; }).sort(function (a, b) { return a.c.rpd - b.c.rpd; })[0];
    if (!bad || !good) { $("#kc-insight").innerHTML = '<p><span class="kc-ik">Key insight</span>At these assumptions every kiosk lands on the same side. Move the thresholds or costs to see the split.</p>'; return; }
    $("#kc-insight").innerHTML = '<p><span class="kc-ik">Key insight</span><button type="button" class="kc-jump" data-jump="' + bad.k.id + '">' + esc(bad.k.name) + "</button> rents <b>" + bad.c.rpd.toFixed(0) + " a day</b> and still lands on " + chip(bad.c.verdict) +
      ": its nearest stop is " + bad.k.nn_mi + " road miles away, so restocking and repairs cost " + money(bad.c.cts * 30 / st.period) + " a month. " +
      '<button type="button" class="kc-jump" data-jump="' + good.k.id + '">' + esc(good.k.name) + "</button> rents only <b>" + good.c.rpd.toFixed(0) + " a day</b> and is a " + chip("keep") + ": it sits " + good.k.nn_mi + " road miles from its nearest stop, and serving it costs " + money(good.c.cts * 30 / st.period) + " a month.</p>";
  }

  /* ------------------------------------------------ assumptions */
  function renderFields() {
    $("#kc-fields").innerHTML = FIELDS.map(function (f) {
      return '<label class="sp-range sp-mini"><span>' + f.label + '</span><input type="range" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + P[f.k] + '" data-k="' + f.k + '"><output>' + f.f(P[f.k]) + "</output></label>";
    }).join("");
    $$("#kc-fields input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var f = FIELDS.filter(function (x) { return x.k === inp.getAttribute("data-k"); })[0];
        P[f.k] = +inp.value;
        if (f.k === "keep" && P.keep < P.close) { P.close = P.keep; syncField("close"); }
        if (f.k === "close" && P.close > P.keep) { P.keep = P.close; syncField("keep"); }
        inp.nextElementSibling.textContent = f.f(P[f.k]); render(false);
      });
    });
  }
  function syncField(k) { var f = FIELDS.filter(function (x) { return x.k === k; })[0], inp = $('#kc-fields input[data-k="' + k + '"]'); inp.value = P[k]; inp.nextElementSibling.textContent = f.f(P[k]); }

  /* ------------------------------------------------ wiring */
  function defaultSel(rows) {
    if (rows.some(function (r) { return r.k.id === st.sel; })) return st.sel;
    var bad = rows.filter(function (r) { return r.c.verdict !== "keep"; }).sort(function (a, b) { return b.c.rpd - a.c.rpd; })[0];
    return (bad || rows.slice().sort(function (a, b) { return b.c.rpd - a.c.rpd; })[0]).k.id;
  }
  function render(fit) {
    var rows = zoneRows(); st.sel = defaultSel(rows);
    renderToolbar(); renderKPIs(rows); renderMap(rows, fit); renderDetail(rows); renderTable(rows); renderInsight();
  }
  function select(id) {
    var k = ALL.filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var zoneChanged = k._z !== st.zone; st.zone = k._z; st.sel = id; render(zoneChanged);
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var b;
    if ((b = t.closest("#kc-zones [data-z]"))) { st.zone = b.getAttribute("data-z"); st.sel = null; render(true); }
    else if ((b = t.closest("#kc-periods [data-p]"))) { st.period = +b.getAttribute("data-p"); render(false); }
    else if ((b = t.closest("[data-sort]"))) { var k = b.getAttribute("data-sort"); if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = 1; } render(false); }
    else if ((b = t.closest("#kc-table tbody tr"))) { select(b.getAttribute("data-id")); }
    else if ((b = t.closest("[data-jump]"))) { select(b.getAttribute("data-jump")); var bd = $("#kc-board"); if (bd.getBoundingClientRect().top < 0) bd.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (t.closest("[data-kc-reset]")) { FIELDS.forEach(function (f) { P[f.k] = f.v; }); renderFields(); render(false); }
  });
  document.addEventListener("keydown", function (e) {
    var tr = e.target.closest && e.target.closest("#kc-table tbody tr");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(tr.getAttribute("data-id")); }
  });

  fetch("/assets/data/kiosks.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; d.zones.forEach(function (z) { Z[z.id] = z; z.kiosks.forEach(function (k) { k._z = z.id; ALL.push(k); }); });
    initMap(); renderFields(); render(true);
    window.addEventListener("resize", function () { map.invalidateSize(); });
  }).catch(function () { $("#kc-detail").innerHTML = '<p class="kc-empty">The dashboard data didn\'t load. Please refresh.</p>'; });
})();
