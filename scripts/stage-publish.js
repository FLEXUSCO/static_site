"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "publish");
const skip = new Set(["publish", "test", "scripts", "node_modules", ".git"]);

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else if (entry.isFile()) copyFile(src, dest);
  }
}

rm(out);
fs.mkdirSync(out);
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
  const src = path.join(root, entry.name);
  const dest = path.join(out, entry.name);
  if (entry.isDirectory()) {
    if (entry.name === "netlify") continue;
    copyTree(src, dest);
  } else if (entry.isFile()) {
    copyFile(src, dest);
  }
}

if (fs.existsSync(path.join(out, "test"))) throw new Error("tests were copied into publish");
if (fs.existsSync(path.join(out, "budget-estimator.html"))) throw new Error("budget page was copied into publish");
console.log("publish staged without tests or function sources");
