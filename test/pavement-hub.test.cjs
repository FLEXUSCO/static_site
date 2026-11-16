const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

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
  "project_card_athens",
  "spec_support",
  "budget_hero"
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
  ["permeable pavement", "porous rubber pavement"].forEach(function (phrase) {
    assert.equal(title.toLowerCase().includes(phrase), true, "title " + phrase);
    assert.equal(h1.toLowerCase().includes(phrase), true, "h1 " + phrase);
    assert.equal(desc.toLowerCase().includes(phrase), true, "description " + phrase);
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.flexusco\.com\/pavement-systems">/);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"BreadcrumbList","itemListElement":\[\{"@type":"ListItem","position":1,"name":"Home","item":"https:\/\/www\.flexusco\.com\/"\},\{"@type":"ListItem","position":2,"name":"Pavement","item":"https:\/\/www\.flexusco\.com\/pavement-systems"\}\]\}<\/script>/);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  assert.equal(html.includes("&ndash;"), false);
  assert.equal(html.includes("$"), false);
  assert.equal(/\bprices?\b/i.test(text), false);
  assert.equal(/\bcosts?\b/i.test(text), false);
  assert.equal((text.match(/\bpricing\b/gi) || []).length, 1);
  assert.match(text, /Budgeting a project\? Send the area and location for project pricing\./);
  assert.equal(/20 years/i.test(text), false);
  assert.equal(/unstable or saturated/i.test(text), false);
  assert.equal(html.includes("Which series"), false);
  assert.equal((html.match(/bid the full installed job/g) || []).length, 1);
  assert.match(text, /50:50 blend, by volume, of specialty aggregate and recycled tire rubber/);
  assert.match(text, /stable, well-drained base and proper construction/);
  assert.equal(/The rows below are from the AP and CP pages/.test(text), false);
  assert.match(text, /Black matrix with light granite/);
  assert.equal((html.match(/CP-200 · Athens, GA/g) || []).length, 2);
  assert.equal(/calculator/i.test(html), false);
  assert.equal(/estimator/i.test(html), false);
  assert.equal(/ipema/i.test(html), false);
  assert.equal(/manufactur/i.test(html), false);
  assert.equal(/\bproduces?\b/i.test(text), false);
  assert.equal(/\bF\s+Flexus/.test(html), false);
  assert.equal(html.includes("FFlexus"), false);
  assert.equal(html.includes("See AP pavement"), true);
  assert.equal(html.includes("See CP pavement"), true);
  assert.equal(html.includes("Photo needed"), false);
  assert.equal(html.includes("placeholder"), false);
  assert.equal(html.includes("/materials/colored-rubber-granules"), false);
  assert.match(text, /half stone and half recycled tire rubber/);
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
    assert.equal(page.includes('aria-controls="materials-menu"'), true, name);
    assert.equal(page.includes('aria-expanded="false"'), true, name);
    assert.equal(page.includes('data-sheet-toggle="sheet-materials"'), true, name);
    assert.equal(page.includes("/materials/colored-rubber-granules"), false, name);
    assert.equal((page.match(/id="materials-menu"/g) || []).length, 1, name);
    assert.equal((page.match(/id="sheet-materials"/g) || []).length, 1, name);
  });
});
