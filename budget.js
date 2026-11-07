// Estimated materials cost for /budget-estimator.
// Approved material rates: CP-200 $5.37/sf, AP-200 $8.85/sf.
// 1.5 in = 3/4 of the 2.0 in rate. 2.5 in = 5/4 of the 2.0 in rate.
// Those are the lifts published for CP and AP: 1.5, 2.0, and 2.5 inches.
// The amount is that rate times area, rounded half up to the nearest cent.
// Installation and subbase are not priced on this page.
(function (root) {
  var BASE = { cp: 53700, ap: 88500 };
  var SCALE = { "1.5": [3, 4], "2.0": [1, 1], "2.5": [5, 4] };
  var MODEL = { cp: "CP", ap: "AP" };
  var LIFT_IN = { "1.5": "1.5", "2.0": "2.0", "2.5": "2.5" };
  var REGION = {
    local: "Southeast",
    adjacent: "Mid-Atlantic / Midwest",
    distant: "West Coast / Northeast"
  };

  function rateFor(series, lift) {
    var base = BASE[series];
    var scale = SCALE[lift];
    if (!base || !scale) return null;
    if ((base * scale[0]) % scale[1] !== 0) return null;
    return (base * scale[0]) / scale[1];
  }

  function parseFeet(value) {
    var text = String(value == null ? "" : value).trim();
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) text = text.replace(/,/g, "");
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
    var parts = text.split(".");
    var whole = parseInt(parts[0], 10);
    var frac = (parts[1] || "").padEnd(2, "0");
    if (whole > 100000 || (whole === 100000 && frac !== "00")) return null;
    return whole * 100 + parseInt(frac, 10);
  }

  function parseDepth(value) {
    var text = String(value == null ? "" : value).trim();
    if (!/^\d{1,2}$/.test(text)) return null;
    var n = parseInt(text, 10);
    if (n > 24) return null;
    return n;
  }

  function roundHalfUpCents(micro) {
    var unit = 1000000n;
    var negative = micro < 0n;
    var n = negative ? -micro : micro;
    var cents = n / unit;
    var rest = n % unit;
    if (rest * 2n >= unit) cents += 1n;
    return negative ? -cents : cents;
  }

  function money(cents) {
    var negative = cents < 0n;
    var n = negative ? -cents : cents;
    var dollars = (n / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var fraction = (n % 100n).toString().padStart(2, "0");
    return (negative ? "-$" : "$") + dollars + "." + fraction;
  }

  function rateText(units) {
    var whole = Math.floor(units / 10000).toString();
    var fraction = (units % 10000).toString().padStart(4, "0").replace(/0+$/, "");
    if (fraction.length < 2) fraction = (units % 10000).toString().padStart(4, "0").slice(0, 2);
    return "$" + whole + "." + fraction;
  }

  function areaText(areaUnits) {
    var whole = (areaUnits / 10000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var fraction = (areaUnits % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
    return whole + (fraction ? "." + fraction : "") + " sf";
  }

  function excludedView(src) {
    var stone = src.stone === "57" || src.stone === "2" ? src.stone : "";
    var region = Object.prototype.hasOwnProperty.call(REGION, src.region) ? src.region : "";
    return {
      stone: stone,
      depthIn: parseDepth(src.depthIn),
      geotextile: src.geotextile === true,
      grid: src.grid === true,
      earthwork: src.earthwork === true,
      edge: src.edge === true,
      region: region
    };
  }

  function calculate(input) {
    var src = input || {};
    var excluded = excludedView(src);
    var lengthH = parseFeet(src.lengthFt);
    var widthH = parseFeet(src.widthFt);
    var series = BASE[src.series] ? src.series : "";
    var lift = SCALE[String(src.lift)] ? String(src.lift) : "";
    var base = {
      ok: false,
      excluded: excluded,
      materialCents: null,
      totalCents: null
    };
    if (lengthH == null) return Object.assign(base, { reason: "length" });
    if (widthH == null) return Object.assign(base, { reason: "width" });
    if (lengthH === 0 || widthH === 0) return Object.assign(base, { reason: "area" });
    if (!series) return Object.assign(base, { reason: "series" });
    if (!lift) return Object.assign(base, { reason: "lift" });
    var materialRate = rateFor(series, lift);
    if (materialRate == null) return Object.assign(base, { reason: "rate" });
    var areaUnits = BigInt(lengthH) * BigInt(widthH);
    var materialCents = roundHalfUpCents(BigInt(materialRate) * areaUnits);
    var model = MODEL[series] + "-" + (lift === "1.5" ? "150" : lift === "2.0" ? "200" : "250");
    var text = money(materialCents);
    return {
      ok: true,
      reason: "",
      areaUnits: areaUnits,
      areaText: areaText(areaUnits),
      series: series,
      lift: lift,
      model: model,
      liftLabel: LIFT_IN[lift] + " in",
      materialRate: materialRate,
      materialRateText: rateText(materialRate) + "/sf",
      materialCents: Number(materialCents),
      materialText: text,
      totalCents: Number(materialCents),
      totalText: text,
      totalLabel: "Estimated materials cost",
      scope: "materials",
      excluded: excluded
    };
  }

  function excludedText(excluded) {
    var bits = [];
    if (excluded.stone) bits.push("#" + excluded.stone + " stone");
    bits.push(excluded.depthIn == null ? "subbase depth not recorded" : excluded.depthIn + " in subbase depth");
    var flags = [];
    if (excluded.geotextile) flags.push("geotextile");
    if (excluded.grid) flags.push("gravel grid");
    if (excluded.earthwork) flags.push("earthwork");
    if (excluded.edge) flags.push("edge restraint");
    var recorded = bits.join(", ");
    var selected = flags.length ? flags.join(", ") : "none of geotextile, gravel grid, earthwork, or edge restraint";
    var region = excluded.region ? REGION[excluded.region] : "region not recorded";
    return "Not in the materials estimate: " + recorded + ". Also not included: " + selected + ". Region: " + region + ". Changing these does not change the estimated materials cost.";
  }

  function readForm(rootEl) {
    function checked(name) {
      var el = rootEl.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : "";
    }
    return {
      lengthFt: rootEl.querySelector("#b-length").value,
      widthFt: rootEl.querySelector("#b-width").value,
      series: checked("series"),
      lift: checked("lift"),
      stone: rootEl.querySelector("#b-stone").value,
      depthIn: rootEl.querySelector("#b-depth").value,
      geotextile: rootEl.querySelector("#b-geo").checked,
      grid: rootEl.querySelector("#b-grid").checked,
      earthwork: rootEl.querySelector("#b-earth").checked,
      edge: rootEl.querySelector("#b-edge").checked,
      region: rootEl.querySelector("#b-region").value
    };
  }

  function render(view, doc) {
    var out = doc.getElementById("budget-output");
    if (!out || !view) return;
    var status = "";
    if (!view.ok) {
      status = view.reason === "area"
        ? "Enter a length and a width greater than zero."
        : "Enter length and width in feet, up to two decimal places, with no unit label.";
    }
    out.querySelector("[data-out='status']").textContent = status;
    out.querySelector("[data-out='area']").textContent = view.ok ? view.areaText : "—";
    out.querySelector("[data-out='material']").textContent = view.ok ? view.model + ", " + view.liftLabel + ", " + view.materialRateText : "—";
    out.querySelector("[data-out='total-label']").textContent = "Estimated materials cost";
    out.querySelector("[data-out='total']").textContent = view.ok ? view.totalText : "—";
    out.querySelector("[data-out='excluded']").textContent = excludedText(view.excluded);
  }

  function boot() {
    var rootEl = document.getElementById("budget-tool");
    if (!rootEl) return;
    function update() { render(calculate(readForm(rootEl)), document); }
    rootEl.addEventListener("input", update);
    rootEl.addEventListener("change", update);
    update();
  }

  var api = {
    BASE: BASE,
    rateFor: rateFor,
    rateText: rateText,
    calculate: calculate,
    readForm: readForm,
    render: render,
    boot: boot
  };
  root.FlexusBudget = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
