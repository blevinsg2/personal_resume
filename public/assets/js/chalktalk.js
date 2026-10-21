/* ChalkTalkFB page: click-to-load YouTube embed (privacy-enhanced) + "today" marker on the weekly strip. */
(function () {
  "use strict";
  document.querySelectorAll(".yt-facade").forEach(function (el) {
    var btn = el.querySelector(".yt-play");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + el.getAttribute("data-yt") + "?autoplay=1&playsinline=1&rel=0&modestbranding=1";
      f.title = el.getAttribute("data-title") || "YouTube video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      f.allowFullscreen = true;
      el.innerHTML = "";
      el.appendChild(f);
      el.classList.add("playing");
    });
  });
  /* Weekly strip: day themes are static (fallback). If the live feed loads, show today + the next 6 days
     with the real topics from https://chalktalkfb.pages.dev/schedule.json (built from SCHEDULE.md). */
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var THEMES = ["Defense", "Offense", "Positions", "Special Teams", "Coaching", "Football 101", "Film Room"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function todayET() {
    try {
      var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.year + "-" + p.month + "-" + p.day;
    } catch (e) { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; }
  function isoOf(d) { return d.toISOString().slice(0, 10); }
  var week = document.getElementById("ct-week"), today = todayET();
  function markToday() {
    var li = week && week.querySelector('li[data-dow="' + addDays(today, 0).getUTCDay() + '"]');
    if (li) { li.classList.add("today"); li.setAttribute("aria-current", "date"); }
  }
  markToday();
  if (week && window.fetch) {
    fetch("https://chalktalkfb.pages.dev/schedule.json", { cache: "no-cache", mode: "cors", credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var by = {}; (d.episodes || []).forEach(function (e) { if (e && e.date) by[e.date] = e; });
        var html = "";
        for (var i = 0; i < 7; i++) {
          var day = addDays(today, i), iso = isoOf(day), dow = day.getUTCDay(), e = by[iso];
          var topic = e ? (e.short || e.topic) : "";
          var label = DAYS[dow] + '<span class="dt">' + MON[day.getUTCMonth()] + " " + day.getUTCDate() + "</span>";
          var watch = e && e.youtubeUrl && i === 0 ? ' <a class="text-link ct-watch" href="' + esc(e.youtubeUrl) + '" target="_blank" rel="noopener">Watch</a>' : "";
          html += '<li data-dow="' + dow + '" data-date="' + iso + '"' + (i === 0 ? ' class="today" aria-current="date"' : "") +
            (e && e.title ? ' title="' + esc(e.title) + '"' : "") + '><span class="d">' + label + "</span><b>" + esc((e && e.theme) || THEMES[dow]) +
            '</b><span class="ep' + (topic ? "" : " soon") + '">' + (topic ? esc(topic) : "Coming soon") + watch + "</span></li>";
        }
        week.innerHTML = html;
        week.classList.add("is-live");
        week.setAttribute("aria-label", "Upcoming Shorts, today through " + DAYS[addDays(today, 6).getUTCDay()]);
      })
      .catch(function () { /* keep the static day themes */ });
  }
})();
