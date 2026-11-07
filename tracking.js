// One synchronous head script. It runs before site.js and before any production tag.
// Enhanced measurement owns form and download events until an owner turns those
// Admin toggles off and a later deploy enables the matching flags in analytics.js.
// Renaming an event does not dedupe the enhanced hit.
(function (root) {
  "use strict";

  var MEASUREMENT_ID = "G-5T6ESYM3SB";
  var PRODUCTION_HOSTS = { "www.flexusco.com": true, "flexusco.com": true };
  var TOKEN = /^[A-Za-z0-9][A-Za-z0-9 ._+~-]{0,79}$/;
  var CLICK = /^[A-Za-z0-9_-]{8,250}$/;
  var RULES = {
    topic: /^(spec-support|sample|materials-quote|spec|spec-pack|materials|quote)$/,
    product: /^(rubber-mulch|colored-granules|rubber-buffings)$/,
    grade: /^(5\/9|6\/16|10-20|infill)$/,
    color: /^(Black|Forest Green|Green|Teal Green|Espresso|Brown|Cedar|Gold|Red)$/,
    to: /^[A-Za-z][A-Za-z0-9_-]{0,40}$/,
    blend: /^(CE275|SD255|NT265|CG218)$/,
    pack: /^(Full|AP|CP)$/,
    from: /^contact$/,
    utm_source: TOKEN,
    utm_medium: TOKEN,
    utm_campaign: TOKEN,
    utm_content: TOKEN,
    utm_term: TOKEN,
    utm_id: TOKEN,
    gclid: CLICK,
    gbraid: CLICK,
    wbraid: CLICK,
    dclid: CLICK,
    fbclid: CLICK,
    srsltid: CLICK,
    msclkid: /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    gad_source: /^[0-9]{1,4}$/,
    gad_campaignid: /^[0-9]{1,20}$/,
    _gl: /^[A-Za-z0-9._*~-]{8,512}$/
  };
  var QUERY_ALLOW = Object.keys(RULES);
  var TEXT_KEYS = { utm_source: true, utm_medium: true, utm_campaign: true, utm_content: true, utm_term: true, utm_id: true };
  var ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "fbclid"];
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE = /^\+?[0-9][0-9().\-\s]{8,}$/;
  var HASH_OK = /^#[A-Za-z0-9_-]{1,64}$/;
  var ATTR_STORAGE = "flexus_attr_v1";

  function productionHost(hostname) {
    return PRODUCTION_HOSTS[String(hostname || "").toLowerCase()] === true;
  }

  function acceptValue(key, value) {
    var rule = RULES[key];
    var text = value == null ? "" : String(value);
    if (!rule || !rule.test(text)) return "";
    if (EMAIL.test(text)) return "";
    if (TEXT_KEYS[key] && PHONE.test(text.trim())) return "";
    return text;
  }

  function allowParams(search) {
    var raw = String(search || "");
    if (raw.charAt(0) === "?") raw = raw.slice(1);
    var incoming = new URLSearchParams(raw);
    var out = new URLSearchParams();
    QUERY_ALLOW.forEach(function (key) {
      if (!incoming.has(key)) return;
      var value = acceptValue(key, incoming.get(key));
      if (value) out.append(key, value);
    });
    return out;
  }

  function cleanedUrl(input, base) {
    var url = new URL(String(input), base || "https://www.flexusco.com");
    var kept = allowParams(url.search);
    url.search = kept.toString() ? "?" + kept.toString() : "";
    if (url.hash && !HASH_OK.test(url.hash)) url.hash = "";
    return url;
  }

  function sameOriginTarget(url, currentHref) {
    if (typeof url !== "string") return url;
    var current = new URL(currentHref);
    var next = new URL(url, currentHref);
    if (next.origin !== current.origin) return url;
    var clean = cleanedUrl(next.href, currentHref);
    return clean.pathname + clean.search + clean.hash;
  }

  function attributionFrom(href, referrer) {
    var url = cleanedUrl(href);
    var params = allowParams(url.search);
    var stored = {
      landing_page: url.pathname + (params.toString() ? "?" + params.toString() : "")
    };
    ATTR_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) stored[key] = value;
    });
    if (referrer) stored.referrer = cleanedUrl(referrer).toString();
    return stored;
  }

  function enabledEvents(owner) {
    var on = owner || {};
    var events = ["contact_click", "cta_click", "material_select"];
    if (on.forms === true) events.push("form_start", "form_attempt", "form_error");
    if (on.downloads === true) events.push("file_download");
    return events;
  }

  var TOPIC = {
    "spec-support": "spec_support",
    sample: "pavement_sample",
    "materials-quote": "materials_quote"
  };
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
    contact_click: ["method", "placement"],
    cta_click: ["intent", "placement"],
    material_select: ["material", "selected"],
    file_download: ["document", "series"],
    form_start: ["form_id"],
    form_attempt: ["form_id", "topic"],
    form_error: ["form_id", "topic", "error_code"]
  };
  var ENUMS = {
    method: { phone: true, email: true },
    placement: { header: true, body: true, footer: true, mobile: true },
    cta_placement: { header: true, body: true, mobile: true },
    intent: { spec_support: true, pavement_sample: true, materials_quote: true },
    material: { rubber_mulch: true, colored_granules: true, rubber_buffings: true },
    document: {
      ap_product_overview: true, ap_install_guide: true, ap_details: true,
      cp_product_overview: true, cp_install_guide: true, cp_details: true
    },
    series: { AP: true, CP: true },
    form_id: { contact: true },
    topic: { spec_support: true, pavement_sample: true, materials_quote: true },
    error_code: { invalid: true }
  };

  function topicEnum(value) { return TOPIC[value] || ""; }

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
    for (var i = 0; i < required.length; i++) {
      if (!valueOk(required[i], src[required[i]], name)) return null;
      out[required[i]] = src[required[i]];
    }
    return out;
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
    try { topic = new URLSearchParams(query).get("topic") || ""; } catch (_err) { topic = ""; }
    return topicEnum(topic);
  }

  function pdfEvent(href) {
    var path = String(href || "").split("?")[0].split("#")[0];
    var file = path.split("/").pop() || "";
    if (file.slice(-4).toLowerCase() !== ".pdf") return null;
    var row = DOCS[file.slice(0, -4)];
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

  function gaConfig(href, referrer) {
    var page = cleanedUrl(href || (typeof location !== "undefined" ? location.href : "https://www.flexusco.com/"));
    var out = { page_location: page.toString() };
    if (referrer || (typeof document !== "undefined" && document.referrer)) {
      out.page_referrer = cleanedUrl(referrer || document.referrer).toString();
    }
    return out;
  }

  function installHistoryGuard() {
    if (typeof history === "undefined" || !history.replaceState) return;
    ["pushState", "replaceState"].forEach(function (name) {
      var current = history[name];
      if (!current || current.__flexusClean) return;
      var wrapped = function (state, title, url) {
        var next = url;
        try { next = sameOriginTarget(url, location.href); } catch (_err) { next = url; }
        return current.call(history, state, title, next);
      };
      wrapped.__flexusClean = true;
      history[name] = wrapped;
    });
  }

  function rememberAttribution() {
    if (typeof sessionStorage === "undefined") return;
    var incoming = attributionFrom(location.href, typeof document !== "undefined" ? document.referrer : "");
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem(ATTR_STORAGE) || "{}") || {}; } catch (_err) { stored = {}; }
    if (!stored.landing_page) stored.landing_page = incoming.landing_page;
    if (!stored.referrer && incoming.referrer) stored.referrer = incoming.referrer;
    ATTR_KEYS.forEach(function (key) {
      if (!stored[key] && incoming[key]) stored[key] = incoming[key];
    });
    try { sessionStorage.setItem(ATTR_STORAGE, JSON.stringify(stored)); } catch (_err2) {}
  }

  function cleanCurrentEntry() {
    if (typeof location === "undefined" || !history.replaceState) return;
    var target = sameOriginTarget(location.href, location.href);
    var now = location.pathname + location.search + location.hash;
    if (target !== now) history.replaceState(null, "", target);
  }

  function bootProductionTag() {
    if (typeof document === "undefined" || typeof location === "undefined") return;
    if (!productionHost(location.hostname)) return;
    if (window.__FLEXUS_GTAG_BOOTED__) return;
    window.__FLEXUS_GTAG_BOOTED__ = true;
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
    script.onload = function () { installHistoryGuard(); };
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, gaConfig());
  }

  function boot() {
    installHistoryGuard();
    rememberAttribution();
    cleanCurrentEntry();
    bootProductionTag();
  }

  var api = {
    MEASUREMENT_ID: MEASUREMENT_ID,
    FORM_SELECTOR: "form[data-flexus-form]",
    productionHost: productionHost,
    allowParams: allowParams,
    cleanedUrl: cleanedUrl,
    sameOriginTarget: sameOriginTarget,
    attributionFrom: attributionFrom,
    enabledEvents: enabledEvents,
    topicEnum: topicEnum,
    sanitize: sanitize,
    anchorPlacement: anchorPlacement,
    ctaPlacement: ctaPlacement,
    ctaIntent: ctaIntent,
    pdfEvent: pdfEvent,
    materialEvent: materialEvent,
    gaConfig: gaConfig,
    installHistoryGuard: installHistoryGuard,
    boot: boot
  };
  root.FlexusTrack = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && typeof location !== "undefined") boot();
})(typeof window !== "undefined" ? window : globalThis);
