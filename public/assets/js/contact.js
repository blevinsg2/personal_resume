/* Contact form: inline validation, honeypot, async submit, success/error states. */
(function () {
  "use strict";
  var form = document.getElementById("contact-form");
  if (!form) return;
  var card = form.closest(".form-card");
  var status = form.querySelector(".form-status");
  var btn = form.querySelector(".btn-submit");
  var btnLabel = btn.querySelector(".lbl");
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var rules = {
    name: function (v) { return v.trim().length >= 2 ? "" : "Please enter your name."; },
    email: function (v) {
      if (!v.trim()) return "Please enter your email so Gary can reply.";
      return EMAIL_RE.test(v.trim()) ? "" : "That email doesn't look quite right.";
    },
    message: function (v) {
      var n = v.trim().length;
      if (!n) return "Please add a short message.";
      return n < 10 ? "A little more detail, please (10+ characters)." : "";
    }
  };

  function field(name) { return form.elements[name]; }
  function validate(name, show) {
    var el = field(name);
    var msg = rules[name](el.value);
    var wrap = el.closest(".field");
    if (show) {
      wrap.classList.toggle("invalid", !!msg);
      wrap.classList.toggle("valid", !msg && el.value.trim() !== "");
      wrap.querySelector(".err-text").textContent = msg;
      el.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    return !msg;
  }

  Object.keys(rules).forEach(function (name) {
    var el = field(name);
    el.addEventListener("blur", function () { if (el.value !== "" || el.dataset.touched) { el.dataset.touched = "1"; validate(name, true); } });
    el.addEventListener("input", function () {
      if (el.closest(".field").classList.contains("invalid") || el.dataset.touched) validate(name, true);
    });
  });

  var msgEl = field("message");
  var counter = form.querySelector(".count");
  var max = parseInt(msgEl.getAttribute("maxlength") || "2000", 10);
  function updateCount() { if (counter) counter.textContent = msgEl.value.length + " / " + max; }
  msgEl.addEventListener("input", updateCount);
  updateCount();

  var ICONS = {
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 11v6M12 7h.01"/></svg>'
  };
  function showStatus(kind, title, text) {
    status.className = "form-status show " + kind;
    status.innerHTML = '<span class="ic" aria-hidden="true">' + ICONS[kind] + '</span><div><b class="st-title"></b> <span class="st-text"></span></div>';
    status.querySelector(".st-title").textContent = title;
    status.querySelector(".st-text").textContent = text;
  }
  function clearStatus() { status.className = "form-status"; status.innerHTML = ""; }
  function setLoading(on) {
    btn.disabled = on;
    btn.classList.toggle("loading", on);
    btnLabel.textContent = on ? "Sending…" : "Send message";
  }
  function succeed() {
    card.classList.add("sent");
    var h = card.querySelector(".form-success h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearStatus();
    var ok = true, firstBad = null;
    Object.keys(rules).forEach(function (name) {
      field(name).dataset.touched = "1";
      if (!validate(name, true)) { ok = false; firstBad = firstBad || field(name); }
    });
    if (!ok) { firstBad.focus(); return; }

    // Honeypot: real people never see or check this box. Bots get a silent "success".
    if (field("botcheck") && field("botcheck").checked) { succeed(); return; }

    var payload = {
      access_key: field("access_key").value,
      subject: field("subject").value,
      from_name: field("from_name").value,
      name: field("name").value.trim(),
      email: field("email").value.trim(),
      message: field("message").value.trim(),
      botcheck: false
    };

    setLoading(true);
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data.success !== false) return;
        throw new Error((data && (data.message || (data.errors && data.errors[0] && data.errors[0].message))) || "Request failed");
      });
    }).then(function () {
      form.reset(); updateCount();
      form.querySelectorAll(".field").forEach(function (f) { f.classList.remove("valid", "invalid"); });
      succeed();
    }).catch(function () {
      showStatus("error", "Message not sent.", "Something went wrong sending it. Please try again in a moment.");
    }).then(function () { clearTimeout(t); setLoading(false); });
  });

  var again = card.querySelector("[data-send-another]");
  if (again) again.addEventListener("click", function () { card.classList.remove("sent"); clearStatus(); field("name").focus(); });
})();
