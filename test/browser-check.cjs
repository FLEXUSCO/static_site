const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const port = 8765;
const files = {
  "/": "index.html",
  "/contact": "contact.html",
  "/thanks": "thanks.html",
  "/budget-estimator": "budget-estimator.html",
  "/materials": "materials.html",
  "/pavement-systems": "pavement-systems.html"
};

const posts = [];

function startServer() {
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
    let file = files[url.pathname];
    if (!file) {
      const rel = decodeURIComponent(url.pathname);
      const abs = path.normalize(path.join(root, rel));
      if (abs.startsWith(root) && fs.existsSync(abs) && fs.statSync(abs).isFile()) file = abs;
    } else {
      file = path.join(root, file);
    }
    if (!file) {
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
  ws.addEventListener("message", function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
      else item.resolve(msg.result);
      return;
    }
    waits.slice().forEach(function (wait) {
      if (wait.method === msg.method) {
        waits.splice(waits.indexOf(wait), 1);
        wait.resolve(msg.params);
      }
    });
  });
  return new Promise(function (resolve, reject) {
    ws.addEventListener("open", function () { resolve(api); });
    ws.addEventListener("error", reject);
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
      close: function () { ws.close(); }
    };
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
  await evalJson(client, "new Promise(function (r) { setTimeout(r, 50); })");
}

async function main() {
  const server = await startServer();
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=9223",
    "--remote-allow-origins=*",
    "--user-data-dir=/tmp/flexus-chrome-check"
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await fetch("http://127.0.0.1:9223/json/version").then(function (r) { return r.json(); });
      break;
    } catch (_e) {
      await new Promise(function (r) { setTimeout(r, 100); });
    }
  }
  if (!version) throw new Error("chrome did not open a debugging port");
  const targets = await fetch("http://127.0.0.1:9223/json/list").then(function (r) { return r.json(); });
  const page = targets.filter(function (t) { return t.type === "page" && t.webSocketDebuggerUrl; })[0];
  if (!page) throw new Error("chrome opened no page target");
  const client = await cdp(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  const notes = [];

  await open(client, "/contact");
  const contact = await evalJson(client, `({
    sent: document.body.innerText.includes("Sent to Flexus"),
    reply: document.body.innerText.includes("We reply by email."),
    selector: !!document.querySelector("form[data-flexus-form='contact']"),
    name: document.querySelector("form").getAttribute("name"),
    prevent: window.FlexusTrack.shouldPreventNativeSubmit()
  })`);
  notes.push(["contact idle", contact]);
  if (!contact.sent || !contact.reply || !contact.selector || contact.name !== "contact" || contact.prevent !== false) {
    throw new Error("contact idle failed " + JSON.stringify(contact));
  }

  await open(client, "/contact?utm_source=newsletter&utm_campaign=fall&gclid=testgclid");
  const attr = await evalJson(client, `({
    utm_source: document.querySelector('[name=utm_source]').value,
    utm_campaign: document.querySelector('[name=utm_campaign]').value,
    gclid: document.querySelector('[name=gclid]').value,
    page: document.querySelector('[name=page]').value
  })`);
  notes.push(["attribution", attr]);
  if (attr.utm_source !== "newsletter" || attr.utm_campaign !== "fall" || attr.gclid !== "testgclid" || attr.page !== "/contact") {
    throw new Error("attribution failed " + JSON.stringify(attr));
  }

  await open(client, "/contact?topic=materials-quote&product=colored-granules&grade=5/9&utm_source=ads&color=Black");
  const quote = await evalJson(client, `({
    topic: document.getElementById("topic").value,
    product: !!document.querySelector('input[name="Product"][value="colored-granules"]').checked,
    grade: document.getElementById("grade").value,
    color: document.getElementById("color").value,
    search: location.search,
    events: (window.dataLayer || []).filter(function (row) { return row && row[0] === "event"; }).map(function (row) { return row[1]; })
  })`);
  notes.push(["materials quote path", quote]);
  if (quote.topic !== "materials-quote" || !quote.product || quote.grade !== "5/9" || quote.color !== "Black") {
    throw new Error("quote prefill failed " + JSON.stringify(quote));
  }
  if (quote.search.indexOf("utm_source=ads") === -1 || quote.search.indexOf("product=colored-granules") === -1) {
    throw new Error("quote query dropped " + quote.search);
  }
  if (quote.events.indexOf("material_select") !== -1 || quote.events.indexOf("generate_lead") !== -1) {
    throw new Error("prefill emitted a selection or lead " + JSON.stringify(quote.events));
  }

  await open(client, "/thanks?from=spec-pack-request&utm_source=keep");
  const thanks = await evalJson(client, `({
    search: location.search,
    events: (window.dataLayer || []).filter(function (row) { return row && row[0] === "event" && row[1] === "generate_lead"; })
  })`);
  notes.push(["thanks arbitrary from", thanks]);
  if (thanks.search.indexOf("from=") !== -1 || thanks.events.length !== 0) {
    throw new Error("thanks page treated the query as a lead " + JSON.stringify(thanks));
  }
  if (thanks.search.indexOf("utm_source=keep") === -1) {
    throw new Error("thanks page dropped an unrelated query " + thanks.search);
  }

  await open(client, "/budget-estimator");
  const budget = await evalJson(client, `({
    area: document.querySelector("[data-out=area]").textContent,
    perimeter: document.querySelector("[data-out=perimeter]").textContent,
    series: document.querySelector("[data-out=series]").textContent,
    text: document.getElementById("budget-output").innerText,
    money: window.FlexusBudget.publicView({ lengthFt: 10, widthFt: 2, series: "ap", lift: "1.5" }).money,
    live: window.FlexusBudget.publicView({ lengthFt: 10, widthFt: 2, series: "ap", lift: "1.5" }).monetaryLive
  })`);
  notes.push(["budget", budget]);
  if (budget.area !== "4,000" || budget.perimeter !== "1,016" || budget.series !== "CP" || budget.text.includes("$") || budget.money !== null || budget.live !== false) {
    throw new Error("budget output failed " + JSON.stringify(budget));
  }

  await open(client, "/materials?to=granules&utm_source=newsletter&product=colored-granules");
  const granules = await evalJson(client, `({
    search: location.search,
    hash: location.hash,
    path: location.pathname
  })`);
  notes.push(["granules existing to= behavior", granules]);
  if (granules.path !== "/materials" || granules.hash !== "#granules" || granules.search !== "") {
    throw new Error("granules context failed " + JSON.stringify(granules));
  }

  await evalJson(client, `document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest("a");
    if (link) e.preventDefault();
  }, true); true`);
  const link = await evalJson(client, `(() => {
    var a = document.querySelector('header a[href="/contact?topic=spec-support"]');
    a.scrollIntoView({ block: "center", inline: "center" });
    var r = a.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  })()`);
  if (!link.w || !link.h) throw new Error("cta link has no box " + JSON.stringify(link));
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: link.x, y: link.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: link.x, y: link.y, button: "left", clickCount: 1 });
  const click = await evalJson(client, `({
    path: location.pathname,
    events: (window.dataLayer || []).filter(function (row) { return row && row[0] === "event" && row[1] === "cta_click"; }).map(function (row) { return row[2]; })
  })`);
  notes.push(["cta click", click]);
  if (click.path !== "/materials" || !click.events.length || click.events[0].intent !== "spec_support") {
    throw new Error("cta click failed " + JSON.stringify(click));
  }
  Object.keys(click.events[0]).forEach(function (key) {
    if (key !== "intent" && key !== "placement") throw new Error("unexpected cta param " + key);
  });

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
  await evalJson(client, "new Promise(function (r) { setTimeout(r, 50); })");
  const after = await evalJson(client, `({
    path: location.pathname,
    search: location.search,
    leads: (window.dataLayer || []).filter(function (row) { return row && row[0] === "event" && row[1] === "generate_lead"; }).length,
    dumped: JSON.stringify(window.dataLayer || [])
  })`);
  const post = posts[0] || {};
  const params = new URLSearchParams(post.body || "");
  notes.push(["local native post", {
    count: posts.length,
    path: post.path || "",
    search: post.search || "",
    formName: params.get("form-name"),
    topic: params.get("Topic"),
    utm: params.get("utm_source"),
    leads: after.leads,
    thanksPath: after.path
  }]);
  if (posts.length !== 1 || post.path !== "/thanks" || params.get("form-name") !== "contact" || params.get("Topic") !== "spec-support" || params.get("utm_source") !== "newsletter") {
    throw new Error("native post was not delivered locally");
  }
  if (after.leads !== 0 || after.dumped.indexOf("local-check@example.com") !== -1 || after.dumped.indexOf("Local Check") !== -1) {
    throw new Error("thanks page recorded a lead or the typed identity");
  }

  console.log(JSON.stringify(notes, null, 2));
  client.close();
  chrome.kill();
  server.close();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
