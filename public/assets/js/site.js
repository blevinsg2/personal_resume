/* Gary Blevins — site behaviour. Vanilla JS, no dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Theme toggle (initial theme is set inline in <head> to avoid a flash) ---- */
  var toggle = document.querySelectorAll("[data-theme-toggle]");
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b0c0e" : "#fafaf8");
    toggle.forEach(function (b) { b.setAttribute("aria-pressed", t === "dark" ? "true" : "false"); });
  }
  toggle.forEach(function (b) {
    b.setAttribute("aria-pressed", root.getAttribute("data-theme") === "dark" ? "true" : "false");
    b.addEventListener("click", function () {
      setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  });

  /* ---- Header border on scroll ---- */
  var header = document.querySelector(".site-header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 8); }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Desktop dropdowns: hover (fine pointers) + click + keyboard ---- */
  var items = Array.prototype.slice.call(document.querySelectorAll(".menu > li.has-dd"));
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function closeAll(except) {
    items.forEach(function (li) {
      if (li !== except) {
        li.classList.remove("open");
        var t = li.querySelector(".menu-trigger");
        if (t) t.setAttribute("aria-expanded", "false");
      }
    });
  }
  items.forEach(function (li) {
    var trigger = li.querySelector(".menu-trigger");
    var timer;
    function open() { clearTimeout(timer); closeAll(li); li.classList.add("open"); trigger.setAttribute("aria-expanded", "true"); }
    function close() { li.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); }
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      li.classList.contains("open") && !li.dataset.hovered ? close() : open();
      delete li.dataset.hovered;
    });
    if (canHover) {
      li.addEventListener("mouseenter", function () { li.dataset.hovered = "1"; open(); setTimeout(function () { delete li.dataset.hovered; }, 400); });
      li.addEventListener("mouseleave", function () { timer = setTimeout(close, 140); });
    }
    li.addEventListener("keydown", function (e) {
      var links = Array.prototype.slice.call(li.querySelectorAll(".dropdown a"));
      var idx = links.indexOf(document.activeElement);
      if (e.key === "Escape") { close(); trigger.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); open(); (links[idx + 1] || links[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); open(); (links[idx - 1] || links[links.length - 1]).focus(); }
    });
    li.addEventListener("focusout", function (e) { if (!li.contains(e.relatedTarget)) close(); });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".menu > li.has-dd")) closeAll(); });

  /* ---- Mobile menu ---- */
  var mToggle = document.querySelector(".menu-toggle");
  var panel = document.getElementById("mobile-menu");
  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    if (mToggle) {
      mToggle.setAttribute("aria-expanded", open ? "true" : "false");
      mToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    if (panel) panel.inert = !open;
  }
  if (panel) panel.inert = true;
  if (mToggle) mToggle.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.body.classList.contains("menu-open")) { setMenu(false); mToggle.focus(); } });
  window.addEventListener("resize", function () { if (window.innerWidth > 860) setMenu(false); });
  document.querySelectorAll(".m-trigger").forEach(function (t) {
    t.addEventListener("click", function () {
      t.setAttribute("aria-expanded", t.getAttribute("aria-expanded") === "true" ? "false" : "true");
    });
  });

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Count-up numbers: <span data-count="95" data-decimals="0">95</span> ---- */
  var counters = document.querySelectorAll("[data-count]");
  function run(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
    if (reduce) { el.textContent = target.toFixed(dec); return; }
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { run(en.target); co.unobserve(en.target); } });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---- Hero career line: measure and draw ---- */
  document.querySelectorAll(".chart-card").forEach(function (card) {
    var line = card.querySelector(".line");
    if (line && line.getTotalLength) {
      var len = Math.ceil(line.getTotalLength());
      line.style.setProperty("--len", len);
    }
    requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("drawn"); }); });
  });

  /* ---- Year in footer ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();

/* ---- Easter egg: rocket launches a mini game (games.js lazy-loaded on first click) ---- */
(function () {
  var b = document.querySelector(".egg");
  if (!b) return;
  var loading = false;
  b.addEventListener("click", function () {
    if (window.MiniGames) return window.MiniGames.open(b);
    if (loading) return; loading = true;
    var s = document.createElement("script");
    s.src = b.getAttribute("data-games"); s.async = true;
    s.onload = function () { loading = false; if (window.MiniGames) window.MiniGames.open(b); };
    s.onerror = function () { loading = false; };
    document.head.appendChild(s);
  });
  /* Step aside when the corner sits over something interactive (maps, tables, controls, form fields). */
  var busy = "a,button:not(.egg),input,select,textarea,label,summary,table,.leaflet-container,canvas,[role=slider],[tabindex]:not([tabindex='-1'])";
  var t = 0;
  function texty(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return /^(IMG|SVG|PICTURE|VIDEO|P|LI|H[1-6]|TD|TH|BLOCKQUOTE|PRE|CODE)$/i.test(el.tagName);
  }
  function check() {
    t = 0;
    var r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = false;
    var pts = [[0, 0], [-10, -10], [10, -10], [-10, 10], [10, 10]];
    b.style.pointerEvents = "none";
    for (var j = 0; j < pts.length && !hit; j++) {
      var el = document.elementFromPoint(cx + pts[j][0], cy + pts[j][1]);
      if (el && el !== b && !b.contains(el) && (el.closest(busy) || texty(el))) hit = true;
    }
    b.style.pointerEvents = "";
    b.classList.toggle("egg-away", hit && document.activeElement !== b);
  }
  function q() { if (!t) t = requestAnimationFrame(check); }
  window.addEventListener("scroll", q, { passive: true });
  window.addEventListener("resize", q);
  window.addEventListener("load", q);
  q();
})();
