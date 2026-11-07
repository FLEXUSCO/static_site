// Netlify Forms event: submission-created.
// Forwards a lead to the CRM when CRM_WEBHOOK_URL is set. No-ops with 200 otherwise.
// Optional CRM_WEBHOOK_SECRET is sent as X-Flexus-Webhook-Secret.
// GA collection is decided separately and is unwired. A CRM failure still returns
// 502 for the CRM call only. The gate never performs a collect request.

const leadGate = require("./lead-gate");

async function handleSubmission(event, deps) {
  const env = (deps && deps.env) || process.env;
  let leadDecision;
  try {
    leadDecision = leadGate.productionDecision(env);
  } catch (_gateErr) {
    leadDecision = { send: false, reason: "gate_error" };
  }
  if (leadDecision.send) {
    leadDecision = { send: false, reason: "collector_unwired" };
  }

  const webhookUrl = env.CRM_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, forwarded: false, reason: "CRM_WEBHOOK_URL unset" })
    };
  }

  let payload;
  try {
    const raw = event && event.body;
    const body = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    payload = body.payload || body;
  } catch (_err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "invalid JSON" }) };
  }

  const data = payload && payload.data ? payload.data : {};
  if (data["bot-field"]) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, forwarded: false, reason: "honeypot" })
    };
  }

  const forward = {
    segment: data.segment || "",
    form_name: (payload && payload.form_name) || data["form-name"] || "",
    source: data.source || "flexusco.com",
    created_at: (payload && payload.created_at) || null,
    site_url: (payload && payload.site_url) || null,
    number: payload && Object.prototype.hasOwnProperty.call(payload, "number") ? payload.number : null,
    data: data
  };

  const headers = { "Content-Type": "application/json" };
  if (env.CRM_WEBHOOK_SECRET) {
    headers["X-Flexus-Webhook-Secret"] = env.CRM_WEBHOOK_SECRET;
  }

  const fetchImpl = (deps && deps.fetch) || fetch;
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(forward)
    });
    if (!res.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, forwarded: false, status: res.status, ga: leadDecision.reason })
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, forwarded: true, ga: leadDecision.reason })
    };
  } catch (_err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, forwarded: false, error: "webhook request failed", ga: leadDecision.reason })
    };
  }
}

exports.handleSubmission = handleSubmission;
exports.handler = function (event) {
  return handleSubmission(event, { env: process.env, fetch: fetch });
};
