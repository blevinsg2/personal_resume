/* Easter egg: five tiny canvas games. Loaded only when the rocket is clicked. No network requests. */
(function () {
  "use strict";
  var W = 480, H = 320, KEY = "egg-hi-";
  var css = getComputedStyle(document.documentElement);
  function C(v) { return css.getPropertyValue(v).trim() || "#888"; }
  var col = {};
  function readColors() { css = getComputedStyle(document.documentElement); col = { bg: C("--surface"), ink: C("--ink"), mut: C("--muted"), acc: C("--accent"), line: C("--line"), warn: "#e5484d" }; }
  function best(id) { try { return +localStorage.getItem(KEY + id) || 0; } catch (e) { return 0; } }
  function saveBest(id, s) { try { if (s > best(id)) localStorage.setItem(KEY + id, s); } catch (e) {} }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- games: each returns {reset, step(dt, I), draw(g), pad, tip} ---------------- */
  var GAMES = [
    { id: "pong", name: "Pong", tip: "↑ ↓ or drag to move. First to 5 wins.", pad: ["up", "down"], make: function (api) {
      var p, a, b, ps, as;
      function serve(d) { b = { x: W / 2, y: H / 2, vx: 220 * d, vy: rnd(-120, 120) }; }
      return {
        reset: function () { p = H / 2; a = H / 2; ps = 0; as = 0; serve(1); },
        step: function (dt, I) {
          if (I.ptrY != null) p += clamp(I.ptrY - p, -420 * dt, 420 * dt); else p += ((I.down ? 1 : 0) - (I.up ? 1 : 0)) * 320 * dt;
          p = clamp(p, 30, H - 30); a += clamp(b.y - a, -190 * dt, 190 * dt); a = clamp(a, 30, H - 30);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y < 6 || b.y > H - 6) { b.vy *= -1; b.y = clamp(b.y, 6, H - 6); }
          if (b.vx < 0 && b.x < 26 && b.x > 12 && Math.abs(b.y - p) < 34) { b.vx = Math.abs(b.vx) * 1.06; b.vy += (b.y - p) * 6; }
          if (b.vx > 0 && b.x > W - 26 && b.x < W - 12 && Math.abs(b.y - a) < 34) { b.vx = -Math.abs(b.vx) * 1.04; b.vy += (b.y - a) * 4; }
          if (b.x < -10) { as++; serve(1); } if (b.x > W + 10) { ps++; api.score(ps); serve(-1); }
          if (as >= 5) api.over("Game over"); else if (ps >= 5) api.over("You win");
        },
        draw: function (g) {
          g.fillStyle = col.line; for (var y = 8; y < H; y += 20) g.fillRect(W / 2 - 1, y, 2, 10);
          g.fillStyle = col.acc; g.fillRect(14, p - 30, 8, 60); g.fillStyle = col.ink; g.fillRect(W - 22, a - 30, 8, 60);
          g.beginPath(); g.arc(b.x, b.y, 6, 0, 7); g.fill();
          g.font = "600 28px Inter, sans-serif"; g.textAlign = "center"; g.fillStyle = col.mut; g.fillText(ps + "   " + as, W / 2, 40);
        } };
    } },
    { id: "asteroids", name: "Asteroids", tip: "← → rotate, ↑ thrust, Space fires.", pad: ["left", "up", "right", "fire"], make: function (api) {
      var s, rocks, shots, cool, sc, lives, inv, lvl;
      function rock(x, y, r) { var a = rnd(0, 6.28), v = rnd(30, 70) * (40 / r); return { x: x, y: y, r: r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, k: Array.from({ length: 9 }, function () { return rnd(.75, 1.15); }) }; }
      function wave() { lvl++; for (var i = 0; i < 2 + lvl; i++) rocks.push(rock(rnd(0, W), Math.random() < .5 ? 0 : H, 34)); }
      function wrap(o) { o.x = (o.x + W) % W; o.y = (o.y + H) % H; }
      return {
        reset: function () { s = { x: W / 2, y: H / 2, a: -1.57, vx: 0, vy: 0 }; rocks = []; shots = []; cool = 0; sc = 0; lives = 3; inv = 2; lvl = 0; wave(); },
        step: function (dt, I) {
          s.a += ((I.right ? 1 : 0) - (I.left ? 1 : 0)) * 4 * dt;
          if (I.up) { s.vx += Math.cos(s.a) * 220 * dt; s.vy += Math.sin(s.a) * 220 * dt; }
          s.vx *= .992; s.vy *= .992; s.x += s.vx * dt; s.y += s.vy * dt; wrap(s);
          cool -= dt; inv -= dt;
          if (I.fire && cool <= 0) { cool = .22; shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: Math.cos(s.a) * 380 + s.vx, vy: Math.sin(s.a) * 380 + s.vy, t: .9 }); }
          shots.forEach(function (o) { o.x += o.vx * dt; o.y += o.vy * dt; o.t -= dt; wrap(o); });
          rocks.forEach(function (o) { o.x += o.vx * dt; o.y += o.vy * dt; wrap(o); });
          shots = shots.filter(function (o) {
            for (var i = 0; i < rocks.length; i++) { var r = rocks[i]; if (Math.hypot(o.x - r.x, o.y - r.y) < r.r) {
              rocks.splice(i, 1); sc += r.r > 30 ? 20 : r.r > 18 ? 50 : 100; api.score(sc);
              if (r.r > 12) { rocks.push(rock(r.x, r.y, r.r / 2)); rocks.push(rock(r.x, r.y, r.r / 2)); } return false; } }
            return o.t > 0; });
          if (!rocks.length) wave();
          if (inv <= 0) for (var i = 0; i < rocks.length; i++) if (Math.hypot(s.x - rocks[i].x, s.y - rocks[i].y) < rocks[i].r + 8) {
            lives--; inv = 2; s.x = W / 2; s.y = H / 2; s.vx = s.vy = 0; if (lives <= 0) api.over("Game over"); break; }
        },
        draw: function (g) {
          g.strokeStyle = col.ink; g.lineWidth = 1.5;
          rocks.forEach(function (o) { g.beginPath(); o.k.forEach(function (k, i) { var t = i / 9 * 6.283; g[i ? "lineTo" : "moveTo"](o.x + Math.cos(t) * o.r * k, o.y + Math.sin(t) * o.r * k); }); g.closePath(); g.stroke(); });
          g.fillStyle = col.acc; shots.forEach(function (o) { g.fillRect(o.x - 1.5, o.y - 1.5, 3, 3); });
          if (inv <= 0 || Math.floor(inv * 8) % 2) { g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.strokeStyle = col.acc; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -7); g.lineTo(-4, 0); g.lineTo(-8, 7); g.closePath(); g.stroke(); g.restore(); }
          g.fillStyle = col.mut; g.font = "500 13px Inter, sans-serif"; g.textAlign = "left"; g.fillText("Lives " + lives, 10, 20);
        } };
    } },
    { id: "snake", name: "Snake", tip: "Arrow keys or swipe to steer.", pad: ["left", "up", "down", "right"], make: function (api) {
      var G = 20, cw = W / G, rh = H / G, sn, dir, nd, food, t, sc;
      function place() { do { food = { x: Math.floor(rnd(0, cw)), y: Math.floor(rnd(0, rh)) }; } while (sn.some(function (q) { return q.x === food.x && q.y === food.y; })); }
      return {
        reset: function () { sn = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]; dir = { x: 1, y: 0 }; nd = dir; t = 0; sc = 0; place(); },
        step: function (dt, I) {
          var want = I.left ? { x: -1, y: 0 } : I.right ? { x: 1, y: 0 } : I.up ? { x: 0, y: -1 } : I.down ? { x: 0, y: 1 } : null;
          if (want && (want.x !== -dir.x || want.y !== -dir.y)) nd = want;
          t += dt; var sp = Math.max(.06, .13 - sc * .002); if (t < sp) return; t = 0; dir = nd;
          var h = { x: sn[0].x + dir.x, y: sn[0].y + dir.y };
          if (h.x < 0 || h.y < 0 || h.x >= cw || h.y >= rh || sn.some(function (q) { return q.x === h.x && q.y === h.y; })) return api.over("Game over");
          sn.unshift(h); if (h.x === food.x && h.y === food.y) { sc++; api.score(sc); place(); } else sn.pop();
        },
        draw: function (g) {
          g.fillStyle = col.warn; g.beginPath(); g.arc(food.x * G + G / 2, food.y * G + G / 2, G / 2 - 3, 0, 7); g.fill();
          sn.forEach(function (q, i) { g.fillStyle = i ? col.ink : col.acc; g.globalAlpha = i ? Math.max(.35, 1 - i / sn.length) : 1; g.fillRect(q.x * G + 2, q.y * G + 2, G - 4, G - 4); });
          g.globalAlpha = 1;
        } };
    } },
    { id: "breakout", name: "Breakout", tip: "← → or drag to move the paddle.", pad: ["left", "right"], make: function (api) {
      var px, b, br, sc, lives, stuck;
      function bricks() { br = []; for (var r = 0; r < 5; r++) for (var c = 0; c < 10; c++) br.push({ x: 8 + c * 46.4, y: 40 + r * 18, r: r }); }
      function ball() { stuck = true; b = { x: px, y: H - 30, vx: 150 * (Math.random() < .5 ? -1 : 1), vy: -240 }; }
      return {
        reset: function () { px = W / 2; sc = 0; lives = 3; bricks(); ball(); },
        step: function (dt, I) {
          if (I.ptrX != null) px += clamp(I.ptrX - px, -600 * dt, 600 * dt); else px += ((I.right ? 1 : 0) - (I.left ? 1 : 0)) * 380 * dt;
          px = clamp(px, 36, W - 36);
          if (stuck) { b.x = px; b.y = H - 30; stuck = false; }
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < 5 || b.x > W - 5) { b.vx *= -1; b.x = clamp(b.x, 5, W - 5); } if (b.y < 5) { b.vy = Math.abs(b.vy); }
          if (b.vy > 0 && b.y > H - 24 && b.y < H - 12 && Math.abs(b.x - px) < 40) { b.vy = -Math.abs(b.vy) * 1.01; b.vx = (b.x - px) * 6; }
          for (var i = 0; i < br.length; i++) { var k = br[i]; if (b.x > k.x && b.x < k.x + 42 && b.y > k.y && b.y < k.y + 14) { br.splice(i, 1); b.vy *= -1; sc += 10 * (5 - k.r); api.score(sc); break; } }
          if (!br.length) { bricks(); ball(); }
          if (b.y > H + 10) { lives--; if (lives <= 0) return api.over("Game over"); ball(); }
        },
        draw: function (g) {
          br.forEach(function (k) { g.fillStyle = col.acc; g.globalAlpha = 1 - k.r * .14; g.fillRect(k.x, k.y, 42, 14); }); g.globalAlpha = 1;
          g.fillStyle = col.ink; g.fillRect(px - 36, H - 18, 72, 8); g.beginPath(); g.arc(b.x, b.y, 5, 0, 7); g.fill();
          g.fillStyle = col.mut; g.font = "500 13px Inter, sans-serif"; g.textAlign = "left"; g.fillText("Lives " + lives, 10, 20);
        } };
    } },
    { id: "rocket", name: "Rocket", tip: "Space, ↑ or tap to boost through the gaps.", pad: ["fire"], make: function (api) {
      var y, v, walls, t, sc, stars, was;
      return {
        reset: function () { y = H / 2; v = 0; walls = []; t = 1; sc = 0; was = false; stars = Array.from({ length: 40 }, function () { return { x: rnd(0, W), y: rnd(0, H), s: rnd(.3, 1) }; }); },
        step: function (dt, I) {
          var press = I.fire || I.up || I.tap; if (press && !was) v = -215; was = press;
          v += 640 * dt; y += v * dt;
          t -= dt; if (t <= 0) { t = 1.5; walls.push({ x: W + 20, gap: rnd(70, H - 70), pass: false }); }
          walls.forEach(function (w) { w.x -= 140 * dt; if (!w.pass && w.x < 90) { w.pass = true; sc++; api.score(sc); } });
          walls = walls.filter(function (w) { return w.x > -40; });
          stars.forEach(function (s) { s.x -= 40 * s.s * dt; if (s.x < 0) s.x = W; });
          if (y < 0 || y > H) return api.over("Game over");
          for (var i = 0; i < walls.length; i++) { var w = walls[i]; if (100 + 10 > w.x && 100 - 10 < w.x + 30 && Math.abs(y - w.gap) > 52) return api.over("Game over"); }
        },
        draw: function (g) {
          g.fillStyle = col.mut; stars.forEach(function (s) { g.globalAlpha = s.s * .6; g.fillRect(s.x, s.y, 2, 2); }); g.globalAlpha = 1;
          g.fillStyle = col.ink; walls.forEach(function (w) { g.fillRect(w.x, 0, 30, w.gap - 52); g.fillRect(w.x, w.gap + 52, 30, H); });
          g.save(); g.translate(100, y); g.rotate(clamp(v / 600, -.5, .7) + 1.57);
          g.fillStyle = col.acc; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(7, -2, 6, 8); g.lineTo(-6, 8); g.quadraticCurveTo(-7, -2, 0, -12); g.fill();
          g.fillStyle = "#f59e0b"; g.beginPath(); g.moveTo(-4, 9); g.lineTo(0, 16 + Math.random() * 4); g.lineTo(4, 9); g.fill(); g.restore();
        } };
    } }
  ];

  /* ---------------- modal ---------------- */
  var dpr = 1, M, cv, g, gi = -1, game, state = "ready", raf = 0, last = 0, score = 0, opener = null, I = {}, keys = {}, ptr = null;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ICON = { up: "▲", down: "▼", left: "◀", right: "▶", fire: "●" };
  var LBL = { up: "Up", down: "Down", left: "Left", right: "Right", fire: "Fire or boost" };
  function build() {
    M = document.createElement("div"); M.className = "egg-modal"; M.hidden = true;
    M.innerHTML = '<div class="egg-backdrop" data-egg-close></div><div class="egg-box" role="dialog" aria-modal="true" aria-labelledby="egg-title">' +
      '<div class="egg-head"><div><span class="egg-k">Mini game</span><h2 id="egg-title"></h2></div>' +
      '<div class="egg-sc" aria-live="polite"><span>Score <b id="egg-score">0</b></span><span>Best <b id="egg-best">0</b></span></div>' +
      '<button type="button" class="egg-btn" data-egg-next>Next game</button><button type="button" class="egg-x" data-egg-close aria-label="Close">×</button></div>' +
      '<div class="egg-stage"><canvas id="egg-cv" width="' + W + '" height="' + H + '" tabindex="0" role="application" aria-label="Game area. Use the arrow keys and Space; press Space to start."></canvas></div>' +
      '<div class="egg-foot"><p id="egg-tip"></p><div class="egg-pad" id="egg-pad"></div></div></div>';
    document.body.appendChild(M);
    cv = M.querySelector("canvas"); dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; g = cv.getContext("2d");
    M.addEventListener("click", function (e) { if (e.target.closest("[data-egg-close]")) close(); else if (e.target.closest("[data-egg-next]")) pick(true); });
    M.addEventListener("keydown", onKey); document.addEventListener("keyup", function (e) { keys[e.key] = false; });
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
    cv.addEventListener("pointerdown", function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); ptr = pos(e); ptr.x0 = ptr.x; ptr.y0 = ptr.y; I.tap = true; if (state !== "play") start(); });
    cv.addEventListener("pointermove", function (e) { if (ptr) { var p = pos(e); ptr.x = p.x; ptr.y = p.y; } });
    cv.addEventListener("pointerup", function () { if (ptr && game && GAMES[gi].id === "snake") { var dx = ptr.x - ptr.x0, dy = ptr.y - ptr.y0; if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) { swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); swipeT = .2; } } ptr = null; I.tap = false; });
    cv.addEventListener("pointercancel", function () { ptr = null; I.tap = false; });
  }
  var swipe = null, swipeT = 0;
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function pad() {
    var el = M.querySelector("#egg-pad"); el.innerHTML = GAMES[gi].pad.map(function (k) { return '<button type="button" data-k="' + k + '" aria-label="' + LBL[k] + '">' + (k === "fire" && GAMES[gi].id === "rocket" ? "Boost" : ICON[k]) + "</button>"; }).join("");
    el.querySelectorAll("button").forEach(function (b) {
      var k = b.getAttribute("data-k");
      function on(e) { e.preventDefault(); keys["pad-" + k] = true; if (state !== "play") start(); }
      function off() { keys["pad-" + k] = false; }
      b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
    });
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); return close(); }
    if (e.key === "Tab") { var f = [].slice.call(M.querySelectorAll("button,canvas")).filter(function (b) { return b.offsetParent !== null; }); var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } return; }
    var gk = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "W", "A", "S", "D"];
    if (gk.indexOf(e.key) >= 0) { if (e.target.closest && e.target.closest(".egg-head") && e.key === " ") return; e.preventDefault(); keys[e.key] = true; if (state !== "play") start(); }
  }
  function input() {
    var k = keys; I.up = k.ArrowUp || k.w || k.W || k["pad-up"] || swipe === "up"; I.down = k.ArrowDown || k.s || k.S || k["pad-down"] || swipe === "down";
    I.left = k.ArrowLeft || k.a || k.A || k["pad-left"] || swipe === "left"; I.right = k.ArrowRight || k.d || k.D || k["pad-right"] || swipe === "right";
    I.fire = k[" "] || k["pad-fire"]; var id = GAMES[gi].id;
    I.ptrY = ptr && id === "pong" ? ptr.y : null; I.ptrX = ptr && id === "breakout" ? ptr.x : null;
    if (id === "asteroids" && I.tap) I.fire = true;
  }
  var api = { score: function (s) { score = s; M.querySelector("#egg-score").textContent = s; if (s > best(GAMES[gi].id)) M.querySelector("#egg-best").textContent = s; }, over: function (msg) { state = "over"; saveBest(GAMES[gi].id, score); showBest(); overMsg = msg; } };
  var overMsg = "";
  function showBest() { M.querySelector("#egg-best").textContent = best(GAMES[gi].id); }
  function pick(next) {
    if (gi >= 0) saveBest(GAMES[gi].id, score);
    var n; do { n = Math.floor(Math.random() * GAMES.length); } while (next && n === gi);
    gi = n; game = GAMES[gi].make(api); M.querySelector("#egg-title").textContent = GAMES[gi].name; M.querySelector("#egg-tip").textContent = GAMES[gi].tip;
    pad(); reset(); if (next) cv.focus();
  }
  function reset() { readColors(); game.reset(); api.score(0); showBest(); state = "ready"; frame(true); }
  function start() { if (state === "over") { game.reset(); api.score(0); } state = "play"; last = performance.now(); loop(); }
  function pause() { if (state === "play") state = "paused"; if (gi >= 0) { saveBest(GAMES[gi].id, score); showBest(); } cancelAnimationFrame(raf); frame(true); }
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function (t) {
      var dt = Math.min(.033, (t - last) / 1000); last = t;
      if (state === "play") { input(); if (swipeT > 0) { swipeT -= dt; if (swipeT <= 0) swipe = null; } game.step(dt, I); }
      frame(false); if (state === "play") loop();
    });
  }
  function frame(idle) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = col.bg; g.fillRect(0, 0, W, H); game.draw(g);
    if (state !== "play") {
      g.fillStyle = col.bg; g.globalAlpha = .82; g.fillRect(0, H / 2 - 44, W, 88); g.globalAlpha = 1;
      g.fillStyle = col.ink; g.textAlign = "center"; g.font = "600 22px Inter, sans-serif";
      g.fillText(state === "over" ? overMsg + " · " + score : state === "paused" ? "Paused" : GAMES[gi].name, W / 2, H / 2 - 4);
      g.fillStyle = col.mut; g.font = "500 13px Inter, sans-serif"; g.fillText((matchMedia("(pointer:coarse)").matches ? "Tap" : "Press Space or tap") + (state === "over" ? " to play again" : " to start"), W / 2, H / 2 + 22);
    }
  }
  function open(btn) {
    if (!M) build(); opener = btn || document.activeElement; M.hidden = false;
    document.documentElement.classList.add("egg-lock");
    if (gi < 0) pick(false); else reset();
    requestAnimationFrame(function () { M.classList.add("on"); cv.focus(); });
    try { if (!localStorage.getItem("egg-found")) { localStorage.setItem("egg-found", "1"); toast(); } } catch (e) {}
  }
  function close() {
    pause(); keys = {}; M.classList.remove("on"); M.hidden = true; document.documentElement.classList.remove("egg-lock");
    if (opener && opener.focus) opener.focus();
  }
  function toast() { var t = document.createElement("div"); t.className = "egg-toast"; t.setAttribute("role", "status"); t.textContent = "You found the rocket 🚀"; document.body.appendChild(t); setTimeout(function () { t.classList.add("on"); }, 30); setTimeout(function () { t.classList.remove("on"); setTimeout(function () { t.remove(); }, 400); }, reduce ? 2600 : 2400); }
  window.MiniGames = { open: open };
})();
