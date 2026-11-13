const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const https = require("https");
const root = path.join(__dirname, "..");
const track = require("../tracking.js");

function visible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function get(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { "user-agent": "flexus-static-compare" } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(res.headers.location));
        return;
      }
      const chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    }).on("error", reject);
  });
}

test("unknown query keys and sensitive values stay out of the session URL", function () {
  const dirty = "https://www.flexusco.com/contact?topic=spec-support&utm_source=newsletter&utm_content=person@example.com&email=person@example.com&phone=7707426016&search=secret&q=lead&unknown_token=abc&gclid=abc123XYZ_99#granules";
  const clean = track.cleanedUrl(dirty);
  assert.equal(clean.searchParams.get("topic"), "spec-support");
  assert.equal(clean.searchParams.get("utm_source"), "newsletter");
  assert.equal(clean.searchParams.get("gclid"), "abc123XYZ_99");
  assert.equal(clean.searchParams.get("email"), null);
  assert.equal(clean.searchParams.get("phone"), null);
  assert.equal(clean.searchParams.get("search"), null);
  assert.equal(clean.searchParams.get("q"), null);
  assert.equal(clean.searchParams.get("unknown_token"), null);
  assert.equal(clean.searchParams.get("utm_content"), null);
  assert.equal(clean.hash, "#granules");
  const historyTarget = track.sameOriginTarget(dirty, dirty);
  assert.equal(historyTarget.includes("unknown_token"), false);
  assert.equal(historyTarget.includes("person@example.com"), false);
  assert.equal(historyTarget.startsWith("/contact?"), true);
});

test("attribution keeps campaign ids and drops the raw referrer query", function () {
  const stored = track.attributionFrom(
    "https://www.flexusco.com/contact?utm_source=newsletter&token=secret&topic=sample",
    "https://partner.example/land?email=person@example.com&utm_medium=cpc"
  );
  assert.equal(stored.utm_source, "newsletter");
  assert.equal(stored.landing_page.includes("token="), false);
  assert.equal(stored.landing_page.includes("topic=sample"), true);
  assert.equal(stored.referrer.includes("person@example.com"), false);
  assert.equal(stored.referrer.includes("utm_medium=cpc"), true);
});

test("production collection is host-gated and custom form/download events stay off", function () {
  assert.equal(track.productionHost("www.flexusco.com"), true);
  assert.equal(track.productionHost("flexusco.com"), true);
  assert.equal(track.productionHost("127.0.0.1"), false);
  assert.equal(track.productionHost("deploy-preview-10.netlify.app"), false);
  assert.equal(track.productionHost("localhost"), false);
  const events = track.enabledEvents({ forms: false, downloads: false });
  assert.deepEqual(events, ["contact_click", "cta_click", "material_select"]);
  assert.equal(events.includes("form_start"), false);
  assert.equal(events.includes("file_download"), false);
  assert.equal(events.includes("generate_lead"), false);
  const analytics = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
  assert.match(analytics, /forms:\s*false/);
  assert.match(analytics, /downloads:\s*false/);
  assert.equal(analytics.includes("generate_lead"), false);
  assert.equal(analytics.includes("nav_cta_click"), false);
  assert.equal(analytics.includes("form_submit"), false);
});

test("tracking.js is loaded once, in the head, before any tag", function () {
  const htmlFiles = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); });
  assert.equal(htmlFiles.includes("budget-estimator.html"), false);
  htmlFiles.forEach(function (name) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    const heads = html.split("</head>")[0];
    const body = html.split("</head>")[1] || "";
    assert.equal((html.match(/src="\/tracking\.js"/g) || []).length, 1, name);
    assert.equal(heads.includes('src="/tracking.js"'), true, name);
    assert.equal(body.includes('src="/tracking.js"'), false, name);
    assert.equal(html.includes("googletagmanager.com"), false, name);
    assert.equal(html.includes("generate_lead"), false, name);
  });
  const site = fs.readFileSync(path.join(root, "site.js"), "utf8");
  assert.equal(site.includes("submitNetlifyForm"), false);
  assert.equal(site.includes('form[data-netlify="true"]'), false);
  assert.equal(site.includes("form[data-flexus-form]"), true);
  const contact = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  assert.match(contact, /Sent to Flexus\. We reply by email\./);
  assert.match(contact, /data-flexus-form="contact"/);
});

test("application and ad parameters keep their shape and free text does not", function () {
  const dirty = "https://www.flexusco.com/resources?pack=Full&packnote=send+everything&gbraid=Abcd1234_ef&wbraid=short&gad_source=1&gad_campaignid=12345678901&msclkid=0123456789abcdef0123456789abcdef&utm_id=spring-2026&srsltid=abcdefghij&dclid=ABCDEFGH&_gl=1*abc123*def456&from=contact&to=downloads";
  const clean = track.cleanedUrl(dirty);
  assert.equal(clean.searchParams.get("pack"), "Full");
  assert.equal(clean.searchParams.get("packnote"), null);
  assert.equal(clean.searchParams.get("gbraid"), "Abcd1234_ef");
  assert.equal(clean.searchParams.get("wbraid"), null);
  assert.equal(clean.searchParams.get("gad_source"), "1");
  assert.equal(clean.searchParams.get("gad_campaignid"), "12345678901");
  assert.equal(clean.searchParams.get("msclkid"), "0123456789abcdef0123456789abcdef");
  assert.equal(clean.searchParams.get("utm_id"), "spring-2026");
  assert.equal(clean.searchParams.get("srsltid"), "abcdefghij");
  assert.equal(clean.searchParams.get("dclid"), "ABCDEFGH");
  assert.equal(clean.searchParams.get("_gl"), "1*abc123*def456");
  assert.equal(clean.searchParams.get("from"), "contact");
  assert.equal(clean.searchParams.get("to"), "downloads");
  assert.equal(track.cleanedUrl("https://www.flexusco.com/?pack=not%20a%20pack").searchParams.get("pack"), null);
  assert.equal(fs.existsSync(path.join(root, "netlify.toml")), false);
  assert.equal(fs.existsSync(path.join(root, "scripts", "stage-publish.js")), false);
});

test("contact fields match the existing deploy log and the functions stay the two known files", function () {
  const html = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
  const names = [];
  const re = /name="([^"]+)"/g;
  let match;
  while ((match = re.exec(form))) names.push(match[1]);
  const expected = ["contact", "form-name", "source", "segment", "page", "landing_page", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "Company", "Unit", "bot-field", "Topic", "Name", "Email", "Organization", "Phone", "Series", "ProjectLocation", "Series", "Lifts", "ShippingAddress", "Product", "Product", "Product", "Grade", "Color", "GranuleColor", "Quantity", "ShipToZIP", "ShippingAddress", "Need", "Need", "Notes"];
  assert.deepEqual(names, expected);
  const functions = fs.readdirSync(path.join(root, "netlify", "functions")).filter(function (name) { return name.endsWith(".js"); });
  assert.deepEqual(functions.sort(), ["legacy-redirect.js", "submission-created.js"]);
});

test("visible contact text matches the current production HTML", async function () {
  const live = await get("https://www.flexusco.com/contact");
  const local = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  assert.equal(visible(local), visible(live));
  const home = await get("https://www.flexusco.com/");
  const localHome = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(visible(localHome), visible(home));
});
