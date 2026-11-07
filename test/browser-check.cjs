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

  await open(client, "/contact?email=person@example.com&unknown_token=abc&search=secret&utm_source=newsletter&utm_content=person@example.com&topic=spec-support&gclid=abc123");
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
  if (!cleaned.search.includes("utm_source=newsletter") || !cleaned.search.includes("topic=spec-support") || !cleaned.search.includes("gclid=abc123")) {
    throw new Error("address bar dropped attribution " + cleaned.search);
  }
  if (!cleaned.sentence) throw new Error("contact sentence changed");
  if (cleaned.utm !== "newsletter" || cleaned.gclid !== "abc123") throw new Error("form attribution missing " + JSON.stringify(cleaned));
  if (cleaned.attr.utm_source !== "newsletter" || cleaned.attr.landing_page.includes("email=")) throw new Error("stash leaked or dropped attribution");
  if (cleaned.gtag !== "undefined") throw new Error("local host booted production gtag");

  const history = await evalJson(client, `(() => {
    history.pushState(null, "", "/contact?email=person@example.com&topic=sample&q=secret");
    return location.search;
  })()`);
  if (history !== "?topic=sample") throw new Error("history event kept a dirty query " + history);

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
  console.log(JSON.stringify({
    cleaned: cleaned.search,
    history: history,
    events: events,
    posts: server.posts.length,
    leads: thanks.leads,
    leaked: leaked.length
  }, null, 2));
  client.close();
  chrome.kill();
  server.close();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
