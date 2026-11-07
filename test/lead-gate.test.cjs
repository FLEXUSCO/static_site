const test = require("node:test");
const assert = require("node:assert/strict");
const lead = require("../netlify/functions/lead-gate");
const { handleSubmission } = require("../netlify/functions/submission-created");

function armedEnv(extra) {
  return Object.assign({
    GA_COLLECT_ENABLED: "true",
    CONTEXT: "production",
    GA_MP_API_SECRET: "present-not-a-real-secret",
    CRM_WEBHOOK_URL: ""
  }, extra || {});
}

function ready(overrides) {
  return lead.decide(Object.assign({
    env: armedEnv(),
    consent: "granted",
    testMarker: false,
    verificationOk: true,
    claimed: true,
    topic: "sample"
  }, overrides || {}));
}

function memoryStore() {
  const keys = new Set();
  let chain = Promise.resolve();
  return {
    set: function (key, _value, opts) {
      const prev = chain;
      let release;
      chain = new Promise(function (resolve) { release = resolve; });
      return prev.then(function () {
        const exists = keys.has(key);
        if (!(opts && opts.onlyIfNew && exists)) keys.add(key);
        release();
        return { modified: !(opts && opts.onlyIfNew && exists), etag: "1" };
      });
    },
    delete: function (key) {
      keys.delete(key);
      return Promise.resolve();
    },
    has: function (key) { return keys.has(key); }
  };
}

test("production, local, preview, and missing secret do not collect", function () {
  assert.equal(lead.environmentBlock({}), "unconfigured");
  assert.equal(lead.environmentBlock({ GA_COLLECT_ENABLED: "true" }), "not_production");
  assert.equal(lead.environmentBlock({ GA_COLLECT_ENABLED: "true", CONTEXT: "dev" }), "not_production");
  assert.equal(lead.environmentBlock({ GA_COLLECT_ENABLED: "true", CONTEXT: "deploy-preview" }), "not_production");
  assert.equal(lead.environmentBlock({ GA_COLLECT_ENABLED: "true", CONTEXT: "branch-deploy" }), "not_production");
  assert.equal(lead.environmentBlock({ GA_COLLECT_ENABLED: "true", CONTEXT: "production" }), "secret_missing");
  assert.equal(lead.decide({ env: {} }).send, false);
  assert.equal(lead.decide({ env: { GA_COLLECT_ENABLED: "true", CONTEXT: "deploy-preview", GA_MP_API_SECRET: "x" } }).reason, "not_production");
});

test("consent unresolved or denied blocks collection even when every other gate is open", function () {
  assert.equal(ready({ consent: "unresolved" }).reason, "consent_unresolved");
  assert.equal(ready({ consent: undefined }).reason, "consent_unresolved");
  assert.equal(ready({ consent: "granted-by-hidden-field" }).reason, "consent_unresolved");
  assert.equal(ready({ consent: "denied" }).reason, "consent_denied");
  assert.equal(lead.productionDecision(armedEnv()).send, false);
  assert.equal(lead.productionDecision(armedEnv()).reason, "consent_unresolved");
});

test("a test marker, a forged event, a rejected topic, and a missing claim do not collect", function () {
  assert.equal(ready({ testMarker: true }).reason, "test_marker");
  assert.equal(ready({ verificationOk: false }).reason, "unverified");
  assert.equal(ready({ claimed: false }).reason, "not_claimed");
  assert.equal(ready({ topic: "budget-estimate" }).reason, "topic_rejected");
  assert.equal(ready({ topic: "sample" }).send, true);
  assert.equal(ready({ topic: "sample" }).topic, "pavement_sample");
});

test("onlyIfNew claim is single-use under overlap and releases after a failed send", async function () {
  const store = memoryStore();
  const id = "abc12345";
  const both = await Promise.all([lead.claimOnce(store, id), lead.claimOnce(store, id)]);
  const wins = both.filter(function (row) { return row.claimed; });
  assert.equal(wins.length, 1);
  assert.equal(both.filter(function (row) { return row.reason === "replay"; }).length, 1);
  assert.equal((await lead.claimOnce(store, id)).reason, "replay");
  assert.equal(await lead.releaseClaim(store, id), true);
  assert.equal((await lead.claimOnce(store, id)).claimed, true);
  assert.equal((await lead.claimOnce(null, id)).reason, "store_unconfigured");
  assert.equal((await lead.claimOnce(store, "short")).reason, "submission_id_rejected");
});

test("the CRM handler does not call a collector and still retries only the CRM", async function () {
  const calls = [];
  const fetchImpl = async function (url) {
    calls.push(String(url));
    if (calls.length === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200 };
  };
  const env = armedEnv({ CRM_WEBHOOK_URL: "https://crm.example.test/hook", CRM_WEBHOOK_SECRET: "crm-secret" });
  const event = { body: JSON.stringify({ payload: { form_name: "contact", number: 4, data: { Name: "Local", Email: "local@example.com", Topic: "sample" } } }) };
  const first = await handleSubmission(event, { env: env, fetch: fetchImpl });
  const second = await handleSubmission(event, { env: env, fetch: fetchImpl });
  assert.equal(first.statusCode, 502);
  assert.equal(JSON.parse(first.body).ga, "consent_unresolved");
  assert.equal(second.statusCode, 200);
  assert.equal(calls.length, 2);
  calls.forEach(function (url) {
    assert.equal(url, "https://crm.example.test/hook");
    assert.equal(url.includes("google-analytics.com"), false);
  });
  const honeypot = await handleSubmission({
    body: JSON.stringify({ payload: { data: { "bot-field": "spam" } } })
  }, { env: env, fetch: fetchImpl });
  assert.equal(honeypot.statusCode, 200);
  assert.equal(JSON.parse(honeypot.body).reason, "honeypot");
  assert.equal(calls.length, 2);
});
