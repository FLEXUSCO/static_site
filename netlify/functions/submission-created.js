// Netlify Forms event: submission-created.
// The form submission is already stored, and the existing email notification
// is sent by Netlify Forms, before this handler runs.
// Website inquiries are not forwarded to the CRM.
exports.handler = async function () {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, forwarded: false, reason: "crm forwarding off" })
  };
};
