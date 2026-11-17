const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const track = require("../tracking.js");
const pagePath = path.join(root, "pavement-systems.html");
const html = fs.readFileSync(pagePath, "utf8");
const LABELS = [
  "pavement_card_ap",
  "pavement_card_cp",
  "compare_ap",
  "compare_cp",
  "project_card_mary_esther",
  "spec_support",
  "budget_quote"
];

function visible(source) {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;|&rdquo;|&amp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cardBlock(source, label, occurrence) {
  const token = 'data-cta-label="' + label + '"';
  let from = 0;
  let at = -1;
  for (let i = 0; i < occurrence; i++) {
    at = source.indexOf(token, from);
    if (at === -1) return "";
    from = at + token.length;
  }
  const start = source.lastIndexOf("<a", at);
  const end = source.indexOf("</a>", at);
  return source.slice(start, end + 4);
}

test("budget total is one combined dollar amount", function () {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "budget.js"), "utf8"), context);
  const total = context.FlexusBudget.total;
  assert.equal(total("CP", "2", 1000), "$8,120");
  assert.equal(total("CP", "1.5", 1000), "$6,528");
  assert.equal(total("CP", "2.5", 1000), "$9,713");
  assert.equal(total("AP", "2", 1000), "$11,600");
  assert.equal(total("AP", "1.5", 1000), "$9,138");
  assert.equal(total("AP", "2.5", 1000), "$14,063");
  assert.equal(total("AP", "2", 4500), "$52,200");
  assert.equal(total("CP", "2", 0), "");
  assert.equal(html.includes("data-flexus-form=\"budget"), false);
  assert.equal(html.includes("googletagmanager"), false);
});

test("pavement hub cta labels are allowlisted and each card is one link", function () {
  const found = [];
  const re = /data-cta-label="([^"]+)"/g;
  let match;
  while ((match = re.exec(html))) found.push(match[1]);
  LABELS.forEach(function (label) {
    assert.equal(found.includes(label), true, label);
    const intent = track.intentForLabel(label);
    assert.equal(intent.length > 0, true, label);
    const safe = track.sanitize("cta_click", { intent: intent, placement: "body", cta_label: label });
    assert.deepEqual(safe, { intent: intent, placement: "body", cta_label: label });
    const block = cardBlock(html, label, 1);
    assert.equal((block.match(/<a\b/g) || []).length, 1, label);
    assert.equal(/<button\b|<input\b|<select\b|<textarea\b/i.test(block), false, label);
  });
  found.forEach(function (label) {
    assert.equal(LABELS.includes(label), true, label);
  });
  assert.equal(found.filter(function (label) { return label === "spec_support"; }).length >= 1, true);
  assert.deepEqual(
    track.sanitize("cta_click", { intent: "spec_support", placement: "header" }),
    { intent: "spec_support", placement: "header" }
  );
  assert.equal(track.intentForLabel("calculator"), "");
  assert.equal(track.sanitize("cta_click", {
    intent: "series_nav",
    placement: "body",
    cta_label: "calculator"
  }), null);
  const analytics = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
  assert.match(analytics, /data-cta-label/);
  assert.match(analytics, /cta_label/);
  assert.match(analytics, /intentForLabel/);
});

test("pavement hub keeps the phrases, canonical, and breadcrumb, with no prices or em dashes", function () {
  const text = visible(html);
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.equal(title, "Permeable Pavement Cost Estimator: AP and CP | Flexus");
  assert.equal(desc, "Porous rubber pavement for greenways, trails, park paths, sidewalks and tree wells. Compare AP and CP, then estimate a material and install budget by square foot.");
  assert.equal(h1, "Permeable rubber pavement for paths and trails");
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.flexusco\.com\/pavement-systems">/);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"BreadcrumbList","itemListElement":\[\{"@type":"ListItem","position":1,"name":"Home","item":"https:\/\/www\.flexusco\.com\/"\},\{"@type":"ListItem","position":2,"name":"Pavement","item":"https:\/\/www\.flexusco\.com\/pavement-systems"\}\]\}<\/script>/);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  assert.equal(html.includes("&ndash;"), false);
  assert.equal((html.match(/\$/g) || []).length, 1);
  assert.equal(html.includes("$11,600"), true);
  assert.match(text, /Pick AP or CP, a lift of 1\.5, 2\.0 or 2\.5 inches, and your square footage\./);
  assert.match(text, /Subbase, freight and site work are not included\./);
  assert.match(text, /Budget only\./);
  assert.equal((text.match(/\bprices?\b/gi) || []).length, 0);
  assert.match(text, /CP costs less than AP/);
  assert.match(text, /Asphalt look, lower cost/);
  assert.equal((text.match(/\bcosts?\b/gi) || []).length, 4);
  assert.equal((text.match(/\bpricing\b/gi) || []).length, 2);
  assert.match(text, /Request project pricing/);
  assert.equal((text.match(/Not sure which\?/g) || []).length, 0);
  assert.equal((text.match(/Budgeting a project\?/g) || []).length, 0);
  assert.match(html, /<details id="compare">/);
  assert.match(html, /<span>Mix<\/span><strong>Rock and recycled tire rubber, 50:50 by volume\.<\/strong>/);
  assert.match(html, /<span>Install<\/span><strong>Poured in place\.<\/strong>/);
  assert.match(html, /<span>Lifts<\/span><strong>Lifts of 1\.5, 2\.0, and 2\.5 inches\.<\/strong>/);
  assert.match(html, /<span>Use<\/span><strong>Pedestrian only\.<\/strong>/);
  assert.match(html, /class="system-link-row"/);
  assert.match(html, /class="system-supply"/);
  assert.equal(/20 years/i.test(text), false);
  assert.equal(/unstable or saturated/i.test(text), false);
  assert.equal(html.includes("Which series"), false);
  assert.equal(html.includes("bid the full installed job"), false);
  assert.equal(html.includes("specialty aggregate"), false);
  assert.match(text, /Supply only, with install guidance for your contractor, or supplied and installed by Flexus\./);
  assert.match(text, /Exposed natural aggregate, 50:50 by volume with recycled tire rubber/);
  assert.equal(/The rows below are from the AP and CP pages/.test(text), false);
  assert.match(text, /Black matrix with light granite/);
  assert.match(text, /Emerald Coast Drone Pros/);
  assert.equal(/calculator/i.test(html), false);
  assert.match(html, /id="budget-estimate"/);
  assert.match(html, /Get a quote for your project/);
  assert.match(html, /No commitment/);
  assert.match(html, /name="budget-series" value="AP" checked/);
  assert.match(html, /name="budget-lift" value="2" checked/);
  assert.match(html, /id="budget-sf"[^>]*value="1,000"/);
  assert.match(html, /id="budget-total"[^>]*>\$11,600</);
  assert.match(html, /AP-200 · 1,000 SF/);
  assert.match(html, /id="budget-quote" href="\/contact\?topic=spec-support&amp;series=AP&amp;lift=2&amp;sf=1000"/);
  assert.match(html, /class="config-card"/);
  assert.match(html, /class="config-segment"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /<h2 id="budget-heading">Permeable pavement cost estimator<\/h2>/);
  assert.match(html, /data-cta-label="budget_quote"/);
  assert.equal(track.intentForLabel("budget_quote"), "spec_support");
  assert.equal((html.match(/\$/g) || []).length, 1);
  assert.equal(html.includes("$11,600"), true);
  assert.equal(/ipema/i.test(html), false);
  assert.equal(/manufactur/i.test(html), false);
  assert.equal(/\bproduces?\b/i.test(text), false);
  assert.equal(/\bF\s+Flexus/.test(html), false);
  assert.equal(html.includes("FFlexus"), false);
  assert.equal(html.includes("See AP pavement"), true);
  assert.match(text, /Four natural stone palettes/);
  assert.match(text, /both are used on the same paths/);
  assert.match(text, /It has held up well to a Category 2 hurricane and two small flood events since being installed in the spring of 2026/);
  assert.equal(/also held up well/.test(text), false);
  assert.match(html, /mary-esther\/hero-54-1920\.webp/);
  assert.match(html, /hero-54-phone-900\.webp/);
  const css = fs.readFileSync(path.join(root, "site.css"), "utf8");
  assert.match(css, /\.hero\.film \.hero-bg img \{ object-position: center 58%; \}/);
  assert.equal(html.includes("Coastal Granite</span>"), false);
  assert.equal(html.includes("See CP pavement"), true);
  assert.equal(html.includes("Photo needed"), false);
  assert.equal(html.includes("placeholder"), false);
  assert.equal(html.includes("/materials/colored-rubber-granules"), false);
  assert.match(text, /Rock and recycled tire rubber, 50:50 by volume/);
  assert.match(text, /minimum 11 percent by weight/);
  assert.match(text, /1\.5, 2\.0, and 2\.5 inches/);
  assert.match(text, /Pedestrian only/);
});

test("every page has the materials menu and granules points at the real section", function () {
  const materials = fs.readFileSync(path.join(root, "materials.html"), "utf8");
  assert.match(materials, /id="granules"/);
  assert.match(materials, /id="mulch"/);
  assert.match(materials, /id="buffings"/);
  fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); }).forEach(function (name) {
    const page = fs.readFileSync(path.join(root, name), "utf8");
    assert.equal(page.includes('href="/materials#mulch"'), true, name);
    assert.equal(page.includes('href="/materials#granules"'), true, name);
    assert.equal(page.includes('href="/materials#buffings"'), true, name);
    assert.equal(page.includes('href="/pavement-systems/ap"'), true, name);
    assert.equal(page.includes('href="/pavement-systems/cp"'), true, name);
    assert.equal(page.includes("AP</span> - Architectural Pavement"), true, name);
    assert.equal(page.includes("CP</span> - Civil Pavement"), true, name);
    assert.equal(page.includes("\u2013"), false, name);
    assert.equal(page.includes("\u2014"), false, name);
    assert.equal(page.includes('aria-controls="materials-menu"'), true, name);
    assert.equal(page.includes('aria-controls="pavement-menu"'), true, name);
    assert.equal(page.includes('aria-expanded="false"'), true, name);
    assert.equal(page.includes("nav-caret"), false, name);
    assert.equal(page.includes("supersack"), false, name);
    assert.equal(page.includes("/materials/colored-rubber-granules"), false, name);
    assert.equal((page.match(/id="materials-menu"/g) || []).length, 1, name);
    assert.equal((page.match(/id="pavement-menu"/g) || []).length, 1, name);
    assert.equal((page.match(/id="sheet-materials"/g) || []).length, 1, name);
    assert.equal((page.match(/id="sheet-pavement"/g) || []).length, 1, name);
  });
});
