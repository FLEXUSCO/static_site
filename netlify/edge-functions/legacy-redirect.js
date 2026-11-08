import { redirectLocation } from "./legacy-redirects.mjs";

// GET and HEAD only. POST stays on the existing redirect fallback.
// onError bypass keeps the _redirects rule if this function throws.
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
