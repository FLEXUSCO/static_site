const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const track = require("../tracking.js");
const SUPPLY = "Supply only, with install guidance for your contractor, or supplied and installed by Flexus.";

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

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

const pages = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); });

test("sitewide copy keeps the supply line and documented aggregate wording", function () {
  pages.forEach(function (name) {
    const html = read(name);
    assert.equal(html.includes("specialty aggregate"), false, name);
    assert.equal(html.includes("bid the full installed job"), false, name);
    assert.equal(html.includes("\u2014"), false, name);
    assert.equal(html.includes("\u2013"), false, name);
    assert.equal(html.includes("&mdash;"), false, name);
    assert.equal(html.includes("&ndash;"), false, name);
    assert.equal(html.includes("$"), false, name);
    assert.equal(/ipema/i.test(html), false, name);
    assert.equal(/manufactur/i.test(html), false, name);
    assert.equal(/\bF\s+Flexus/.test(html), false, name);
    assert.equal(html.includes("FFlexus"), false, name);
  });
  ["index.html", "pavement-systems.html", "specifiers.html", "about.html"].forEach(function (name) {
    assert.equal(read(name).includes(SUPPLY), true, name);
  });
  assert.equal(track.intentForLabel("see_pavement"), "series_nav");
  assert.deepEqual(
    track.sanitize("cta_click", { intent: "series_nav", placement: "body", cta_label: "see_pavement" }),
    { intent: "series_nav", placement: "body", cta_label: "see_pavement" }
  );
});

test("home is a short film page with one hero action", function () {
  const html = read("index.html");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(h1, "Paths for parks and trails");
  assert.equal(h1.split(" ").length, 5);
  assert.match(html, /hero-54-phone-640\.webp/);
  assert.match(html, /data-cta-label="see_pavement"/);
  assert.match(html, /data-cta-label="pavement_card_ap"/);
  assert.match(html, /data-cta-label="pavement_card_cp"/);
  assert.match(html, /data-cta-label="spec_support"/);
  assert.match(html, /Exposed natural aggregate on AP/);
  assert.match(html, /Pedestrian only/);
  assert.match(html, /href="\/materials"/);
  assert.match(html, /Category 2 hurricane/);
  assert.equal(/also held up well/.test(visible(html)), false);
  const hero = html.slice(html.indexOf('<section class="hero film">'), html.indexOf("</section>"));
  assert.equal((hero.match(/<a\b/g) || []).length, 1);
  assert.equal(html.includes("calculator"), false);
  assert.equal(/\bproduces?\b/i.test(visible(html)), false);
});

test("AP and CP keep cut-sheet facts under a short spec strip", function () {
  const ap = read("pavement-ap.html");
  const cp = read("pavement-cp.html");
  assert.match(ap, /Exposed natural aggregate and recycled tire rubber/);
  assert.match(ap, /AP-150 at 1\.5 in \(38 mm\), AP-200 at 2\.0 in \(51 mm\), AP-250 at 2\.5 in \(64 mm\)/);
  assert.match(ap, /Textured, matte, stone-forward/);
  assert.match(ap, /Minimum 11 percent by weight/);
  assert.match(ap, /Sand Dune, Coastal Granite, Charcoal Earth, Natural Trail/);
  assert.match(ap, /Not for vehicles/);
  assert.match(ap, /botanical gardens, zoo paths, courtyards/);
  assert.match(ap, /maximum cross slope of 2 percent/);
  assert.match(ap, /about 9,000 sf/);
  assert.match(ap, /ap_install_guide\.pdf/);
  assert.match(ap, /ap-200-install-800\.webp/);
  assert.match(ap, /src="\/assets\/ap-swatch-sand-dune-800\.webp"/);
  assert.match(ap, /ap-swatch-sand-dune\.jpg 1080w/);
  assert.match(ap, /ap-swatch-coastal-granite-800\.webp/);
  assert.match(ap, /ap-swatch-charcoal-earth-800\.webp/);
  assert.match(ap, /ap-swatch-natural-trail-800\.webp/);
  assert.equal((ap.match(/class="palette-grid"[\s\S]*?<\/div>/)[0].match(/width="1080" height="1080"/g) || []).length, 4);
  ["ap-swatch-sand-dune-800.webp", "ap-swatch-coastal-granite-800.webp", "ap-swatch-charcoal-earth-800.webp", "ap-swatch-natural-trail-800.webp"].forEach(function (file) {
    assert.equal(fs.existsSync(path.join(root, "assets", file)), true, file);
  });
  assert.match(cp, /Granite and black recycled tire rubber/);
  assert.match(cp, /CP-150 at 1\.5 in \(38 mm\), CP-200 at 2\.0 in \(51 mm\), CP-250 at 2\.5 in \(64 mm\)/);
  assert.match(cp, /Textured, exposed granite aggregate/);
  assert.match(cp, /about 10\.34 lb of solids per square foot/);
  assert.match(cp, /11 to 12\.5 percent by weight of total solids/);
  assert.match(cp, /suitable for ADA-aligned pedestrian routes when it is installed over a compliant subbase/);
  assert.match(cp, /final accessibility compliance is the project designer's responsibility/);
  assert.match(cp, /mid-install/);
  assert.match(cp, /cp-200-athens-800\.webp/);
  const athensAt = cp.indexOf("<h2 class=\"section-title\">Athens, Georgia</h2>");
  const athens = cp.slice(athensAt, cp.indexOf("</section>", athensAt));
  assert.equal(athens.indexOf("Athens project notes") < athens.indexOf("surface-sample"), true);
  assert.match(athens, /flexus-cp-200-800\.webp/);
  assert.match(athens, /width="1080" height="1080"/);
  assert.equal(cp.includes("IPEMA"), false);
});

test("projects and case pages keep documented facts", function () {
  const projects = read("projects.html");
  const mary = read("mary-esther-azalea-trail.html");
  const athens = read("athens-root-intrusion-sidewalk.html");
  assert.match(projects, /azalea-01-1920\.webp/);
  assert.match(projects, /mid-install/);
  assert.match(projects, /data-cta-label="project_card_mary_esther"/);
  assert.match(projects, /data-cta-label="project_card_athens"/);
  assert.match(mary, /City of Mary Esther, FL/);
  assert.match(mary, /About 9,000 sf/);
  assert.match(mary, /I highly recommend using this as a great trail material/);
  assert.match(mary, /flexus-azalea-showcase\.mp4/);
  assert.match(mary, /azalea-46-1920\.webp/);
  assert.match(athens, /Editor: do not add an owner, year, area, or quote/);
  assert.match(athens, /Athens, GA/);
  assert.match(athens, /Flexus CP-200/);
  assert.match(athens, /mid-install/);
  assert.equal(/Shawn Lindsey/.test(athens), false);
});

test("specifiers and materials keep their detailed facts", function () {
  const spec = read("specifiers.html");
  const materials = read("materials.html");
  [
    "CSI Division 32",
    "ASTM D698",
    "95 percent Standard Proctor",
    "ASTM No. 57",
    "ASTM No. 2",
    "50°F and rising",
    "not more than 104°F",
    "Initial set 4 to 8 hours",
    "Working time about 20 minutes at 70°F",
    "recommended maximum cross slope of 2 percent",
    "MS4",
    "voids the system warranty",
    SUPPLY
  ].forEach(function (fact) {
    assert.equal(spec.includes(fact), true, fact);
  });
  [
    "50 lb bags",
    "Black, Forest Green, Green, Teal Green, Espresso, Brown, Cedar, Gold, and Red",
    "5/9 mesh",
    "6/16 mesh",
    "10-20 mesh",
    "Infill",
    "This line is separate from permeable pavement"
  ].forEach(function (fact) {
    assert.equal(materials.includes(fact), true, fact);
  });
});

test("contact form wiring is unchanged", function () {
  const html = read("contact.html");
  assert.match(html, /<form name="contact" method="POST" data-netlify="true" data-flexus-form="contact" netlify-honeypot="bot-field" action="\/thanks\?from=contact">/);
  ["form-name", "source", "segment", "page", "landing_page", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "bot-field"].forEach(function (name) {
    assert.equal(html.includes('name="' + name + '"'), true, name);
  });
  assert.equal(html.includes("googletagmanager.com"), false);
  const css = read("site.css");
  assert.match(css, /@media \(max-width: 980px\) \{\s*\.nav-actions > a\.pill \{ display: none; \}/);
  assert.match(html, /src="\/tracking\.js"/);
  assert.match(html, /zd6h7tk5io/);
});
