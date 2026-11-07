const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const budget = require("../budget.js");

const root = path.join(__dirname, "..");

function quote(over) {
  return budget.calculate(Object.assign({
    lengthFt: "500",
    widthFt: "8",
    series: "cp",
    lift: "2.0",
    install: false,
    stone: "57",
    depthIn: "4",
    geotextile: true,
    grid: false,
    earthwork: false,
    edge: true,
    region: "local"
  }, over));
}

test("approved bases and thickness scale are exact", function () {
  assert.equal(budget.rateFor("cp", "2.0"), 53700);
  assert.equal(budget.rateFor("ap", "2.0"), 88500);
  assert.equal(budget.rateFor("cp", "1.5"), 40275);
  assert.equal(budget.rateFor("cp", "2.5"), 67125);
  assert.equal(budget.rateFor("ap", "1.5"), 66375);
  assert.equal(budget.rateFor("ap", "2.5"), 110625);
  assert.equal(budget.rateText(53700), "$5.37");
  assert.equal(budget.rateText(40275), "$4.0275");
  assert.equal(budget.rateText(67125), "$6.7125");
  assert.equal(budget.rateText(66375), "$6.6375");
  assert.equal(budget.rateText(110625), "$11.0625");
  assert.equal(budget.rateText(budget.INSTALL), "$3.00");
  assert.equal(budget.rateFor("cp", "3.0"), null);
});

test("4000 sf CP-200 is materials 21480 plus optional install 12000", function () {
  const materials = quote();
  assert.equal(materials.ok, true);
  assert.equal(materials.areaText, "4,000 sf");
  assert.equal(materials.model, "CP-200");
  assert.equal(materials.materialCents, 2148000);
  assert.equal(materials.materialText, "$21,480.00");
  assert.equal(materials.installCents, 0);
  assert.equal(materials.installText, "Not included");
  assert.equal(materials.totalCents, 2148000);
  assert.equal(materials.totalText, "$21,480.00");
  assert.equal(materials.totalLabel, "Total pavement materials");
  assert.equal(materials.scope, "pavement-materials");

  const both = quote({ install: true });
  assert.equal(both.installCents, 1200000);
  assert.equal(both.installText, "$12,000.00");
  assert.equal(both.totalCents, 3348000);
  assert.equal(both.totalText, "$33,480.00");
  assert.equal(both.totalLabel, "Total pavement materials and installation");
  assert.equal(both.materialCents, 2148000);
});

test("every published lift prices the same 4000 sf from the approved scale", function () {
  const expect = {
    cp: { "1.5": 1611000, "2.0": 2148000, "2.5": 2685000 },
    ap: { "1.5": 2655000, "2.0": 3540000, "2.5": 4425000 }
  };
  Object.keys(expect).forEach(function (series) {
    Object.keys(expect[series]).forEach(function (lift) {
      const off = quote({ series: series, lift: lift, install: false });
      const on = quote({ series: series, lift: lift, install: true });
      assert.equal(off.materialCents, expect[series][lift], series + " " + lift);
      assert.equal(on.materialCents, expect[series][lift]);
      assert.equal(on.installCents, 1200000);
      assert.equal(on.totalCents, expect[series][lift] + 1200000);
      assert.notEqual(on.materialRateText, on.installRateText);
    });
  });
});

test("fractional square feet round half up to the cent and do not pre-round the rate", function () {
  assert.equal(quote({ lengthFt: "1", widthFt: "1", series: "cp", lift: "1.5" }).materialCents, 403);
  assert.equal(quote({ lengthFt: "1", widthFt: "1", series: "ap", lift: "1.5" }).materialCents, 664);
  assert.equal(quote({ lengthFt: "1", widthFt: "1", series: "cp", lift: "2.5" }).materialCents, 671);
  assert.equal(quote({ lengthFt: "1", widthFt: "1", series: "ap", lift: "2.5" }).materialCents, 1106);
  assert.equal(quote({ lengthFt: "2", widthFt: "1", series: "cp", lift: "1.5" }).materialCents, 806);
  const half = quote({ lengthFt: "10.5", widthFt: "8" });
  assert.equal(half.areaText, "84 sf");
  assert.equal(half.materialCents, 45108);
});

test("zero, negative, and unit labels do not produce a dollar total", function () {
  ["0", "0.00", "-8", "8m", "8 m", "8in", "8 ft", "eight", "", "8.125", "100000.01"].forEach(function (bad) {
    const view = quote({ widthFt: bad });
    assert.equal(view.ok, false, bad);
    assert.equal(view.totalCents, null);
    assert.equal(view.materialCents, null);
  });
  assert.equal(quote({ lengthFt: "0", widthFt: "8" }).reason, "area");
  assert.equal(quote({ lengthFt: "-500" }).reason, "length");
  assert.equal(quote({ lengthFt: "1,000", widthFt: "8" }).areaText, "8,000 sf");
  assert.equal(quote({ lengthFt: "1,000", widthFt: "8" }).materialCents, 4296000);
});

test("excluded site fields do not change the money", function () {
  const base = quote();
  const changed = quote({
    stone: "2",
    depthIn: "12",
    geotextile: false,
    grid: true,
    earthwork: true,
    edge: false,
    region: "distant"
  });
  assert.equal(changed.materialCents, base.materialCents);
  assert.equal(changed.installCents, base.installCents);
  assert.equal(changed.totalCents, base.totalCents);
  assert.equal(changed.excluded.stone, "2");
  assert.equal(changed.excluded.depthIn, 12);
  assert.equal(changed.excluded.region, "distant");
  assert.equal(quote({ depthIn: "later" }).totalCents, base.totalCents);
  assert.equal(quote({ depthIn: "later" }).excluded.depthIn, null);
});

test("the page states the priced scope and does not reuse the old adder schedule", function () {
  const html = fs.readFileSync(path.join(root, "budget-estimator.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "budget.js"), "utf8");
  const blob = html + "\n" + js;
  ["$4.0275/sf", "$5.37/sf", "$6.7125/sf", "$6.6375/sf", "$8.85/sf", "$11.0625/sf", "$3.00/sf", "$21,480.00"].forEach(function (text) {
    assert.equal(html.includes(text), true, text);
  });
  assert.equal(html.includes("dollar amounts are not shown"), false);
  assert.equal(html.includes("Dollar amounts are not shown"), false);
  assert.equal(html.includes("±15%"), false);
  assert.equal(html.includes("generate_lead"), false);
  assert.equal(html.includes("googletagmanager"), false);
  assert.equal(html.includes("gtag("), false);
  assert.equal(html.includes("analytics.js"), false);
  assert.equal(html.includes("<form"), false);
  assert.equal(html.includes("data-netlify"), false);
  assert.equal(html.includes("budget-estimator"), true);
  ["$0.40", "$0.65", "$0.75", "$2.50", "$3.50", "$8.00", "$9.00", "$11.00", "$13.00", "$15.00", "$17.00", "$2,500", "$5,000", "$8,500", "0.15", "±15%", "mobilization"].forEach(function (stale) {
    assert.equal(blob.includes(stale), false, stale);
  });
  const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  assert.equal(nav.includes("budget-estimator"), false);
  assert.equal(html.includes('href="/budget-estimator"'), false);
});

test("existing pages and nav are unchanged aside from the estimator route", function () {
  const pages = ["index.html", "pavement-systems.html", "pavement-ap.html", "pavement-cp.html", "specifiers.html", "projects.html", "materials.html", "about.html", "contact.html"];
  pages.forEach(function (name) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    assert.equal(html.includes("/budget-estimator"), false, name);
  });
  const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
  assert.match(redirects, /^\/budget-estimator\s+\/budget-estimator\.html\s+200$/m);
  assert.equal(/\/budget-estimator\s+\/pavement-systems/.test(redirects), false);
  assert.match(redirects, /^\/pricing\s+\/pavement-systems\s+301$/m);
  assert.match(redirects, /^\/cost-calculator\s+\/pavement-systems\s+301$/m);
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.equal(sitemap.includes("https://www.flexusco.com/budget-estimator"), true);
});
