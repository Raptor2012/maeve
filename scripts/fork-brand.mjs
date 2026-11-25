#!/usr/bin/env node
// Maeve fork: brands a throwaway checkout just before a build, as T3 Tools' trademark policy
// requires for distributed builds. Commit nothing it changes, so rebases stay cheap.
// Usage: node scripts/fork-brand.mjs [--no-i18n]

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const root = NodePath.resolve(import.meta.dirname, "..");
const BRAND = "Maeve";
const PACKAGE_ID = "dev.raptor2012.maeve";
const skipI18n = process.argv.includes("--no-i18n");

const rel = (file) => NodePath.relative(root, file).split(NodePath.sep).join("/");
const read = (file) => NodeFS.readFileSync(file, "utf8");
const write = (file, text) => NodeFS.writeFileSync(file, text);

function walk(dir, out = []) {
  for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "translations") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

// 1. Icons, logos and wordmark components from fork/brand, at the same paths.
const kit = NodePath.join(root, "fork", "brand");
let copied = 0;
for (const file of walk(kit)) {
  const target = NodePath.join(root, NodePath.relative(kit, file));
  NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
  NodeFS.copyFileSync(file, target);
  copied++;
}
console.log(`brand: copied ${copied} asset files`);

// 2. Snapshot translation catalogs before the source text changes their keys.
const CATALOG_APPS = ["apps/web", "apps/mobile", "apps/desktop"];
const catalogs = new Map();
for (const app of CATALOG_APPS) {
  const dir = NodePath.join(root, app, "src", "i18n", "translations");
  if (!NodeFS.existsSync(dir)) continue;
  const locales = {};
  for (const name of NodeFS.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    locales[name] = JSON.parse(read(NodePath.join(dir, name)));
  }
  catalogs.set(app, { dir, locales });
}

// 3. User-visible names in source text. Tests and the server's agent-facing text stay as they are.
const SOURCE_DIRS = [
  "apps/web/src",
  "apps/mobile/src",
  "apps/desktop/src",
  "apps/desktop/resources/voice",
  "packages/client-runtime/src",
  "packages/shared/src",
];
const SOURCE_EXT = /\.(tsx?|mts|html)$/;
const isTest = (file) => /\.(test|browser\.test|logic\.test)\.[cm]?tsx?$/.test(file);
// Identifiers, not display text: legacy profile folders the app migrates from, and the marker it
// uses to recognise the t3 command shim it installed.
const PROTECTED = ["T3 Code (Alpha)", "T3 Code (Dev)", "Written by T3 Code"];
const rename = (text) => {
  let out = text;
  PROTECTED.forEach((phrase, i) => (out = out.replaceAll(phrase, `\u0000${i}\u0000`)));
  out = out.replaceAll("T3 Code", BRAND).replaceAll('aria-label="T3"', `aria-label="${BRAND}"`);
  PROTECTED.forEach((phrase, i) => (out = out.replaceAll(`\u0000${i}\u0000`, phrase)));
  return out;
};
let changedFiles = 0;
for (const dir of SOURCE_DIRS) {
  const abs = NodePath.join(root, dir);
  if (!NodeFS.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    if (!SOURCE_EXT.test(file) || isTest(file)) continue;
    const before = read(file);
    const after = rename(before);
    if (after !== before) {
      write(file, after);
      changedFiles++;
    }
  }
}
console.log(`brand: renamed in ${changedFiles} source files`);

function edit(file, pairs) {
  const abs = NodePath.join(root, file);
  let text = read(abs);
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`brand: "${from}" not found in ${file}`);
    text = text.replaceAll(from, to);
  }
  write(abs, text);
}

edit("apps/desktop/package.json", [
  ['"productName": "T3 Code (Beta)"', `"productName": "${BRAND}"`],
]);
edit("apps/web/index.html", [["<title>T3 Code</title>", `<title>${BRAND}</title>`]]);
edit("apps/web/public/manifest.webmanifest", [
  ['"name": "T3 Code"', `"name": "${BRAND}"`],
  ['"short_name": "T3 Code"', `"short_name": "${BRAND}"`],
]);
edit("apps/mobile/app.config.ts", [
  ['appName: "T3 Code Dev"', `appName: "${BRAND} Dev"`],
  ['appName: "T3 Code Preview"', `appName: "${BRAND}"`],
  ['appName: "T3 Code"', `appName: "${BRAND}"`],
  ["com.t3tools.t3code", PACKAGE_ID],
  ['androidAdaptiveBackgroundColor: "#111533"', 'androidAdaptiveBackgroundColor: "#000000"'],
]);
// Installer and OS-facing strings in the desktop packaging script.
{
  const file = NodePath.join(root, "scripts", "build-desktop-artifact.ts");
  write(file, read(file).replaceAll('"T3 Code', `"${BRAND}`).replaceAll('"T3-Code-', `"${BRAND}-`));
}

// 4. Regenerate catalogs for the renamed text, then carry every translation over to its new key.
if (!skipI18n) {
  for (const [app, { dir, locales }] of catalogs) {
    NodeChildProcess.execSync("vp run i18n:generate", {
      cwd: NodePath.join(root, app),
      stdio: "inherit",
    });
    const oldSource = locales["en.json"];
    const newSource = JSON.parse(read(NodePath.join(dir, "en.json")));
    // Old source text (as JSON) to its key, for finding where a renamed message came from.
    const oldKeyBySource = new Map(
      Object.entries(oldSource).map(([key, value]) => [JSON.stringify(value), key]),
    );
    const moves = [];
    for (const [key, value] of Object.entries(newSource)) {
      if (key in oldSource) continue;
      const original = JSON.stringify(value).replaceAll(BRAND, "T3 Code");
      const oldKey = oldKeyBySource.get(original);
      if (oldKey) moves.push([oldKey, key]);
    }
    for (const name of Object.keys(locales)) {
      if (name === "en.json") continue;
      const file = NodePath.join(dir, name);
      const current = JSON.parse(read(file));
      for (const [oldKey, newKey] of moves) {
        const old = locales[name][oldKey];
        // The generator fills new keys with the English source; the real translation wins.
        if (old === undefined) continue;
        current[newKey] = JSON.parse(JSON.stringify(old).replaceAll("T3 Code", BRAND));
      }
      write(file, `${JSON.stringify(current, null, 2)}\n`);
    }
    console.log(`brand: ${rel(dir)} carried ${moves.length} translations to renamed messages`);
  }
}
console.log("brand: done");
