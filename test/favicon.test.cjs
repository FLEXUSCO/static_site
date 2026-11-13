const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pages = ["index.html", "about.html", "contact.html", "materials.html", "pavement-systems.html", "pavement-ap.html", "pavement-cp.html", "projects.html", "mary-esther-azalea-trail.html", "athens-root-intrusion-sidewalk.html", "specifiers.html", "privacy.html"];
const GLYPH = "M71 0V700H518V603H191V398H458V303H191V0Z";

test("favicon files are the DM Sans F and the ico contains 16, 32, and 48", function () {
  const svg = fs.readFileSync(path.join(root, "favicon.svg"), "utf8");
  assert.equal(svg.includes(GLYPH), true);
  assert.equal(svg.includes('fill="#0d0d0e"'), true);
  const ico = fs.readFileSync(path.join(root, "favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  const sizes = [];
  for (let i = 0; i < 3; i += 1) {
    const width = ico.readUInt8(6 + i * 16) || 256;
    const height = ico.readUInt8(7 + i * 16) || 256;
    const offset = ico.readUInt32LE(18 + i * 16);
    sizes.push(width + "x" + height);
    assert.equal(ico.subarray(offset, offset + 8).toString("hex"), "89504e470d0a1a0a");
  }
  assert.deepEqual(sizes, ["16x16", "32x32", "48x48"]);
  function pngSize(name) {
    const buf = fs.readFileSync(path.join(root, name));
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    return buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20);
  }
  assert.equal(pngSize("favicon-192.png"), "192x192");
  assert.equal(pngSize("favicon-512.png"), "512x512");
  assert.equal(pngSize("apple-touch-icon.png"), "180x180");
});

test("the current pages link the favicon and nothing else in the body changed for it", function () {
  pages.forEach(function (name) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    const head = html.split("</head>")[0];
    const body = html.split("</head>")[1] || "";
    assert.equal(head.includes('href="/favicon.ico"'), true, name);
    assert.equal(head.includes('href="/favicon.svg"'), true, name);
    assert.equal(head.includes('href="/apple-touch-icon.png"'), true, name);
    assert.equal(body.includes("favicon"), false, name);
    assert.equal((html.match(/src="\/tracking\.js"/g) || []).length, 1, name);
  });
  const thanks = fs.readFileSync(path.join(root, "thanks.html"), "utf8");
  assert.equal(thanks.includes("favicon"), false);
  assert.equal(fs.existsSync(path.join(root, "budget-estimator.html")), false);
});
