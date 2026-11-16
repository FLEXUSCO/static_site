const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const track = require("../tracking.js");

const root = path.join(__dirname, "..");

test("Global Privacy Control is only strict true", function () {
  assert.equal(track.globalPrivacyControl({ globalPrivacyControl: true }), true);
  assert.equal(track.globalPrivacyControl({ globalPrivacyControl: false }), false);
  assert.equal(track.globalPrivacyControl({ globalPrivacyControl: "true" }), false);
  assert.equal(track.globalPrivacyControl({}), false);
  assert.equal(track.globalPrivacyControl(null), false);
});

test("boot does not create analytics tags when Global Privacy Control is set", function () {
  const created = [];
  Object.defineProperty(navigator, "globalPrivacyControl", {
    configurable: true,
    get: function () { return true; }
  });
  global.window = global;
  global.location = {
    hostname: "www.flexusco.com",
    href: "https://www.flexusco.com/contact?topic=spec-support",
    pathname: "/contact",
    search: "?topic=spec-support",
    hash: ""
  };
  global.document = {
    createElement: function () { created.push("create"); return {}; },
    getElementsByTagName: function () { created.push("tags"); return [{ parentNode: { insertBefore: function () { created.push("insert"); } } }]; },
    head: { appendChild: function () { created.push("append"); } },
    referrer: ""
  };
  global.history = {
    replaceState: function () { created.push("history"); },
    pushState: function () { created.push("push"); }
  };
  try {
    track.boot();
    assert.equal(created.includes("create"), false);
    assert.equal(created.includes("append"), false);
    assert.equal(created.includes("insert"), false);
  } finally {
    delete navigator.globalPrivacyControl;
    delete global.window;
    delete global.location;
    delete global.document;
    delete global.history;
  }
});

test("every page includes tracking.js once and Clarity lives in that file", function () {
  const files = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); });
  assert.equal(files.length > 10, true);
  files.forEach(function (name) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    const head = html.split("</head>")[0];
    assert.equal((html.match(/<script src="\/tracking\.js"><\/script>/g) || []).length, 1, name);
    assert.equal(head.includes('<script src="/tracking.js"></script>'), true, name);
    assert.equal(html.includes("clarity.ms"), false, name);
    assert.equal(html.includes("googletagmanager.com"), false, name);
  });
  const js = fs.readFileSync(path.join(root, "tracking.js"), "utf8");
  const boot = js.slice(js.indexOf("function boot()"), js.indexOf("var api"));
  const guard = boot.indexOf("if (globalPrivacyControl()) return;");
  assert.equal(guard > 0, true);
  assert.equal(guard < boot.indexOf("loadClarity()"), true);
  assert.equal(guard < boot.indexOf("bootProductionTag()"), true);
  assert.equal((js.match(/clarity\.ms\/tag\//g) || []).length, 1);
});

function startServer(port) {
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(file);
    const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
    res.writeHead(200, { "content-type": type + "; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  return new Promise(function (resolve) {
    server.listen(port, "127.0.0.1", function () { resolve(server); });
  });
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 1;
  const pending = new Map();
  const waits = [];
  const api = {
    send: function (method, params) {
      const id = next++;
      return new Promise(function (resolve, reject) {
        pending.set(id, { resolve: resolve, reject: reject });
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
    },
    wait: function (method) {
      return new Promise(function (resolve) { waits.push({ method: method, resolve: resolve }); });
    },
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

test("a normal visit loads the GA4 tag and Clarity once, and Global Privacy Control loads neither", async function () {
  const port = 8778;
  const server = await startServer(port);
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    "--host-resolver-rules=MAP www.flexusco.com 127.0.0.1",
    "--remote-debugging-port=9336", "--remote-allow-origins=*",
    "--user-data-dir=/tmp/flexus-gpc-check"
  ], { stdio: "ignore" });
  try {
    let version;
    for (let i = 0; i < 40 && !version; i += 1) {
      try { version = await fetch("http://127.0.0.1:9336/json/version").then(function (r) { return r.json(); }); }
      catch (_err) { await new Promise(function (r) { setTimeout(r, 150); }); }
    }
    if (!version) throw new Error("chrome did not start");
    const targets = await fetch("http://127.0.0.1:9336/json/list").then(function (r) { return r.json(); });
    const page = targets.filter(function (item) { return item.type === "page" && item.webSocketDebuggerUrl; })[0];
    const client = await cdp(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });

    async function visit(path) {
      const loaded = client.wait("Page.loadEventFired");
      await client.send("Page.navigate", { url: "http://www.flexusco.com:" + port + path });
      await loaded;
      await new Promise(function (r) { setTimeout(r, 400); });
      const result = await client.send("Runtime.evaluate", {
        expression: `({
          gpc: navigator.globalPrivacyControl === true,
          track: typeof window.FlexusTrack,
          clarity: typeof window.clarity,
          h1: document.querySelector("h1") && document.querySelector("h1").textContent,
          scripts: Array.from(document.scripts).map(function (s) { return s.src; }).filter(function (src) {
            return src.includes("/tracking.js") || src.includes("clarity.ms/tag/") || src.includes("googletagmanager.com/gtag/js");
          })
        })`,
        returnByValue: true
      });
      return result.result.value;
    }

    const normal = await visit("/index.html");
    assert.equal(normal.gpc, false);
    assert.equal(normal.track, "object");
    assert.equal(normal.scripts.filter(function (src) { return src.includes("/tracking.js"); }).length, 1);
    assert.equal(normal.scripts.filter(function (src) { return src.includes("clarity.ms/tag/"); }).length, 1);
    assert.equal(normal.scripts.filter(function (src) { return src.includes("googletagmanager.com/gtag/js"); }).length, 1);

    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: function () { return true; } });"
    });
    const gpc = await visit("/privacy.html");
    assert.equal(gpc.gpc, true);
    assert.equal(gpc.clarity, "undefined");
    assert.equal(gpc.h1, "Privacy Policy");
    assert.equal(gpc.scripts.filter(function (src) { return src.includes("clarity.ms/tag/"); }).length, 0);
    assert.equal(gpc.scripts.filter(function (src) { return src.includes("googletagmanager.com/gtag/js"); }).length, 0);
    client.close();
  } finally {
    chrome.kill();
    await new Promise(function (resolve) { server.close(resolve); });
  }
});
