// Project-input summary for /budget-estimator.
// Historical per-unit rates are not in this file. They are unconfirmed, so
// this page does not calculate or render money. monetaryLive stays false.
(function (root) {
  var SERIES = { cp: "CP", ap: "AP" };
  var LIFTS = { "1.5": true, "2.0": true, "2.5": true };
  var STONE = { "57": true, "2": true };
  var REGION = { local: true, adjacent: true, distant: true };

  function num(value) {
    var n = parseFloat(value);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  function publicView(input) {
    var src = input || {};
    var lengthFt = num(src.lengthFt);
    var widthFt = num(src.widthFt);
    var area = lengthFt * widthFt;
    var series = SERIES[src.series] || "";
    var lift = LIFTS[String(src.lift)] ? String(src.lift) : "";
    var stone = STONE[String(src.stone)] ? String(src.stone) : "";
    var depth = num(src.depthIn);
    return {
      ok: area > 0 && !!series && !!lift,
      areaSf: area,
      perimeterLf: 2 * (lengthFt + widthFt),
      series: series,
      lift: lift,
      stone: stone,
      depthIn: depth,
      geotextile: !!src.geotextile,
      grid: !!src.grid,
      earthwork: !!src.earthwork,
      edge: !!src.edge,
      region: REGION[src.region] ? src.region : "",
      monetaryLive: false,
      money: null
    };
  }

  function readForm(form) {
    function checked(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : "";
    }
    return {
      lengthFt: form.querySelector("#b-length").value,
      widthFt: form.querySelector("#b-width").value,
      series: checked("series"),
      lift: checked("lift"),
      stone: form.querySelector("#b-stone").value,
      depthIn: form.querySelector("#b-depth").value,
      geotextile: form.querySelector("#b-geo").checked,
      grid: form.querySelector("#b-grid").checked,
      earthwork: form.querySelector("#b-earth").checked,
      edge: form.querySelector("#b-edge").checked,
      region: form.querySelector("#b-region").value
    };
  }

  function formatSf(n) {
    if (!isFinite(n)) return "0";
    return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }

  function render(view, doc) {
    var out = doc.getElementById("budget-output");
    if (!out || !view) return;
    out.querySelector("[data-out='area']").textContent = formatSf(view.areaSf);
    out.querySelector("[data-out='perimeter']").textContent = formatSf(Math.round(view.perimeterLf));
    out.querySelector("[data-out='series']").textContent = view.series || "—";
    out.querySelector("[data-out='lift']").textContent = view.lift ? view.lift + " in" : "—";
    out.querySelector("[data-out='subbase']").textContent = view.stone ? "#" + view.stone + ", " + formatSf(view.depthIn) + " in" : "—";
    var flags = [];
    if (view.geotextile) flags.push("geotextile");
    if (view.grid) flags.push("gravel grid");
    if (view.earthwork) flags.push("earthwork");
    if (view.edge) flags.push("edge restraint");
    out.querySelector("[data-out='conditions']").textContent = flags.length ? flags.join(", ") : "None selected";
    var region = { local: "Southeast", adjacent: "Mid-Atlantic / Midwest", distant: "West Coast / Northeast" };
    out.querySelector("[data-out='region']").textContent = region[view.region] || "—";
  }

  function boot() {
    var form = document.getElementById("budget-form");
    if (!form) return;
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    var memory = {};
    function update(fromUser) {
      var view = publicView(readForm(form));
      render(view, document);
      if (!window.FlexusTrack) return;
      var event = FlexusTrack.calculationEvent(view, fromUser, memory);
      if (event) FlexusTrack.emit("calculation_complete", event);
    }
    form.addEventListener("input", function () { update(true); });
    form.addEventListener("change", function () { update(true); });
    update(false);
  }

  var api = { publicView: publicView, readForm: readForm, render: render, boot: boot };
  root.FlexusBudget = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
