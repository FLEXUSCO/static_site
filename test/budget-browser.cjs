const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

function startServer() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const url = new URL(req.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/budget-estimator") pathname = "/budget-estimator.html";
      const file = path.normalize(path.join(root, pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", function () { resolve(server); });
  });
}

function launchChrome() {
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=9333",
    "--user-data-dir=/tmp/flexus-budget-chrome",
    "--host-resolver-rules=MAP www.googletagmanager.com 127.0.0.1, MAP www.google-analytics.com 127.0.0.1, MAP googletagmanager.com 127.0.0.1, MAP google-analytics.com 127.0.0.1"
  ], { stdio: "ignore" });
  return chrome;
}

async function connect() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const version = await fetch("http://127.0.0.1:9333/json/version");
      if (version.ok) return version.json();
    } catch (_err) {}
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  throw new Error("chrome debugging port did not open");
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const waits = [];
  ws.addEventListener("message", function (event) {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
      return;
    }
    waits.slice().forEach(function (wait) {
      if (wait.method === message.method) {
        waits.splice(waits.indexOf(wait), 1);
        wait.resolve(message.params);
      }
    });
  });
  return new Promise(function (resolve, reject) {
    ws.addEventListener("open", function () {
      resolve({
        send: function (method, params) {
          const id = ++seq;
          ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
          return new Promise(function (res, rej) { pending.set(id, { resolve: res, reject: rej }); });
        },
        wait: function (method) {
          return new Promise(function (res) { waits.push({ method: method, resolve: res }); });
        },
        close: function () { ws.close(); }
      });
    });
    ws.addEventListener("error", reject);
  });
}

async function openPage(browserWs, url) {
  const browser = await cdp(browserWs);
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const list = await fetch("http://127.0.0.1:9333/json/list").then(function (res) { return res.json(); });
  const tab = list.find(function (item) { return item.id === created.targetId; });
  const client = await cdp(tab.webSocketDebuggerUrl);
  const google = [];
  client.send("Network.enable");
  client.send("Page.enable");
  const loaded = client.wait("Page.loadEventFired");
  await client.send("Page.navigate", { url: url });
  await loaded;
  await client.send("Runtime.evaluate", { expression: "document.fonts ? document.fonts.ready : true", awaitPromise: true });
  return { browser: browser, client: client, google: google, tab: tab };
}

async function text(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: "document.getElementById('budget-output').innerText",
    returnByValue: true
  });
  return result.result.value;
}

async function shot(client, name) {
  const image = await client.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(image.data, "base64"));
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const chrome = launchChrome();
  try {
    const version = await connect();
    const page = await openPage(version.webSocketDebuggerUrl, "http://127.0.0.1:" + port + "/budget-estimator");
    const client = page.client;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    let body = await text(client);
    const pageHtml = await client.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
    const served = pageHtml.result.value + "\n" + await (await fetch("http://127.0.0.1:" + port + "/budget.js")).text();
    const hiddenInstall = "$" + "3.00";
    const hiddenCombined = "33" + ",480";
    if (!body.includes("4,000 sf") || !body.includes("CP-200, 2.0 in, $5.37/sf") || !body.includes("$21,480.00") || !body.includes("Estimated materials cost") || !body.includes("Installation and subbase are not included")) {
      throw new Error("default materials estimate was wrong:\n" + body);
    }
    if (served.includes(hiddenInstall) || served.includes(hiddenCombined) || served.includes("b-install") || body.includes("±15%") || body.includes("$0.40")) {
      throw new Error("served budget artifact still has an installation price or a combined total");
    }
    if (await client.send("Runtime.evaluate", { expression: "!!document.getElementById('b-install')", returnByValue: true }).then(function (r) { return r.result.value; })) {
      throw new Error("installation control is still in the page");
    }
    await shot(client, "budget-desktop.png");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await shot(client, "budget-mobile.png");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    const models = [
      ["cp", "1.5", "$16,110.00"],
      ["cp", "2.5", "$26,850.00"],
      ["ap", "1.5", "$26,550.00"],
      ["ap", "2.0", "$35,400.00"],
      ["ap", "2.5", "$44,250.00"],
      ["cp", "2.0", "$21,480.00"]
    ];
    for (let i = 0; i < models.length; i += 1) {
      await client.send("Runtime.evaluate", { expression: "document.querySelector('input[name=\"series\"][value=\"" + models[i][0] + "\"]').click(); document.querySelector('input[name=\"lift\"][value=\"" + models[i][1] + "\"]').click();" });
      body = await text(client);
      if (!body.includes(models[i][2]) || body.includes(hiddenInstall) || body.includes(hiddenCombined)) {
        throw new Error("model " + models[i].join(" ") + " was wrong:\n" + body);
      }
    }
    await client.send("Runtime.evaluate", { expression: "document.querySelector('.budget-table').scrollIntoView({ block: 'center' })" });
    await shot(client, "budget-rates.png");
    await client.send("Runtime.evaluate", { expression: "document.getElementById('b-stone').value='2'; document.getElementById('b-depth').value='12'; document.getElementById('b-geo').checked=false; document.getElementById('b-grid').checked=true; document.getElementById('b-region').value='distant'; document.getElementById('b-stone').dispatchEvent(new Event('change', { bubbles: true }));" });
    body = await text(client);
    if (!body.includes("$21,480.00") || !body.includes("#2 stone") || !body.includes("12 in subbase") || !body.includes("West Coast")) {
      throw new Error("excluded fields changed the materials cost or were not recorded:\n" + body);
    }
    await client.send("Runtime.evaluate", { expression: "document.getElementById('b-width').value='8m'; document.getElementById('b-width').dispatchEvent(new Event('input', { bubbles: true }));" });
    body = await text(client);
    if (body.includes("$21,480.00") || !body.includes("no unit label")) {
      throw new Error("unit label was accepted:\n" + body);
    }
    const cleared = await client.send("Runtime.evaluate", {
      expression: "document.getElementById('b-width').value='0'; document.getElementById('b-width').dispatchEvent(new Event('input', { bubbles: true })); JSON.stringify({ total: document.querySelector('[data-out=\"total\"]').textContent, status: document.querySelector('[data-out=\"status\"]').textContent })",
      returnByValue: true
    });
    const clearedView = JSON.parse(cleared.result.value);
    if (clearedView.total !== "—" || !clearedView.status.includes("greater than zero")) {
      throw new Error("zero width still showed a total " + cleared.result.value);
    }
    const nav = await client.send("Runtime.evaluate", { expression: "document.querySelector('header.nav').innerText", returnByValue: true });
    if (String(nav.result.value).toLowerCase().includes("budget")) throw new Error("nav gained a budget link");
    const perf = await client.send("Runtime.evaluate", {
      expression: "performance.getEntriesByType('resource').map(function (e) { return e.name; }).filter(function (name) { return /google-analytics|googletagmanager|\\/g\\/collect|gtag\\/js/.test(name); })",
      returnByValue: true
    });
    if (perf.result.value.length) throw new Error("budget page requested Google " + perf.result.value.join(", "));
    page.client.close();
    page.browser.close();
    console.log(JSON.stringify({ ok: true }, null, 2));
  } finally {
    chrome.kill();
    server.close();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
