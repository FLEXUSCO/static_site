const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const port = 8766;
const files = {
  "/": "index.html",
  "/contact": "contact.html",
  "/thanks": "thanks.html",
  "/materials": "materials.html"
};

function startServer() {
  const posts = [];
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "POST") {
      const chunks = [];
      req.on("data", function (chunk) { chunks.push(chunk); });
      req.on("end", function () {
        posts.push({ path: url.pathname, search: url.search, body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(path.join(root, "thanks.html")));
      });
      return;
    }
    if (url.pathname === "/referrer-source") {
      const next = "/not-a-page?pack=Full&email=person@example.com&gbraid=Abcd1234_ef&utm_source=newsletter#user@secret";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><html><body><a id=\"go\" href=\"" + next + "\">go</a></body></html>");
      return;
    }
    if (url.pathname === "/pack-check" || url.pathname === "/not-a-page") {
      let html = fs.readFileSync(path.join(root, "contact.html"), "utf8");
      if (url.pathname === "/pack-check") {
        html = html.replace(
          '<script src="/site.js" defer></script>',
          '<button id="pack-opener" data-modal-open="spec" hidden></button><div class="modal" id="modal-spec"><input id="specPackType" value=""></div><script src="/site.js" defer></script>'
        );
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const mapped = files[url.pathname];
    let file = mapped ? path.join(root, mapped) : "";
    if (!file) {
      const candidate = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
      if (candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) file = candidate;
    }
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(file);
    const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
    res.writeHead(200, { "content-type": type + "; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  server.posts = posts;
  return new Promise(function (resolve) {
    server.listen(port, "127.0.0.1", function () { resolve(server); });
  });
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 1;
  const pending = new Map();
  const waits = [];
  const listeners = [];
  const api = {
    send: function (method, params) {
      const id = next++;
      return new Promise(function (res, rej) {
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
    },
    wait: function (method) {
      return new Promise(function (res) { waits.push({ method: method, resolve: res }); });
    },
    on: function (method, fn) { listeners.push({ method: method, fn: fn }); },
    close: function () { ws.close(); }
  };
  ws.addEventListener("message", function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
      else item.resolve(msg.result);
      return;
    }
    listeners.forEach(function (listener) {
      if (listener.method === msg.method) listener.fn(msg.params || {});
    });
    waits.slice().forEach(function (wait, index) {
      if (wait.method === msg.method) {
        waits.splice(index, 1);
        wait.resolve(msg.params);
      }
    });
  });
  return new Promise(function (resolve, reject) {
    ws.addEventListener("open", function () { resolve(api); });
    ws.addEventListener("error", reject);
  });
}

async function evalJson(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression: expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function open(client, urlPath) {
  const loaded = client.wait("Page.loadEventFired");
  await client.send("Page.navigate", { url: "http://127.0.0.1:" + port + urlPath });
  await loaded;
}

async function main() {
  const server = await startServer();
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    "--remote-debugging-port=9224", "--remote-allow-origins=*",
    "--user-data-dir=/tmp/flexus-client-tracking-check"
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await fetch("http://127.0.0.1:9224/json/version").then(function (r) { return r.json(); }); }
    catch (_err) { await new Promise(function (r) { setTimeout(r, 100); }); }
  }
  if (!version) throw new Error("chrome did not start");
  const targets = await fetch("http://127.0.0.1:9224/json/list").then(function (r) { return r.json(); });
  const page = targets.filter(function (item) { return item.type === "page" && item.webSocketDebuggerUrl; })[0];
  const client = await cdp(page.webSocketDebuggerUrl);
  const leaked = [];
  client.on("Network.responseReceived", function (params) {
    const url = params.response && params.response.url || "";
    if (/google-analytics\.com|analytics\.google\.com|googletagmanager\.com|google\.com\/g\/collect/.test(url)) leaked.push(url);
  });
  await client.send("Network.enable");
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await open(client, "/contact?email=person@example.com&unknown_token=abc&search=secret&utm_source=newsletter&utm_content=person@example.com&topic=spec-support&gclid=abc123XYZ_99");
  const cleaned = await evalJson(client, `({
    search: location.search,
    sentence: document.body.innerText.includes("Sent to Flexus. We reply by email."),
    attr: JSON.parse(sessionStorage.getItem("flexus_attr_v1") || "{}"),
    utm: (document.querySelector('[name="utm_source"]') || {}).value || "",
    gclid: (document.querySelector('[name="gclid"]') || {}).value || "",
    referrer: (document.querySelector('[name="referrer"]') || {}).value || "",
    gtag: typeof window.gtag
  })`);
  if (cleaned.search.includes("email=") || cleaned.search.includes("unknown_token") || cleaned.search.includes("search=") || cleaned.search.includes("person@example.com")) {
    throw new Error("address bar kept a sensitive query " + cleaned.search);
  }
  if (!cleaned.search.includes("utm_source=newsletter") || !cleaned.search.includes("topic=spec-support") || !cleaned.search.includes("gclid=abc123XYZ_99")) {
    throw new Error("address bar dropped attribution " + cleaned.search);
  }
  if (!cleaned.sentence) throw new Error("contact sentence changed");
  if (cleaned.utm !== "newsletter" || cleaned.gclid !== "abc123XYZ_99") throw new Error("form attribution missing " + JSON.stringify(cleaned));
  if (cleaned.attr.utm_source !== "newsletter" || cleaned.attr.landing_page.includes("email=")) throw new Error("stash leaked or dropped attribution");
  if (cleaned.gtag !== "undefined") throw new Error("local host booted production gtag");

  const history = await evalJson(client, `(() => {
    history.pushState(null, "", "/contact?email=person@example.com&topic=sample&q=secret");
    return location.search;
  })()`);
  if (history !== "?topic=sample") throw new Error("history event kept a dirty query " + history);

  await open(client, "/pack-check?pack=Full&email=person@example.com");
  const packOk = await evalJson(client, `({
    pack: (document.getElementById("specPackType") || {}).value || "",
    search: location.search
  })`);
  if (packOk.pack !== "Full" || !packOk.search.includes("pack=Full") || packOk.search.includes("email=")) {
    throw new Error("pack modal query failed " + JSON.stringify(packOk));
  }
  await open(client, "/pack-check?pack=please+email+me");
  const packBad = await evalJson(client, `(document.getElementById("specPackType") || {}).value || ""`);
  if (packBad !== "") throw new Error("free-text pack was kept and applied: " + packBad);

  await open(client, "/contact?topic=materials-quote&product=colored-granules&grade=5/9&color=Black&note=free+text");
  const quote = await evalJson(client, `({
    topic: document.getElementById("topic").value,
    product: !!document.querySelector('input[name="Product"][value="colored-granules"]').checked,
    grade: document.getElementById("grade").value,
    color: document.getElementById("color").value,
    search: location.search
  })`);
  if (quote.topic !== "materials-quote" || !quote.product || quote.grade !== "5/9" || quote.color !== "Black" || quote.search.includes("note=")) {
    throw new Error("topic or product prefill failed " + JSON.stringify(quote));
  }

  await open(client, "/materials?to=granules&email=person@example.com");
  const scrolled = await evalJson(client, `({ hash: location.hash, search: location.search, id: !!document.getElementById("granules") })`);
  if (scrolled.hash !== "#granules" || scrolled.search.includes("email=") || !scrolled.id) {
    throw new Error("to= scroll failed " + JSON.stringify(scrolled));
  }

  await evalJson(client, `(() => {
    window.gtag = function () { (window.__events = window.__events || []).push([].slice.call(arguments)); };
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a");
      if (link) event.preventDefault();
    }, true);
    if (!document.querySelector('a[href*="/pdfs/"]')) {
      document.body.insertAdjacentHTML("beforeend", '<a id="pdf-link" href="/assets/pdfs/ap/ap-details.pdf">PDF</a>');
    }
    return true;
  })()`);
  async function clickSelector(selector) {
    const box = await evalJson(client, `(() => {
      var node = document.querySelector(${JSON.stringify(selector)});
      node.scrollIntoView({ block: "center" });
      var rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 10) };
    })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await clickSelector('header a[href="/contact?topic=spec-support"]');
  await clickSelector("#pdf-link");
  const events = await evalJson(client, `(window.__events || []).map(function (row) { return row[1]; })`);
  if (!events.includes("cta_click") || events.includes("form_start") || events.includes("file_download") || events.includes("generate_lead") || events.includes("form_submit")) {
    throw new Error("event ownership failed " + JSON.stringify(events));
  }

  await open(client, "/contact?topic=spec-support&utm_source=newsletter");
  const button = await evalJson(client, `(() => {
    document.getElementById("name").value = "Local Check";
    document.getElementById("email").value = "local-check@example.com";
    var btn = document.querySelector("form[data-flexus-form] button[type=submit]");
    btn.scrollIntoView({ block: "center" });
    var r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  const posted = client.wait("Page.loadEventFired");
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 });
  await posted;
  const post = server.posts[0] || {};
  const params = new URLSearchParams(post.body || "");
  if (server.posts.length !== 1 || post.path !== "/thanks" || params.get("form-name") !== "contact" || params.get("Topic") !== "spec-support" || params.get("utm_source") !== "newsletter") {
    throw new Error("native post failed");
  }
  if (String(post.body).includes("local-check@example.com") && params.get("Email") !== "local-check@example.com") {
    throw new Error("fixture email was not the form field");
  }
  const thanks = await evalJson(client, `({
    leads: (window.dataLayer || []).filter(function (row) { return row && row[1] === "generate_lead"; }).length,
    text: document.body.innerText.includes("We have your note.")
  })`);
  if (thanks.leads !== 0 || !thanks.text) throw new Error("thanks page changed or recorded a lead");
  if (leaked.length) throw new Error("analytics host responded " + leaked[0]);
  const synthetic = await syntheticPayloads(server);
  console.log(JSON.stringify({
    cleaned: cleaned.search,
    history: history,
    events: events,
    posts: server.posts.length,
    leads: thanks.leads,
    leaked: leaked.length,
    synthetic: synthetic
  }, null, 2));
  client.close();
  chrome.kill();
  server.close();
}

const STUB = [
  "window.dataLayer = window.dataLayer || [];",
  "window.__seenHistory = [];",
  "(function () {",
  "  var configured = { dl: location.href, dr: document.referrer || '' };",
  "  function hit(name, extra) {",
  "    var payload = { v: '2', tid: 'G-5T6ESYM3SB', en: name, dl: configured.dl, dr: configured.dr };",
  "    Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key]; });",
  "    fetch('https://www.google-analytics.com/g/collect?' + new URLSearchParams(payload).toString(), { method: 'GET', mode: 'no-cors', keepalive: true });",
  "  }",
  "  function handle(args) {",
  "    if (!args) return;",
  "    if (args[0] === 'config') {",
  "      var opts = args[2] || {};",
  "      if (opts.page_location) configured.dl = opts.page_location;",
  "      if (opts.page_referrer) configured.dr = opts.page_referrer;",
  "      hit('page_view');",
  "    } else if (args[0] === 'event') {",
  "      hit(args[1], args[2] || {});",
  "    }",
  "  }",
  "  Array.prototype.slice.call(window.dataLayer).forEach(handle);",
  "  var push = window.dataLayer.push.bind(window.dataLayer);",
  "  window.dataLayer.push = function () { var result = push.apply(window.dataLayer, arguments); handle(arguments[0]); return result; };",
  "  ['pushState', 'replaceState'].forEach(function (name) {",
  "    var prev = history[name];",
  "    history[name] = function (state, title, url) {",
  "      window.__seenHistory.push(String(url));",
  "      return prev.apply(history, arguments);",
  "    };",
  "  });",
  "  document.addEventListener('submit', function (event) {",
  "    var form = event.target;",
  "    if (form && form.action) hit('form_submit', { 'ep.form_destination': form.action, dl: location.href });",
  "  }, true);",
  "  document.addEventListener('click', function (event) {",
  "    var link = event.target && event.target.closest && event.target.closest('a[href]');",
  "    if (!link) return;",
  "    var href = link.href;",
  "    if (/\\.pdf($|\\?)/.test(link.getAttribute('href') || '')) hit('file_download', { 'ep.link_url': href, dl: location.href });",
  "    else if (/^https?:/.test(href) && link.host !== location.host) hit('click', { 'ep.link_url': href, dl: location.href });",
  "  }, true);",
  "  window.__stubDone = true;",
  "})();"
].join("\n");

async function syntheticPayloads(server) {
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    "--host-resolver-rules=MAP www.flexusco.com 127.0.0.1",
    "--remote-debugging-port=9225", "--remote-allow-origins=*",
    "--user-data-dir=/tmp/flexus-synthetic-tag"
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await fetch("http://127.0.0.1:9225/json/version").then(function (r) { return r.json(); }); }
    catch (_err) { await new Promise(function (r) { setTimeout(r, 100); }); }
  }
  if (!version) throw new Error("synthetic chrome did not start");
  const targets = await fetch("http://127.0.0.1:9225/json/list").then(function (r) { return r.json(); });
  const page = targets.filter(function (item) { return item.type === "page" && item.webSocketDebuggerUrl; })[0];
  const client = await cdp(page.webSocketDebuggerUrl);
  const collects = [];
  const paused = [];
  client.on("Fetch.requestPaused", function (params) {
    const url = params.request && params.request.url || "";
    paused.push(url);
    if (url.includes("gtag/js")) {
      client.send("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body: Buffer.from(STUB).toString("base64")
      }).catch(function () {});
      return;
    }
    collects.push(url);
    client.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(function () {});
  });
  await client.send("Fetch.enable", { patterns: [
    { urlPattern: "*googletagmanager.com*", requestStage: "Request" },
    { urlPattern: "*google-analytics.com*", requestStage: "Request" },
    { urlPattern: "*analytics.google.com*", requestStage: "Request" }
  ] });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  const origin = "http://www.flexusco.com:" + server.address().port;
  let loaded = client.wait("Page.loadEventFired");
  await client.send("Page.navigate", { url: origin + "/referrer-source?email=person@example.com&utm_medium=cpc&evil=1" });
  await loaded;
  loaded = client.wait("Page.loadEventFired");
  const go = await evalJson(client, `(() => { var n = document.getElementById("go"); var r = n.getBoundingClientRect(); return { x: r.x + 2, y: r.y + 2 }; })()`);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: go.x, y: go.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: go.x, y: go.y, button: "left", clickCount: 1 });
  await loaded;
  await evalJson(client, "new Promise(function (r) { setTimeout(r, 100); })");
  const state = await evalJson(client, `({
    path: location.pathname,
    search: location.search,
    hash: location.hash,
    seen: window.__seenHistory || []
  })`);
  await evalJson(client, `history.pushState(null, "", "/not-a-page?email=person@example.com&topic=sample&q=secret"); true`);
  const afterHistory = await evalJson(client, "location.search");
  const seen = await evalJson(client, "window.__seenHistory || []");
  const browserReferrer = await evalJson(client, "document.referrer");
  await evalJson(client, `document.body.insertAdjacentHTML("beforeend", '<a id="pdf-link" href="/assets/pdfs/ap/ap-details.pdf">PDF</a><a id="out-link" href="https://example.com/out?email=person@example.com">Out</a>'); document.addEventListener("click", function (event) { var link = event.target.closest && event.target.closest("a"); if (link) event.preventDefault(); }, true); true`);
  async function click(selector) {
    const box = await evalJson(client, `(() => { var n = document.querySelector(${JSON.stringify(selector)}); if (!n) return { missing: true, href: location.href }; n.scrollIntoView({block:"center"}); var r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, valid: n.form ? n.form.checkValidity() : true }; })()`);
    if (box.missing) throw new Error("missing " + selector + " at " + box.href + " ids=" + JSON.stringify(box.ids));
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await click("#pdf-link");
  await click("#out-link");
  await evalJson(client, `(() => {
    document.getElementById("name").value = "Local Check";
    document.getElementById("email").value = "local-check@example.com";
    return true;
  })()`);
  const submitted = client.wait("Page.loadEventFired");
  await click('form[data-flexus-form] button[type="submit"]');
  await Promise.race([
    submitted,
    new Promise(function (_resolve, reject) { setTimeout(function () { reject(new Error("form submit did not navigate")); }, 5000); })
  ]);
  const names = collects.map(function (url) { return new URL(url).searchParams.get("en"); });
  const pageHit = collects.map(function (url) { return new URL(url); }).find(function (url) { return url.searchParams.get("en") === "page_view"; });
  const download = collects.map(function (url) { return new URL(url); }).find(function (url) { return url.searchParams.get("en") === "file_download"; });
  const outbound = collects.map(function (url) { return new URL(url); }).filter(function (url) { return url.searchParams.get("en") === "click"; });
  if (!pageHit) throw new Error("no intercepted page_view " + JSON.stringify(collects));
  const dl = pageHit.searchParams.get("dl") || "";
  const dr = pageHit.searchParams.get("dr") || "";
  if (dl.includes("person@example.com") || dl.includes("user@secret") || !dl.includes("pack=Full") || !dl.includes("gbraid=Abcd1234_ef")) {
    throw new Error("page_view location was not cleaned " + dl);
  }
  if (state.path !== "/not-a-page") throw new Error("path was rewritten " + state.path);
  if (dr.includes("person@example.com") || dr.includes("evil=")) throw new Error("referrer was not cleaned " + dr);
  if (!dr.includes("utm_medium=cpc")) throw new Error("referrer attribution dropped " + dr);
  if (afterHistory !== "?topic=sample") throw new Error("wrapper ordering left a dirty history URL " + afterHistory);
  if (!seen.length || String(seen[seen.length - 1]).includes("email=")) {
    throw new Error("history wrapper " + JSON.stringify(seen));
  }
  if (!download || download.searchParams.get("ep.link_url").includes("?") || !download.searchParams.get("ep.link_url").endsWith("/assets/pdfs/ap/ap-details.pdf")) {
    throw new Error("download link_url was not the clean file " + (download && download.searchParams.get("ep.link_url")));
  }
  if (names.includes("form_start") || names.includes("generate_lead")) throw new Error("custom lead or form event was collected " + names.join(","));
  const dirtyOutbound = outbound.find(function (url) { return (url.searchParams.get("ep.link_url") || "").includes("person@example.com"); });
  client.close();
  chrome.kill();
  return {
    page: dl,
    referrer: dr,
    history: afterHistory,
    download: download.searchParams.get("ep.link_url"),
    events: names,
    externalHrefPassedThrough: !!dirtyOutbound,
    browserReferrerStillHasEmail: browserReferrer.includes("person@example.com")
  };
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
