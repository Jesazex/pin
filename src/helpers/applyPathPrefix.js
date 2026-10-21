const crypto = require("crypto");
const fs = require("fs");
const { applyPathPrefix } = require("./pathPrefix");

// Runs after Eleventy and Sass both finish. Doing this inside eleventy.after
// races the parallel Sass build and can leave CSS urls unprefixed.
const outDir = "dist";
if (!fs.existsSync(outDir)) {
  process.exit(0);
}

const iconFile = "src/site/favicon.png";
const iconVersion = fs.existsSync(iconFile)
  ? crypto.createHash("sha256").update(fs.readFileSync(iconFile)).digest("hex").slice(0, 8)
  : "";
const changed = applyPathPrefix(outDir, process.env.PATH_PREFIX, iconVersion);
fs.writeFileSync(`${outDir}/.nojekyll`, "");
if (changed) {
  console.log(`[pages] Prefixed root urls in ${changed} files (${process.env.PATH_PREFIX})`);
}
