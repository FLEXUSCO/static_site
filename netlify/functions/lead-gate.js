"use strict";

// Collection gate for a future verified-submission conversion.
// The wired production path cannot send. See productionDecision.
//
// Documented limits, checked against current vendor docs on 2026-11-07:
// - Netlify verifies a JWS before it invokes an event function
//   (https://docs.netlify.com/build/functions/trigger-on-events/). The docs
//   do not give the function a header or secret it can check itself, and they
//   do not say the legacy HTTP URL for submission-created.js rejects an
//   unsigned POST. A body that merely looks like a submission is not proof.
// - formSubmitted event.data is the verified field map. The docs do not
//   include a submission id there (same page).
// - The Forms API documents listing verified submissions. It does not
//   document a get-by-id read or a completeness guarantee for that list
//   (https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/).
// - Blobs set(..., { onlyIfNew: true }) is a conditional create that reports
//   whether it wrote (https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
//   The same page says overlapping writes are last-write-wins and Blobs is
//   not a general lock. onlyIfNew is not a transaction around a later HTTP call.
// - GA4 Measurement Protocol documents transaction_id for purchase dedup. It
//   does not document a general event_id dedup
//   (https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events).

var TOPIC = {
  "spec-support": "spec_support",
  sample: "pavement_sample",
  "materials-quote": "materials_quote"
};

function environmentBlock(env) {
  var source = env || {};
  if (source.GA_COLLECT_ENABLED !== "true") return "unconfigured";
  if (source.CONTEXT !== "production") return "not_production";
  if (!source.GA_MP_API_SECRET) return "secret_missing";
  return "";
}

function decide(input) {
  var src = input || {};
  var envReason = environmentBlock(src.env);
  if (envReason) return { send: false, reason: envReason };
  if (src.consent === "denied") return { send: false, reason: "consent_denied" };
  if (src.consent !== "granted") return { send: false, reason: "consent_unresolved" };
  if (src.testMarker === true) return { send: false, reason: "test_marker" };
  if (src.verificationOk !== true) return { send: false, reason: "unverified" };
  if (src.claimed !== true) return { send: false, reason: "not_claimed" };
  var topic = TOPIC[src.topic];
  if (!topic) return { send: false, reason: "topic_rejected" };
  return { send: true, reason: "ready", topic: topic };
}

function productionDecision(env) {
  // The site does not call gtag('consent') and the 2026-11-06 Admin preflight
  // shows consent signals inactive. A form field is not a consent signal.
  return decide({
    env: env,
    consent: "unresolved",
    testMarker: false,
    verificationOk: false,
    claimed: false,
    topic: ""
  });
}

function claimOnce(store, submissionId) {
  if (!store || typeof store.set !== "function") {
    return Promise.resolve({ claimed: false, reason: "store_unconfigured" });
  }
  if (typeof submissionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(submissionId)) {
    return Promise.resolve({ claimed: false, reason: "submission_id_rejected" });
  }
  var key = "lead-ga/" + submissionId;
  return Promise.resolve(store.set(key, "pending", { onlyIfNew: true })).then(function (result) {
    if (!result || result.modified !== true) return { claimed: false, reason: "replay" };
    return { claimed: true, key: key };
  }, function () {
    return { claimed: false, reason: "store_error" };
  });
}

function releaseClaim(store, submissionId) {
  if (!store || typeof store.delete !== "function") return Promise.resolve(false);
  if (typeof submissionId !== "string") return Promise.resolve(false);
  return Promise.resolve(store.delete("lead-ga/" + submissionId)).then(function () {
    return true;
  }, function () {
    return false;
  });
}

module.exports = {
  TOPIC: TOPIC,
  environmentBlock: environmentBlock,
  decide: decide,
  productionDecision: productionDecision,
  claimOnce: claimOnce,
  releaseClaim: releaseClaim
};
