#!/usr/bin/env node
// Automates the GitHub Pages deploy flow from README.md's "Web deployment"
// section: temporarily set the Pages base path, export, add the SPA 404
// fallback, publish -- then always restore app.json, even on failure.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const appJsonPath = path.join(root, "app.json");
const BASE_URL = "/dining-decision-app";

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

const original = fs.readFileSync(appJsonPath, "utf8");
const config = JSON.parse(original);
config.expo.experiments = { ...config.expo.experiments, baseUrl: BASE_URL };
fs.writeFileSync(appJsonPath, JSON.stringify(config, null, 2) + "\n");

try {
  run("npx expo export -p web");
} finally {
  // Restore regardless of export outcome so a failed export never leaves the
  // temporary baseUrl sitting in a real commit.
  fs.writeFileSync(appJsonPath, original);
}

fs.copyFileSync(
  path.join(root, "dist", "index.html"),
  path.join(root, "dist", "404.html"),
);

run(
  "npx gh-pages --nojekyll -d dist --before-add ./scripts/gh-pages-before-add.js",
);

console.log("\nDeployed: https://codinghag.github.io/dining-decision-app/");
