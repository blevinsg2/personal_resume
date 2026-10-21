/* Staffing to demand: one EXAMPLE store day. All traffic and assumptions are illustrative and editable. */
(function () {
  "use strict";
  var app = document.getElementById("sf-app");
  if (!app) return;
  var OPEN = 6, H = 16;   /* example store hours: 6 AM to 10 PM */
  var TRAFFIC = {          /* example customers entering per hour, not real data */
    weekday: [18, 40, 62, 80, 95, 105, 110, 102, 96, 100, 118, 128, 112, 82, 52, 28],
    weekend: [26, 60, 115, 170, 210, 230, 225, 205, 180, 160, 138, 110, 82, 56, 36, 20]
  };
  var FIELDS = [
    { k: "share", label: "Customers needing a specialist", unit: "%", min: 1, max: 60, step: 1, v: 10 },
    { k: "capA", label: "Customers one associate can help / hr", unit: "", min: 1, max: 40, step: 1, v: 8 },
    { k: "capS", label: "Customers one specialist can help / hr", unit: "", min: 1, max: 20, step: 1, v: 3 },
    { k: "convH", label: "Conversion when helped", unit: "%", min: 1, max: 100, step: 1, v: 45 },
    { k: "convN", label: "Conversion when not helped", unit: "%", min: 0, max: 100, step: 1, v: 25 },
    { k: "tickG", label: "Average ticket, general", unit: "$", min: 1, max: 5000, step: 1, v: 55 },
    { k: "tickS", label: "Average ticket, specialist sale", unit: "$", min: 1, max: 20000, step: 10, v: 450 },
    { k: "wageA", label: "Associate wage / hr", unit: "$", min: 1, max: 200, step: 0.5, v: 16 },
    { k: "wageS", label: "Specialist wage / hr", unit: "$", min: 1, max: 200, step: 0.5, v: 19 }
  ];
  var MIN_A = 2, MIN_S = 1, MAX_STAFF = 40;
  var P = {}; FIELDS.forEach(function (f) { P[f.k] = f.v; });
  var st = { day: "weekday", preset: "flat", sel: 5, a: [], s: [] };

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function hr(i) { var h = OPEN + i; return h === 12 ? "12 PM" : h < 12 ? h + " AM" : (h - 12) + " PM"; }
  function hshort(i) { var h = OPEN + i; return h === 12 ? "12p" : h < 12 ? h + "a" : (h - 12) + "p"; }

  /* ------------------------------------------------ model */
  function demand(i) { var t = TRAFFIC[st.day][i], sh = P.share / 100; return { t: t, g: t * (1 - sh), s: t * sh }; }
  function needed(i) { var d = demand(i); return { a: Math.max(MIN_A, Math.ceil(d.g / P.capA - 1e-9)), s: Math.max(MIN_S, Math.ceil(d.s / P.capS - 1e-9)) }; }
  function evalPlan(A, S) {
    var cH = P.convH / 100, cN = P.convN / 100, out = { sales: 0, pot: 0, pay: 0, hrsA: 0, hrsS: 0, under: 0, over: 0, rows: [] };
    for (var i = 0; i < H; i++) {
      var d = demand(i), n = needed(i), gh = Math.min(d.g, A[i] * P.capA), sh = Math.min(d.s, S[i] * P.capS);
      var sales = (gh * cH + (d.g - gh) * cN) * P.tickG + (sh * cH + (d.s - sh) * cN) * P.tickS;
      var pot = d.g * cH * P.tickG + d.s * cH * P.tickS, pay = A[i] * P.wageA + S[i] * P.wageS;
      var stA = A[i] < n.a ? "under" : A[i] > n.a ? "over" : "ok", stS = S[i] < n.s ? "under" : S[i] > n.s ? "over" : "ok";
      var goal = S[i] > 0 ? d.s * cH * P.tickS / S[i] : null, goalMax = P.capS * cH * P.tickS;
      if (stA === "under" || stS === "under") out.under++; else if (stA === "over" || stS === "over") out.over++;
      out.sales += sales; out.pot += pot; out.pay += pay; out.hrsA += A[i]; out.hrsS += S[i];
      out.rows.push({ d: d, n: n, stA: stA, stS: stS, sales: sales, pay: pay, goal: goal, stretch: goal != null && goal > goalMax + 0.5 });
    }
    return out;
  }
  function presetDemand() { var A = [], S = []; for (var i = 0; i < H; i++) { var n = needed(i); A.push(n.a); S.push(n.s); } return { a: A, s: S }; }
  function presetFlat() {   /* same total hours as "staffed to demand", spread evenly across the day */
    var d = presetDemand(), ta = d.a.reduce(function (x, y) { return x + y; }, 0), ts = d.s.reduce(function (x, y) { return x + y; }, 0);
    function spread(tot, min) { var base = Math.floor(tot / H), rem = tot - base * H, out = []; for (var i = 0; i < H; i++) out.push(Math.max(min, base + (i >= (H - rem) / 2 && i < (H - rem) / 2 + rem ? 1 : 0))); return out; }
    return { a: spread(ta, MIN_A), s: spread(ts, MIN_S) };
  }
  function applyPreset() {
    if (st.preset === "custom") return;
    var p = st.preset === "flat" ? presetFlat() : presetDemand(); st.a = p.a; st.s = p.s;
  }

  /* ------------------------------------------------ render */
  var W = 640, CW = W / H;
  function renderTraffic() {
    var svg = $("#sf-traffic"), T = TRAFFIC[st.day], max = Math.max.apply(null, T) * 1.1, h = 120, pts = [];
    for (var i = 0; i < H; i++) pts.push([i * CW + CW / 2, h - 6 - (T[i] / max) * (h - 18)]);
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = line + " L" + pts[H - 1][0] + " " + h + " L" + pts[0][0] + " " + h + " Z";
    var p = pts[st.sel];
    svg.innerHTML = '<rect class="sf-selcol" x="' + st.sel * CW + '" y="0" width="' + CW + '" height="' + h + '"/>' +
      '<path class="sf-area" d="' + area + '"/><path class="sf-line" d="' + line + '" vector-effect="non-scaling-stroke"/>' +
      pts.map(function (q, i) { return '<rect class="sf-hit" data-i="' + i + '" x="' + i * CW + '" y="0" width="' + CW + '" height="' + h + '"/>'; }).join("") +
      '<circle class="sf-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4" vector-effect="non-scaling-stroke"/>';
  }
  function renderBars(id, arr, role, ev) {
    var svg = $(id), h = +svg.getAttribute("viewBox").split(" ")[3], max = 0;
    ev.rows.forEach(function (r, i) { max = Math.max(max, arr[i], role === "a" ? r.n.a : r.n.s); });
    max = Math.max(max + 1, role === "a" ? 8 : 4);
    var sc = (h - 16) / max, out = '<rect class="sf-selcol" x="' + st.sel * CW + '" y="0" width="' + CW + '" height="' + h + '"/>';
    for (var y = 0; y <= max; y += (max > 16 ? 5 : max > 8 ? 2 : 1)) out += '<line class="sf-grid" x1="0" x2="' + W + '" y1="' + (h - y * sc) + '" y2="' + (h - y * sc) + '" vector-effect="non-scaling-stroke"/>';
    ev.rows.forEach(function (r, i) {
      var v = arr[i], need = role === "a" ? r.n.a : r.n.s, status = role === "a" ? r.stA : r.stS;
      var bh = v * sc, x = i * CW + CW * 0.16, w = CW * 0.68;
      out += '<rect class="sf-bar ' + status + '" x="' + x + '" y="' + (h - bh) + '" width="' + w + '" height="' + Math.max(bh, 0) + '" rx="3"/>';
      out += '<line class="sf-need" x1="' + (i * CW + CW * 0.08) + '" x2="' + (i * CW + CW * 0.92) + '" y1="' + (h - need * sc) + '" y2="' + (h - need * sc) + '" vector-effect="non-scaling-stroke"/>';
      out += '<text class="sf-val' + (i === st.sel ? " on" : "") + '" x="' + (i * CW + CW / 2) + '" y="' + Math.max(11, h - bh - 4) + '" text-anchor="middle">' + v + "</text>";
    });
    for (var j = 0; j < H; j++) out += '<rect class="sf-hit" data-i="' + j + '" x="' + j * CW + '" y="0" width="' + CW + '" height="' + h + '"/>';
    svg.innerHTML = out;
    svg.setAttribute("data-max", max);
  }
  function kpi(label, value, sub, cls) { return '<div class="sf-kpi ' + (cls || "") + '"><span>' + label + "</span><b>" + value + "</b><small>" + sub + "</small></div>"; }
  function render() {
    var ev = evalPlan(st.a, st.s), pct = ev.sales ? ev.pay / ev.sales * 100 : 0;
    $("#sf-kpis").innerHTML =
      kpi("Sales captured", money(ev.sales), Math.round(ev.sales / ev.pot * 100) + "% of the sales available") +
      kpi("Payroll", money(ev.pay), (ev.hrsA + ev.hrsS) + " labor hours") +
      kpi("Payroll % of sales", pct.toFixed(1) + "%", "lower is leaner") +
      kpi("Hours short", ev.under + " of " + H, ev.over + " with extra people", ev.under ? "warn" : "");
    renderTraffic();
    renderBars("#sf-assoc", st.a, "a", ev);
    renderBars("#sf-spec", st.s, "s", ev);
    $("#sf-axis").innerHTML = st.a.map(function (x, i) { return "<span>" + (i % 2 === 0 ? hshort(i) : "") + "</span>"; }).join("");
    $("#sf-goals").innerHTML = '<span class="sf-goals-l">Forecast sales per specialist-hour</span><div>' + ev.rows.map(function (r, i) {
      return '<span class="' + (i === st.sel ? "on " : "") + (r.stretch ? "stretch" : "") + '">' + (r.goal == null ? "–" : "$" + (r.goal >= 1000 ? (r.goal / 1000).toFixed(1) + "k" : Math.round(r.goal))) + "</span>";
    }).join("") + "</div>";
    var gs = $("#sf-goals div"), on = $("#sf-goals span.on");
    if (gs && on && gs.scrollWidth > gs.clientWidth + 2) gs.scrollLeft = Math.max(0, on.offsetLeft - gs.offsetLeft - gs.clientWidth / 2 + on.offsetWidth / 2);
    var r = ev.rows[st.sel], i = st.sel;
    $("#sf-hour").innerHTML = '<div class="sf-hour-t"><b>' + hr(i) + "</b><span>" + Math.round(r.d.t) + " customers forecast · " + Math.round(r.d.s) + " need a specialist</span></div>" +
      stepper("Associates", "a", st.a[i], r.n.a, r.stA) + stepper("Specialists", "s", st.s[i], r.n.s, r.stS) +
      '<div class="sf-goal"><span>Sales per specialist-hour</span><b>' + (r.goal == null ? "No specialist on" : money(r.goal)) + "</b><small>" +
      (r.goal == null ? "Add one to see it" : r.stretch ? "More than one specialist can handle (" + money(P.capS * P.convH / 100 * P.tickS) + " max)" : "Forecast specialist sales ÷ specialists") + "</small></div>";
    $$("#sf-hour [data-step]").forEach(function (b) {
      b.addEventListener("click", function () { var role = b.getAttribute("data-role"); setStaff(role, st.sel, st[role][st.sel] + +b.getAttribute("data-step")); });
    });
    var f = evalPlan(presetFlat().a, presetFlat().s), d = evalPlan(presetDemand().a, presetDemand().s);
    var diff = d.sales - f.sales;
    $("#sf-compare").innerHTML = '<div class="sf-cmp-h"><b>Flat vs staffed to demand</b><span>Same day, same assumptions, same labor hours</span></div><div class="sf-cmp">' +
      cmpCol("Flat schedule", f) + cmpCol("Staffed to demand", d) +
      '<div class="sf-cmp-d"><span>Difference</span><b>' + (diff >= 0 ? "+" : "−") + money(Math.abs(diff)) + "</b><small>sales captured, " + (d.hrsA + d.hrsS === f.hrsA + f.hrsS ? "no extra hours" : (d.hrsA + d.hrsS - f.hrsA - f.hrsS) + " hours apart") + "</small></div></div>";
    $$("[data-sf-preset]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-sf-preset") === st.preset ? "true" : "false"); });
  }
  function cmpCol(t, e) { return '<div><span>' + t + "</span><b>" + money(e.sales) + "</b><small>" + (e.hrsA + e.hrsS) + " hrs · payroll " + (e.pay / e.sales * 100).toFixed(1) + "% · " + e.under + " hrs short</small></div>"; }
  function stepper(label, role, v, need, status) {
    return '<div class="sf-step ' + status + '"><span>' + label + '</span><div><button type="button" data-role="' + role + '" data-step="-1" aria-label="One fewer ' + label.toLowerCase() + '">−</button><b>' + v +
      '</b><button type="button" data-role="' + role + '" data-step="1" aria-label="One more ' + label.toLowerCase() + '">+</button></div><small>' + need + " needed" + (status === "under" ? " · short" : status === "over" ? " · extra" : "") + "</small></div>";
  }
  function setStaff(role, i, v) {
    v = Math.max(0, Math.min(MAX_STAFF, v));
    if (st[role][i] === v) return;
    st[role] = st[role].slice(); st[role][i] = v; st.preset = "custom"; render();
  }

  /* ------------------------------------------------ interaction: tap to select, drag to set */
  function colFromEvent(svg, e) { var r = svg.getBoundingClientRect(); return Math.max(0, Math.min(H - 1, Math.floor((e.clientX - r.left) / r.width * H))); }
  $$(".sf-bars").forEach(function (svg) {
    var role = svg.getAttribute("data-role"), drag = null;
    function valFrom(e) { var r = svg.getBoundingClientRect(), h = +svg.getAttribute("viewBox").split(" ")[3], max = +svg.getAttribute("data-max"), y = (r.bottom - e.clientY) / r.height * h; return Math.round(y / ((h - 16) / max)); }
    svg.addEventListener("pointerdown", function (e) {
      var i = colFromEvent(svg, e); drag = { i: i, y: e.clientY, moved: false };
      if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
      if (st.sel !== i) { st.sel = i; render(); }
    });
    svg.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientY - drag.y) < 4) return;
      drag.moved = true; setStaff(role, drag.i, valFrom(e));
    });
    function end() { drag = null; }
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  });
  $("#sf-traffic").addEventListener("click", function (e) { st.sel = colFromEvent(e.currentTarget, e); render(); });
  $$("[data-sf-day]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.day = b.getAttribute("data-sf-day");
      $$("[data-sf-day]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      if (st.preset === "custom") st.preset = "demand";
      applyPreset(); render();
    });
  });
  $$("[data-sf-preset]").forEach(function (b) {
    b.addEventListener("click", function () { st.preset = b.getAttribute("data-sf-preset"); applyPreset(); render(); });
  });
  var fieldsEl = $("#sf-fields");
  function renderFields() {
    fieldsEl.innerHTML = FIELDS.map(function (f) {
      return '<label class="sf-field"><span>' + f.label + '</span><span class="sf-in">' + (f.unit === "$" ? "<i>$</i>" : "") +
        '<input type="number" inputmode="decimal" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + P[f.k] + '" data-k="' + f.k + '">' + (f.unit === "%" ? "<i>%</i>" : "") + "</span></label>";
    }).join("");
    $$("input", fieldsEl).forEach(function (inp) {
      inp.addEventListener("input", function () {
        var f = FIELDS.filter(function (x) { return x.k === inp.getAttribute("data-k"); })[0], v = parseFloat(inp.value);
        if (!isFinite(v)) return;
        P[f.k] = Math.max(f.min, Math.min(f.max, v)); applyPreset(); render();
      });
    });
  }
  $("[data-sf-reset]").addEventListener("click", function () { FIELDS.forEach(function (f) { P[f.k] = f.v; }); renderFields(); applyPreset(); render(); });
  renderFields(); applyPreset(); render();
})();
