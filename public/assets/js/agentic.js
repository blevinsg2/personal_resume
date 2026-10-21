/* The Wolf of Wall Bot: weekly index chart, play axis, scorecard, trade log and lessons.
   Data: /assets/data/agentic_trading.json, copied from the bot's weekly.json by scripts/sync_trading.py.
   Only normalized numbers (index = 100 at the start, percent returns); no dollar amounts exist in the file. */
(function () {
  "use strict";
  var root = document.getElementById("at");
  if (!root) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg", $ = function (id) { return document.getElementById(id); };
  var svg = $("at-svg"), chart = $("at-chart"), empty = $("at-empty");
  var KEYS = ["belfort", "buffett", "spy", "savings"];
  var NAMES = { belfort: "Belfort mode", buffett: "Buffett mode", spy: "SPY", savings: "Savings rate" };
  var TYPES = { stock: "Stock", etf: "ETF", call: "Call", put: "Put" };
  var D = null, st = { wk: 0, mode: "all", type: "all", allwk: true, playing: false, timer: 0 };

  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pct(v) { return v == null || isNaN(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%"; }
  function cls(v) { return v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : ""; }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monYear(d) { var m = /^(\d{4})-(\d{2})/.exec(d || ""); return m ? MON[+m[2] - 1] + " " + m[1] : ""; }
  function weeks() { return (D && D.weeks) || []; }
  function wkObj(n) { return weeks().filter(function (w) { return w.week === n; })[0]; }

  /* ---------------------------------------------------------------- chart */
  function drawChart() {
    var W = chart.clientWidth, H = chart.clientHeight; if (!W) return;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.textContent = "";
    var small = W < 560, pl = small ? 40 : 48, pr = small ? 16 : 120, pt = 18, pb = 30;
    var ws = weeks(), n = ws.length;
    var lo = 99, hi = 101;
    ws.forEach(function (w) { KEYS.forEach(function (k) { var s = w.series[k]; if (s) { lo = Math.min(lo, s.index); hi = Math.max(hi, s.index); } }); });
    var pad = Math.max(0.5, (hi - lo) * 0.12); lo -= pad; hi += pad;
    var step = niceStep((hi - lo) / 4), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    var X = function (i) { return pl + (W - pl - pr) * (n ? i / n : 0.5); }, Y = function (v) { return pt + (H - pt - pb) * (1 - (v - y0) / (y1 - y0)); };
    var g = el("g", { "class": "at-grid" }, svg);
    for (var v = y0; v <= y1 + 1e-9; v += step) {
      el("line", { x1: pl, x2: W - pr + (small ? 0 : 8), y1: Y(v), y2: Y(v), "class": Math.abs(v - 100) < 1e-9 ? "base" : "" }, g);
      var t = el("text", { x: pl - 8, y: Y(v), dy: "0.32em", "text-anchor": "end" }, g); t.textContent = (+v.toFixed(2)).toString();
    }
    if (!n) return;
    for (var i = 0; i <= n; i++) { var tx = el("text", { x: X(i), y: H - 8, "text-anchor": "middle", "class": i === st.wk ? "cur" : "" }, g); tx.textContent = i === 0 ? "Start" : (small && n > 8 && i % 2 ? "" : "W" + i); }
    var cut = st.wk, ends = [];
    KEYS.forEach(function (k) {
      var pts = [[X(0), Y(100)]];
      ws.forEach(function (w, j) { var s = w.series[k]; if (s) pts.push([X(j + 1), Y(s.index)]); });
      if (pts.length < 2) return;
      var d = function (a) { return a.map(function (p, j) { return (j ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(""); };
      el("path", { d: d(pts), "class": "at-line ghost s-" + k }, svg);
      var on = pts.slice(0, cut + 1);
      el("path", { d: d(on), "class": "at-line s-" + k }, svg);
      var last = on[on.length - 1], wo = wkObj(cut), sv = wo && wo.series[k];
      el("circle", { cx: last[0], cy: last[1], r: 3.6, "class": "at-dot s-" + k }, svg);
      if (sv) ends.push({ k: k, x: last[0], y: last[1], v: sv.index });
    });
    // end labels, nudged apart so they don't overlap
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 14) ends[j].y = ends[j - 1].y + 14;
    if (!small) ends.forEach(function (e) { var t = el("text", { x: e.x + 9, y: e.y, dy: "0.32em", "class": "at-end s-" + e.k }, svg); t.textContent = NAMES[e.k] + " " + e.v.toFixed(1); });
    var wo2 = wkObj(cut);
    svg.setAttribute("aria-label", "Index chart, all starting at 100, through week " + cut + ": " + KEYS.filter(function (k) { return wo2 && wo2.series[k]; }).map(function (k) { return NAMES[k] + " " + wo2.series[k].index.toFixed(1); }).join(", "));
  }
  function niceStep(r) { var p = Math.pow(10, Math.floor(Math.log10(r))), f = r / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

  /* ---------------------------------------------------------------- panels */
  function scorecard() {
    var w = wkObj(st.wk), tb = document.querySelector("#at-score tbody");
    $("at-sc-lbl").textContent = $("at-ls-lbl").textContent = "Week " + st.wk + (w && w.end ? " · " + monYear(w.end) : "");
    tb.innerHTML = KEYS.filter(function (k) { return w.series[k]; }).map(function (k) {
      var s = w.series[k];
      return '<tr class="s-' + k + '"><th scope="row"><i></i>' + NAMES[k] + '</th><td class="n">' + s.index.toFixed(2) + '</td><td class="n ' + cls(s.weekly_pct) + '">' + pct(s.weekly_pct) + '</td><td class="n ' + cls(s.cum_pct) + '">' + pct(s.cum_pct) + "</td></tr>";
    }).join("");
    var S = w.series, bits = [];
    if (S.belfort && S.buffett) {
      var lead = S.belfort.index >= S.buffett.index ? "belfort" : "buffett", other = lead === "belfort" ? "buffett" : "belfort", gap = Math.abs(S.belfort.index - S.buffett.index);
      bits.push(gap < 0.005 ? "The two modes are tied." : NAMES[lead] + " leads " + NAMES[other] + " by " + gap.toFixed(2) + " index points.");
    }
    ["belfort", "buffett"].forEach(function (k) {
      if (S[k] && S.savings) bits.push(NAMES[k] + (S[k].index >= S.savings.index ? " is ahead of" : " is behind") + " the savings rate" + (S.spy ? (S[k].index >= S.spy.index ? " and ahead of SPY." : " and behind SPY.") : "."));
    });
    $("at-verdict").textContent = "Through week " + st.wk + ": " + bits.join(" ");
  }
  function lessons() {
    var w = wkObj(st.wk), L = (w && w.lessons) || [];
    $("at-lessons").innerHTML = L.length ? L.map(function (x) {
      return "<li>" + (x.mode ? '<span class="at-tag s-' + x.mode + '">' + (x.mode === "belfort" ? "Belfort" : "Buffett") + "</span>" : "") + esc(x.text) + "</li>";
    }).join("") : '<li class="at-none">No lessons logged for week ' + st.wk + ".</li>";
  }
  function tradeLog() {
    var T = (D.trades || []).filter(function (t) {
      return (st.mode === "all" || t.mode === st.mode) && (st.type === "all" || t.type === st.type) && (st.allwk ? (t.week == null || t.week <= st.wk) : t.week === st.wk);
    });
    $("at-log-n").textContent = T.length + " trade" + (T.length === 1 ? "" : "s") + (st.allwk ? " through week " + st.wk : " in week " + st.wk);
    document.querySelector("#at-trades tbody").innerHTML = T.length ? T.slice().reverse().map(function (t) {
      var r = t.result_pct, st_ = t.status ? ' <span class="at-st">' + esc(t.status) + "</span>" : "";
      return '<tr><td class="at-d">' + esc(t.date) + '</td><td><span class="at-tag s-' + t.mode + '">' + (t.mode === "belfort" ? "Belfort" : "Buffett") + '</span></td><td class="at-tk">' + esc(t.ticker) + "</td><td>" + esc(t.side || "—") +
        "</td><td>" + esc(TYPES[t.type] || t.type) + '</td><td class="n ' + cls(r) + '">' + (r == null ? "Open" : pct(r)) + st_ + '</td><td class="at-why-c">' + esc(t.reason) + "</td></tr>";
    }).join("") : '<tr class="at-none"><td colspan="7">' + ((D.trades || []).length ? "No trades match these filters." : "No trades logged yet.") + "</td></tr>";
  }

  /* ---------------------------------------------------------------- play axis */
  var pp = $("at-pp"), wkIn = $("at-wk");
  function weekUI() {
    var ws = weeks(), w = wkObj(st.wk);
    wkIn.value = st.wk; wkIn.style.setProperty("--p", (ws.length > 1 ? (st.wk - 1) / (ws.length - 1) * 100 : 100).toFixed(2) + "%");
    $("at-wk-lbl").textContent = "Week " + st.wk + " of " + ws.length;
    $("at-wk-sub").textContent = w && w.end ? monYear(w.end) : "";
    wkIn.setAttribute("aria-valuetext", "Week " + st.wk + " of " + ws.length);
    $("at-asof").textContent = "Through week " + st.wk + (w && w.end ? " · " + monYear(w.end) : "");
  }
  function sync() { drawChart(); scorecard(); lessons(); tradeLog(); weekUI(); }
  function setPlay(on) {
    clearTimeout(st.timer); st.playing = on;
    pp.textContent = on ? "❚❚" : "▶"; pp.setAttribute("aria-label", on ? "Pause" : "Play week by week");
    if (!on) return;
    if (st.wk >= weeks().length) { st.wk = 1; sync(); }
    st.timer = setTimeout(step, reduce ? 1800 : 1300);
  }
  function step() { if (st.wk >= weeks().length) { setPlay(false); return; } st.wk++; sync(); if (st.wk >= weeks().length) setPlay(false); else st.timer = setTimeout(step, reduce ? 1800 : 1300); }

  /* ---------------------------------------------------------------- boot */
  function bindFilters() {
    function seg(attr, key) {
      document.querySelectorAll("[" + attr + "]").forEach(function (b) {
        b.addEventListener("click", function () {
          st[key] = b.getAttribute(attr);
          document.querySelectorAll("[" + attr + "]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          if (D && weeks().length) tradeLog();
        });
      });
    }
    seg("data-at-mode", "mode"); seg("data-at-type", "type");
    $("at-allwk").addEventListener("change", function (e) { st.allwk = e.target.checked; if (D && weeks().length) tradeLog(); });
  }
  bindFilters();
  fetch("/assets/data/agentic_trading.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    D = d;
    var ws = weeks();
    if (!ws.length) { root.setAttribute("data-status", "pending"); drawChart(); return; }   // server-rendered empty state stays
    root.setAttribute("data-status", "live"); empty.hidden = true;
    st.wk = ws.length;
    if (ws.length > 1) {
      $("at-play").hidden = false; wkIn.min = 1; wkIn.max = ws.length;
      pp.addEventListener("click", function () { setPlay(!st.playing); });
      wkIn.addEventListener("input", function () { setPlay(false); st.wk = +wkIn.value; sync(); });
    }
    sync();
  }).catch(function () { root.setAttribute("data-status", "error"); drawChart(); });
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(drawChart, 120); });
  document.addEventListener("visibilitychange", function () { if (document.hidden && st.playing) setPlay(false); });
})();
