/* Upcoming launches calendar for the Launch Globe page.
   Build-time data: /assets/data/launch_upcoming.json (scripts/build_launch_upcoming.py, The Space Devs Launch Library 2).
   If that copy is more than a few hours old, it refreshes once from the public API (cached for an hour per tab) and
   falls back to the build-time copy on any error. Times are shown in U.S. Eastern. */
(function () {
  "use strict";
  var root = document.getElementById("lgc");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var TZ = "America/New_York", STALE = 3 * 36e5, CACHE = "lgc-ll2-v2";
  var STATUS = { Go: ["go", "Go", "Go for launch: date and time confirmed"], TBC: ["tbc", "TBC", "To be confirmed: the date is announced but not locked in"],
    TBD: ["tbd", "TBD", "To be determined: no firm date yet"], Hold: ["hold", "Hold", "On hold"], "In Flight": ["go", "In flight", "In flight"] };
  var PREC = { SEC: "min", MIN: "min", HR: "hour", DAY: "day", WEEK: "week", M: "month", Q: "quarter", H1: "half", H2: "half", Y: "year", FY: "year", DEC: "year" };
  // Keep in sync with PV_RULES and STREAM_PAGES in scripts/build_launch_upcoming.py (provider keys match launch_globe.json).
  var PV_RULES = [["spx", /^SpaceX/], ["rlab", /^Rocket Lab/], ["ula", /United Launch Alliance/], ["blue", /Blue Origin/],
    ["ffly", /Firefly/], ["ng", /Northrop|Orbital (Sciences|ATK)/], ["nasa", /^(NASA|National Aeronautics)/],
    ["ru", /Russia|ROSCOSMOS|Roscosmos|Khrunichev|Progress Rocket|Kosmotras|Soviet/],
    ["casc", /China Aerospace Science and Technology|China Rocket|CASC|China Academy of Launch|Shanghai Academy/],
    ["eu", /Arianespace|European Space Agency|Avio|Isar|Rocket Factory|Orbex/], ["in", /Indian Space|ISRO|NewSpace India/],
    ["jp", /Mitsubishi|JAXA|Japan Aerospace/], ["ir", /Iran|IRGC|Islamic Revolutionary/],
    ["kp", /Korean Committee|National Aerospace Development|DPRK|North Korea/]];
  var STREAM_PAGES = [
    [/^SpaceX/, [["SpaceX launches page", "https://www.spacex.com/launches"], ["SpaceX on YouTube", "https://www.youtube.com/@SpaceX"]]],
    [/^Rocket Lab/, [["Rocket Lab livestream page", "https://www.rocketlabusa.com/live-stream/"]]],
    [/United Launch Alliance/, [["ULA missions page", "https://www.ulalaunch.com/missions"], ["ULA on YouTube", "https://www.youtube.com/@UnitedLaunchAlliance"]]],
    [/Blue Origin/, [["Blue Origin on YouTube", "https://www.youtube.com/@BlueOrigin"]]],
    [/^(NASA|National Aeronautics)/, [["NASA+", "https://plus.nasa.gov/"], ["NASA on YouTube", "https://www.youtube.com/@NASA"]]],
    [/^Arianespace/, [["Arianespace on YouTube", "https://www.youtube.com/@arianespace"]]],
    [/Indian Space|ISRO/, [["ISRO on YouTube", "https://www.youtube.com/@isroofficial5866"]]],
    [/Firefly/, [["Firefly on YouTube", "https://www.youtube.com/@FireflySpace"]]]];
  var DONE = { Success: 1, "Launch Successful": 1, Failure: 1, "Launch Failure": 1, "Partial Failure": 1, "Launch was a Partial Failure": 1 };
  var st = { data: null, view: null, month: null, sel: null };
  var mq = window.matchMedia ? matchMedia("(max-width: 699px)") : { matches: false };

  function parts(d, o) { var r = {}; new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, o)).formatToParts(d).forEach(function (p) { r[p.type] = p.value; }); return r; }
  function etKey(d) { var p = parts(d, { year: "numeric", month: "2-digit", day: "2-digit" }); return p.year + "-" + p.month + "-" + p.day; }
  function etTime(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d); }
  function etHour(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric" }).format(d); }
  function etDay(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d); }
  function etMonth(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", year: "numeric" }).format(d); }
  function dated(x) { return x.prec === "min" || x.prec === "hour" || x.prec === "day" || x.prec === "week"; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function whenText(x) {
    var d = new Date(x.net);
    var when = dated(x) ? (x.prec === "week" ? "Week of " : "") + etDay(d) : etMonth(d);
    var t = x.prec === "min" ? etTime(d) + " ET" : x.prec === "hour" ? "Around " + etHour(d) + " ET" : x.prec === "day" ? "Time TBD" : "Date TBD";
    var win = "";
    if (x.prec === "min" && x.ws && x.we) win = x.ws === x.we ? "Instantaneous window" : "Window " + etTime(new Date(x.ws)) + " to " + etTime(new Date(x.we)) + " ET";
    return { when: when, t: t, win: win };
  }
  function prov(x) { var P = window.__lgProviders || [], p = P[x.pv]; return p && p.key !== "other" ? p.short : (x.lsp || "Other"); }
  function linkTo(href, text, title) { var a = el("a", null, text); a.href = href; a.target = "_blank"; a.rel = "noopener"; if (title) a.title = title; return a; }
  function watch(x) {
    var w = x.watch || [], s = x.streams || [];
    if (!w.length && !s.length) return null;
    var box = el("span", "lgc-watch");
    box.appendChild(el("span", "lbl", w.length ? "Watch live:" : "Provider stream page:"));
    if (w.length) w.forEach(function (v) { if (/^https:\/\//.test(v.u)) box.appendChild(linkTo(v.u, (v.p || "Webcast") + (/^Official/.test(v.k || "") ? " (official)" : ""), v.t)); });
    else s.forEach(function (v) { box.appendChild(linkTo(v.u, v.t)); });
    return box;
  }
  function padText(x) { return (/^unknown/i.test(x.pad) ? "Pad TBD" : x.pad) + ", " + x.location; }
  function badge(x) { var s = STATUS[x.status] || ["tbd", x.status || "TBD", x.status_name || ""]; var b = el("span", "lgc-st " + s[0], s[1]); b.title = s[2]; return b; }
  function item(x) {
    var w = whenText(x), li = el("li", "lgc-item"); li.id = "lgc-i-" + x.id;
    var dot = el("i", "lg-dot pv-" + x.pv); dot.setAttribute("aria-hidden", "true"); li.appendChild(dot);
    var a = el("div", "lgc-when"); a.appendChild(el("b", null, w.when)); a.appendChild(el("span", null, w.t)); li.appendChild(a);
    var b = el("div", "lgc-what"); b.appendChild(el("b", null, x.name));
    b.appendChild(el("span", null, x.vehicle + " · " + prov(x) + " · " + padText(x)));
    if (w.win) b.appendChild(el("span", "lgc-win", w.win));
    var wl = watch(x); if (wl) b.appendChild(wl);
    li.appendChild(b); li.appendChild(badge(x));
    return li;
  }

  function current(list) { var cut = Date.now() - 2 * 36e5; return list.filter(function (x) { return x.status === "In Flight" || new Date(x.net).getTime() >= cut || !dated(x); }); }

  function renderList() {
    var ol = $("lgc-list"); ol.innerHTML = "";
    var L = current(st.data.launches);
    if (!L.length) { ol.appendChild(el("li", "lgc-empty", "No launches are on the schedule for the next few weeks.")); return; }
    L.forEach(function (x) { ol.appendChild(item(x)); });
  }
  function monthsSpan() {
    var now = new Date(), p = parts(now, { year: "numeric", month: "numeric" }), m0 = +p.year * 12 + (+p.month - 1), m1 = m0 + 1;
    current(st.data.launches).forEach(function (x) { if (dated(x)) { var q = parts(new Date(x.net), { year: "numeric", month: "numeric" }); m1 = Math.max(m1, +q.year * 12 + (+q.month - 1)); } });
    return [m0, Math.min(m1, m0 + 3)];
  }
  function renderCal() {
    var cal = $("lgc-cal"), span = monthsSpan(), m = st.month;
    if (m == null || m < span[0] || m > span[1]) m = st.month = span[0];
    var y = Math.floor(m / 12), mo = m % 12;
    $("lgc-month").textContent = new Date(Date.UTC(y, mo, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    $("lgc-prev").disabled = m <= span[0]; $("lgc-next").disabled = m >= span[1];
    var byDay = {}, today = etKey(new Date());
    current(st.data.launches).forEach(function (x) { if (dated(x)) { var k = etKey(new Date(x.net)); (byDay[k] = byDay[k] || []).push(x); } });
    cal.innerHTML = "";
    var g = el("div", "lgc-grid"); g.setAttribute("role", "grid"); g.setAttribute("aria-label", $("lgc-month").textContent + " launch calendar");
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) { var h = el("div", "lgc-dow", d); h.setAttribute("role", "columnheader"); g.appendChild(h); });
    var first = new Date(Date.UTC(y, mo, 1)).getUTCDay(), n = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    for (var i = 0; i < first; i++) g.appendChild(el("div", "lgc-day pad"));
    for (var d = 1; d <= n; d++) {
      var key = y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"), xs = byDay[key] || [];
      var c = el("div", "lgc-day" + (key === today ? " today" : "") + (key < today ? " past" : "") + (xs.length ? " has" : ""));
      c.setAttribute("role", "gridcell");
      var num = el("span", "lgc-num", String(d)); if (key === today) { num.setAttribute("aria-label", d + ", today"); c.appendChild(el("span", "lgc-today", "Today")); }
      c.insertBefore(num, c.firstChild);
      xs.forEach(function (x) {
        var b = el("button", "lgc-ev pv-" + x.pv); b.type = "button";
        var w = whenText(x);
        b.appendChild(el("i", "lg-dot pv-" + x.pv));
        b.appendChild(el("span", "lgc-evt", (x.prec === "min" ? etTime(new Date(x.net)).replace(":00", "").replace(" ", "").toLowerCase() + " " : "") + x.name));
        b.setAttribute("aria-label", x.name + ", " + w.when + ", " + w.t + ", status " + (STATUS[x.status] || [0, x.status])[1]);
        if (st.sel === x.id) b.setAttribute("aria-pressed", "true");
        b.addEventListener("click", function () { st.sel = x.id; renderCal(); showDetail(x); });
        c.appendChild(b);
      });
      g.appendChild(c);
    }
    cal.appendChild(g);
    // launches with only a month (or vaguer) target can't sit on a day
    var later = current(st.data.launches).filter(function (x) { return !dated(x); }), more = $("lgc-more");
    more.hidden = !later.length; more.textContent = later.length ? "No date yet: " + later.map(function (x) { return x.name + " (" + x.vehicle + ", target " + etMonth(new Date(x.net)) + ")"; }).join("; ") + "." : "";
  }
  function showDetail(x) { var dv = $("lgc-detail"); dv.innerHTML = ""; var ol = el("ol", "lgc-list one"); ol.appendChild(item(x)); dv.appendChild(ol); dv.hidden = false; }
  function setView(v) {
    st.view = v;
    $("lgc-view").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === v ? "true" : "false"); });
    var cal = v === "cal";
    $("lgc-cal").hidden = !cal; $("lgc-nav").hidden = !cal; $("lgc-list").hidden = cal; $("lgc-detail").hidden = !cal || !st.sel;
    $("lgc-more").hidden = !cal || !$("lgc-more").textContent;
  }
  function render() {
    renderList(); renderCal();
    var L = current(st.data.launches);
    if (st.sel && !L.some(function (x) { return x.id === st.sel; })) st.sel = null;
    if (!st.sel) { var nx = L.filter(dated)[0]; if (nx) { st.sel = nx.id; renderCal(); showDetail(nx); } }
    else showDetail(L.filter(function (x) { return x.id === st.sel; })[0]);
    setView(st.view || (mq.matches ? "list" : "cal"));
    var asof = new Date(st.data.as_of);
    $("lgc-asof").textContent = (st.data.live ? "refreshed " : "as of ") + etDay(asof).replace(/^\w+, /, "") + ", " + parts(asof, { year: "numeric" }).year + ", " + etTime(asof) + " ET";
    var ev; try { ev = new CustomEvent("lg:upcoming", { detail: L }); } catch (e) { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("lg:upcoming", false, false, L); }
    window.__lgUpcoming = L; document.dispatchEvent(ev);
  }

  // Live refreshes use LL2's lighter "normal" mode, which has no webcast list, so webcast links come from the
  // build-time copy (matched by launch id) and otherwise fall back to the provider's own stream page.
  function normalize(rows, prev) {
    var sites = window.__lgSites || [], keys = (window.__lgProviders || []).map(function (p) { return p.key; }), other = Math.max(keys.length - 1, 0);
    var old = {}; (prev || []).forEach(function (x) { old[x.id] = x; });
    function pv(name, country) {
      for (var i = 0; i < PV_RULES.length; i++) if (PV_RULES[i][1].test(name)) { var k = keys.indexOf(PV_RULES[i][0]); return k < 0 ? other : k; }
      if (country === "CHN") { var c = keys.indexOf("cncom"); return c < 0 ? other : c; }
      return other;
    }
    return rows.filter(function (x) { var s = x.status || {}; return !DONE[s.abbrev] && !DONE[s.name]; }).map(function (x) {
      var pad = x.pad || {}, loc = pad.location || {}, lat = +pad.latitude || 0, lon = +pad.longitude || 0, gs = null, best = 1.5;
      sites.forEach(function (p, i) { var d = Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos(lat * Math.PI / 180)); if (d < best) { best = d; gs = i; } });
      var pr = ((x.net_precision || {}).abbrev || "MIN").toUpperCase(), lsp = (x.launch_service_provider || {}).name || "";
      var sp = null; STREAM_PAGES.some(function (r) { if (r[0].test(lsp)) { sp = r[1]; return true; } return false; });
      return { id: x.id, name: (x.mission && x.mission.name) || String(x.name || "").split("|").pop().trim(), pv: pv(lsp, (pad.country || {}).alpha_3_code), lsp: lsp,
        vehicle: ((x.rocket || {}).configuration || {}).name || "", pad: pad.name || "", location: loc.name || "", lat: lat, lon: lon, gsite: gs,
        net: x.net, prec: PREC[pr] || "day", ws: x.window_start, we: x.window_end, status: (x.status || {}).abbrev || "", status_name: (x.status || {}).name || "",
        watch: (old[x.id] && old[x.id].watch) || [], streams: (sp || []).map(function (v) { return { t: v[0], u: v[1] }; }) };
    });
  }
  function refresh() {
    if (Date.now() - new Date(st.data.as_of).getTime() < STALE) return;
    try { var c = JSON.parse(sessionStorage.getItem(CACHE) || "null"); if (c && Date.now() - new Date(c.as_of).getTime() < 36e5) { st.data = c; render(); return; } } catch (e) {}
    var until = new Date(Date.now() + (+root.getAttribute("data-days") || 60) * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
    var url = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=100&mode=normal&ordering=net&net__lte=" + encodeURIComponent(until);
    fetch(url, { credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.results)) throw new Error("bad data");
      st.data = { as_of: new Date().toISOString(), days: st.data.days, live: true, launches: normalize(j.results, st.data.launches) };
      try { sessionStorage.setItem(CACHE, JSON.stringify(st.data)); } catch (e) {}
      render();
    }).catch(function () { /* keep the build-time schedule */ });
  }

  $("lgc-view").hidden = false;
  $("lgc-view").addEventListener("click", function (e) { var b = e.target.closest("button[data-view]"); if (b) setView(b.getAttribute("data-view")); });
  $("lgc-prev").addEventListener("click", function () { st.month--; renderCal(); });
  $("lgc-next").addEventListener("click", function () { st.month++; renderCal(); });
  fetch("/assets/data/launch_upcoming.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    st.data = d; render();
    // provider names and globe sites come from the globe's data; wait for it briefly so live rows map the same way
    var done = false, go = function () { if (done) return; done = true; if (window.__lgProviders) render(); refresh(); };
    if (window.__lgSites) go(); else { document.addEventListener("lg:ready", go); setTimeout(go, 6000); }
  }).catch(function () { /* the server-rendered list stays */ });
})();
