const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HEADER = '<a href="/pavement-systems" data-path="/pavement-systems">Pavement</a><a href="/specifiers" data-path="/specifiers">Specifiers</a><a href="/projects" data-path="/projects">Projects</a><a href="/materials" data-path="/materials">Materials</a><a href="/about" data-path="/about">About</a><a href="/contact" data-path="/contact">Contact</a>';
const FOOTER = '<nav class="footer-nav" aria-label="Footer"><a href="/">Home</a><a href="/pavement-systems">Pavement</a><a href="/pavement-systems/ap">AP</a><a href="/pavement-systems/cp">CP</a><a href="/specifiers">Specifiers</a><a href="/projects">Projects</a><a href="/materials">Materials</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></nav>';
const SECTIONS = [
  ["who-we-are", "Who we are"],
  ["information-we-collect", "Information we collect"],
  ["how-we-use", "How we use information"],
  ["cookies-and-analytics", "Cookies and analytics"],
  ["how-we-share", "How we share information"],
  ["data-retention", "Data retention"],
  ["data-security", "Data security"],
  ["your-choices", "Your choices and rights"],
  ["childrens-privacy", "Children's privacy"],
  ["third-party-links", "Third-party links"],
  ["changes", "Changes to this policy"],
  ["contact-us", "Contact us"]
];

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function mainHtml(html) {
  const start = html.indexOf("<main>");
  const end = html.indexOf("</main>");
  return html.slice(start, end);
}

test("privacy policy has one h1, every section, and no em dashes", function () {
  const html = read("privacy.html");
  const h1 = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || [];
  assert.equal(h1.length, 1);
  assert.equal(h1[0].includes("Privacy Policy"), true);
  assert.equal(html.includes("Last updated: November 13, 2026"), true);
  assert.equal(html.includes("Effective date"), false);
  assert.equal(html.includes("sends a notification to our email"), true);
  assert.equal(html.includes("customer records is turned on"), false);
  assert.equal(html.includes("empty hidden field"), false);
  assert.equal(html.includes("unit as bags"), false);
  assert.equal(html.includes("spam filtering"), true);
  assert.equal(html.includes("does not log or store full IP addresses"), true);
  assert.equal(html.includes("separate control that strips"), false);
  assert.equal(html.includes("ask the recipient to honor this policy"), true);
  assert.equal(html.includes("remains bound by this policy"), false);
  assert.equal(html.includes(">Company.</strong>"), false);
  assert.equal(html.includes("Email: <a href=\"mailto:info@flexusco.com\">info@flexusco.com</a>"), true);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(/(?:^|[>\s])F\s+Flexus/.test(html), false);
  assert.equal(/\$\d/.test(html), false);
  SECTIONS.forEach(function (pair) {
    assert.equal(html.includes('id="' + pair[0] + '"'), true, pair[0]);
    assert.equal(html.includes(">" + pair[1] + "<"), true, pair[1]);
    assert.equal(html.includes('href="#' + pair[0] + '"'), true, pair[0]);
  });
  const head = html.split("</head>")[0];
  assert.equal((html.match(/src="\/tracking\.js"/g) || []).length, 1);
  assert.equal(head.includes('src="/tracking.js"'), true);
  assert.equal((html.match(/clarity\.ms\/tag\//g) || []).length, 1);
  assert.equal(html.includes("googletagmanager.com"), false);
});

test("privacy policy links use a real address and descriptive text", function () {
  const main = mainHtml(read("privacy.html"));
  const re = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  let count = 0;
  while ((match = re.exec(main))) {
    count += 1;
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    assert.equal(text.length > 0, true, href);
    assert.equal(/^https:\/\/|^mailto:|^tel:|^\/|^#/.test(href), true, href);
    assert.equal(text === href, false, href);
    assert.equal(/^https?:\/\//.test(text), false, text);
    if (href.startsWith("#")) {
      assert.equal(main.includes('id="' + href.slice(1) + '"'), true, href);
    }
  }
  assert.equal(count >= 12, true);
  assert.equal(main.includes("https://tools.google.com/dlpage/gaoptout"), true);
  assert.equal(main.includes("https://adssettings.google.com"), true);
  assert.equal(main.includes("https://privacy.microsoft.com/privacystatement"), true);
  assert.equal(main.includes("Netlify Forms"), true);
  assert.equal(main.includes("Google signals"), true);
  assert.equal(main.includes("Global Privacy Control"), true);
  assert.equal(main.includes("Do Not Track"), true);
  assert.equal(main.includes("Google Workspace"), true);
});

test("header nav and footer stay the same on every page", function () {
  fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); }).forEach(function (name) {
    const html = read(name);
    const header = (html.match(/<nav class="nav-links" data-nav>([\s\S]*?)<\/nav>/) || [])[1] || "";
    const normalized = header.replace(/\s+class="active"/g, "").replace(/\s+/g, "");
    assert.equal(normalized.includes('href="/privacy"'), false, name);
    assert.equal(normalized.includes(HEADER.replace(/\s+/g, "")), true, name);
    assert.equal((html.match(/<nav class="footer-nav"[\s\S]*?<\/nav>/g) || []).length, 1, name);
    assert.equal(html.includes(FOOTER), true, name);
  });
});
