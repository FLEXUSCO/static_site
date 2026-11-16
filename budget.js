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

  function quoteHref(series, lift, sf) {
    var href = "/contact?topic=spec-support";
    var area = Number(sf);
    if (!series || !lift || !(area > 0)) return href;
    return href
      + "&series=" + encodeURIComponent(series)
      + "&lift=" + encodeURIComponent(String(lift))
      + "&sf=" + encodeURIComponent(String(Math.round(area)));
  }

  function read() {
    var series = box.querySelector('input[name="budget-series"]:checked');
    var lift = box.querySelector('input[name="budget-lift"]:checked');
    var seriesValue = series && series.value;
    var liftValue = lift && lift.value;
    out.textContent = total(seriesValue, liftValue, area.value);
    if (quote) quote.setAttribute("href", quoteHref(seriesValue, liftValue, area.value));
  }

  box.addEventListener("input", read);
  box.addEventListener("change", read);
})(typeof globalThis !== "undefined" ? globalThis : this);
