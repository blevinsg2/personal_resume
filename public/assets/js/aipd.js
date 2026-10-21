/* AIPD dashboard demo. Data: /assets/data/aipd.json. All companies, contacts and values are fictional. */
(function () {
  "use strict";
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function kmoney(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k"; }
  function num(n) { return Math.round(n).toLocaleString("en-US"); }

  var PROD = {
    cmms: { n: "Maintenance management (CMMS/EAM)", s: "Maintenance mgmt", role: "Director of Facilities & Maintenance", base: 18000 },
    space: { n: "Space & workplace", s: "Space & workplace", role: "Head of Workplace", base: 15000 },
    lease: { n: "Lease administration", s: "Lease admin", role: "Lease Administration Manager", base: 12000 },
    edm: { n: "Engineering document management", s: "Engineering docs", role: "Engineering Document Control Manager", base: 20000 },
    capital: { n: "Real estate & capital planning", s: "Capital planning", role: "VP, Real Estate & Capital Planning", base: 24000 }
  };
  var PK = ["cmms", "space", "lease", "edm", "capital"];
  /* industry win history (example values, 0-35) */
  var AFF = {
    "Healthcare": { cmms: 35, space: 18, lease: 22, edm: 15, capital: 25 },
    "Manufacturing": { cmms: 35, space: 8, lease: 10, edm: 30, capital: 18 },
    "Higher education": { cmms: 28, space: 30, lease: 8, edm: 15, capital: 26 },
    "Public sector": { cmms: 30, space: 12, lease: 10, edm: 22, capital: 32 },
    "Corporate real estate": { cmms: 15, space: 32, lease: 35, edm: 8, capital: 22 },
    "Retail": { cmms: 24, space: 8, lease: 33, edm: 6, capital: 18 },
    "Energy & utilities": { cmms: 32, space: 6, lease: 12, edm: 34, capital: 20 }
  };
  var ADJ = {
    cmms: { capital: "They track asset condition in maintenance management already; that history is what a capital plan is built on.", edm: "Their technicians need current drawings at the asset, next to the work order." },
    space: { lease: "They manage space with us; leases are the other half of the same portfolio." },
    lease: { space: "Their leases are with us; utilization data shows which ones to renew or give back." },
    edm: { cmms: "Their drawings are with us; linking them to work orders saves technicians a trip." },
    capital: { cmms: "Capital plans stay current when they're fed by day-to-day maintenance data." }
  };
  function facPts(f) { return f >= 100 ? 25 : f >= 40 ? 20 : f >= 15 ? 14 : f >= 5 ? 8 : 3; }
  function empPts(e) { return e >= 10000 ? 15 : e >= 2500 ? 12 : e >= 1000 ? 9 : e >= 250 ? 6 : 3; }
  function band(e) { return e < 500 ? "$10–50M" : e < 2000 ? "$50–250M" : e < 8000 ? "$250M–1B" : "$1B+"; }
  function value(p, f) { return PROD[p].base * Math.min(6, 1 + f / 30); }
  function scoreFor(c, p, owned) {
    var parts = [["Industry win history (" + c.industry + ")", AFF[c.industry][p]], [num(c.facilities) + " facilities", facPts(c.facilities)], [num(c.employees) + " employees", empPts(c.employees)]];
    (c.signals || []).forEach(function (s, i) { if (c.sigp[i] === p) parts.push(["Signal: " + s, 15]); });
    if (owned) owned.forEach(function (o) { if (ADJ[o] && ADJ[o][p]) parts.push(["Pairs with " + PROD[o].s + " they own", 10]); });
    var t = parts.reduce(function (a, b) { return a + b[1]; }, 0);
    return { p: p, parts: parts, score: Math.min(100, t) };
  }
  function rank(c, owned) {
    return PK.filter(function (p) { return !owned || owned.indexOf(p) < 0; }).map(function (p) { return scoreFor(c, p, owned); }).sort(function (a, b) { return b.score - a.score; });
  }

  var D, st = { ae: "nyc", tab: "new", sel: null, ind: "all", size: "all", min: 50 }, map, layer, fitted = {};
  function terr() { return D.aes.filter(function (a) { return a.id === st.ae; })[0]; }
  function sizeOk(e) { return st.size === "all" || (st.size === "s" ? e < 1000 : st.size === "m" ? e >= 1000 && e <= 5000 : e > 5000); }
  function indOk(c) { return st.ind === "all" || c.industry === st.ind; }
  function model() {
    var t = terr();
    var cust = t.customers.filter(indOk).map(function (c) { var r = rank(c, c.owned); return { c: c, up: r[0], val: value(r[0].p, c.facilities) * 0.8 }; });
    var pros = t.prospects.filter(function (c) { return indOk(c) && sizeOk(c.employees); }).map(function (c) { var r = rank(c); return { c: c, best: r[0], next: r[1], val: value(r[0].p, c.facilities) }; })
      .filter(function (x) { return x.best.score >= st.min; }).sort(function (a, b) { return b.best.score - a.best.score; });
    return { t: t, cust: cust, ups: cust.slice().sort(function (a, b) { return b.up.score - a.up.score; }), pros: pros };
  }

  /* ------------------------------------------------ render */
  function renderTop(m) {
    $("#ai-scope").innerHTML = "<b>" + esc(m.t.city) + " territory.</b> You only see accounts assigned to " + esc(m.t.ae.split(" ")[0]) + ". Other AEs' customers and prospects are hidden.";
    var pipe = m.cust.reduce(function (a, x) { return a + x.val; }, 0) + m.pros.reduce(function (a, x) { return a + x.val * x.best.score / 100; }, 0);
    $("#ai-kpis").innerHTML =
      kpi("Existing accounts", m.cust.length, m.cust.reduce(function (a, x) { return a + x.c.owned.length; }, 0) + " products owned") +
      kpi("Upsell opportunities", m.cust.length, "one next product each") +
      kpi("Net-new prospects", m.pros.length, "fit score ≥ " + st.min + (st.ind !== "all" || st.size !== "all" ? " · filtered" : "")) +
      kpi("Estimated pipeline", kmoney(pipe), "illustrative, annual");
  }
  function kpi(l, v, s) { return '<div class="sf-kpi"><span>' + l + "</span><b>" + v + "</b><small>" + s + "</small></div>"; }
  function tier(s) { return s >= 75 ? "hi" : s >= 55 ? "mid" : "lo"; }
  function fitChip(s) { return '<span class="ai-fitc ' + tier(s) + '">' + s + "</span>"; }

  function renderList(m) {
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === st.tab ? "true" : "false"); });
    var h = "";
    if (st.tab === "cust") h = m.cust.map(function (x) {
      return item(x.c.id, x.c.name, x.c.industry + " · " + num(x.c.facilities) + " facilities", x.c.owned.map(function (p) { return '<span class="ai-own">' + PROD[p].s + "</span>"; }).join(""), "");
    }).join("");
    if (st.tab === "up") h = m.ups.map(function (x) {
      return item(x.c.id, x.c.name, "Next: <b>" + PROD[x.up.p].s + "</b> · ~" + kmoney(x.val) + "/yr", '<span class="ai-why">' + esc(upReason(x)) + "</span>", fitChip(x.up.score));
    }).join("");
    if (st.tab === "new") h = m.pros.map(function (x) {
      return item(x.c.id, x.c.name, x.c.industry + " · " + num(x.c.employees) + " employees · " + num(x.c.facilities) + " facilities", '<span class="ai-rec">' + PROD[x.best.p].s + "</span>", fitChip(x.best.score));
    }).join("");
    var n = st.tab === "new" ? m.pros.length : m.cust.length;
    $("#ai-items").innerHTML = n ? "<ul>" + h + "</ul>" : '<p class="ai-none">Nothing matches these filters. Lower the minimum fit score or widen the filters.</p>';
  }
  function item(id, name, sub, extra, right) {
    return '<li class="' + (id === st.sel ? "on" : "") + '"><button type="button" data-id="' + id + '"><span class="ai-in"><b>' + esc(name) + "</b><small>" + sub + "</small><span class=\"ai-ex\">" + extra + "</span></span>" + right + "</button></li>";
  }
  function upReason(x) {
    var o = x.c.owned.filter(function (p) { return ADJ[p] && ADJ[p][x.up.p]; })[0];
    return o ? ADJ[o][x.up.p] : "Strong win history for " + PROD[x.up.p].s.toLowerCase() + " in " + x.c.industry.toLowerCase() + ", and " + num(x.c.facilities) + " facilities to run it across.";
  }

  function renderMap(m, fit) {
    layer.clearLayers(); map.invalidateSize();
    var showCust = st.tab !== "new";
    m.cust.forEach(function (x) {
      var on = x.c.id === st.sel;
      var mk = L.marker([x.c.lat, x.c.lon], { icon: L.divIcon({ className: "ai-cm" + (showCust ? "" : " dim") + (on ? " on" : ""), html: "<span></span>", iconSize: [16, 16], iconAnchor: [8, 8] }), title: x.c.name, keyboard: false }).addTo(layer);
      mk.bindTooltip(esc(x.c.name) + " · customer", { direction: "top", offset: [0, -8], className: "kc-tip" });
      mk.on("click", function () { if (st.tab === "new") st.tab = "cust"; select(x.c.id); });
    });
    m.pros.forEach(function (x) {
      var on = x.c.id === st.sel;
      var mk = L.circleMarker([x.c.lat, x.c.lon], { radius: on ? 10 : 7, className: "ai-pm " + tier(x.best.score) + (showCust ? " dim" : "") + (on ? " on" : ""), weight: on ? 3 : 2 }).addTo(layer);
      mk.bindTooltip(esc(x.c.name) + " · fit " + x.best.score, { direction: "top", offset: [0, -6], className: "kc-tip" });
      mk.on("click", function () { st.tab = "new"; select(x.c.id); }); if (mk.getElement()) mk.getElement().setAttribute("tabindex", "-1");
    });
    if (fit || !fitted[st.ae]) {
      var t = terr(), pts = t.customers.concat(t.prospects).map(function (c) { return [c.lat, c.lon]; });
      map.fitBounds(pts, { padding: [22, 22] }); fitted[st.ae] = true;
    }
  }

  function renderDetail(m) {
    var el = $("#ai-detail"), x;
    if (st.tab === "new") x = m.pros.filter(function (p) { return p.c.id === st.sel; })[0];
    else x = m.cust.filter(function (p) { return p.c.id === st.sel; })[0];
    if (!x) { el.innerHTML = '<p class="ai-none">Tap a company in the list or on the map.</p>'; return; }
    var c = x.c, s = st.tab === "new" ? x.best : x.up, isP = st.tab === "new";
    var firm = '<dl class="ai-firm"><div><dt>Industry</dt><dd>' + esc(c.industry) + "</dd></div><div><dt>Employees</dt><dd>" + num(c.employees) + "</dd></div><div><dt>Revenue band</dt><dd>" + band(c.employees) + "</dd></div><div><dt>Facilities</dt><dd>" + num(c.facilities) + "</dd></div></dl>";
    var parts = '<ul class="ai-parts">' + s.parts.map(function (p) { return "<li><span>" + esc(p[0]) + "</span><b>+" + p[1] + "</b></li>"; }).join("") + '<li class="tot"><span>Fit score' + (s.parts.reduce(function (a, b) { return a + b[1]; }, 0) > 100 ? " (capped)" : "") + "</span><b>" + s.score + "</b></li></ul>";
    var why = isP ? whyText(x) : upReason(x);
    el.innerHTML =
      '<div class="ai-dh"><div><span class="ai-kind">' + (isP ? "Net-new prospect" : "Existing customer") + "</span><h3>" + esc(c.name) + "</h3></div>" + fitChip(s.score) + "</div>" + firm +
      (isP ? "" : '<p class="ai-owned">Owns: ' + c.owned.map(function (p) { return '<span class="ai-own">' + PROD[p].s + "</span>"; }).join("") + "</p>") +
      '<div class="ai-recbox"><span>' + (isP ? "Recommended product" : "Upsell recommendation") + "</span><b>" + PROD[s.p].n + "</b><p>" + esc(why) + "</p></div>" +
      '<div class="ai-two"><div><p class="ai-lbl">Why the score</p>' + parts + (isP && x.next ? '<p class="ai-runner">Runner-up: ' + PROD[x.next.p].s + " (" + x.next.score + ")</p>" : "") + "</div>" +
      '<div><p class="ai-lbl">' + (isP ? "Suggested contact" : "Account contact") + '</p><div class="ai-contact"><span class="ai-av" aria-hidden="true">' + c.contact.split(" ").map(function (w) { return w[0]; }).join("") + "</span><div><b>" + esc(c.contact) + "</b><small>" + (isP ? PROD[s.p].role : "Facilities lead · existing relationship") + "</small></div></div>" +
      (isP ? '<p class="ai-lbl">Third-party signals</p><ul class="ai-sigs">' + c.signals.map(function (sg) { return "<li>" + esc(sg) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="ai-val">Example value: ~' + kmoney(x.val) + " a year</p></div></div>";
  }
  function whyText(x) {
    var c = x.c, p = x.best.p, sig = c.signals.filter(function (s, i) { return c.sigp[i] === p; });
    return PROD[p].n + " has the strongest win history in " + c.industry.toLowerCase() + " (" + AFF[c.industry][p] + " of 35), and " + num(c.facilities) + " facilities give it plenty to manage" + (sig.length ? ". The data also shows: " + sig.join("; ").toLowerCase() + "." : ".");
  }

  function defaultSel(m) {
    var list = st.tab === "new" ? m.pros : st.tab === "up" ? m.ups : m.cust;
    if (list.some(function (x) { return x.c.id === st.sel; })) return st.sel;
    return list.length ? list[0].c.id : null;
  }
  function render(fit) { var m = model(); st.sel = defaultSel(m); renderTop(m); renderList(m); renderMap(m, fit); renderDetail(m); }
  function select(id) {
    st.sel = id; render(false);
    if (window.matchMedia("(max-width:860px)").matches) { var d = $("#ai-detail"); if (d.getBoundingClientRect().top > innerHeight - 80 || d.getBoundingClientRect().top < 0) d.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  fetch("/assets/data/aipd.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    $("#ai-ae").innerHTML = d.aes.map(function (a) { return '<option value="' + a.id + '">' + esc(a.ae) + " · " + esc(a.city) + "</option>"; }).join("");
    $("#ai-ind").innerHTML = '<option value="all">All industries</option>' + Object.keys(AFF).map(function (i) { return "<option>" + i + "</option>"; }).join("");
    map = L.map("ai-map", { zoomControl: true, scrollWheelZoom: false, attributionControl: true, tap: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, className: "tr-tiles", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    $("#ai-ae").addEventListener("change", function (e) { st.ae = e.target.value; st.sel = null; render(true); });
    $("#ai-ind").addEventListener("change", function (e) { st.ind = e.target.value; render(false); });
    $("#ai-size").addEventListener("change", function (e) { st.size = e.target.value; render(false); });
    $("#ai-min").addEventListener("input", function (e) { st.min = +e.target.value; $("#ai-min-out").textContent = st.min; render(false); });
    $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.getAttribute("data-tab"); st.sel = null; render(false); }); });
    $("#ai-items").addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (b) select(b.getAttribute("data-id")); });
    window.addEventListener("resize", function () { map.invalidateSize(); });
    render(true);
  }).catch(function () { $("#ai-detail").innerHTML = '<p class="ai-none">The dashboard data didn\'t load. Please refresh.</p>'; });
})();
