/* Sales performance case study: one EXAMPLE store with fictional specialists. All data and assumptions are illustrative. */
(function () {
  "use strict";
  var root = document.getElementById("sp-cascade");
  if (!root) return;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function kmoney(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + Math.round(n / 1000) + "k" : money(n); }

  /* ------------------------------------------------ example data */
  var DEPTS = [
    { id: "app", name: "Appliances", mix: 22 }, { id: "flr", name: "Flooring", mix: 11 }, { id: "kit", name: "Kitchens", mix: 20 },
    { id: "mil", name: "Millwork", mix: 10 }, { id: "tool", name: "Tools", mix: 19 }, { id: "pnt", name: "Paint", mix: 18 }
  ];
  var M = ["sales", "margin", "attach", "service", "credit", "leads", "share"];
  /* fictional specialists: profile = recent level vs goal per metric (1.00 = at goal) */
  var PEOPLE = [
    { n: "Ana", d: "app", h: 160, p: [1.08, 0.97, 1.12, 1.05, 0.70, 1.00, 1.05] },
    { n: "Ben", d: "app", h: 160, p: [0.92, 1.02, 0.85, 0.95, 1.10, 1.20, 0.90] },
    { n: "Cara", d: "flr", h: 160, p: [1.02, 1.05, 0.95, 1.25, 0.90, 0.75, 1.00] },
    { n: "Dev", d: "kit", h: 160, p: [1.10, 1.03, 1.00, 0.80, 1.05, 1.10, 1.08] },
    { n: "Eli", d: "kit", h: 140, p: [0.88, 0.95, 1.02, 1.00, 0.95, 0.90, 0.85] },
    { n: "Faye", d: "mil", h: 150, p: [1.00, 0.90, 1.05, 1.00, 1.00, 1.05, 1.00] },
    { n: "Gus", d: "tool", h: 130, p: [1.04, 1.00, 0.78, 1.00, 1.02, 0.95, 0.95] },
    { n: "Hana", d: "pnt", h: 160, p: [0.97, 1.06, 1.10, 0.92, 0.88, 1.00, 1.10] },
    { n: "Ivy", d: "tool", h: 150, p: [1.03, 0.98, 1.06, 0.88, 1.08, 1.02, 1.00] },
    { n: "Jo", d: "pnt", h: 140, p: [0.95, 1.04, 0.92, 1.10, 1.00, 0.86, 0.95] }
  ];
  var MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  var SEASON = [0.86, 0.80, 0.74, 0.80, 0.96, 1.20, 1.26, 1.16, 1.06, 1.02, 0.96, 0.92];   /* example, not real seasonality */
  var MIX_T = [["Core product", 70], ["Accessories", 12], ["Install & services", 10], ["Protection plans", 8]];
  var FIELDS = [
    { k: "base", label: "Store sales last year (monthly)", unit: "$", min: 1000000, max: 5000000, step: 50000, v: 2300000 },
    { k: "growth", label: "Growth vs last year", unit: "%", min: -10, max: 20, step: 0.5, v: 4 },
    { k: "share", label: "Goal: share of dept sales via specialists", unit: "%", min: 10, max: 95, step: 1, v: 60 },
    { k: "margin", label: "Goal: margin", unit: "%", min: 5, max: 60, step: 0.5, v: 32 },
    { k: "attach", label: "Goal: attachment rate", unit: "%", min: 1, max: 80, step: 1, v: 25 },
    { k: "service", label: "Goal: service attach", unit: "%", min: 1, max: 80, step: 1, v: 18 },
    { k: "credit", label: "Goal: credit attach", unit: "%", min: 1, max: 50, step: 0.5, v: 8 },
    { k: "leads", label: "Goal: leads per month", unit: "", min: 1, max: 200, step: 1, v: 30 }
  ];
  var P = {}; FIELDS.forEach(function (f) { P[f.k] = f.v; });
  var st = { who: 0 };

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /* fixed 12-month ratio-to-goal history per person and metric (trend + noise ending near the profile) */
  var HIST = PEOPLE.map(function (p, pi) {
    var r = rng(1000 + pi * 97);
    return M.map(function (m, mi) {
      var tr = (r() - 0.5) * 0.14, out = [];
      for (var i = 0; i < 12; i++) out.push(Math.max(0.3, p.p[mi] + tr * (i - 11) / 11 + (r() - 0.5) * 0.07));
      return out;
    });
  });

  /* ------------------------------------------------ model */
  function forecast() { return P.base * (1 + P.growth / 100); }
  function deptF(d) { return forecast() * d.mix / 100; }
  function hoursIn(did) { return PEOPLE.filter(function (p) { return p.d === did; }).reduce(function (a, p) { return a + p.h; }, 0); }
  function goalOf(p) { var d = DEPTS.filter(function (x) { return x.id === p.d; })[0]; return deptF(d) * P.share / 100 * p.h / hoursIn(p.d); }
  function metricGoal(m, p, i) {   /* monthly goal for month i (0..11) */
    if (m === "sales") return goalOf(p) * SEASON[i];
    if (m === "leads") return P.leads;
    return P[m];
  }
  var META = {
    sales: { t: "Sales vs goal", fmt: function (v) { return kmoney(v); } },
    margin: { t: "Margin", fmt: function (v) { return v.toFixed(1) + "%"; } },
    attach: { t: "Attachment rate", fmt: function (v) { return v.toFixed(1) + "%"; } },
    service: { t: "Service attach", fmt: function (v) { return v.toFixed(1) + "%"; } },
    credit: { t: "Credit attach", fmt: function (v) { return v.toFixed(1) + "%"; } },
    leads: { t: "Leads generated", fmt: function (v) { return Math.round(v) + ""; } },
    share: { t: "Dept sales via specialists", fmt: function (v) { return v.toFixed(0) + "%"; } }
  };
  function series(pi, m) { var p = PEOPLE[pi], mi = M.indexOf(m); return HIST[pi][mi].map(function (r, i) { var g = m === "share" ? P.share : metricGoal(m, p, i); return { v: Math.min(m === "share" ? 100 : 1e12, g * r), g: g }; }); }
  function recent(pi, m) { var s = series(pi, m).slice(-3), v = 0, g = 0; s.forEach(function (x) { v += x.v; g += x.g; }); return { v: v / 3, g: g / 3, r: v / g }; }
  var COACH = {
    sales: "Shadow a top closer for a shift; practice asking for the sale on every quote.",
    margin: "Lead with the better and best options; explain the value before the price.",
    attach: "Build a quick add-on checklist for the top sellers in the department.",
    service: "Bring installation into the first conversation, not the last.",
    credit: "Mention the card's financing on big-ticket quotes; pair with a credit champion.",
    leads: "Book follow-ups before customers leave; use slower hours for callbacks.",
    share: "Ask the department team to hand off project customers; be visible on the floor."
  };

  /* ------------------------------------------------ 1. cascade */
  function renderCascade() {
    $("#sp-base").value = P.base; $("#sp-growth").value = P.growth;
    $("#sp-base-out").textContent = kmoney(P.base); $("#sp-growth-out").textContent = (P.growth > 0 ? "+" : "") + P.growth + "%";
    $("#sp-forecast").textContent = money(forecast());
    var maxD = Math.max.apply(null, DEPTS.map(deptF));
    $("#sp-depts").innerHTML = DEPTS.map(function (d) {
      var ppl = PEOPLE.filter(function (p) { return p.d === d.id; });
      return '<div class="sp-dept"><div class="sp-dh"><b>' + d.name + "</b><span>" + d.mix + "% of store</span></div>" +
        '<div class="sp-dbar"><i style="width:' + (deptF(d) / maxD * 100).toFixed(1) + '%"></i><em>' + kmoney(deptF(d)) + "</em></div>" +
        '<div class="sp-goals">' + ppl.map(function (p) { return '<span><b>' + p.n + "</b> " + kmoney(goalOf(p)) + "<small>" + p.h + " hrs</small></span>"; }).join("") +
        '<span class="sp-rest"><b>Team</b> ' + kmoney(deptF(d) * (1 - P.share / 100)) + "<small>non-specialist</small></span></div></div>";
    }).join("");
  }

  /* ------------------------------------------------ 2. scorecard */
  function spark(s, kind) {
    var W = 140, H = 40, vals = s.map(function (x) { return x.v; }).concat(s.map(function (x) { return x.g; })), max = Math.max.apply(null, vals) * 1.08, min = kind === "bar" ? 0 : Math.min.apply(null, vals) * 0.9;
    function y(v) { return H - 2 - (v - min) / (max - min || 1) * (H - 6); }
    var cw = W / 12, out = "";
    if (kind === "bar") {
      s.forEach(function (x, i) { out += '<rect class="' + (x.v >= x.g ? "ok" : "gap") + '" x="' + (i * cw + 1.5) + '" y="' + y(x.v) + '" width="' + (cw - 3) + '" height="' + (H - 2 - y(x.v)) + '" rx="1.5"/>'; });
      out += '<polyline class="goal" points="' + s.map(function (x, i) { return (i * cw + cw / 2).toFixed(1) + "," + y(x.g).toFixed(1); }).join(" ") + '" vector-effect="non-scaling-stroke"/>';
    } else {
      out += '<polyline class="goal" points="' + s.map(function (x, i) { return (i * cw + cw / 2).toFixed(1) + "," + y(x.g).toFixed(1); }).join(" ") + '" vector-effect="non-scaling-stroke"/>';
      out += '<polyline class="val" points="' + s.map(function (x, i) { return (i * cw + cw / 2).toFixed(1) + "," + y(x.v).toFixed(1); }).join(" ") + '" vector-effect="non-scaling-stroke"/>';
      var l = s[11]; out += '<circle class="' + (l.v >= l.g ? "ok" : "gap") + '" cx="' + (11 * cw + cw / 2) + '" cy="' + y(l.v) + '" r="3" vector-effect="non-scaling-stroke"/>';
    }
    return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' + out + "</svg>";
  }
  function mixOf(pi) {
    var r = function (m) { return recent(pi, m).r; };
    var acc = 12 * r("margin"), svc = 10 * r("service"), pro = 8 * r("attach");
    return [["Core product", 100 - acc - svc - pro], ["Accessories", acc], ["Install & services", svc], ["Protection plans", pro]];
  }
  function mixBar(mix) { return '<div class="sp-mix">' + mix.map(function (x, i) { return '<i class="c' + i + '" style="width:' + x[1].toFixed(1) + '%" title="' + x[0] + " " + x[1].toFixed(0) + '%"></i>'; }).join("") + "</div>"; }
  function renderPeople() {
    $("#sp-people").innerHTML = PEOPLE.map(function (p, i) {
      var d = DEPTS.filter(function (x) { return x.id === p.d; })[0];
      return '<button type="button" role="tab" aria-selected="' + (i === st.who) + '" data-who="' + i + '"><b>' + p.n + "</b><small>" + d.name + "</small></button>";
    }).join("");
    $$("#sp-people button").forEach(function (b) { b.addEventListener("click", function () { st.who = +b.getAttribute("data-who"); renderPeople(); renderScore(); renderOpps(); }); });
  }
  function renderScore() {
    var pi = st.who, p = PEOPLE[pi];
    var cards = M.map(function (m) {
      var s = series(pi, m), last = s[11], rc = recent(pi, m), ok = rc.r >= 0.995;
      return '<div class="sp-card ' + (ok ? "ok" : "gap") + '"><div class="sp-ch"><span>' + META[m].t + "</span><em>" + (ok ? "At or above goal" : "Opportunity") + "</em></div>" +
        "<b>" + META[m].fmt(last.v) + '</b><small>Oct goal ' + META[m].fmt(last.g) + " · 3-mo " + Math.round(rc.r * 100) + "% of goal</small>" + spark(s, m === "sales" ? "bar" : "line") +
        '<div class="sp-mo"><span>' + MONTHS[0] + "</span><span>" + MONTHS[11] + "</span></div></div>";
    }).join("");
    var mix = mixOf(pi);
    cards += '<div class="sp-card sp-mixcard"><div class="sp-ch"><span>Basket mix · last 3 months</span></div>' +
      '<div class="sp-mixrow"><small>' + esc(p.n) + "</small>" + mixBar(mix) + '</div><div class="sp-mixrow"><small>Target</small>' + mixBar(MIX_T) + "</div>" +
      '<div class="sp-leg">' + mix.map(function (x, i) { return '<span><i class="c' + i + '"></i>' + x[0] + " " + x[1].toFixed(0) + "%</span>"; }).join("") + "</div></div>";
    $("#sp-cards").innerHTML = cards;
  }

  /* ------------------------------------------------ 3. opportunity list */
  function renderOpps() {
    var rows = PEOPLE.map(function (p, pi) {
      var worst = null, best = null;
      M.forEach(function (m) { var r = recent(pi, m); if (!worst || r.r < worst.r) worst = { m: m, r: r.r, v: r.v, g: r.g }; if (!best || r.r > best.r) best = { m: m, r: r.r }; });
      return { p: p, pi: pi, w: worst, b: best };
    }).sort(function (a, b) { return a.w.r - b.w.r; });
    $("#sp-opp").innerHTML = rows.map(function (x, i) {
      var d = DEPTS.filter(function (z) { return z.id === x.p.d; })[0], has = x.w.r < 0.995;
      return '<li><button type="button" data-who="' + x.pi + '"' + (x.pi === st.who ? ' class="on"' : "") + '><span class="tr-rk">' + (i + 1) + '</span><span class="sp-on"><b>' + x.p.n + " <small>" + d.name + "</small></b>" +
        (has ? "<span>Opportunity: <strong>" + META[x.w.m].t.toLowerCase() + "</strong>, " + META[x.w.m].fmt(x.w.v) + " vs " + META[x.w.m].fmt(x.w.g) + " goal</span><em>Coaching focus: " + COACH[x.w.m] + "</em>"
          : "<span>At or above goal on every metric.</span><em>Ask them to share what's working with the team.</em>") +
        '<span class="sp-str">Strength: ' + META[x.b.m].t.toLowerCase() + ", " + Math.round(x.b.r * 100) + "% of goal</span></span>" +
        '<span class="sp-gap">' + (has ? Math.round((1 - x.w.r) * 100) + "%<small>gap</small>" : "✓") + "</span></button></li>";
    }).join("");
    $$("#sp-opp button").forEach(function (b) {
      b.addEventListener("click", function () { st.who = +b.getAttribute("data-who"); renderPeople(); renderScore(); renderOpps(); var sc = document.getElementById("sp-score"); if (sc && sc.scrollIntoView) sc.scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
  }

  /* ------------------------------------------------ assumptions */
  function renderFields() {
    $("#sp-fields").innerHTML = FIELDS.map(function (f) {
      return '<label class="sf-field"><span>' + f.label + '</span><span class="sf-in">' + (f.unit === "$" ? "<i>$</i>" : "") +
        '<input type="number" inputmode="decimal" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + P[f.k] + '" data-k="' + f.k + '"' + (f.k === "base" ? ' style="width:96px"' : "") + ">" + (f.unit === "%" ? "<i>%</i>" : "") + "</span></label>";
    }).join("");
    $$("#sp-fields input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var f = FIELDS.filter(function (x) { return x.k === inp.getAttribute("data-k"); })[0], v = parseFloat(inp.value);
        if (!isFinite(v)) return; P[f.k] = Math.max(f.min, Math.min(f.max, v)); all(false);
      });
    });
  }
  function all(fields) { if (fields) renderFields(); renderCascade(); renderScore(); renderOpps(); }
  function syncField(k) { var i = $('#sp-fields input[data-k="' + k + '"]'); if (i) i.value = P[k]; }
  $("#sp-base").addEventListener("input", function (e) { P.base = +e.target.value; syncField("base"); all(false); });
  $("#sp-growth").addEventListener("input", function (e) { P.growth = +e.target.value; syncField("growth"); all(false); });
  $("[data-sp-reset]").addEventListener("click", function () { FIELDS.forEach(function (f) { P[f.k] = f.v; }); all(true); });
  renderPeople(); all(true);
})();
