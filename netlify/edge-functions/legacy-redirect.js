// Legacy paths whose Netlify rule sets topic or to. A fixed target query
// replaces the incoming query, so this function merges the allowlisted values.
// Destinations are constants. The path's own topic or to wins.

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
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var PHONE = /^\+?[0-9][0-9().\-\s]{8,}$/;

var ROUTES = {
  "/materials/quote": { dest: "/contact", force: { topic: "materials-quote" } },
  "/materials/quote.html": { dest: "/contact", force: { topic: "materials-quote" } },
  "/materials/rubber-granules": { dest: "/materials", force: { to: "granules" } },
  "/materials/rubber-granules.html": { dest: "/materials", force: { to: "granules" } },
  "/materials/rubber-mulch": { dest: "/materials", force: { to: "mulch" } },
  "/materials/rubber-mulch.html": { dest: "/materials", force: { to: "mulch" } },
  "/materials/rubber-buffings": { dest: "/materials", force: { to: "buffings" } },
  "/materials/rubber-buffings.html": { dest: "/materials", force: { to: "buffings" } },
  "/resources": { dest: "/specifiers", force: { to: "downloads" } },
  "/resources.html": { dest: "/specifiers", force: { to: "downloads" } },
  "/request-sample": { dest: "/contact", force: { topic: "sample" } },
  "/request-sample.html": { dest: "/contact", force: { topic: "sample" } },
  "/installers": { dest: "/specifiers", force: { to: "installation" } },
  "/installers.html": { dest: "/specifiers", force: { to: "installation" } },
  "/stormwater-bmp": { dest: "/specifiers", force: { to: "stormwater" } },
  "/stormwater-bmp.html": { dest: "/specifiers", force: { to: "stormwater" } },
  "/flexus-final/resources.html": { dest: "/specifiers", force: { to: "downloads" } },
  "/flexus-final/request-sample.html": { dest: "/contact", force: { topic: "sample" } },
  "/flexus-final/installers.html": { dest: "/specifiers", force: { to: "installation" } },
  "/flexus-final/stormwater-bmp.html": { dest: "/specifiers", force: { to: "stormwater" } }
};

export function acceptValue(key, value) {
  var rule = RULES[key];
  var text = value == null ? "" : String(value);
  if (!rule || !rule.test(text)) return "";
  if (EMAIL.test(text)) return "";
  if (TEXT_KEYS[key] && PHONE.test(text.trim())) return "";
  return text;
}

function exactPath(pathname) {
  if (typeof pathname !== "string") return "";
  if (pathname.length === 0 || pathname.length > 200) return "";
  if (pathname.charAt(0) !== "/") return "";
  if (pathname.indexOf("//") !== -1) return "";
  if (/[\r\n\0\\]/.test(pathname)) return "";
  if (pathname.indexOf("%") !== -1) return "";
  return pathname;
}

export function redirectLocation(pathname, search) {
  var path = exactPath(pathname);
  var route = ROUTES[path];
  if (!route || route.dest.charAt(0) !== "/" || route.dest.indexOf("//") !== -1) return null;
  if (String(search || "").indexOf("#") !== -1) return null;
  var incoming = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  var out = new URLSearchParams();
  var force = route.force;
  Object.keys(force).forEach(function (key) {
    var value = acceptValue(key, force[key]);
    if (value) out.append(key, value);
  });
  QUERY_ALLOW.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(force, key)) return;
    if (!incoming.has(key)) return;
    var value = acceptValue(key, incoming.get(key));
    if (value) out.append(key, value);
  });
  var query = out.toString();
  var location = route.dest + (query ? "?" + query : "");
  if (location.indexOf("#") !== -1 || /[\r\n\0\\]/.test(location) || location.indexOf("://") !== -1) return null;
  if (location.charAt(0) !== "/" || location.charAt(1) === "/") return null;
  return location;
}

export function redirectFromUrl(input) {
  var url;
  try {
    url = new URL(String(input), "https://www.flexusco.com");
  } catch (_err) {
    return null;
  }
  return redirectLocation(url.pathname, url.search);
}

var LEGACY_PATHS = Object.keys(ROUTES);

export { LEGACY_PATHS, QUERY_ALLOW };

export default async function legacyRedirect(request) {
  var current;
  try {
    current = new URL(request.url);
  } catch (_err) {
    return;
  }
  if (current.protocol !== "https:" && current.protocol !== "http:") return;
  if (current.username || current.password) return;
  var target = redirectLocation(current.pathname, current.search);
  if (!target) return;
  var next = new URL(target, current.origin);
  if (next.origin !== current.origin) return;
  if (next.username || next.password || next.hash) return;
  if (next.pathname + next.search !== target) return;
  return Response.redirect(next, 301);
}

export const config = {
  path: [
    "/materials/quote",
    "/materials/quote.html",
    "/materials/rubber-granules",
    "/materials/rubber-granules.html",
    "/materials/rubber-mulch",
    "/materials/rubber-mulch.html",
    "/materials/rubber-buffings",
    "/materials/rubber-buffings.html",
    "/resources",
    "/resources.html",
    "/request-sample",
    "/request-sample.html",
    "/installers",
    "/installers.html",
    "/stormwater-bmp",
    "/stormwater-bmp.html",
    "/flexus-final/resources.html",
    "/flexus-final/request-sample.html",
    "/flexus-final/installers.html",
    "/flexus-final/stormwater-bmp.html"
  ],
  method: ["GET", "HEAD"],
  onError: "bypass"
};
