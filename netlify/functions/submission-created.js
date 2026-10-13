// Netlify Forms event: submission-created.
// Forwards a lead to the CRM when CRM_WEBHOOK_URL is set. No-ops with 200 otherwise.
// Optional CRM_WEBHOOK_SECRET is sent as X-Flexus-Webhook-Secret.

exports.handler = async function (event) {
  const webhookUrl = process.env.CRM_WEBHOOK_URL;
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
  if (process.env.CRM_WEBHOOK_SECRET) {
    headers["X-Flexus-Webhook-Secret"] = process.env.CRM_WEBHOOK_SECRET;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(forward)
    });
    if (!res.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, forwarded: false, status: res.status })
      };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, forwarded: true }) };
  } catch (_err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, forwarded: false, error: "webhook request failed" })
    };
  }
};
