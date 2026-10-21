/* Traffic & Routing visual. Data: /assets/data/traffic.json (FHWA TMAS) and /assets/data/routes.json (OSRM, precomputed). */
(function () {
  "use strict";
  var heatEl = document.getElementById("tr-grids");
  if (!heatEl) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var T, R, st = { city: "dc", dir: 0, t: 2 * 24 + 17, rcity: "dc", metric: "time", sel: null, depart: 17, mode: "delivery" };
  var KM_MI = 0.621371;

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function hr(h) { return h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : (h - 12) + " PM"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------------------------------------------------------- Part 1: heat strips */
  function corridorMax(d) { var m = 0; d.profile.forEach(function (r) { r.forEach(function (v) { if (v > m) m = v; }); }); return m || 1; }
  function renderHeat() {
    var city = T.cities[st.city], html = "";
    city.corridors.forEach(function (c, ci) {
      var d = c.dirs[st.dir] || c.dirs[0], max = corridorMax(d), cells = "";
      for (var w = 0; w < 7; w++) for (var h = 0; h < 24; h++) {
        var v = d.profile[w][h], p = v == null ? 0 : v / max;
        cells += '<i data-w="' + w + '" data-h="' + h + '" style="--p:' + Math.round(Math.pow(p, 1.6) * 100) + '%" title="' + DAYS[w] + " " + hr(h) + ": " + (v == null ? "no data" : fmt(v) + " vehicles/hour") + '"></i>';
      }
      html += '<div class="tr-strip" data-ci="' + ci + '"><div class="tr-strip-h"><div><b>' + esc(c.route) + '</b> <span>' + esc(d.dir) + '</span><small>' + esc(c.where) + '</small></div>' +
        '<div class="tr-read"><b data-v>–</b><span data-p></span></div></div>' +
        '<div class="tr-cells" style="--max:' + max + '">' + cells + '</div>' +
        '<div class="tr-axis" aria-hidden="true"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div></div>';
    });
    heatEl.innerHTML = html;
    $$(".tr-cells i", heatEl).forEach(function (c) {
      c.addEventListener("click", function () { stop(); setT(+c.getAttribute("data-w") * 24 + +c.getAttribute("data-h")); });
    });
    updateHeat();
  }
  function updateHeat() {
    var w = Math.floor(st.t / 24), h = st.t % 24, city = T.cities[st.city];
    $("#tr-hour").value = st.t;
    $("#tr-now").textContent = DAYS[w] + " " + hr(h);
    $$(".tr-strip", heatEl).forEach(function (el, ci) {
      var c = city.corridors[ci], d = c.dirs[st.dir] || c.dirs[0], v = d.profile[w][h], max = corridorMax(d);
      $("[data-v]", el).textContent = v == null ? "No data" : fmt(v) + " / hr";
      $("[data-p]", el).textContent = v == null ? "" : Math.round(v / max * 100) + "% of its busiest hour";
      $$(".tr-cells i.on", el).forEach(function (x) { x.classList.remove("on"); });
      var cell = $('.tr-cells i[data-w="' + w + '"][data-h="' + h + '"]', el); if (cell) cell.classList.add("on");
      $(".tr-cells", el).style.setProperty("--col", h); $(".tr-cells", el).style.setProperty("--row", w);
    });
  }
  function setT(t) { st.t = (t + 168) % 168; updateHeat(); }
  var timer = 0, playBtn = $("[data-tr-play]");
  function stop() { if (timer) { clearInterval(timer); timer = 0; playBtn.classList.remove("is-on"); playBtn.setAttribute("aria-label", "Play through the week"); } }
  playBtn.addEventListener("click", function () {
    if (timer) return stop();
    playBtn.classList.add("is-on"); playBtn.setAttribute("aria-label", "Pause");
    timer = setInterval(function () { setT(st.t + 1); }, reduce ? 400 : 140);
  });
  $("#tr-hour").addEventListener("input", function (e) { stop(); setT(+e.target.value); });
  $$("[data-tr-city]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.city = b.getAttribute("data-tr-city");
      $$("[data-tr-city]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      renderHeat();
    });
  });
  $$("[data-tr-dir]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.dir = +b.getAttribute("data-tr-dir");
      $$("[data-tr-dir]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderHeat();
    });
  });

  /* ---------------------------------------------------------------- Part 2: routing */
  var routeEl = document.getElementById("tr-routing"), modeled = routeEl && routeEl.getAttribute("data-modeled") === "1";
  var map, tiles, layer, dep = document.getElementById("tr-depart");
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function tileUrl() { return "https://tile.openstreetmap.org/{z}/{x}/{y}.png"; }

  /* Illustrative only (shown when data-modeled="1"): scale a route's freeway miles by a congestion
     factor estimated from the real weekday hourly volumes in Part 1. Not measured speeds. */
  var cMemo = {};
  function congestion(cityKey, route, h) {
    var k = cityKey + "|" + route + "|" + h;
    if (k in cMemo) return cMemo[k];
    var city = T.cities[cityKey], best = 1;
    city.corridors.forEach(function (c) {
      if (route.indexOf(c.route.replace("-", " ")) < 0) return;
      c.dirs.forEach(function (d) {
        var max = corridorMax(d), v = 0, n = 0;
        for (var w = 1; w <= 5; w++) { if (d.profile[w][h] != null) { v += d.profile[w][h]; n++; } }
        var f = 1 + 0.6 * Math.pow((v / n) / max, 4);
        if (f > best) best = f;
      });
    });
    return (cMemo[k] = best);
  }
  /* s: anything with drive_min (free-flow OSRM minutes) and roads [[ref, km]]; h: whole weekday hour */
  function adjMinutes(cityKey, s, h) {
    var tot = s.roads.reduce(function (a, r) { return a + r[1]; }, 0) || 1, mult = 0, fw = 0, fwKm = 0;
    s.roads.forEach(function (r) { var f = congestion(cityKey, r[0], h); if (f > 1) { mult += (r[1] / tot) * f; fwKm += r[1]; fw += f * r[1]; } });
    var avgF = fwKm ? fw / fwKm : 1 + 0.6 * 0.5;
    var local = 1 - fwKm / tot, localF = 1 + (avgF - 1) * 0.4;
    return s.drive_min * (mult + local * localF);
  }
  /* fractional hour: blend the two neighbouring hours so the clock moves smoothly through the day */
  function adjAt(cityKey, s, hf) {
    var h0 = Math.floor(hf), a = hf - h0;
    return adjMinutes(cityKey, s, ((h0 % 24) + 24) % 24) * (1 - a) + adjMinutes(cityKey, s, (((h0 + 1) % 24) + 24) % 24) * a;
  }
  function val(s, m) {
    if (m === "crow") return s.crow_km * KM_MI;
    if (m === "road") return s.road_km * KM_MI;
    return modeled ? adjMinutes(st.rcity, s, st.depart) : s.drive_min;
  }
  function label(m, v) { return m === "time" ? Math.round(v) + " min" : v.toFixed(1) + " mi"; }
  function ranked(m) { var c = R.cities[st.rcity]; return c.stops.slice().sort(function (a, b) { return val(a, m) - val(b, m); }); }
  var MNAME = { crow: "straight line", road: "road miles", time: "drive time" };

  function initMap() {
    map = L.map("tr-map", { zoomControl: true, scrollWheelZoom: false, attributionControl: true, tap: true });
    tiles = L.tileLayer(tileUrl(), { maxZoom: 18, className: "tr-tiles", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function renderRoute(fit) {
    var c = R.cities[st.rcity], order = ranked(st.metric), sel = st.sel && c.stops.some(function (s) { return s.id === st.sel; }) ? st.sel : order[0].id;
    st.sel = sel;
    layer.clearLayers(); map.invalidateSize();
    var start = [c.start.lat, c.start.lon], bounds = L.latLngBounds([start]);
    c.stops.forEach(function (s) {
      var on = s.id === sel, line = s.line.map(function (p) { return [p[1], p[0]]; });
      L.polyline(line, { className: "tr-line" + (on ? " on" : ""), weight: on ? 5 : 3, interactive: false }).addTo(layer);
      if (on) L.polyline([start, [s.lat, s.lon]], { className: "tr-crow", weight: 2, dashArray: "4 6", interactive: false }).addTo(layer);
      line.forEach(function (p) { bounds.extend(p); });
    });
    order.forEach(function (s, i) {
      var on = s.id === sel;
      var m = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "tr-pin" + (on ? " on" : "") + (i === 0 ? " first" : ""), html: "<span>" + (i + 1) + "</span>", iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: true, title: s.name }).addTo(layer);
      m.on("click", function () { st.sel = s.id; renderRoute(false); });
    });
    L.circleMarker(start, { radius: 6, className: "tr-start-dot", interactive: false }).addTo(layer);
    L.marker(start, { icon: L.divIcon({ className: "tr-start", html: "<span>Start</span>", iconSize: [52, 22], iconAnchor: [26, -8] }), interactive: false, zIndexOffset: 1000 }).addTo(layer);
    if (fit) map.fitBounds(bounds, { padding: [24, 24] });

    var list = $("#tr-list"), vals = order.map(function (s) { return val(s, st.metric); });
    list.innerHTML = order.map(function (s, i) {
      var on = s.id === sel;
      return '<li class="' + (on ? "on" : "") + (i === 0 ? " first" : "") + '"><button type="button" data-id="' + s.id + '"><span class="tr-rk">' + (i + 1) + '</span><span class="tr-nm">' + esc(s.name) +
        '<small>' + ["crow", "road", "time"].map(function (m) { return '<em class="' + (m === st.metric ? "cur" : "") + '">' + label(m, val(s, m)) + (m === "crow" ? " straight" : m === "road" ? " road" : "") + "</em>"; }).join("") +
        '</small></span><b>' + label(st.metric, vals[i]) + "</b></button></li>";
    }).join("");
    $$("button", list).forEach(function (b) { b.addEventListener("click", function () { st.sel = b.getAttribute("data-id"); renderRoute(false); }); });
    var n = { crow: ranked("crow")[0], road: ranked("road")[0], time: ranked("time")[0] };
    var v = "Nearest by straight line: <b>" + esc(n.crow.name) + "</b>. By road miles: <b>" + esc(n.road.name) + "</b>. By " + (modeled ? "drive time at " + hr(st.depart) : "drive time") + ": <b>" + esc(n.time.name) + "</b>.";
    var s = c.stops.filter(function (x) { return x.id === sel; })[0];
    v += ' <span class="tr-sel">' + esc(s.name) + ": " + label("crow", val(s, "crow")) + " as the crow flies, " + label("road", val(s, "road")) + " by road" +
      (s.road_km / s.crow_km > 1.5 ? " (" + (s.road_km / s.crow_km).toFixed(1) + "× longer)" : "") + ".</span>";
    $("#tr-verdict").innerHTML = v;
  }

  /* ---------------------------------------------------------------- Service-tech mode
     EXAMPLE job durations (not real data). The planner tries every visit order for one tech leaving the start
     point at the chosen weekday hour; each leg uses the drive time for the hour the tech actually leaves that stop. */
  var JOBS = [
    { id: "clean", name: "Cleaning", min: 20 },
    { id: "restock", name: "Restock", min: 30 },
    { id: "reader", name: "Card-reader swap", min: 35 },
    { id: "diag", name: "Diagnostic", min: 45 },
    { id: "screen", name: "Screen replacement", min: 75 }
  ];
  var JOB = {}; JOBS.forEach(function (j) { JOB[j.id] = j; });
  var jobsBy = {
    dc: { ftwash: "clean", mtvernon: "screen", harbor: "restock", oldtown: "reader", pentagon: "diag", tysons: "clean" },
    ric: { airport: "screen", ginter: "clean", pocahontas: "restock", shortpump: "diag" }
  };
  function clock(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + ":" + (mm < 10 ? "0" : "") + mm + " " + (h < 12 ? "AM" : "PM"); }
  function dur(m) { m = Math.round(m); var h = Math.floor(m / 60); return h ? h + " h " + (m % 60) + " min" : m + " min"; }
  function legMin(cityKey, leg, tMin) { var x = { drive_min: leg.min, roads: leg.roads }; return modeled ? adjAt(cityKey, x, tMin / 60) : leg.min; }
  function simulate(cityKey, order) {   /* order: stop indexes 1..n (0 is the start point) */
    var c = R.cities[cityKey], t = st.depart * 60, cur = 0, rows = [], drive = 0, svc = 0;
    order.forEach(function (j) {
      var s = c.stops[j - 1], leg = c.legs[cur + "-" + j], d = legMin(cityKey, leg, t), job = JOB[jobsBy[cityKey][s.id]];
      var arr = t + d; t = arr + job.min; drive += d; svc += job.min;
      rows.push({ stop: s, idx: j, leg: leg, drive: d, arrive: arr, depart: t, job: job });
      cur = j;
    });
    return { rows: rows, drive: drive, svc: svc, total: t - st.depart * 60 };
  }
  function permute(a) {
    if (a.length < 2) return [a];
    var out = [];
    a.forEach(function (x, i) { permute(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); }); });
    return out;
  }
  function hav(a, b) {
    var r = Math.PI / 180, dp = (b.lat - a.lat) * r, dl = (b.lon - a.lon) * r;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  function nearestFirst(cityKey) {   /* the naive plan: always drive to the closest remaining stop by straight line */
    var c = R.cities[cityKey], left = c.stops.map(function (s, i) { return i + 1; }), here = c.start, out = [];
    while (left.length) {
      left.sort(function (a, b) { return hav(here, c.stops[a - 1]) - hav(here, c.stops[b - 1]); });
      var j = left.shift(); out.push(j); here = c.stops[j - 1];
    }
    return out;
  }
  function plan(cityKey) {
    var c = R.cities[cityKey], best = null;
    permute(c.stops.map(function (s, i) { return i + 1; })).forEach(function (o) {
      var r = simulate(cityKey, o);
      if (!best || r.total < best.total - 1e-9) best = r;
    });
    return { best: best, naive: simulate(cityKey, nearestFirst(cityKey)) };
  }
  function renderTech(fit) {
    var key = st.rcity, c = R.cities[key], p = plan(key), b = p.best;
    layer.clearLayers();
    var start = [c.start.lat, c.start.lon], bounds = L.latLngBounds([start]);
    b.rows.forEach(function (r) {
      var line = r.leg.line.map(function (q) { return [q[1], q[0]]; });
      L.polyline(line, { className: "tr-line on tr-leg", weight: 4, interactive: false }).addTo(layer);
      line.forEach(function (q) { bounds.extend(q); });
    });
    b.rows.forEach(function (r, i) {
      L.marker([r.stop.lat, r.stop.lon], { icon: L.divIcon({ className: "tr-pin on" + (i === 0 ? " first" : ""), html: "<span>" + (i + 1) + "</span>", iconSize: [28, 28], iconAnchor: [14, 14] }), title: (i + 1) + ". " + r.stop.name + " (" + r.job.name + ")" }).addTo(layer);
    });
    L.circleMarker(start, { radius: 6, className: "tr-start-dot", interactive: false }).addTo(layer);
    L.marker(start, { icon: L.divIcon({ className: "tr-start", html: "<span>Start</span>", iconSize: [52, 22], iconAnchor: [26, -8] }), interactive: false, zIndexOffset: 1000 }).addTo(layer);
    map.invalidateSize();
    if (fit) map.fitBounds(bounds, { padding: [24, 24] });

    var same = p.naive.rows.map(function (r) { return r.idx; }).join() === b.rows.map(function (r) { return r.idx; }).join();
    var diff = p.naive.total - b.total;
    var v = "Best order for one tech leaving at <b>" + clock(st.depart * 60) + "</b>: " + b.rows.length + " stops, done at <b>" + clock(st.depart * 60 + b.total) + "</b>. " +
      '<span class="tr-sel">Day length ' + dur(b.total) + " (" + dur(b.drive) + " driving, " + dur(b.svc) + " on jobs). " +
      (same || diff < 0.5 ? "Here, going nearest-first by straight line happens to give the same result." :
        "Nearest-first by straight line would finish at " + clock(st.depart * 60 + p.naive.total) + ", " + dur(diff) + " later.") + "</span>" +
      ' <span class="tr-hint">Change a job below or the departure hour to re-plan. A longer job pushes later drives into a different hour, which can reshuffle the order.</span>';
    $("#tr-verdict").innerHTML = v;
    var opts = function (cur) { return JOBS.map(function (j) { return '<option value="' + j.id + '"' + (j.id === cur ? " selected" : "") + ">" + esc(j.name) + " · " + j.min + " min</option>"; }).join(""); };
    $("#tr-list").innerHTML = '<li class="tr-it tr-it-start"><span class="tr-rk">S</span><span class="tr-nm">' + esc(c.start.name) + "<small><em>Leave " + clock(st.depart * 60) + "</em></small></span></li>" +
      b.rows.map(function (r, i) {
        return '<li class="tr-it' + (i === 0 ? " first" : "") + '"><span class="tr-rk">' + (i + 1) + '</span><span class="tr-nm">' + esc(r.stop.name) +
          "<small><em>Arrive " + clock(r.arrive) + "</em><em>Leave " + clock(r.depart) + "</em></small></span>" +
          '<span class="tr-tm"><b>' + Math.round(r.drive) + ' min</b><small>drive</small><b>' + r.job.min + " min</b><small>service</small></span>" +
          '<label class="tr-job"><span class="visually-hidden">Job at ' + esc(r.stop.name) + '</span><select data-stop="' + r.stop.id + '">' + opts(r.job.id) + "</select></label></li>";
      }).join("") +
      '<li class="tr-it tr-it-end"><span class="tr-rk">✓</span><span class="tr-nm">Day done<small><em>' + clock(st.depart * 60 + b.total) + '</em></small></span><span class="tr-tm"><b>' + dur(b.total) + "</b><small>total</small></span></li>";
    $$("#tr-list select").forEach(function (sel) {
      sel.addEventListener("change", function () { jobsBy[key][sel.getAttribute("data-stop")] = sel.value; renderTech(false); });
    });
  }
  function render(fit) { if (st.mode === "tech") renderTech(fit); else renderRoute(fit); }
  var techUsed = false;
  $$("[data-tr-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.mode = b.getAttribute("data-tr-mode");
      $$("[data-tr-mode]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      routeEl.classList.toggle("is-tech", st.mode === "tech");
      if (st.mode === "tech" && !techUsed && dep) { techUsed = true; st.depart = 8; dep.value = 8; $("#tr-depart-out").textContent = hr(8); }
      render(true);
      setTimeout(function () { map.invalidateSize(); }, 60);
    });
  });
  var jobsEl = $("#tr-jobs");
  if (jobsEl) jobsEl.innerHTML = '<span class="tr-badge">Example durations</span>' + JOBS.map(function (j) { return "<span>" + esc(j.name) + " <b>" + j.min + " min</b></span>"; }).join("");
  $$("[data-tr-rcity]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.rcity = b.getAttribute("data-tr-rcity"); st.sel = null;
      $$("[data-tr-rcity]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      render(true);
    });
  });
  $$("[data-tr-metric]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.metric = b.getAttribute("data-tr-metric"); st.sel = null;
      $$("[data-tr-metric]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderRoute(false);
    });
  });
  if (dep) dep.addEventListener("input", function () { st.depart = +dep.value; $("#tr-depart-out").textContent = hr(st.depart); render(false); });

  Promise.all([fetch("/assets/data/traffic.json").then(function (r) { return r.json(); }), fetch("/assets/data/routes.json").then(function (r) { return r.json(); })])
    .then(function (d) {
      T = d[0]; R = d[1];
      renderHeat();
      if (window.L && routeEl) { initMap(); renderRoute(true); }
    }).catch(function () { heatEl.innerHTML = '<p class="tr-noscript">Couldn\'t load the data.</p>'; });
})();
