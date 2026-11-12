const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function rules() {
  return fs.readFileSync(path.join(root, "_redirects"), "utf8").split("\n").filter(function (line) {
    return line && !line.startsWith("#");
  }).map(function (line) {
    const parts = line.trim().split(/\s+/);
    return { from: parts[0], to: parts[1], status: parts[2] };
  });
}

test("legacy html duplicates force a query-free 301 to the canonical path", function () {
  const found = {};
  rules().forEach(function (rule) { found[rule.from] = rule; });
  const expected = {
    "/index.html": "/",
    "/specifiers.html": "/specifiers",
    "/materials.html": "/materials",
    "/pavement-ap.html": "/pavement-systems/ap",
    "/pavement-cp.html": "/pavement-systems/cp",
    "/pavement-systems.html": "/pavement-systems",
    "/projects.html": "/projects",
    "/about.html": "/about",
    "/contact.html": "/contact"
  };
  Object.keys(expected).forEach(function (from) {
    assert.equal(found[from].to, expected[from], from);
    assert.equal(found[from].status, "301!", from);
    assert.equal(found[from].to.includes("?"), false, from);
  });
  assert.equal(found["/resources"].to, "/.netlify/functions/legacy-redirect");
  assert.equal(found["/pavement-systems/ap"].to, "/pavement-ap.html");
  assert.equal(found["/pavement-systems/ap"].status, "200");
});

test("a trailing slash redirects only for the four nested pages", async function () {
  const src = fs.readFileSync(path.join(root, "netlify/edge-functions/canonical-slash.js"), "utf8");
  const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  assert.equal(mod.slashRedirect("/pavement-systems/ap/", "?utm_source=newsletter"), "/pavement-systems/ap?utm_source=newsletter");
  assert.equal(mod.slashRedirect("/pavement-systems/cp/", ""), "/pavement-systems/cp");
  assert.equal(mod.slashRedirect("/projects/mary-esther-azalea-trail/", "?to=downloads"), "/projects/mary-esther-azalea-trail?to=downloads");
  assert.equal(mod.slashRedirect("/projects/athens-root-intrusion-sidewalk/", ""), "/projects/athens-root-intrusion-sidewalk");
  assert.equal(mod.slashRedirect("/pavement-systems/ap", "?utm_source=newsletter"), null);
  assert.equal(mod.slashRedirect("/specifiers/", ""), null);
  assert.equal(mod.slashRedirect("/pavement-systems/ap/extra/", ""), null);
  assert.equal(mod.slashRedirect("/pavement-systems/ap//", ""), null);
});

test("homepage structured data is only the website and organization", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  assert.equal(blocks.length, 2);
  const data = blocks.map(function (block) {
    return JSON.parse(block.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, ""));
  });
  assert.equal(data[0]["@type"], "WebSite");
  assert.equal(data[0].name, "Flexus Materials");
  assert.equal(data[0].alternateName, "Flexus");
  assert.equal(data[0].url, "https://www.flexusco.com/");
  assert.equal(data[1]["@type"], "Organization");
  assert.equal(data[1].name, "Flexus Materials Ltd Co");
  assert.equal(data[1].logo, "https://www.flexusco.com/favicon-192.png");
  assert.equal(data[1].telephone, "+1-770-742-6016");
  assert.equal(data[1].address.addressLocality, "Atlanta");
  assert.equal(data[1].address.addressRegion, "GA");
  assert.equal(data[1].address.addressCountry, "US");
  assert.equal(data[1].sameAs, undefined);
  assert.equal(JSON.stringify(data).includes("manufacturer"), false);
  assert.equal(JSON.stringify(data).includes("aggregateRating"), false);
  assert.equal(JSON.stringify(data).includes("Offer"), false);
  const others = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html") && name !== "index.html"; });
  others.forEach(function (name) {
    const page = fs.readFileSync(path.join(root, name), "utf8");
    assert.equal(page.includes('"@type":"WebSite"'), false, name);
  });
});

test("sitemap dates are the publish date and the eleven canonical urls stay", function () {
  const xml = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const locs = xml.match(/<loc>[^<]+<\/loc>/g);
  assert.deepEqual(locs, [
    "<loc>https://www.flexusco.com/</loc>",
    "<loc>https://www.flexusco.com/pavement-systems</loc>",
    "<loc>https://www.flexusco.com/pavement-systems/ap</loc>",
    "<loc>https://www.flexusco.com/pavement-systems/cp</loc>",
    "<loc>https://www.flexusco.com/specifiers</loc>",
    "<loc>https://www.flexusco.com/projects</loc>",
    "<loc>https://www.flexusco.com/projects/mary-esther-azalea-trail</loc>",
    "<loc>https://www.flexusco.com/projects/athens-root-intrusion-sidewalk</loc>",
    "<loc>https://www.flexusco.com/materials</loc>",
    "<loc>https://www.flexusco.com/about</loc>",
    "<loc>https://www.flexusco.com/contact</loc>"
  ]);
  assert.equal((xml.match(/<lastmod>2026-11-12<\/lastmod>/g) || []).length, 11);
  assert.equal(xml.includes("2026-11-02"), false);
});
