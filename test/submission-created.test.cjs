const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "netlify", "functions", "submission-created.js");

function eventFor(topic) {
  return {
    body: JSON.stringify({
      payload: {
        form_name: "contact",
        data: {
          "form-name": "contact",
          Topic: topic,
          Name: "Labeled Check",
          Email: "labeled-check@example.com"
        }
      }
    })
  };
}

test("submission-created does not call the CRM even when a webhook address is present", async function () {
  const previousUrl = process.env.CRM_WEBHOOK_URL;
  const previousSecret = process.env.CRM_WEBHOOK_SECRET;
  process.env.CRM_WEBHOOK_URL = "https://crm.example/hook";
  process.env.CRM_WEBHOOK_SECRET = "not-a-real-secret";
  const calls = [];
  const previousFetch = global.fetch;
  global.fetch = function () {
    calls.push("called");
    throw new Error("fetch must not run");
  };
  delete require.cache[require.resolve("../netlify/functions/submission-created.js")];
  const fn = require("../netlify/functions/submission-created.js");
  try {
    for (const topic of ["spec-support", "sample", "materials-quote"]) {
      const result = await fn.handler(eventFor(topic));
      const body = JSON.parse(result.body);
      assert.equal(result.statusCode, 200);
      assert.equal(body.forwarded, false);
    }
    assert.deepEqual(calls, []);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.CRM_WEBHOOK_URL;
    else process.env.CRM_WEBHOOK_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.CRM_WEBHOOK_SECRET;
    else process.env.CRM_WEBHOOK_SECRET = previousSecret;
  }
});

test("the handler source has no outbound request", function () {
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("http"), false);
});
