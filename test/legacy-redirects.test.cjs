const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const track = require("../tracking.js");

const root = path.join(__dirname, "..");

function load() {
  return require("../netlify/functions/legacy-redirect.js");
}

function params(location) {
  return new URL("https://www.flexusco.com" + location).searchParams;
}

test("quote and material families keep campaign and product values", function () {
  const { redirectFromUrl } = load();
  const quote = redirectFromUrl("/materials/quote?utm_source=newsletter&utm_medium=cpc&utm_campaign=spring&utm_content=ad&utm_term=trail&utm_id=spring01&gclid=abc123XYZ_99&gbraid=Abcd1234_ef&product=colored-granules");
  const query = params(quote);
  assert.equal(quote.startsWith("/contact?"), true);
  assert.equal(query.get("topic"), "materials-quote");
  assert.equal(query.get("product"), "colored-granules");
  assert.equal(query.get("utm_source"), "newsletter");
  assert.equal(query.get("utm_medium"), "cpc");
  assert.equal(query.get("utm_campaign"), "spring");
  assert.equal(query.get("gclid"), "abc123XYZ_99");
  assert.equal(query.get("gbraid"), "Abcd1234_ef");
  assert.equal(quote.includes("#"), false);

  const granules = redirectFromUrl("/materials/rubber-granules.html?utm_source=newsletter&product=colored-granules&grade=5%2F9");
  const g = params(granules);
  assert.equal(granules.split("?")[0], "/materials");
  assert.equal(g.get("to"), "granules");
  assert.equal(g.get("product"), "colored-granules");
  assert.equal(g.get("grade"), "5/9");
  assert.equal(g.get("utm_source"), "newsletter");

  assert.equal(params(redirectFromUrl("/materials/rubber-mulch?utm_source=newsletter")).get("to"), "mulch");
  assert.equal(params(redirectFromUrl("/materials/rubber-buffings.html?utm_medium=cpc")).get("to"), "buffings");
  assert.equal(params(redirectFromUrl("/resources?utm_source=newsletter")).get("to"), "downloads");
  assert.equal(params(redirectFromUrl("/resources.html?gclid=abc123XYZ_99")).get("gclid"), "abc123XYZ_99");
  assert.equal(params(redirectFromUrl("/request-sample?utm_source=newsletter")).get("topic"), "sample");
  assert.equal(params(redirectFromUrl("/request-sample.html?utm_id=box1")).get("utm_id"), "box1");
  assert.equal(params(redirectFromUrl("/installers?utm_source=newsletter")).get("to"), "installation");
  assert.equal(params(redirectFromUrl("/installers.html?utm_source=newsletter")).get("utm_source"), "newsletter");
  assert.equal(params(redirectFromUrl("/stormwater-bmp?utm_campaign=bmp")).get("to"), "stormwater");
  assert.equal(params(redirectFromUrl("/stormwater-bmp.html?utm_campaign=bmp")).get("utm_campaign"), "bmp");
  assert.equal(params(redirectFromUrl("/leed-specification?utm_source=newsletter&to=downloads")).get("to"), "division-32");
  assert.equal(params(redirectFromUrl("/leed-specification.html?utm_source=newsletter")).get("utm_source"), "newsletter");
  assert.equal(params(redirectFromUrl("/municipal-rfp?utm_medium=cpc&to=stormwater")).get("to"), "procurement");
  assert.equal(params(redirectFromUrl("/municipal-rfp.html?gclid=abc123XYZ_99")).get("gclid"), "abc123XYZ_99");
  assert.equal(params(redirectFromUrl("/flexus-final/leed-specification.html?utm_source=newsletter")).get("to"), "division-32");
  assert.equal(params(redirectFromUrl("/flexus-final/municipal-rfp.html?utm_campaign=rfp")).get("to"), "procurement");
  assert.equal(params(redirectFromUrl("/flexus-final/resources.html?utm_source=newsletter")).get("to"), "downloads");
  assert.equal(params(redirectFromUrl("/flexus-final/request-sample.html")).get("topic"), "sample");
  assert.equal(params(redirectFromUrl("/flexus-final/installers.html?utm_medium=email")).get("to"), "installation");
  assert.equal(params(redirectFromUrl("/flexus-final/stormwater-bmp.html?utm_source=newsletter")).get("to"), "stormwater");
});

test("the path topic or to wins over a conflicting source value", function () {
  const { redirectFromUrl } = load();
  const quote = params(redirectFromUrl("/materials/quote?topic=sample&to=mulch&product=rubber-mulch"));
  assert.equal(quote.get("topic"), "materials-quote");
  assert.equal(quote.get("to"), "mulch");
  assert.equal(quote.get("product"), "rubber-mulch");

  const granules = params(redirectFromUrl("/materials/rubber-granules?to=mulch&topic=materials-quote"));
  assert.equal(granules.get("to"), "granules");
  assert.equal(granules.get("topic"), "materials-quote");

  assert.equal(params(redirectFromUrl("/request-sample?topic=materials-quote")).get("topic"), "sample");
  assert.equal(params(redirectFromUrl("/resources?to=stormwater")).get("to"), "downloads");
  assert.equal(params(redirectFromUrl("/stormwater-bmp?to=downloads")).get("to"), "stormwater");
  assert.equal(params(redirectFromUrl("/installers?to=downloads")).get("to"), "installation");
});

test("unknown keys, mail, phone, and off-site targets are not copied", function () {
  const { redirectFromUrl } = load();
  const location = redirectFromUrl("/materials/quote?email=person@example.com&phone=7707426016&name=Ada&next=https://evil.example&url=https://evil.example&redirect=https://evil.example&utm_content=person@example.com&utm_source=%2B14045551212&product=not-a-product&gclid=short");
  const query = params(location);
  assert.equal(query.get("topic"), "materials-quote");
  assert.equal(query.get("email"), null);
  assert.equal(query.get("phone"), null);
  assert.equal(query.get("name"), null);
  assert.equal(query.get("next"), null);
  assert.equal(query.get("url"), null);
  assert.equal(query.get("redirect"), null);
  assert.equal(query.get("utm_content"), null);
  assert.equal(query.get("utm_source"), null);
  assert.equal(query.get("product"), null);
  assert.equal(query.get("gclid"), null);
  assert.equal(location.includes("evil.example"), false);
  assert.equal(location.includes("@"), false);
  assert.equal(location.startsWith("//"), false);
  assert.equal(location.includes("://"), false);
});

test("encoded values are decoded once and checked, and the fragment is not a destination", function () {
  const { redirectFromUrl, redirectLocation } = load();
  const encoded = params(redirectFromUrl("/materials/quote?utm_source=news%6Cetter&product=%63olored-granules&grade=5%2F9"));
  assert.equal(encoded.get("utm_source"), "newsletter");
  assert.equal(encoded.get("product"), "colored-granules");
  assert.equal(encoded.get("grade"), "5/9");

  const twice = redirectFromUrl("/materials/quote?utm_source=news%256Cetter");
  assert.equal(params(twice).get("utm_source"), null);

  const hashed = redirectFromUrl("https://www.flexusco.com/materials/quote?utm_source=newsletter#panel-materials");
  assert.equal(hashed.includes("#"), false);
  assert.equal(params(hashed).get("utm_source"), "newsletter");
  assert.equal(params(hashed).get("topic"), "materials-quote");

  assert.equal(redirectFromUrl("/materials%2Fquote?utm_source=newsletter"), null);
  assert.equal(redirectLocation("/resources/", ""), "/specifiers?to=downloads");
  assert.equal(redirectLocation("/resources//", ""), "/specifiers?to=downloads");
  assert.equal(redirectLocation("/materials//quote", ""), "/contact?topic=materials-quote");
  var slashed = params(redirectLocation("/materials/quote/", "?topic=sample&utm_source=newsletter&product=colored-granules"));
  assert.equal(slashed.get("topic"), "materials-quote");
  assert.equal(slashed.get("product"), "colored-granules");
  assert.equal(slashed.get("utm_source"), "newsletter");
  var leedSlash = params(redirectLocation("/leed-specification.html/", "?utm_source=newsletter&to=downloads"));
  assert.equal(leedSlash.get("to"), "division-32");
  assert.equal(leedSlash.get("utm_source"), "newsletter");
  assert.equal(redirectLocation("/Resources", ""), null);
  assert.equal(redirectLocation("/resources%2F", ""), null);
  assert.equal(redirectLocation("/resources/extra", ""), null);
  assert.equal(redirectFromUrl("/materials/quote/../../contact?topic=sample"), null);
  assert.equal(redirectFromUrl("/materials/quote.html/"), "/contact?topic=materials-quote");
  assert.equal(redirectLocation("/materials/quote", "utm_source=newsletter#panel"), null);
  assert.equal(redirectFromUrl("https://evil.example/materials/quote?utm_source=newsletter").startsWith("/contact?"), true);
  assert.equal(redirectFromUrl("javascript:alert(1)"), null);
});

test("the function returns a relative redirect and the rules forward the query", async function () {
  const legacy = load();
  const response = await legacy.handler({
    httpMethod: "GET",
    rawUrl: "https://deploy-preview-11--flexus-site.netlify.app/materials/quote?utm_source=newsletter&product=colored-granules&topic=sample&email=person@example.com#panel",
    path: "/.netlify/functions/legacy-redirect"
  });
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.Location.startsWith("/contact?"), true);
  assert.equal(response.headers.Location.includes("://"), false);
  assert.equal(response.headers.Location.includes("#"), false);
  assert.equal(params(response.headers.Location).get("topic"), "materials-quote");
  assert.equal(params(response.headers.Location).get("product"), "colored-granules");
  assert.equal(params(response.headers.Location).get("utm_source"), "newsletter");
  assert.equal(params(response.headers.Location).get("email"), null);
  const denied = await legacy.handler({ httpMethod: "POST", rawUrl: "https://www.flexusco.com/materials/quote", path: "/materials/quote" });
  assert.equal(denied.statusCode, 405);
});

test("kept values match the page cleaner, and the redirect rules do not replace the query", function () {
  const legacy = load();
  const samples = [
    "newsletter",
    "person@example.com",
    "colored-granules",
    "not-a-product",
    "abc123XYZ_99",
    "short",
    "5/9",
    "Forest Green",
    "Full"
  ];
  legacy.QUERY_ALLOW.forEach(function (key) {
    samples.forEach(function (value) {
      const raw = new URLSearchParams();
      raw.set(key, value);
      const fromPage = track.allowParams("?" + raw.toString()).get(key) || "";
      const fromRedirect = legacy.acceptValue(key, new URLSearchParams(raw.toString()).get(key));
      assert.equal(fromRedirect, fromPage, key + "=" + value);
    });
  });

  const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
  const lines = redirects.split("\n");
  legacy.LEGACY_PATHS.forEach(function (item) {
    const line = lines.find(function (row) { return row.indexOf(item + " ") === 0 || row.indexOf(item + "\t") === 0; });
    assert.ok(line, item);
    assert.equal(line.includes("?"), false, line);
    assert.equal(line.includes("/.netlify/functions/legacy-redirect"), true, line);
    assert.equal(/\s200\s*$/.test(line), true, line);
  });
  assert.match(redirects, /^\/ap\s+\/pavement-systems\/ap\s+301$/m);
  assert.match(redirects, /^\/budget-estimator\s+\/pavement-systems\s+301$/m);
  assert.equal(fs.existsSync(path.join(root, "netlify/edge-functions")), false);
});
