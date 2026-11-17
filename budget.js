(function (root) {
  var PER_SF = {
    AP: { "1.5": 9.1375, "2": 11.6, "2.5": 14.0625 },
    CP: { "1.5": 6.5275, "2": 8.12, "2.5": 9.7125 }
  };

  function total(series, lift, sf) {
    var rate = PER_SF[series] && PER_SF[series][String(lift)];
    var area = Number(sf);
    if (!rate || !(area > 0)) return "";
    var dollars = Math.round(rate * area);
    return "$" + dollars.toLocaleString("en-US");
  }

  root.FlexusBudget = { total: total };

  if (typeof document === "undefined") return;
  var box = document.getElementById("budget-estimate");
  if (!box) return;
  var out = document.getElementById("budget-total");
  var area = document.getElementById("budget-sf");
  var quote = document.getElementById("budget-quote");

  var recap = document.getElementById("budget-recap");
  var LIFT_CODE = { "1.5": "150", "2": "200", "2.5": "250" };
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_err) {
    reduceMotion = false;
  }

  function digitsOf(value) {
    return String(value || "").replace(/\D/g, "").replace(/^0+/, "").slice(0, 7);
  }

  function formatSf(digits) {
    return digits ? Number(digits).toLocaleString("en-US") : "";
  }

  function writeArea() {
    var raw = area.value;
    var caret = area.selectionStart;
    var before = raw.slice(0, caret == null ? raw.length : caret).replace(/\D/g, "").length;
    var digits = digitsOf(raw);
    var formatted = formatSf(digits);
    if (raw === formatted) return digits;
    area.value = formatted;
    var seen = 0;
    var pos = 0;
    if (before > 0) {
      pos = formatted.length;
      for (var i = 0; i < formatted.length; i++) {
        if (formatted.charAt(i) >= "0" && formatted.charAt(i) <= "9") seen++;
        if (seen >= before) { pos = i + 1; break; }
      }
    }
    if (area === document.activeElement && area.setSelectionRange) area.setSelectionRange(pos, pos);
    return digits;
  }

  function quoteHref(series, lift, sf) {
    var href = "/contact?topic=spec-support";
    if (!series || !lift || !sf) return href;
    return href
      + "&series=" + encodeURIComponent(series)
      + "&lift=" + encodeURIComponent(String(lift))
      + "&sf=" + encodeURIComponent(sf);
  }

  var paintToken = 0;
  function paintTotal(next) {
    if (out.textContent === next && !out.classList.contains("is-changing")) return;
    paintToken += 1;
    var token = paintToken;
    if (!reduceMotion && out.textContent && next) {
      out.classList.add("is-changing");
      window.setTimeout(function () {
        if (token !== paintToken) return;
        out.textContent = next;
        out.classList.remove("is-changing");
      }, 90);
      return;
    }
    out.classList.remove("is-changing");
    out.textContent = next;
  }

  function read() {
    var series = box.querySelector('input[name="budget-series"]:checked');
    var lift = box.querySelector('input[name="budget-lift"]:checked');
    var seriesValue = series && series.value;
    var liftValue = lift && lift.value;
    var sf = writeArea();
    var amount = total(seriesValue, liftValue, sf);
    paintTotal(amount);
    if (recap) {
      var code = LIFT_CODE[String(liftValue)];
      recap.textContent = amount && seriesValue && code
        ? seriesValue + "-" + code + " \u00b7 " + formatSf(sf) + " SF"
        : "";
    }
    if (quote) quote.setAttribute("href", quoteHref(seriesValue, liftValue, sf));
  }

  box.addEventListener("input", read);
  box.addEventListener("change", read);
  read();
})(typeof globalThis !== "undefined" ? globalThis : this);
