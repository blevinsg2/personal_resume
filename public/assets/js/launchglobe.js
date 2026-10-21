/* Launch Globe: every orbital launch attempt since Sputnik on a dotted orthographic globe (canvas, no library).
   Data: /assets/data/launch_globe.json, built by scripts/build_launch_globe.py from GCAT + Wikipedia + Natural Earth. */
(function () {
  "use strict";
  var root = document.getElementById("lg");
  if (!root) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $("lg-cv"), ctx = cv.getContext("2d"), stage = $("lg-stage"), tip = $("lg-tip");
  var playB = $("lg-play"), scrub = $("lg-scrub"), yl = $("lg-yl"), spdSel = $("lg-spd"), lastEl = $("lg-last"), dateEl = $("lg-date");
  var yb = $("lg-ybars"), ybx = yb.getContext("2d"), ybInfo = $("lg-ybinfo"), legend = $("lg-legend");
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DEG = Math.PI / 180;
  var D, L, S, PV, NP, V, T0, landXYZ, siteXYZ = [], y0, y1, mStart, nMonths, tEnd, YC, yStartIdx, order, PRIO = {};
  var sel, st = { t: 0, ptr: 0, playing: false, speed: 2, lon: -40, lat: 20, user: false, follow: true, visible: true, autoplayed: false, touched: false };
  var cnt, flights = [], flashes = [], W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, raf = 0, lastFrame = 0, colors = {}, pvc = [], lastShown = -1;
  var lastDraw = 0, lastUiT = 0, landBuf = null, tokens = 0, hoverYear = null;
  // follow-the-action camera: recent launches (wall-clock time) feed a cluster search; the camera eases toward the
  // busiest cluster with a critically damped spring, and only switches clusters after a dwell and a clear margin
  var resetAnim = null, ev = [], cam = { vLon: 0, vLat: 0, tLon: null, tLat: null, tScore: 0, since: -1e9, nextPick: 0, lastEv: -1e9 };
  var DWELL = 3200, TOUR = 6500, PICK_MS = 250, EV_MS = 4200, COS_R = Math.cos(50 * Math.PI / 180), HOME = { lon: -40, lat: 20 };
  // reduced motion keeps the rockets (they are the story) but simplifies them: fewer at once, steady exhaust,
  // no expanding launch rings, and a calmer camera: follow turns slowly, with no idle spin (Follow can be switched off)
  var CAP = function () { return reduce ? (W < 600 ? 6 : 12) : W < 600 ? 10 : 22; }, FD = 2000;

  function hash(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function vec(lon, lat) { var a = lon * DEG, b = lat * DEG; return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)]; }
  function dayDate(d) { return new Date(T0 + d * 864e5); }
  function monthIdx(d) { var x = dayDate(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); }
  function monthDay(m) { return (Date.UTC(Math.floor(m / 12), m % 12, 1) - T0) / 864e5; }
  function fmtM(m) { return MON[m % 12] + " " + Math.floor(m / 12); }
  function yearOf(d) { return dayDate(d).getUTCFullYear(); }
  function pass(x) { return sel[x[1]] === 1; }
  function dark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  function readColors() {
    var cs = getComputedStyle(root);
    var g = function (n, f) { return (cs.getPropertyValue(n) || "").trim() || f; };
    colors = { ocean: g("--lg-ocean", "#dde6f3"), limb: g("--lg-limb", "#9fb0c9"), land: g("--lg-land", "#3f4b62"), oceanEdge: g("--lg-ocean-edge", "#c9d5e8"), ink: g("--ink", "#111"),
      glow: g("--lg-glow", "rgba(47,109,246,.14)"), muted: g("--muted", "#666"), line: g("--line", "#ddd"), bg: g("--bg", "#fff") };
    pvc = PV ? PV.map(function (p) { return dark() ? p.dark : p.light; }) : [];
  }

  /* ---------- projection ---------- */
  var cl, sl, cp, sp;
  function setRot() { cl = Math.cos(st.lon * DEG); sl = Math.sin(st.lon * DEG); cp = Math.cos(st.lat * DEG); sp = Math.sin(st.lat * DEG); }
  function proj(x, y, z, o) {
    var x1 = x * cl + y * sl, y1 = -x * sl + y * cl, yy = cp * z - sp * x1;
    o[0] = cx + R * y1; o[1] = cy - R * yy; o[2] = sp * z + cp * x1;
    var rr = y1 * y1 + yy * yy;
    o[3] = (o[2] < 0 && rr < 1);
    // o[4]: 1 in front or clear of the disc; fades to 0.12 once a point is well behind the limb
    o[4] = o[3] ? 0.12 + 0.88 * Math.max(0, Math.min(1, (Math.sqrt(rr) - 0.86) / 0.14)) : 1;
    return o;
  }

  /* ---------- flights ---------- */
  function makeFlight(i, now) {
    var x = L[i], s = S[x[2]], p = siteXYZ[x[2]], h = hash(i), az = s.az || [45, 110];
    var lo = s.lon * DEG, la = s.lat * DEG, A = (az[0] + (az[1] - az[0]) * h) * DEG;
    var e = [-Math.sin(lo), Math.cos(lo), 0], n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    var d = [Math.cos(A) * n[0] + Math.sin(A) * e[0], Math.cos(A) * n[1] + Math.sin(A) * e[1], Math.cos(A) * n[2] + Math.sin(A) * e[2]];
    var f = x[4] === "F";
    return { i: i, born: now, p: p, d: d, pv: x[1], fail: f, part: x[4] === "P", end: f ? 0.28 + hash(i + 7) * 0.25 : 1, prio: !!PRIO[x[1]] };
  }
  var tmp = [0, 0, 0, false, 1], tmp2 = [0, 0, 0, false, 1];
  function fpos(f, s, o) {
    var th = 0.8 * s * s, r = 1 + 0.95 * Math.pow(s, 1.35), c = Math.cos(th) * r, sn = Math.sin(th) * r;
    return proj(f.p[0] * c + f.d[0] * sn, f.p[1] * c + f.d[1] * sn, f.p[2] * c + f.d[2] * sn, o);
  }
  function drawFlight(f, now) {
    var s = (now - f.born) / FD, head = Math.min(s, f.end), fade = s > f.end ? 1 - (s - f.end) / 0.35 : 1;
    if (fade <= 0) return false;
    if (f.fail && s >= f.end && !f.boom) {
      f.boom = true; var bp = fpos(f, f.end, [0, 0, 0, false, 1]);
      if (!bp[3] && !reduce) flashes.push({ pt: bp, born: now, dur: 800, col: colors.ink, burst: true });
    }
    var col = pvc[f.pv], N = 14, tail = Math.max(0, head - 0.42);
    ctx.lineCap = "round"; ctx.lineWidth = f.prio ? 2.2 : 1.5;
    if (f.part) ctx.setLineDash([3, 3]);
    fpos(f, tail, tmp2);
    for (var j = 1; j <= N; j++) {
      fpos(f, tail + (head - tail) * j / N, tmp);
      var vis = Math.min(tmp[4], tmp2[4]); // segments behind the globe stay as a faint ghost trail
      ctx.globalAlpha = fade * (j / N) * (f.prio ? 0.95 : 0.8) * vis; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(tmp2[0], tmp2[1]); ctx.lineTo(tmp[0], tmp[1]); ctx.stroke();
      tmp2[0] = tmp[0]; tmp2[1] = tmp[1]; tmp2[2] = tmp[2]; tmp2[3] = tmp[3]; tmp2[4] = tmp[4];
    }
    ctx.setLineDash([]);
    if (s < f.end) {
      var a0 = fpos(f, Math.max(0, head - 0.015), [0, 0, 0, false, 1]), a1 = fpos(f, head + 0.001, [0, 0, 0, false, 1]);
      if (a1[4] > 0.2) {
        var ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), Ls = f.prio ? 8.5 : 6.5;
        ctx.save(); ctx.translate(a1[0], a1[1]); ctx.rotate(ang); ctx.globalAlpha = a1[4];
        ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(-Ls * 0.6, 0, reduce ? 2.1 : 1.6 + Math.random() * 1.1, 0, 7); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(Ls * 0.5, 0); ctx.lineTo(-Ls * 0.5, -2.2); ctx.lineTo(-Ls * 0.5, 2.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    return true;
  }

  /* ---------- drawing ---------- */
  function siteDominant(s) { var b = -1, bn = 0; for (var k = 0; k < NP; k++) if (sel[k] && s.n[k] > bn) { bn = s.n[k]; b = k; } return b; }
  function draw(now) {
    setRot();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.16);
    g.addColorStop(0, colors.glow); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 7); ctx.fill();
    var og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    og.addColorStop(0, colors.ocean); og.addColorStop(1, colors.oceanEdge);
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = colors.limb; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = colors.land;
    var ds = Math.max(1.5, R / 105);
    // land dots: project once, then fill them in 4 depth bands with one path each (far fewer state changes than per-dot alpha)
    var nl = landXYZ.length / 3;
    if (!landBuf || landBuf.length < nl * 3) landBuf = new Float32Array(nl * 3);
    for (var k = 0, j = 0; k < landXYZ.length; k += 3, j += 3) {
      proj(landXYZ[k], landXYZ[k + 1], landXYZ[k + 2], tmp);
      landBuf[j] = tmp[0]; landBuf[j + 1] = tmp[1]; landBuf[j + 2] = tmp[2] <= 0.02 ? -1 : Math.min(3, Math.floor(tmp[2] * 4));
    }
    for (var band = 0; band < 4; band++) {
      var zm = (band + 0.5) / 4, sz = ds * (0.55 + 0.45 * zm), hs = sz / 2;
      ctx.globalAlpha = 0.4 + 0.6 * zm; ctx.beginPath();
      for (j = 0; j < nl * 3; j += 3) if (landBuf[j + 2] === band) ctx.rect(landBuf[j] - hs, landBuf[j + 1] - hs, sz, sz);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // site markers; SpaceX / Rocket Lab sites drawn last so they sit on top
    var sc = Math.max(0.75, R / 220), live = st.t >= tEnd - 0.01, late = [];
    for (var i = 0; i < S.length; i++) {
      var s = S[i]; proj(siteXYZ[i][0], siteXYZ[i][1], siteXYZ[i][2], tmp);
      s.sx = tmp[0]; s.sy = tmp[1]; s.vis = tmp[2] > 0; s.z = tmp[2]; s.tot = 0;
      for (var q = 0; q < NP; q++) if (sel[q]) s.tot += s.n[q];
      s.dom = siteDominant(s);
      if (s.vis && (s.tot || (live && s.up))) { if (PRIO[s.dom]) late.push(s); else drawSite(s, sc, live); }
    }
    late.forEach(function (s) { drawSite(s, sc, live); });
    ctx.globalAlpha = 1;
    flashes = flashes.filter(function (fl) {
      var a = (now - fl.born) / fl.dur; if (a >= 1) return false;
      var o = fl.pt ? fl.pt : proj(siteXYZ[fl.site][0], siteXYZ[fl.site][1], siteXYZ[fl.site][2], tmp);
      if (!fl.pt && o[2] <= 0) return true;
      ctx.globalAlpha = 1 - a; ctx.strokeStyle = fl.col; ctx.lineWidth = fl.burst ? 2 : 1.4;
      if (fl.burst) { var rr = 3 + a * 9; ctx.beginPath(); ctx.moveTo(o[0] - rr, o[1] - rr); ctx.lineTo(o[0] + rr, o[1] + rr); ctx.moveTo(o[0] + rr, o[1] - rr); ctx.lineTo(o[0] - rr, o[1] + rr); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(o[0], o[1], 3 + a * 12, 0, 7); ctx.stroke(); }
      return true;
    });
    ctx.globalAlpha = 1;
    var top = [];
    flights = flights.filter(function (f) { if (f.prio) { top.push(f); return true; } return drawFlight(f, now); });
    top.forEach(function (f) { if (!drawFlight(f, now)) flights.splice(flights.indexOf(f), 1); });
    ctx.globalAlpha = 1;
  }
  function drawSite(s, sc, live) {
    if (s.tot) {
      var r = Math.min(10, 1.8 + Math.sqrt(s.tot) * 0.24) * sc;
      ctx.globalAlpha = 0.35 + 0.65 * s.z;
      ctx.fillStyle = pvc[s.dom]; ctx.beginPath(); ctx.arc(s.sx, s.sy, r, 0, 7); ctx.fill();
      ctx.strokeStyle = colors.ocean; ctx.lineWidth = 1.2; ctx.stroke();
    }
    if (live && s.up && sel[s.up.pv]) {
      ctx.globalAlpha = 1; ctx.save(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.6; ctx.strokeStyle = pvc[s.up.pv];
      ctx.beginPath(); ctx.arc(s.sx, s.sy, 11 * Math.max(0.8, R / 220), 0, 7); ctx.stroke(); ctx.restore();
    }
  }

  /* ---------- year bars ---------- */
  function drawBars() {
    var w = yb.clientWidth, h = yb.clientHeight; if (!w) return;
    var r = Math.min(2, window.devicePixelRatio || 1);
    if (yb.width !== Math.round(w * r)) { yb.width = Math.round(w * r); yb.height = Math.round(h * r); }
    ybx.setTransform(r, 0, 0, r, 0, 0); ybx.clearRect(0, 0, w, h);
    var n = y1 - y0 + 1, gap = w / n > 6 ? 1 : 0.5, bw = w / n - gap, base = h - 16, mx = 1, cyr = yearOf(st.t);
    var tot = function (y) { var t = 0; for (var k = 0; k < NP; k++) if (sel[k]) t += YC[y][k]; return t; };
    for (var y = 0; y < n; y++) mx = Math.max(mx, tot(y));
    var curCounts = yearCounts(cyr);
    for (y = 0; y < n; y++) {
      var x = y * (bw + gap), yr = y0 + y, full = tot(y), hh = full / mx * (base - 4);
      ybx.fillStyle = colors.line; ybx.globalAlpha = yr > cyr ? 0.7 : 0.25; ybx.fillRect(x, base - hh, bw, hh);
      ybx.globalAlpha = 1;
      if (yr <= cyr) {
        var c = yr === cyr ? curCounts : YC[y], yy = base;
        for (var j = 0; j < order.length; j++) {
          var k = order[j]; if (!sel[k] || !c[k]) continue;
          var seg = c[k] / mx * (base - 4); ybx.fillStyle = pvc[k]; ybx.fillRect(x, yy - seg, bw, seg); yy -= seg;
        }
      }
      if (yr === cyr || yr === hoverYear) { ybx.strokeStyle = colors.ink; ybx.lineWidth = 1; ybx.strokeRect(x - 0.5, base - Math.max(hh, 3) - 1.5, bw + 1, Math.max(hh, 3) + 1.5); }
      if (yr % 10 === 0 || (y === 0 && yr % 10 < 7)) { ybx.fillStyle = colors.muted; ybx.font = "10.5px " + (getComputedStyle(root).getPropertyValue("--mono") || "monospace"); ybx.textAlign = "center"; ybx.fillText(String(yr), x + bw / 2, h - 3); }
    }
  }
  function yearCounts(yr) {
    var c = new Array(NP).fill(0), a = yStartIdx[yr - y0] || 0;
    for (var j = a; j < st.ptr; j++) { if (yearOf(L[j][0]) !== yr) break; c[L[j][1]]++; }
    return c;
  }
  function yearText(yr) {
    var c = yr === yearOf(st.t) ? yearCounts(yr) : yr < yearOf(st.t) ? YC[yr - y0] : YC[yr - y0], tot = 0, parts = [];
    order.filter(function (k) { return sel[k] && c[k]; }).sort(function (a, b) { return c[b] - c[a]; }).forEach(function (k) { tot += c[k]; parts.push(PV[k].short + " " + c[k]); });
    return yr + ": " + tot + " launch" + (tot === 1 ? "" : "es") + (parts.length ? " (" + parts.slice(0, 6).join(", ") + (parts.length > 6 ? ", …" : "") + ")" : "");
  }

  /* ---------- time ---------- */
  function lowerBound(t) { var lo = 0, hi = L.length; while (lo < hi) { var m = (lo + hi) >> 1; if (L[m][0] <= t) lo = m + 1; else hi = m; } return lo; }
  function recount() {
    cnt = new Array(NP).fill(0);
    S.forEach(function (s) { s.n = new Array(NP).fill(0); });
    for (var j = 0; j < st.ptr; j++) { var x = L[j]; cnt[x[1]]++; S[x[2]].n[x[1]]++; }
  }
  function seek(t) { st.t = Math.max(0, Math.min(tEnd, t)); st.ptr = lowerBound(st.t); flights = []; flashes = []; ev = []; cam.tLon = null; recount(); lastShown = -1; for (var j = st.ptr - 1; j >= 0; j--) if (pass(L[j])) { lastShown = j; break; } ui(true); kick(); }
  function rate(t) { // days per second: a busy year gets more screen time, so 2025 (329 launches) runs ~5x slower than 1960
    var y = YC[yearOf(t) - y0], n = 0; if (y) for (var k = 0; k < NP; k++) if (sel[k]) n += y[k];
    return 365.25 / (1 + 0.02 * n) * st.speed;
  }
  function advance(dt, now) {
    var t1 = Math.min(tEnd, st.t + rate(st.t) * dt), spawned = 0, cap = CAP();
    tokens = Math.min(cap, tokens + dt * cap * 1000 / FD);
    while (st.ptr < L.length && L[st.ptr][0] <= t1) {
      var i = st.ptr++, x = L[i];
      cnt[x[1]]++; S[x[2]].n[x[1]]++;
      if (!pass(x)) continue;
      lastShown = i;
      ev.push({ v: siteXYZ[x[2]], w: PRIO[x[1]] ? 1.25 : 1, t: now }); cam.lastEv = now;
      if (!reduce) flashes.push({ site: x[2], born: now, dur: 700, col: pvc[x[1]] });
      if (flights.length >= cap || spawned >= 8) continue;
      var prio = !!PRIO[x[1]], vis = S[x[2]].vis !== false;
      if (prio || (vis && tokens >= 1)) { if (!prio) tokens -= 1; flights.push(makeFlight(i, now - spawned * 90)); spawned++; }
    }
    st.t = t1;
    if (st.t >= tEnd) setPlaying(false);
  }

  /* ---------- UI ---------- */
  var totEl = $("lg-ctot"), cyEl = $("lg-cy"), cylEl = $("lg-cyl"), prevUi = "", chips = [];
  function landingText(x) {
    var land = x[6]; if (!land || !land.length) return "";
    var c = land[0], k = c[0], where = c.split(":")[1] || "", core = /Falcon Heavy/.test(V[x[5]]) ? "Center core " : "Booster ";
    var w = where === "drone ship" ? "a drone ship" : where === "ground pad" ? "a landing pad" : where;
    if (k === "S") return core + "landed on " + w;
    if (k === "F") return core + "landing failed" + (where ? " (" + where + ")" : "");
    if (k === "P") return core + "landed" + (where ? " on " + w : "") + ", then was lost";
    if (k === "O") return core + "made a controlled ocean splashdown (test)";
    if (k === "X") return "No booster landing (launch failed first)";
    return "No booster landing attempt";
  }
  function launchText(i) {
    var x = L[i], ship = x[7] === 1;
    var out = x[4] === "S" ? "Success" : x[4] === "P" ? "Partial failure" : "Failure";
    var parts = [x[3] || "Unnamed payload", ship ? "Starship flight test" : V[x[5]], PV[x[1]].short, S[x[2]].name, out], lt = landingText(x);
    if (lt) parts.push(lt);
    return parts;
  }
  function ui(force) {
    var m = monthIdx(st.t), cyr = yearOf(st.t);
    var key = m + "|" + st.ptr + "|" + lastShown + "|" + sel.join("");
    if (key === prevUi && !force) return;
    var tnow = performance.now();
    if (!force && st.playing && tnow - lastUiT < 110) return; // ~9 text/bar updates a second while playing is plenty
    prevUi = key; lastUiT = tnow;
    var tot = 0; for (var k = 0; k < NP; k++) if (sel[k]) tot += cnt[k];
    totEl.textContent = tot.toLocaleString();
    var yc = yearCounts(cyr), ny = 0; for (k = 0; k < NP; k++) if (sel[k]) ny += yc[k];
    cylEl.textContent = "In " + cyr; cyEl.textContent = ny.toLocaleString();
    chips.forEach(function (c) { c.n.textContent = cnt[c.k].toLocaleString(); });
    var lbl = fmtM(Math.min(m, mStart + nMonths)); yl.textContent = lbl; dateEl.textContent = lbl;
    scrub.value = Math.max(0, Math.min(nMonths, m - mStart)); scrub.setAttribute("aria-valuetext", lbl);
    if (lastShown >= 0) {
      var x2 = L[lastShown], pr = launchText(lastShown);
      lastEl.innerHTML = ""; var dot = document.createElement("i"); dot.className = "lg-dot pv-" + x2[1]; lastEl.appendChild(dot);
      var b = document.createElement("b"); b.textContent = pr[0]; lastEl.appendChild(b);
      lastEl.appendChild(document.createTextNode(" · " + pr.slice(1).join(" · ")));
      if (x2[4] !== "S") { var fx = document.createElement("span"); fx.className = "lg-fx"; fx.textContent = x2[4] === "F" ? " ✕" : " ┄"; fx.setAttribute("aria-hidden", "true"); lastEl.appendChild(fx); }
    } else lastEl.innerHTML = "&nbsp;";
    drawBars();
    if (hoverYear == null) ybInfo.textContent = yearText(cyr);
  }
  function setPlaying(on) {
    if (on && st.t >= tEnd) seek(0);
    st.playing = on; playB.textContent = on ? "❚❚" : "▶"; playB.setAttribute("aria-label", on ? "Pause" : "Play");
    root.classList.toggle("is-playing", on); if (!on) ui(true); kick();
  }

  /* ---------- legend / filters ---------- */
  function buildLegend() {
    legend.innerHTML = "";
    order.forEach(function (k) {
      var p = PV[k], b = document.createElement("button");
      b.type = "button"; b.className = "lg-chip pv-" + k + (PRIO[k] ? " prio" : ""); b.setAttribute("aria-pressed", "true"); b.title = p.name;
      b.innerHTML = '<i class="lg-dot pv-' + k + '" aria-hidden="true"></i><span class="nm"></span><span class="n"></span>';
      b.querySelector(".nm").textContent = p.short;
      b.addEventListener("click", function () { sel[k] = sel[k] ? 0 : 1; if (!sel.some(function (v) { return v; })) sel[k] = 1; applySel(); });
      legend.appendChild(b); chips.push({ k: k, b: b, n: b.querySelector(".n") });
    });
  }
  function applySel() {
    chips.forEach(function (c) { c.b.setAttribute("aria-pressed", sel[c.k] ? "true" : "false"); });
    flights = flights.filter(function (f) { return sel[f.pv]; });
    if (lastShown >= 0 && !pass(L[lastShown])) { lastShown = -1; for (var j = st.ptr - 1; j >= 0; j--) if (pass(L[j])) { lastShown = j; break; } }
    root.querySelectorAll("[data-quick]").forEach(function (b) {
      var q = b.getAttribute("data-quick"), on = q === "all" ? sel.every(function (v) { return v; }) : sel.every(function (v, k) { return v === (PRIO[k] ? 1 : 0); });
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    hidePadTip(); ui(true); kick();
  }
  root.querySelectorAll("[data-quick]").forEach(function (b) {
    b.addEventListener("click", function () {
      var q = b.getAttribute("data-quick");
      for (var k = 0; k < NP; k++) sel[k] = q === "all" ? 1 : PRIO[k] ? 1 : 0;
      applySel();
    });
  });

  /* ---------- loop ---------- */
  function autoCam() { return st.follow && !drag; }
  function needsFrame() { return st.visible && !document.hidden && (st.playing || resetAnim || flights.length || flashes.length || drag || (autoCam() && !reduce) || Math.abs(cam.vLon) + Math.abs(cam.vLat) > 0.05); }
  function angDiff(a, b) { var d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function toV(lon, lat) { var lo = lon * DEG, la = lat * DEG; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
  function kern(d) { return d > COS_R ? (d - COS_R) / (1 - COS_R) : 0; }
  function clusterAt(c, now) { // weighted activity within ~50 degrees of unit vector c, and its centroid
    var sc = 0, m = [0, 0, 0];
    for (var j = 0; j < ev.length; j++) {
      var e = ev[j], k = kern(dot3(c, e.v)); if (!k) continue;
      var w = e.w * Math.exp(-(now - e.t) / 1600) * k; sc += w; m[0] += e.v[0] * w; m[1] += e.v[1] * w; m[2] += e.v[2] * w;
    }
    return { s: sc, m: m };
  }
  function pickTarget(now) {
    while (ev.length && now - ev[0].t > EV_MS) ev.shift();
    if (ev.length > 60) ev.splice(0, ev.length - 60);
    if (!ev.length) return;
    var hasT = cam.tLon != null, tv = hasT ? toV(cam.tLon, cam.tLat) : null, best = null, far = null, from = Math.max(0, ev.length - 30);
    for (var i = from; i < ev.length; i++) {
      var c = clusterAt(ev[i].v, now); c.v = ev[i].v;
      if (!best || c.s > best.s) best = c;
      if (hasT && dot3(c.v, tv) < Math.cos(40 * DEG) && (!far || c.s > far.s)) far = c;
    }
    function aim(c) {
      var m = c.m, mm = Math.hypot(m[0], m[1], m[2]); if (!mm) return false;
      // tilt toward the cluster, but not all the way, so mid-latitude context stays in view; Plesetsk (63 N) lands near 48
      cam.tLon = Math.atan2(m[1], m[0]) / DEG; cam.tLat = Math.max(-28, Math.min(48, Math.asin(m[2] / mm) / DEG * 0.78 + 4));
      cam.since = null; return true; // the dwell clock starts once the camera arrives
    }
    if (!hasT) { if (ev.length >= 3 || now - ev[0].t > 700) aim(best); return; } // wait for a few launches before the first turn
    var cur = clusterAt(tv, now);
    var dwell = cam.since == null ? 0 : now - cam.since;
    if (far && dwell >= DWELL && far.s > cur.s * 1.4 + 0.15) { aim(far); return; }        // the action clearly moved elsewhere
    if (far && dwell >= TOUR && far.s >= cur.s * 0.45 && far.s > 1) { aim(far); return; }  // or take a turn on the other busy side
    var mm = Math.hypot(cur.m[0], cur.m[1], cur.m[2]);
    if (mm) { // drift gently with the current cluster
      var lon = Math.atan2(cur.m[1], cur.m[0]) / DEG, lat = Math.max(-28, Math.min(48, Math.asin(cur.m[2] / mm) / DEG * 0.78 + 4));
      cam.tLon += angDiff(lon, cam.tLon) * 0.3; cam.tLat += (lat - cam.tLat) * 0.3;
    }
  }
  function moveCam(dt, now) {
    var w = reduce ? 0.9 : 1.5, maxV = reduce ? 14 : 50, aLon, aLat;
    if (st.playing && now - cam.lastEv > 2600) cam.tLon = null; // nothing launching lately: go back to a slow drift
    if (st.playing && now >= cam.nextPick) { cam.nextPick = now + PICK_MS; pickTarget(now); }
    if (cam.tLon != null && cam.since == null && Math.abs(angDiff(cam.tLon, st.lon)) < 8 && Math.abs(cam.tLat - st.lat) < 6) cam.since = now; // arrived
    if (st.playing && cam.tLon != null) {
      aLon = w * w * angDiff(cam.tLon, st.lon) - 2 * w * cam.vLon;
      aLat = w * w * (cam.tLat - st.lat) - 2 * w * cam.vLat;
    } else if (reduce) { // reduced motion: no idle spin, just settle where it is
      aLon = -3 * cam.vLon; aLat = -3 * cam.vLat;
    } else { // slow spin (faster while playing), easing the tilt back toward the default
      aLon = 1.2 * ((st.playing ? 6 : 4) - cam.vLon);
      aLat = w * w * 0.3 * (HOME.lat - st.lat) - 2 * w * 0.55 * cam.vLat;
    }
    cam.vLon = Math.max(-maxV, Math.min(maxV, cam.vLon + aLon * dt)); cam.vLat = Math.max(-maxV, Math.min(maxV, cam.vLat + aLat * dt));
    st.lon += cam.vLon * dt; st.lat = Math.max(-60, Math.min(60, st.lat + cam.vLat * dt));
  }
  function setFollow(on) {
    st.follow = !!on; st.user = !on;
    if (!on) { cam.vLon = 0; cam.vLat = 0; } else { cam.tLon = null; cam.since = -1e9; }
    if (followB) followB.setAttribute("aria-pressed", on ? "true" : "false");
    kick();
  }
  function frame(now) {
    raf = 0;
    var dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0; lastFrame = now;
    if (resetAnim) {
      var ra = Math.min(1, (now - resetAnim.t0) / 900), e3 = ra < 0.5 ? 4 * ra * ra * ra : 1 - Math.pow(-2 * ra + 2, 3) / 2;
      st.lon = resetAnim.lon0 + angDiff(HOME.lon, resetAnim.lon0) * e3; st.lat = resetAnim.lat0 + (HOME.lat - resetAnim.lat0) * e3;
      if (ra >= 1) { resetAnim = null; cam.since = now; }
    } else if (autoCam()) moveCam(dt, now);
    if (st.playing) advance(dt, now);
    var idle = !st.playing && !flights.length && !flashes.length && !drag;
    if (!idle || now - lastDraw > 33) { draw(now); lastDraw = now; } // idle spin renders at ~30 fps to save battery
    ui();
    if (needsFrame()) raf = requestAnimationFrame(frame); else lastFrame = 0;
  }
  function kick() { if (!raf) { if (!needsFrame()) { lastFrame = 0; if (R) draw(performance.now()); return; } raf = requestAnimationFrame(frame); } }

  /* ---------- size ---------- */
  function resize() {
    var w = stage.clientWidth; if (!w) return;
    var h = w < 600 ? Math.round(w * 1.04) : Math.round(Math.min(620, Math.max(420, w * 0.58)));
    dpr = Math.min(2, window.devicePixelRatio || 1); W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px";
    R = Math.min(w, h) * (w < 600 ? 0.35 : 0.36); cx = w / 2; cy = h * (w < 600 ? 0.56 : 0.55);
    drawBars(); kick();
  }

  /* ---------- interaction ---------- */
  var drag = null;
  function hidePadTip() { tip.hidden = true; }
  function padTip(px, py) {
    var hits = [];
    S.forEach(function (s, i) { if (s.vis && (s.tot || s.up)) { var d = Math.hypot(s.sx - px, s.sy - py); if (d < 16) hits.push({ s: s, i: i, d: d }); } });
    if (!hits.length) { hidePadTip(); return false; }
    hits.sort(function (a, b) { return a.d - b.d; }); hits = hits.slice(0, 2);
    var through = fmtM(monthIdx(st.t));
    tip.innerHTML = "";
    hits.forEach(function (h) {
      var box = document.createElement("div"); box.className = "lg-tp";
      var b = document.createElement("b"); b.textContent = h.s.name; box.appendChild(b);
      var sp_ = document.createElement("span"); sp_.textContent = h.s.tot.toLocaleString() + " launch" + (h.s.tot === 1 ? "" : "es") + " through " + through; box.appendChild(sp_);
      var ks = order.filter(function (k) { return sel[k] && h.s.n[k]; }).sort(function (a, c) { return h.s.n[c] - h.s.n[a]; });
      if (ks.length) {
        var ul = document.createElement("ul");
        ks.slice(0, 4).forEach(function (k) { var li = document.createElement("li"); li.innerHTML = '<i class="lg-dot pv-' + k + '"></i>'; li.appendChild(document.createTextNode(PV[k].short + " " + h.s.n[k].toLocaleString())); ul.appendChild(li); });
        if (ks.length > 4) { var li = document.createElement("li"); li.textContent = "+" + (ks.length - 4) + " more"; ul.appendChild(li); }
        box.appendChild(ul);
      }
      if (h.s.up && st.t >= tEnd - 0.01) { var em = document.createElement("em"); em.textContent = upText(h.s.up); box.appendChild(em); }
      tip.appendChild(box);
    });
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight, x = hits[0].s.sx + 14, y = hits[0].s.sy - th - 10;
    if (x + tw > W - 6) x = Math.max(6, hits[0].s.sx - tw - 14);
    if (y < 6) y = Math.min(H - th - 6, hits[0].s.sy + 14);
    tip.style.left = x + "px"; tip.style.top = y + "px";
    return true;
  }
  function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener("pointerdown", function (e) {
    var p = pt(e); drag = { x: p[0], y: p[1], lon: st.lon, lat: st.lat, moved: false, id: e.pointerId, touch: e.pointerType !== "mouse" };
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  });
  cv.addEventListener("pointermove", function (e) {
    var p = pt(e);
    if (drag && drag.id === e.pointerId) {
      var dx = p[0] - drag.x, dy = p[1] - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; hidePadTip(); }
      if (drag.moved) {
        if (st.follow) setFollow(false); // dragging pauses follow mode
        st.lon = drag.lon - dx / R / DEG * 0.9;
        if (!drag.touch) st.lat = Math.max(-70, Math.min(70, drag.lat + dy / R / DEG * 0.9));
        kick();
      }
    } else if (e.pointerType === "mouse") padTip(p[0], p[1]);
  });
  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    var wasDrag = drag.moved, p = pt(e); drag = null;
    if (!wasDrag && e.type === "pointerup") { if (!padTip(p[0], p[1])) hidePadTip(); }
    kick();
  }
  cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !drag) hidePadTip(); });
  cv.addEventListener("keydown", function (e) {
    var d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key];
    if (!d) return; e.preventDefault(); if (st.follow) setFollow(false);
    st.lon += d[0]; st.lat = Math.max(-70, Math.min(70, st.lat + d[1])); kick();
  });
  var followB = $("lg-follow");
  followB.addEventListener("click", function () { setFollow(!st.follow); });
  $("lg-reset").addEventListener("click", function () {
    if (reduce) { cam.vLon = 0; cam.vLat = 0; st.lon = HOME.lon; st.lat = HOME.lat; setFollow(true); return; } // snap, no animated swing
    // ease back to the default view, then carry on following
    cam.vLon = 0; cam.vLat = 0; st.lon = st.lon % 360; resetAnim = { t0: performance.now(), lon0: st.lon, lat0: st.lat }; setFollow(true);
  });
  playB.addEventListener("click", function () { st.touched = true; setPlaying(!st.playing); });
  scrub.addEventListener("input", function () { var v = +scrub.value; st.touched = true; setPlaying(false); seek(monthDay(mStart + v + 1) - 0.001); });
  spdSel.addEventListener("change", function () { st.speed = +spdSel.value; });
  root.addEventListener("keydown", function (e) {
    if ((e.key === " " || e.key === "Spacebar") && !/^(INPUT|SELECT|BUTTON|TEXTAREA|A|CANVAS)$/.test(e.target.tagName)) { e.preventDefault(); st.touched = true; setPlaying(!st.playing); }
  });
  function barYear(e) { var r = yb.getBoundingClientRect(); return Math.max(y0, Math.min(y1, y0 + Math.floor((e.clientX - r.left) / r.width * (y1 - y0 + 1)))); }
  yb.addEventListener("pointermove", function (e) { hoverYear = barYear(e); ybInfo.textContent = yearText(hoverYear); drawBars(); });
  yb.addEventListener("pointerleave", function () { hoverYear = null; ybInfo.textContent = yearText(yearOf(st.t)); drawBars(); });
  yb.addEventListener("click", function (e) { var y = barYear(e); st.touched = true; setPlaying(false); seek(Math.min(tEnd, monthDay(y * 12 + 12) - 0.001)); });
  yb.addEventListener("keydown", function (e) {
    var d = { ArrowLeft: -1, ArrowRight: 1, Home: -999, End: 999 }[e.key]; if (!d) return; e.preventDefault();
    var y = Math.max(y0, Math.min(y1, yearOf(st.t) + d)); st.touched = true; setPlaying(false); seek(Math.min(tEnd, monthDay(y * 12 + 12) - 0.001));
  });
  document.addEventListener("visibilitychange", kick);
  new MutationObserver(function () { readColors(); drawBars(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- upcoming launches (from launchcal.js) ---------- */
  function setUpcoming(list) {
    if (!S || !R) { window.__lgUpcoming = list; return; }
    S.forEach(function (s) { s.up = null; });
    (list || []).forEach(function (u) { if (u.gsite != null && S[u.gsite] && !S[u.gsite].up) S[u.gsite].up = u; });
    var k = root.querySelector(".lg-key-up"); if (k) k.hidden = !S.some(function (s) { return s.up; });
    kick();
  }
  document.addEventListener("lg:upcoming", function (e) { setUpcoming(e.detail); });
  function upText(u) {
    var d = new Date(u.net), tz = "America/New_York";
    var day = /^(min|hour|day|week)$/.test(u.prec) ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d) : new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "numeric" }).format(d);
    return "Next: " + u.name + " (" + PV[u.pv].short + "), " + day + " · " + (u.status || "TBD");
  }

  /* ---------- init ---------- */
  function init(data) {
    D = data; L = D.launches; S = D.sites; PV = D.meta.providers; NP = PV.length; V = D.meta.vehicles; T0 = Date.UTC(D.meta.t0, 0, 1);
    PV.forEach(function (p, k) { if (p.key === "spx" || p.key === "rlab") PRIO[k] = 1; });
    sel = new Array(NP).fill(1);
    var ld = D.land; landXYZ = new Float32Array(ld.length / 2 * 3);
    for (var i = 0, k = 0; i < ld.length; i += 2, k += 3) { var v = vec(ld[i], ld[i + 1]); landXYZ[k] = v[0]; landXYZ[k + 1] = v[1]; landXYZ[k + 2] = v[2]; }
    siteXYZ = S.map(function (s) { return vec(s.lon, s.lat); });
    y0 = yearOf(L[0][0]); y1 = yearOf(L[L.length - 1][0]);
    YC = []; yStartIdx = [];
    for (var y = y0; y <= y1; y++) YC.push(new Array(NP).fill(0));
    L.forEach(function (x, j) { var yy = yearOf(x[0]) - y0; YC[yy][x[1]]++; if (yStartIdx[yy] == null) yStartIdx[yy] = j; });
    var totals = new Array(NP).fill(0); L.forEach(function (x) { totals[x[1]]++; });
    var other = PV.length - 1;
    order = PV.map(function (p, k) { return k; }).sort(function (a, b) { return (PRIO[b] || 0) - (PRIO[a] || 0) || (a === other) - (b === other) || totals[b] - totals[a]; });
    mStart = monthIdx(L[0][0]); var mEnd = monthIdx(L[L.length - 1][0]); nMonths = mEnd - mStart;
    tEnd = monthDay(mEnd + 1) - 0.001;
    scrub.max = nMonths; scrub.value = nMonths;
    root.setAttribute("data-n", L.length);
    window.__lgSites = S; window.__lgProviders = PV;
    window.__lgView = function () { return { lon: st.lon, lat: st.lat, follow: st.follow, target: cam.tLon == null ? null : [cam.tLon, cam.tLat] }; }; // read-only, for tests
    try { document.dispatchEvent(new CustomEvent("lg:ready")); } catch (e) {}
    S.forEach(function (s) { s.n = new Array(NP).fill(0); });
    readColors(); buildLegend(); resize();
    seek(tEnd);
    if (window.__lgUpcoming) setUpcoming(window.__lgUpcoming);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(stage); else window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          st.visible = en.isIntersecting;
          if (en.isIntersecting && en.intersectionRatio >= 0.35 && !st.autoplayed && !st.touched) { st.autoplayed = true; seek(0); setPlaying(true); }
          kick();
        });
      }, { threshold: [0, 0.35] }).observe(stage);
    }
  }
  fetch("/assets/data/launch_globe.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(init).catch(function (e) {
    lastEl.textContent = "The launch data didn't load. Try refreshing the page."; lastEl.classList.add("bo-err");
    if (window.console) console.warn(e);
  });
})();
