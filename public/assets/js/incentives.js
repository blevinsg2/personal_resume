/* Incentives case study (Part 3): the same EXAMPLE store as Part 2. All data and assumptions are fictional and editable. */
(function () {
  "use strict";
  var root = document.getElementById("ic-fund");
  if (!root) return;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function kmoney(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + Math.round(n / 1000) + "k" : money(n); }

  var DEPTS = [
    { id: "app", name: "Appliances", mix: 22 }, { id: "flr", name: "Flooring", mix: 11 }, { id: "kit", name: "Kitchens", mix: 20 },
    { id: "mil", name: "Millwork", mix: 10 }, { id: "tool", name: "Tools", mix: 19 }, { id: "pnt", name: "Paint", mix: 18 }
  ];
  /* fictional specialists (same as Part 2). r = recent level vs goal: sales, margin, attach, service, credit, leads */
  var PEOPLE = [
    { n: "Ana", d: "app", h: 160, r: [1.08, 0.97, 1.12, 1.05, 0.70, 1.00] },
    { n: "Ben", d: "app", h: 160, r: [0.92, 1.02, 0.85, 0.95, 1.10, 1.20] },
    { n: "Cara", d: "flr", h: 160, r: [1.02, 1.05, 0.95, 1.25, 0.90, 0.75] },
    { n: "Dev", d: "kit", h: 160, r: [1.10, 1.03, 1.00, 0.80, 1.05, 1.10] },
    { n: "Eli", d: "kit", h: 140, r: [0.88, 0.95, 1.02, 1.00, 0.95, 0.90] },
    { n: "Faye", d: "mil", h: 150, r: [1.00, 0.90, 1.05, 1.00, 1.00, 1.05] },
    { n: "Gus", d: "tool", h: 130, r: [1.04, 1.00, 0.78, 1.00, 1.02, 0.95] },
    { n: "Hana", d: "pnt", h: 160, r: [0.97, 1.06, 1.10, 0.92, 0.88, 1.00] },
    { n: "Ivy", d: "tool", h: 150, r: [1.03, 0.98, 1.06, 0.88, 1.08, 1.02] },
    { n: "Jo", d: "pnt", h: 140, r: [0.95, 1.04, 0.92, 1.10, 1.00, 0.86] }
  ];
  var LEV = [
    { k: "sales", t: "Sales" }, { k: "margin", t: "Margin" }, { k: "attach", t: "Protection plans" },
    { k: "service", t: "Service attach" }, { k: "credit", t: "Credit attach" }, { k: "leads", t: "Leads" }
  ];
  var PRESETS = {
    balanced: { sales: 1, margin: 1, attach: 1, service: 1, credit: 1, leads: 1 },
    credit: { sales: 1, margin: 1, attach: 1, service: 1, credit: 2.5, leads: 1 },
    protect: { sales: 1, margin: 1, attach: 2.5, service: 1.5, credit: 1, leads: 1 },
    margin: { sales: 0.5, margin: 2.5, attach: 1.5, service: 1, credit: 1, leads: 1 }
  };
  var FIELDS = [
    { k: "base", label: "Store sales last year (monthly)", unit: "$", min: 1000000, max: 5000000, step: 50000, v: 2300000, w: 96 },
    { k: "growth", label: "Growth vs last year", unit: "%", min: -10, max: 20, step: 0.5, v: 4 },
    { k: "margin", label: "Gross margin", unit: "%", min: 5, max: 60, step: 0.5, v: 32 },
    { k: "pool", label: "Pool, % of dept gross profit", unit: "%", min: 0, max: 5, step: 0.05, v: 1.25 },
    { k: "t1", label: "Tier 1 threshold", unit: "%", min: 80, max: 100, step: 1, v: 95 },
    { k: "m1", label: "Tier 1 payout", unit: "%", min: 0, max: 200, step: 5, v: 50 },
    { k: "t2", label: "Tier 2 threshold", unit: "%", min: 90, max: 110, step: 1, v: 100 },
    { k: "m2", label: "Tier 2 payout", unit: "%", min: 0, max: 200, step: 5, v: 100 },
    { k: "t3", label: "Tier 3 threshold", unit: "%", min: 100, max: 120, step: 1, v: 105 },
    { k: "m3", label: "Tier 3 payout", unit: "%", min: 0, max: 300, step: 5, v: 115 },
    { k: "kick", label: "Lever kicker at goal, per metric / month", unit: "$", min: 0, max: 200, step: 5, v: 20 }
  ];
  var P = {}; FIELDS.forEach(function (f) { P[f.k] = f.v; });
  var st = { design: "cliff", basis: "hours", att: {}, dept: "app", preset: "balanced", w: {} };
  /* illustrative season presets (not real figures). "near" is the default: store just under forecast */
  var MONTHS = {
    slow: { app: 93, flr: 90, kit: 92, mil: 94, tool: 91, pnt: 89 },
    near: { app: 101, flr: 94, kit: 96, mil: 95, tool: 99, pnt: 98 },
    goal: { app: 100, flr: 100, kit: 100, mil: 100, tool: 100, pnt: 100 },
    peak: { app: 106, flr: 103, kit: 105, mil: 104, tool: 108, pnt: 110 }
  };
  function setMonth(m) { DEPTS.forEach(function (d) { st.att[d.id] = MONTHS[m][d.id]; }); }
  function monthNow() {
    for (var m in MONTHS) { if (DEPTS.every(function (d) { return st.att[d.id] === MONTHS[m][d.id]; })) return m; }
    return "";
  }
  function resetState() { setMonth("near"); st.dept = "kit"; st.w = Object.assign({}, PRESETS.balanced); st.preset = "balanced"; }
  resetState();

  /* ------------------------------------------------ model */
  function forecast() { return P.base * (1 + P.growth / 100); }
  function deptF(d) { return forecast() * d.mix / 100; }
  function storeAtt() { var a = 0; DEPTS.forEach(function (d) { a += st.att[d.id] * d.mix / 100; }); return a; }
  function gate(design) { return design === "cliff" ? 100 : P.t1; }
  function mult(design, att) {
    if (design === "cliff") return att >= 100 ? 1 : 0;
    return att >= P.t3 ? P.m3 / 100 : att >= P.t2 ? P.m2 / 100 : att >= P.t1 ? P.m1 / 100 : 0;
  }
  function poolFor(design, d, att, storeOn) { return storeOn ? deptF(d) * att / 100 * P.margin / 100 * P.pool / 100 * mult(design, att) : 0; }
  function pools(design) {
    var sa = storeAtt(), on = sa >= gate(design) - 0.05, out = {}, tot = 0;
    DEPTS.forEach(function (d) { var v = poolFor(design, d, st.att[d.id], on); out[d.id] = v; tot += v; });
    return { sa: sa, on: on, by: out, total: tot };
  }
  function shares(pl) {   /* payout per person from the department pools */
    var out = PEOPLE.map(function () { return 0; });
    DEPTS.forEach(function (d) {
      var idx = [], ws = 0;
      PEOPLE.forEach(function (p, i) { if (p.d === d.id) { var w = st.basis === "hours" ? p.h : p.h * p.r[0]; idx.push([i, w]); ws += w; } });
      idx.forEach(function (x) { out[x[0]] = ws ? pl.by[d.id] * x[1] / ws : 0; });
    });
    return out;
  }
  function factor(r) { return Math.max(0, Math.min(1.5, 1 + (r - 1) * 5)); }
  function kickers(p, w) { return LEV.map(function (m, i) { return P.kick * w[m.k] * factor(p.r[i]); }); }

  /* ------------------------------------------------ 1. fund the pool */
  function renderSliders() {
    $("#ic-dsl").innerHTML = DEPTS.map(function (d) {
      return '<label class="sp-range sp-mini"><span>' + d.name + '</span><input type="range" min="80" max="120" step="1" value="' + st.att[d.id] + '" data-d="' + d.id + '"><output>' + st.att[d.id] + "%</output></label>";
    }).join("");
    $$("#ic-dsl input").forEach(function (inp) {
      inp.addEventListener("input", function () { st.att[inp.getAttribute("data-d")] = +inp.value; inp.nextElementSibling.textContent = inp.value + "%"; renderAll(); });
    });
  }
  function tierLabel(att) {
    if (st.design === "cliff") return att >= 100 ? "100% payout" : "below goal";
    var m = mult("tier", att); return m ? Math.round(m * 100) + "% tier" : "below first tier";
  }
  function renderFund(pl, sh) {
    $("#ic-all").value = Math.round(pl.sa); $("#ic-all-out").textContent = pl.sa.toFixed(1) + "%";
    var g = gate(st.design);
    $("#ic-top").className = "sp-ptop " + (pl.on ? "on" : "off");
    $("#ic-top").innerHTML = "<span>" + (pl.on ? "Store at " + pl.sa.toFixed(1) + "%: departments at their threshold fund this month's pool" : "Store at " + pl.sa.toFixed(1) + "%: no pool until the store reaches " + g + "%") + "</span><b>" + money(pl.total) + '<small class="mo">/mo</small></b>';
    $("#ic-rows").innerHTML = DEPTS.map(function (d) {
      var att = st.att[d.id], v = pl.by[d.id], on = v > 0;
      return '<div class="sp-prow ' + (on ? "on" : "off") + '"><div><b>' + d.name + "</b><small>" + att + "% · " + (pl.on ? tierLabel(att) : "waiting on store") + '</small></div><div class="sp-pay">' +
        PEOPLE.map(function (p, i) { return p.d === d.id ? "<span>" + p.n + " <b>" + money(sh[i]) + '<small class="mo">/mo</small></b></span>' : ""; }).join("") + "</div><strong>" + money(v) + '<small class="mo">/mo</small></strong></div>';
    }).join("") + kickNote();
    $$("[data-ic-design]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-ic-design") === st.design ? "true" : "false"); });
    $$("[data-ic-basis]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-ic-basis") === st.basis ? "true" : "false"); });
    var mn = monthNow();
    $$("[data-ic-month]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-ic-month") === mn ? "true" : "false"); });
  }

  function kickNote() {
    if (!pools(st.design).on) return '<p class="ic-note">No payout this month: the store is below ' + gate(st.design) + '%. Push the sliders up, or pick <b>Spring peak</b>, to see what a payout looks like.</p>';
    var ks = PEOPLE.map(function (p) { return kickers(p, st.w).reduce(function (x, y) { return x + y; }, 0); });
    var lo = Math.min.apply(null, ks), hi = Math.max.apply(null, ks);
    return '<p class="ic-note">Amounts above are each specialist\'s monthly <b>pool share</b>. Leadership-lever kickers (step 4) add ' + money(lo) + "–" + money(hi) + "/mo on top at the current weights.</p>";
  }

  /* ------------------------------------------------ 2. what does it take */
  function renderNeed(pl) {
    var g = gate(st.design), html = "";
    if (!pl.on) {
      var storeNeed = forecast() * (g - pl.sa) / 100;
      html += '<div class="ic-store-need"><span>Store first</span><b>' + money(storeNeed) + "</b><small>more store sales to reach " + g + "% and open the pool</small></div>";
    }
    html += '<ul class="ic-need">' + DEPTS.map(function (d) {
      var att = st.att[d.id], F = deptF(d), now = F * att / 100, n = PEOPLE.filter(function (p) { return p.d === d.id; }).length, thr = null;
      var steps = st.design === "cliff" ? [100] : [P.t1, P.t2, P.t3];
      for (var i = 0; i < steps.length; i++) if (att < steps[i]) { thr = steps[i]; break; }
      if (thr == null) return '<li class="done"><b>' + d.name + "</b><span>" + (!pl.on ? "At goal ✓ · waiting on the store" : st.design === "cliff" ? "Pool unlocked ✓" : "Top tier unlocked ✓") + "</span><em>" + att + "% of " + kmoney(F) + (st.design === "cliff" ? " · every extra sale still adds to the pool" : "") + "</em></li>";
      var need = F * thr / 100 - now, gain = poolFor(st.design, d, thr, true) - poolFor(st.design, d, att, true);
      var first = st.design === "cliff" || thr === P.t1;
      return "<li><b>" + d.name + "</b><span>" + money(need) + " more to reach " + thr + "%" + "</span><em>" + (first ? "Unlocks" : "Adds") + " about " + money(gain) + " to the pool" + (pl.on ? "" : " once the store gets there") + " · ≈ " + money(need / n) + " more sales per specialist</em></li>";
    }).join("") + "</ul>";
    $("#ic-need").innerHTML = html;
  }

  /* ------------------------------------------------ 3. design tradeoffs (payout curve) */
  function renderCurve() {
    var d = DEPTS.filter(function (x) { return x.id === st.dept; })[0], W = 520, H = 220, L = 52, R = 12, T = 12, B = 30;
    var xs = []; for (var a = 80; a <= 120; a += 0.5) xs.push(a);
    var cl = xs.map(function (a) { return poolFor("cliff", d, a, true); }), ti = xs.map(function (a) { return poolFor("tier", d, a, true); });
    var max = Math.max.apply(null, cl.concat(ti)) * 1.1 || 1;
    function X(a) { return L + (a - 80) / 40 * (W - L - R); }
    function Y(v) { return T + (1 - v / max) * (H - T - B); }
    function path(arr) { var s = ""; xs.forEach(function (a, i) { var y = Y(arr[i]).toFixed(1); s += (i ? (arr[i] !== arr[i - 1] ? "L" + X(a).toFixed(1) + " " + Y(arr[i - 1]).toFixed(1) + " " : "") + "L" : "M") + X(a).toFixed(1) + " " + y + " "; }); return s; }
    var out = "";
    [0, 0.5, 1].forEach(function (f) { var v = max / 1.1 * f; out += '<line class="g" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + kmoney(v) + "</text>"; });
    [80, 90, 100, 110, 120].forEach(function (a) { out += '<text class="ax" x="' + X(a) + '" y="' + (H - 10) + '" text-anchor="middle">' + a + "%</text>"; });
    out += '<line class="goal" x1="' + X(100) + '" x2="' + X(100) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    out += '<path class="tier" d="' + path(ti) + '"/><path class="cliff" d="' + path(cl) + '"/>';
    var att = st.att[d.id], vc = poolFor("cliff", d, att, true), vt = poolFor("tier", d, att, true);
    out += '<line class="nowl" x1="' + X(att) + '" x2="' + X(att) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    out += '<circle class="cliffd" cx="' + X(att) + '" cy="' + Y(vc) + '" r="4.5"/><circle class="tierd" cx="' + X(att) + '" cy="' + Y(vt) + '" r="4.5"/>';
    $("#ic-curve").innerHTML = out;
    var jump = poolFor("cliff", d, 100, true);
    $("#ic-why").innerHTML = "<p>At <b>" + att + "%</b>, " + d.name + " funds <b>" + money(vc) + "</b> with the cliff and <b>" + money(vt) + "</b> with tiers (store assumed at threshold).</p>" +
      "<ul><li><b>Cliff:</b> one jump of " + money(jump) + " at exactly 100%. Huge push for a team at 97%, little reason to try at 88%, and only a small bump for selling past goal.</li>" +
      "<li><b>Tiered:</b> smaller steps at " + P.t1 + "%, " + P.t2 + "%, and " + P.t3 + "%. More teams stay in reach, and the top tier keeps people selling after they hit goal. The tradeoff is paying something below goal.</li></ul>";
    $("#ic-dept").value = st.dept;
  }

  /* ------------------------------------------------ 4. leadership levers */
  function renderWeights() {
    $("#ic-weights").innerHTML = '<p class="ic-wh">Metric weights</p>' + LEV.map(function (m) {
      return '<label class="sp-range sp-mini"><span>' + m.t + '</span><input type="range" min="0" max="2.5" step="0.25" value="' + st.w[m.k] + '" data-w="' + m.k + '"><output>' + st.w[m.k].toFixed(2).replace(/\.?0+$/, "") + "×</output></label>";
    }).join("");
    $$("#ic-weights input").forEach(function (inp) {
      inp.addEventListener("input", function () { st.w[inp.getAttribute("data-w")] = +inp.value; st.preset = "custom"; inp.nextElementSibling.textContent = (+inp.value).toFixed(2).replace(/\.?0+$/, "") + "×"; renderLevers(); });
    });
    document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ic-month]"); if (!b) return;
    setMonth(b.getAttribute("data-ic-month")); renderSliders(); renderAll();
  });
  $$("[data-ic-preset]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-ic-preset") === st.preset ? "true" : "false"); });
  }
  function renderLevers() {
    var pl = pools(st.design), hypo = !pl.on, saved = null;
    if (hypo) { saved = Object.assign({}, st.att); setMonth("goal"); pl = pools(st.design); }   /* preview a month at goal */
    var sh = shares(pl);
    if (hypo) st.att = saved;
    var cur = PEOPLE.map(function (p, i) { var k = kickers(p, st.w); return { p: p, pool: sh[i], k: k, kt: k.reduce(function (a, b) { return a + b; }, 0) }; });
    var base = PEOPLE.map(function (p) { return kickers(p, PRESETS.balanced).reduce(function (a, b) { return a + b; }, 0); });
    var spend = 0, baseSpend = 0, byM = LEV.map(function () { return 0; });
    cur.forEach(function (c, i) { spend += c.pool + c.kt; baseSpend += c.pool + base[i]; c.k.forEach(function (v, j) { byM[j] += v; }); });
    var kTot = byM.reduce(function (a, b) { return a + b; }, 0) || 1;
    var order = LEV.map(function (m, j) { return { t: m.t, v: byM[j], w: st.w[m.k] }; }).sort(function (a, b) { return b.v - a.v; });
    var d = spend - baseSpend;
    $("#ic-lev-kpis").innerHTML = (hypo ? '<div class="ic-hypo"><span>Preview</span>The store is below ' + gate(st.design) + '% this month, so no one is paid. Below is what a month at goal (store and every department at 100%) would pay. <button type="button" class="text-link" data-ic-month="goal">Set every department to 100%</button></div>' : "") +
      '<div class="sf-kpi"><span>' + (hypo ? "Spend in a month at goal" : "Store incentive spend · monthly") + "</span><b>" + money(spend) + "</b><small>" + (Math.abs(d) < 1 ? "same as balanced" : (d > 0 ? "+" : "−") + money(Math.abs(d)) + " vs balanced") + " · pool " + money(pl.total) + "</small></div>" +
      '<div class="sf-kpi"><span>Most rewarded now</span><b>' + order[0].t + "</b><small>" + Math.round(order[0].v / kTot * 100) + "% of kicker spend · then " + order[1].t.toLowerCase() + "</small></div>" +
      '<div class="ic-mix">' + order.map(function (o, i) { return '<span style="width:' + (o.v / kTot * 100).toFixed(1) + '%" class="m' + i + '" title="' + o.t + " " + money(o.v) + '"></span>'; }).join("") + "</div>";
    var max = Math.max.apply(null, cur.map(function (c) { return c.pool + c.kt; })) || 1;
    $("#ic-people").innerHTML = cur.map(function (c, i) {
      var tot = c.pool + c.kt, dd = c.kt - base[i], top = LEV[c.k.indexOf(Math.max.apply(null, c.k))].t;
      return '<div class="ic-pr"><div class="ic-pn"><b>' + c.p.n + "</b><small>" + DEPTS.filter(function (x) { return x.id === c.p.d; })[0].name + '</small></div><div class="ic-bar"><i class="pool" style="width:' + (c.pool / max * 100).toFixed(1) + '%"></i><i class="kick" style="width:' + (c.kt / max * 100).toFixed(1) + '%"></i></div>' +
        '<div class="ic-pv"><b>' + money(tot) + '<small class="mo">/mo</small></b><small class="' + (dd > 0.5 ? "up" : dd < -0.5 ? "down" : "") + '">' + (Math.abs(dd) < 0.5 ? "no change" : (dd > 0 ? "+" : "−") + money(Math.abs(dd))) + "</small></div><em>Top kicker: " + top.toLowerCase() + "</em></div>";
    }).join("") + '<p class="ic-leg"><i class="pool"></i>Pool share <i class="kick"></i>Lever kickers · monthly, change vs balanced</p>' + insight(cur, base);
  }

  function insight(cur, base) {
    var up = LEV.map(function (m, j) { return st.w[m.k] > PRESETS.balanced[m.k] ? j : -1; }).filter(function (j) { return j >= 0; });
    if (!up.length) return '<p class="ic-ins">Every metric is weighted the same. Pick a campaign preset or move a weight to steer the plan.</p>';
    var best = null;
    cur.forEach(function (c, i) { var dd = c.kt - base[i]; if (!best || dd > best.d) best = { n: c.p.n, d: dd }; });
    var none = cur.filter(function (c) { return up.every(function (j) { return c.k[j] === 0; }); }).map(function (c) { return c.p.n; });
    var names = up.map(function (j) { return LEV[j].t.toLowerCase(); }).join(" and ");
    return '<p class="ic-ins">Biggest gain: <b>' + best.n + "</b> (+" + money(best.d) + ")." + (none.length ? " No change for <b>" + none.join(", ") + "</b>: " + names + " is below 80% of goal, so there's no kicker yet. That's a coaching opportunity, not a penalty." : "") + "</p>";
  }

  /* ------------------------------------------------ assumptions + wiring */
  function renderFields() {
    $("#ic-fields").innerHTML = FIELDS.map(function (f) {
      return '<label class="sf-field"><span>' + f.label + '</span><span class="sf-in">' + (f.unit === "$" ? "<i>$</i>" : "") +
        '<input type="number" inputmode="decimal" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + P[f.k] + '" data-k="' + f.k + '"' + (f.w ? ' style="width:' + f.w + 'px"' : "") + ">" + (f.unit === "%" ? "<i>%</i>" : "") + "</span></label>";
    }).join("");
    $$("#ic-fields input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var f = FIELDS.filter(function (x) { return x.k === inp.getAttribute("data-k"); })[0], v = parseFloat(inp.value);
        if (!isFinite(v)) return; P[f.k] = Math.max(f.min, Math.min(f.max, v)); renderAll();
      });
    });
  }
  function renderAll() { var pl = pools(st.design), sh = shares(pl); renderFund(pl, sh); renderNeed(pl); renderCurve(); renderLevers(); }
  $("#ic-dept").innerHTML = DEPTS.map(function (d) { return '<option value="' + d.id + '">' + d.name + "</option>"; }).join("");
  $("#ic-dept").addEventListener("change", function (e) { st.dept = e.target.value; renderCurve(); });
  $("#ic-all").addEventListener("input", function (e) { var v = +e.target.value; DEPTS.forEach(function (d) { st.att[d.id] = v; }); renderSliders(); renderAll(); });
  $$("[data-ic-design]").forEach(function (b) { b.addEventListener("click", function () { st.design = b.getAttribute("data-ic-design"); renderAll(); }); });
  $$("[data-ic-basis]").forEach(function (b) { b.addEventListener("click", function () { st.basis = b.getAttribute("data-ic-basis"); renderAll(); }); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ic-month]"); if (!b) return;
    setMonth(b.getAttribute("data-ic-month")); renderSliders(); renderAll();
  });
  $$("[data-ic-preset]").forEach(function (b) { b.addEventListener("click", function () { st.preset = b.getAttribute("data-ic-preset"); st.w = Object.assign({}, PRESETS[st.preset]); renderWeights(); renderLevers(); }); });
  $("[data-ic-reset]").addEventListener("click", function () { FIELDS.forEach(function (f) { P[f.k] = f.v; }); st.design = "cliff"; st.basis = "hours"; resetState(); renderFields(); renderSliders(); renderWeights(); renderAll(); });
  renderFields(); renderSliders(); renderWeights(); renderAll();
})();
