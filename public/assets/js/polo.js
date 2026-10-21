/* Polo Finder page: before/after comparison slider. */
(function () {
  "use strict";
  document.querySelectorAll(".ba").forEach(function (el) {
    var r = el.querySelector("input[type=range]");
    if (!r) return;
    function set() { el.style.setProperty("--pos", r.value + "%"); }
    r.addEventListener("input", set);
    set();
  });
})();
