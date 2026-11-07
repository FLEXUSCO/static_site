// Flexus tracking helpers. Pages keep the existing gtag snippet for G-5T6ESYM3SB.
// This file does not load another tag, GTM, or a second measurement ID.
//
// generate_lead stays fail-closed. A Netlify form POST and a static file POST
// can both answer HTTP 200 with HTML, and accepted posts are also reported as
// 200 rather than 302. This site rewrites /thanks to a static page, so landing
// there is not acceptance. Intercepting the POST to inspect the body, then
// falling back to a native submit, can store the lead twice. Native submit
// stays in place. Nothing in production calls markAcceptedLead.
(function (root) {
  var TOPIC = {
    "spec-support": "spec_support",
    sample: "pavement_sample",
    "materials-quote": "materials_quote"
  };
  var TOPIC_OK = {
    spec_support: true,
    pavement_sample: true,
    materials_quote: true
  };
  var LEAD_KEY = "flexus_lead_v1";
  var FORM_SELECTOR = "form[data-flexus-form]";
  var MATERIALS = {
    "rubber-mulch": "rubber_mulch",
    "colored-granules": "colored_granules",
    "rubber-buffings": "rubber_buffings"
  };
  var DOCS = {
    flexus_ap_product_overview: ["ap_product_overview", "AP"],
    ap_install_guide: ["ap_install_guide", "AP"],
    "ap-details": ["ap_details", "AP"],
    flexus_cp_product_overview: ["cp_product_overview", "CP"],
    cp_install_guide: ["cp_install_guide", "CP"],
    "cp-details": ["cp_details", "CP"]
  };
  var REQUIRED = {
    form_start: ["form_id"],
    form_attempt: ["form_id", "topic"],
    form_error: ["form_id", "topic", "error_code"],
    generate_lead: ["topic"],
    contact_click: ["method", "placement"],
    cta_click: ["intent", "placement"],
    file_download: ["document", "series"],
    material_select: ["material", "selected"],
    calculation_complete: ["series", "lift"]
  };
  var ENUMS = {
    form_id: { contact: true },
    topic: TOPIC_OK,
    error_code: { invalid: true },
    method: { phone: true, email: true },
    placement: { header: true, body: true, footer: true, mobile: true },
    intent: TOPIC_OK,
    document: {
      ap_product_overview: true,
      ap_install_guide: true,
      ap_details: true,
      cp_product_overview: true,
      cp_install_guide: true,
      cp_details: true
    },
    series: { AP: true, CP: true },
    material: { rubber_mulch: true, colored_granules: true, rubber_buffings: true },
    lift: { "1.5": true, "2.0": true, "2.5": true },
    cta_placement: { header: true, body: true, mobile: true }
  };

  function topicEnum(value) {
    return TOPIC[value] || "";
  }

  function topicFromLocation(pathname, search) {
    var params = new URLSearchParams(search || "");
    var requested = params.get("topic") || "";
    if (requested === "spec" || requested === "spec-pack") requested = "spec-support";
    if (requested === "materials" || requested === "quote") requested = "materials-quote";
    if (requested === "spec-support" || requested === "sample" || requested === "materials-quote") return requested;
    return "";
  }

  function classifyNetlifyResponse(res) {
    if (!res) return "network";
    var status = Number(res.status);
    if (status >= 400 && status <= 599) return "rejected";
    return "unverified";
  }

  function leadAllowed(classification) {
    return classification === "accepted";
  }

  function shouldPreventNativeSubmit() {
    return false;
  }

  function markAcceptedLead(storage, topic) {
    if (!storage || !TOPIC_OK[topic]) return false;
    storage.setItem(LEAD_KEY, JSON.stringify({ topic: topic }));
    return true;
  }

  function consumeLead(storage) {
    if (!storage) return "";
    var raw = "";
    try { raw = storage.getItem(LEAD_KEY) || ""; } catch (_e) { raw = ""; }
    try { storage.removeItem(LEAD_KEY); } catch (_e2) {}
    if (!raw) return "";
    try {
      var parsed = JSON.parse(raw);
      return TOPIC_OK[parsed.topic] ? parsed.topic : "";
    } catch (_e3) {
      return "";
    }
  }

  function leadEventFromVisit(storage) {
    var topic = consumeLead(storage);
    if (!topic) return null;
    return sanitize("generate_lead", { topic: topic });
  }

  function valueOk(key, value, eventName) {
    if (key === "selected") return typeof value === "boolean";
    if (key === "placement" && eventName === "cta_click") return !!ENUMS.cta_placement[value];
    if (typeof value !== "string") return false;
    if (/https?:|@/i.test(value)) return false;
    return !!(ENUMS[key] && ENUMS[key][value]);
  }

  function sanitize(name, params) {
    var required = REQUIRED[name];
    if (!required) return null;
    var src = params || {};
    var out = {};
    var i;
    for (i = 0; i < required.length; i++) {
      var key = required[i];
      if (!valueOk(key, src[key], name)) return null;
      out[key] = src[key];
    }
    return out;
  }

  function emit(name, params, gtagFn) {
    var safe = sanitize(name, params);
    if (!safe) return null;
    var send = gtagFn || (typeof gtag === "function" ? gtag : null);
    if (send) send("event", name, safe);
    return safe;
  }

  function anchorPlacement(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el.nodeType === 1) {
      if (el.classList) {
        if (el.classList.contains("mobile-action-bar")) return "mobile";
        if (el.classList.contains("sheet")) return "mobile";
        if (el.tagName === "HEADER" && el.classList.contains("nav")) return "header";
        if (el.classList.contains("footer")) return "footer";
      }
      el = el.parentElement;
    }
    return "body";
  }

  function ctaPlacement(node) {
    var place = anchorPlacement(node);
    return ENUMS.cta_placement[place] ? place : "";
  }

  function ctaIntent(href) {
    var raw = String(href || "");
    var query = raw.indexOf("?") === -1 ? "" : raw.slice(raw.indexOf("?") + 1).split("#")[0];
    var topic = "";
    try { topic = new URLSearchParams(query).get("topic") || ""; } catch (_e) { topic = ""; }
    return topicEnum(topic);
  }

  function pdfEvent(href) {
    var path = String(href || "").split("?")[0].split("#")[0];
    var file = path.split("/").pop() || "";
    if (file.slice(-4).toLowerCase() !== ".pdf") return null;
    var stem = file.slice(0, -4);
    var row = DOCS[stem];
    if (!row) return null;
    return sanitize("file_download", { document: row[0], series: row[1] });
  }

  function materialEvent(input, trusted) {
    if (trusted !== true || !input) return null;
    if (input.name !== "Product" || String(input.type).toLowerCase() !== "checkbox") return null;
    var material = MATERIALS[input.value];
    if (!material) return null;
    return sanitize("material_select", { material: material, selected: !!input.checked });
  }

  var SENSITIVE_KEY = /^(email|e-mail|phone|tel|name|first_name|last_name|full_name|address|street|city|zip|postal|postcode|token|password|passwd|secret|ssn)$/i;
  var EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_VALUE = /^\+?[0-9][0-9().\-\s]{8,}$/;

  function sanitizeTrackingUrl(input) {
    try {
      var raw = String(input || "");
      if (!/^https?:\/\//i.test(raw)) return "https://www.flexusco.com/";
      var url = new URL(raw);
      var keys = [];
      url.searchParams.forEach(function (_value, key) { keys.push(key); });
      keys.forEach(function (key) {
        var values = url.searchParams.getAll(key);
        var sensitive = SENSITIVE_KEY.test(key) || values.some(function (value) {
          return EMAIL_VALUE.test(value) || PHONE_VALUE.test(String(value).trim());
        });
        if (sensitive) url.searchParams.delete(key);
      });
      url.hash = "";
      return url.toString();
    } catch (_err) {
      return "https://www.flexusco.com/";
    }
  }

  function gaConfig() {
    var out = {};
    try {
      if (typeof location !== "undefined" && location.href) out.page_location = sanitizeTrackingUrl(location.href);
    } catch (_err) {}
    try {
      if (typeof document !== "undefined" && document.referrer) out.page_referrer = sanitizeTrackingUrl(document.referrer);
    } catch (_err2) {}
    return out;
  }

  function calculationEvent(view, fromUser, memory) {
    var state = memory || {};
    if (fromUser !== true || !view || view.monetaryLive !== true || view.ok !== true) return null;
    if (!ENUMS.series[view.series] || !ENUMS.lift[view.lift]) return null;
    var sig = view.series + "|" + view.lift + "|" + String(view.areaSf);
    if (state.last === sig) return null;
    state.last = sig;
    return sanitize("calculation_complete", { series: view.series, lift: view.lift });
  }

  var api = {
    FORM_SELECTOR: FORM_SELECTOR,
    topicEnum: topicEnum,
    topicFromLocation: topicFromLocation,
    classifyNetlifyResponse: classifyNetlifyResponse,
    leadAllowed: leadAllowed,
    shouldPreventNativeSubmit: shouldPreventNativeSubmit,
    markAcceptedLead: markAcceptedLead,
    consumeLead: consumeLead,
    leadEventFromVisit: leadEventFromVisit,
    sanitize: sanitize,
    emit: emit,
    anchorPlacement: anchorPlacement,
    ctaPlacement: ctaPlacement,
    ctaIntent: ctaIntent,
    pdfEvent: pdfEvent,
    materialEvent: materialEvent,
    calculationEvent: calculationEvent,
    sanitizeTrackingUrl: sanitizeTrackingUrl,
    gaConfig: gaConfig
  };

  root.FlexusTrack = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
