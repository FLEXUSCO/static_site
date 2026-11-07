const test = require("node:test");
const assert = require("node:assert/strict");

function same(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function load(file, exportName) {
  const sandbox = {
    URLSearchParams: URLSearchParams,
    URL: URL,
    console: console,
    module: { exports: {} },
    window: {},
    globalThis: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  return sandbox.module.exports;
}

const track = load("tracking.js");
const budget = load("budget.js");

function memoryStore() {
  const data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

test("topic aliases and materials-quote path", function () {
  assert.equal(track.topicFromLocation("/contact", "?topic=sample"), "sample");
  assert.equal(track.topicFromLocation("/contact", "?topic=spec-pack"), "spec-support");
  assert.equal(track.topicFromLocation("/contact", "?topic=quote"), "materials-quote");
  assert.equal(track.topicFromLocation("/contact/materials-quote", "?product=colored-granules&utm_source=ads"), "materials-quote");
  assert.equal(track.topicFromLocation("/contact/materials-quote", "?topic=sample&product=rubber-mulch"), "sample");
  assert.equal(track.topicEnum("materials-quote"), "materials_quote");
  assert.equal(track.topicEnum("sample"), "pavement_sample");
  assert.equal(track.topicEnum("spec-support"), "spec_support");
  assert.equal(track.topicEnum("budget-estimate"), "");
});

test("granules path keeps a section id and campaign query", function () {
  assert.equal(track.sectionIdFromPath("/materials/granules"), "granules");
  assert.equal(track.sectionIdFromPath("/materials"), "");
  const next = track.urlAfterToParam("/materials/granules", "?utm_source=newsletter&product=colored-granules&gclid=abc", "granules");
  assert.equal(next, "/materials/granules?utm_source=newsletter&product=colored-granules&gclid=abc#granules");
  const droppedTo = track.urlAfterToParam("/materials", "?to=granules&utm_campaign=fall&product=colored-granules", "granules");
  assert.equal(droppedTo, "/materials?utm_campaign=fall&product=colored-granules#granules");
});

test("static HTTP 200 is not acceptance and native submit is not intercepted", function () {
  assert.equal(track.classifyNetlifyResponse({ status: 200, ok: true, body: "<!DOCTYPE html><title>Flexus</title>" }), "unverified");
  assert.equal(track.classifyNetlifyResponse({ status: 200, ok: true, body: "" }), "unverified");
  assert.equal(track.classifyNetlifyResponse({ status: 302, ok: false, redirected: true }), "unverified");
  assert.equal(track.classifyNetlifyResponse({ status: 0, type: "opaqueredirect" }), "unverified");
  assert.equal(track.classifyNetlifyResponse({ status: 404, ok: false }), "rejected");
  assert.equal(track.classifyNetlifyResponse({ status: 500, ok: false }), "rejected");
  assert.equal(track.classifyNetlifyResponse(null), "network");
  assert.equal(track.leadAllowed("unverified"), false);
  assert.equal(track.leadAllowed("rejected"), false);
  assert.equal(track.leadAllowed("accepted"), true);
  assert.equal(track.shouldPreventNativeSubmit(), false);
  ["unverified", "rejected", "network"].forEach(function (kind) {
    assert.equal(track.leadAllowed(kind), false);
  });
});

test("direct thanks query and refresh do not emit generate_lead", function () {
  const store = memoryStore();
  assert.equal(track.leadEventFromVisit(store), null);
  store.setItem("flexus_lead_v1", JSON.stringify({ topic: "pavement_sample" }));
  // A query string is intentionally not an input. Arbitrary ?from= cannot mint a lead.
  same(track.leadEventFromVisit(store), { topic: "pavement_sample" });
  assert.equal(track.leadEventFromVisit(store), null);
  assert.equal(track.markAcceptedLead(store, "not-a-topic"), false);
  assert.equal(track.markAcceptedLead(store, "materials_quote"), true);
  assert.deepEqual(track.consumeLead(store), "materials_quote");
  assert.equal(track.consumeLead(store), "");
});

test("events drop free text, addresses, and urls", function () {
  const calls = [];
  const gtag = function () { calls.push(arguments); };
  const bad = track.emit("generate_lead", { topic: "materials_quote", email: "a@b.com", page: "https://evil.example/a" }, gtag);
  same(bad, { topic: "materials_quote" });
  assert.equal(Object.keys(calls[0][2]).join(","), "topic");
  assert.equal(track.emit("generate_lead", { topic: "https://flexusco.com/thanks?from=contact" }, gtag), null);
  assert.equal(track.emit("form_attempt", { form_id: "contact", topic: "user@example.com" }, gtag), null);
  same(track.emit("form_start", { form_id: "contact", name: "Ada" }, gtag), { form_id: "contact" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], "form_start");
  same(calls[1][2], { form_id: "contact" });
});

test("pdf, cta, contact, and material params stay on the allowlist", function () {
  same(track.pdfEvent("/assets/pdfs/ap/ap-details.pdf"), { document: "ap_details", series: "AP" });
  same(track.pdfEvent("/assets/pdfs/cp/flexus_cp_product_overview.pdf?utm_source=x"), { document: "cp_product_overview", series: "CP" });
  assert.equal(track.pdfEvent("/files/secret-name.pdf"), null);
  assert.equal(track.ctaIntent("/contact?topic=spec-support"), "spec_support");
  assert.equal(track.ctaIntent("/contact?topic=sample"), "pavement_sample");
  assert.equal(track.ctaIntent("/contact/materials-quote?product=rubber-mulch"), "materials_quote");
  assert.equal(track.ctaIntent("/contact"), "");
  const link = { nodeType: 1, classList: { contains: function () { return false; } }, tagName: "A", parentElement: null };
  assert.equal(track.ctaPlacement(link), "body");
  const footer = {
    nodeType: 1,
    classList: { contains: function (c) { return c === "footer"; } },
    tagName: "FOOTER",
    parentElement: null
  };
  assert.equal(track.anchorPlacement(footer), "footer");
  assert.equal(track.ctaPlacement(footer), "");
  same(track.materialEvent({ name: "Product", type: "checkbox", value: "colored-granules", checked: true }, true), {
    material: "colored_granules",
    selected: true
  });
  assert.equal(track.materialEvent({ name: "Product", type: "checkbox", value: "colored-granules", checked: true }, false), null);
  assert.equal(track.materialEvent({ name: "Product", type: "checkbox", value: "other", checked: true }, true), null);
});

test("budget geometry is public and money is not", function () {
  const view = budget.publicView({
    lengthFt: "500",
    widthFt: "8",
    series: "cp",
    lift: "2.0",
    stone: "57",
    depthIn: "4",
    geotextile: true,
    grid: false,
    earthwork: false,
    edge: true,
    region: "local"
  });
  assert.equal(view.ok, true);
  assert.equal(view.areaSf, 4000);
  assert.equal(view.perimeterLf, 1016);
  assert.equal(view.series, "CP");
  assert.equal(view.lift, "2.0");
  assert.equal(view.monetaryLive, false);
  assert.equal(view.money, null);
  assert.equal(JSON.stringify(view).includes("$"), false);
  assert.equal(budget.publicView({ lengthFt: "0", widthFt: "8", series: "cp", lift: "2.0" }).ok, false);
  const memory = {};
  assert.equal(track.calculationEvent(view, true, memory), null);
  const live = Object.assign({}, view, { monetaryLive: true });
  assert.equal(track.calculationEvent(live, false, memory), null);
  same(track.calculationEvent(live, true, memory), { series: "CP", lift: "2.0" });
  assert.equal(track.calculationEvent(live, true, memory), null);
  assert.equal(JSON.stringify(track.calculationEvent(live, true, {})).includes("4000"), false);
});

test("redirect rules keep campaign query targets free of a replacement query", function () {
  const lines = fs.readFileSync(path.join(root, "_redirects"), "utf8").split("\n");
  function rule(from) {
    return lines.map(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "#") return null;
      const parts = trimmed.split(/\s+/);
      return parts[0] === from ? parts : null;
    }).filter(Boolean)[0];
  }
  function assertBare(from, to, status) {
    const parts = rule(from);
    assert.ok(parts, from);
    assert.equal(parts[1], to);
    assert.equal(parts[2], status);
    assert.equal(parts[1].includes("?"), false);
  }
  assertBare("/materials/quote", "/contact/materials-quote", "301");
  assertBare("/materials/quote.html", "/contact/materials-quote", "301");
  assertBare("/materials/rubber-granules", "/materials/granules", "301");
  assertBare("/materials/rubber-granules.html", "/materials/granules", "301");
  assertBare("/budget-estimator", "/budget-estimator.html", "200");
  assertBare("/contact/materials-quote", "/contact.html", "200");
  assertBare("/materials/granules", "/materials.html", "200");
  assertBare("/flexus-final/budget-estimator.html", "/budget-estimator", "301");
  assert.equal(rule("/budget-estimator.html"), undefined);
  assert.equal(rule("/pricing")[1], "/pavement-systems");
  assert.equal(rule("/cost-calculator")[1], "/pavement-systems");
});

test("served contact markup keeps a stable selector and does not claim the form was sent", function () {
  const html = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  const served = html.replace(/\sdata-netlify="true"/g, "").replace(/\snetlify-honeypot="[^"]*"/g, "");
  assert.equal(served.includes("data-netlify"), false);
  assert.equal(served.includes('data-flexus-form="contact"'), true);
  assert.equal(served.includes('name="contact"'), true);
  assert.equal(served.includes('name="form-name" value="contact"'), true);
  assert.equal(html.includes("Sent to Flexus"), false);
  assert.match(html, /We reply by email\./);
  assert.equal(html.includes("location.pathname"), true);
  assert.equal(html.includes("requested = 'materials-quote'"), true);
  const site = fs.readFileSync(path.join(root, "site.js"), "utf8");
  assert.equal(site.includes('form[data-netlify="true"]'), false);
  assert.equal(site.includes("form[data-flexus-form]"), true);
  assert.equal(site.includes("fetch("), false);
  assert.equal(site.includes("submitNetlifyForm"), false);
  const thanks = fs.readFileSync(path.join(root, "thanks.html"), "utf8");
  assert.equal(thanks.includes("generate_lead"), false);
  const analytics = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
  assert.equal(analytics.includes("form_submit"), false);
  assert.equal(analytics.includes("nav_cta_click"), false);
});

test("pages keep only G-5T6ESYM3SB and budget output has no prices", function () {
  const htmlFiles = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); });
  htmlFiles.forEach(function (name) {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    const ids = text.match(/G-[A-Z0-9]+/g) || [];
    ids.forEach(function (id) { assert.equal(id, "G-5T6ESYM3SB", name); });
    assert.equal(text.includes("GTM-"), false, name);
    assert.equal(text.includes("googletagmanager.com/gtm.js"), false, name);
  });
  const page = fs.readFileSync(path.join(root, "budget-estimator.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "budget.js"), "utf8");
  [page, script].forEach(function (text) {
    assert.equal(text.includes("$"), false);
    ["0.65", "0.75", "0.40", "2.50", "3.50", "8500", "per sf", "/sf"].forEach(function (token) {
      assert.equal(text.includes(token), false, token);
    });
  });
  assert.match(page, /bid the full installed job/);
  assert.match(page, /install guidance/);
  assert.match(page, /materials quote/i);
  assert.equal(page.includes('name="budget-estimate"'), false);
  assert.equal(page.includes("data-netlify"), false);
});
