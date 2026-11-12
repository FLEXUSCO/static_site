// Nested pages keep a trailing slash as a separate 200. These four paths
// redirect only when the request path actually ends in one slash.
// A slashless sitemap URL returns without a redirect.

var NESTED = {
  "/pavement-systems/ap": true,
  "/pavement-systems/cp": true,
  "/projects/mary-esther-azalea-trail": true,
  "/projects/athens-root-intrusion-sidewalk": true
};

export function slashRedirect(pathname, search) {
  if (typeof pathname !== "string" || pathname.length < 2) return null;
  if (pathname.charAt(pathname.length - 1) !== "/") return null;
  if (pathname.indexOf("//") !== -1) return null;
  var bare = pathname.slice(0, -1);
  if (!NESTED[bare]) return null;
  var query = String(search || "");
  if (query.indexOf("#") !== -1) return null;
  if (query && query.charAt(0) !== "?") query = "?" + query;
  if (query === "?") query = "";
  var location = bare + query;
  if (location.charAt(0) !== "/" || location.charAt(1) === "/" || location.indexOf("://") !== -1) return null;
  return location;
}

export default async function canonicalSlash(request) {
  var current;
  try {
    current = new URL(request.url);
  } catch (_err) {
    return;
  }
  if (current.username || current.password) return;
  var target = slashRedirect(current.pathname, current.search);
  if (!target) return;
  var next = new URL(target, current.origin);
  if (next.origin !== current.origin || next.username || next.password || next.hash) return;
  if (next.pathname + next.search !== target) return;
  return Response.redirect(next, 301);
}

export const config = {
  path: [
    "/pavement-systems/ap/",
    "/pavement-systems/cp/",
    "/projects/mary-esther-azalea-trail/",
    "/projects/athens-root-intrusion-sidewalk/"
  ],
  onError: "bypass"
};
