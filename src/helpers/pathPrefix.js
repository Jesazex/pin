const fs = require("fs");
const path = require("path");

const PREFIXABLE = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".xml",
  ".svg",
  ".webmanifest",
]);

/**
 * Normalize a site path prefix such as "/PIN16".
 * Empty, missing, and "/" mean the site is served from the domain root.
 */
function normalizePrefix(prefix) {
  if (prefix == null) return "";
  let value = String(prefix).trim();
  if (!value || value === "/") return "";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.endsWith("/")) value = value.slice(0, -1);
  const parts = value.split("/").slice(1);
  const safe = parts.every(
    (part) => part && part !== "." && part !== ".." && /^[A-Za-z0-9._~-]+$/.test(part)
  );
  if (!safe) {
    throw new Error(`Invalid PATH_PREFIX: ${prefix}`);
  }
  return value;
}

/**
 * Rewrite root-absolute URLs so a project site under /PIN16 can load
 * styles, scripts, and note links. Leaves protocol-relative URLs, already
 * prefixed paths, and ordinary "16px / 1.5" CSS alone.
 */
function prefixRootUrls(text, prefix) {
  const normalized = normalizePrefix(prefix);
  if (!normalized || typeof text !== "string" || !text) return text;
  const token = normalized
    .slice(1)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const skip = `(?!\\/|${token}\\/)`;
  // Only quotes. A slash after "(" is a JavaScript regexp (`match(/^На/)`,
  // `replace(/\s+/)`), not a URL. CSS `url(/img)` is handled separately.
  const quoted = new RegExp(`(?<=["'])\\/${skip}`, "g");
  const afterComma = new RegExp(`(?<=,\\s*)\\/${skip}`, "g");
  const cssUrl = new RegExp(`(?<=url\\(\\s*)\\/${skip}`, "g");
  return text
    .replace(quoted, `${normalized}/`)
    .replace(afterComma, `${normalized}/`)
    .replace(cssUrl, `${normalized}/`);
}

const ICON_NAMES = [
  ["favicon.ico", "favicon"],
  ["apple-touch-icon.png", "apple-touch-icon"],
  ["icon-192.png", "icon-192"],
  ["icon-512.png", "icon-512"],
];

/**
 * Point icon links at a new filename. Browsers keep the old favicon for a
 * stable `/favicon.ico` address even after the file bytes change.
 */
function versionIconUrls(text, version) {
  if (!version || typeof text !== "string" || !text) return text;
  let next = text;
  for (const [fileName, stem] of ICON_NAMES) {
    const ext = path.extname(fileName);
    next = next.replace(
      new RegExp(`/${stem}\\${ext}(?!-)`, "g"),
      `/${stem}-${version}${ext}`
    );
  }
  return next;
}

function applyPathPrefix(dir, prefix, iconVersion) {
  const normalized = normalizePrefix(prefix);
  if (!fs.existsSync(dir)) return 0;
  let changed = 0;

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!PREFIXABLE.has(path.extname(entry.name).toLowerCase())) continue;
      const original = fs.readFileSync(full, "utf8");
      let next = prefixRootUrls(original, normalized);
      next = versionIconUrls(next, iconVersion);
      if (next !== original) {
        fs.writeFileSync(full, next);
        changed += 1;
      }
    }
  }

  walk(dir);
  if (iconVersion) {
    for (const [fileName, stem] of ICON_NAMES) {
      const from = path.join(dir, fileName);
      if (!fs.existsSync(from)) continue;
      const ext = path.extname(fileName);
      fs.copyFileSync(from, path.join(dir, `${stem}-${iconVersion}${ext}`));
    }
  }
  return changed;
}

module.exports = { normalizePrefix, prefixRootUrls, versionIconUrls, applyPathPrefix };
