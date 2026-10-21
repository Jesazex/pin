const path = require("path");

const wikiLinkRegex = /\[\[(.*?\|.*?)\]\]/g;
const internalLinkRegex = /href="\/(.*?)"/g;
// Markdown-style links to .md files, e.g. [Feedback](../concepts/feedback.md).
// Negative lookbehind excludes image embeds. Group 1 is the link target.
const markdownMdLinkRegex =
  /(?<!\!)\[[^\]]*\]\(\s*([^)\s]+?\.(?:md|markdown))(#[^)\s]*)?\s*\)/gi;
const externalSchemeRegex = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolve a markdown link target to a vault-root-relative path.
 * Returns null for external links or paths escaping the vault root.
 * sourceDir is the vault-relative directory of the linking note ("" for root).
 */
function resolveVaultPath(linkTarget, sourceDir) {
  if (!linkTarget || externalSchemeRegex.test(linkTarget)) {
    return null;
  }
  let decoded = linkTarget;
  try {
    decoded = decodeURI(linkTarget);
  } catch {
    // Keep the raw target if it is not valid percent-encoding
  }
  const resolved = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(sourceDir || "", decoded));
  if (resolved.startsWith("../") || resolved === "..") {
    return null;
  }
  return resolved;
}

/**
 * Possible vault-root-relative interpretations of a markdown link target,
 * most likely first. Obsidian resolves targets relative to the note, but
 * some exporters emit vault-root paths with no ./ or ../ prefix, so those
 * targets get a vault-root candidate as fallback.
 */
function vaultPathCandidates(linkTarget, sourceDir) {
  const noteRelative = resolveVaultPath(linkTarget, sourceDir);
  const candidates = noteRelative ? [noteRelative] : [];
  if (
    linkTarget &&
    !linkTarget.startsWith("/") &&
    !linkTarget.startsWith("./") &&
    !linkTarget.startsWith("../")
  ) {
    const vaultRoot = resolveVaultPath(linkTarget, "");
    if (vaultRoot && !candidates.includes(vaultRoot)) {
      candidates.push(vaultRoot);
    }
  }
  return candidates;
}

/**
 * Extract markdown-style links to .md files, resolved against the source
 * note's vault path and stripped of extension/fragment so they match note
 * stems. Ambiguous targets yield every candidate interpretation.
 */
function extractMarkdownLinks(content, sourcePath) {
  const links = [];
  const sourceDir = path.posix.dirname(sourcePath || "");
  let match;
  markdownMdLinkRegex.lastIndex = 0;
  while ((match = markdownMdLinkRegex.exec(content)) !== null) {
    for (const resolved of vaultPathCandidates(
      match[1],
      sourceDir === "." ? "" : sourceDir,
    )) {
      links.push(resolved.replace(/\.(md|markdown)$/i, ""));
    }
  }
  return links;
}

/**
 * Rewrite relative .md hrefs in rendered HTML to their resolved permalinks.
 * resolveAnchor(vaultPathCandidates, fragment, originalHref) receives the
 * candidate interpretations (most likely first) and returns an attributes
 * object ({ href, ... }) or null to leave the anchor untouched.
 */
function convertMdHrefs(html, sourceDir, resolveAnchor) {
  // (?:[^>]*?\s)? requires href to start the tag or follow whitespace, so
  // attributes like data-href are never rewritten.
  return html.replace(
    /(<a\s(?:[^>]*?\s)?href=")([^"]+)("[^>]*>)/gi,
    (fullMatch, before, href, after) => {
      const [target, ...fragmentParts] = href.split("#");
      const fragment = fragmentParts.length ? `#${fragmentParts.join("#")}` : "";
      if (
        !/\.(md|markdown)$/i.test(target) ||
        target.startsWith("/") ||
        externalSchemeRegex.test(target)
      ) {
        return fullMatch;
      }
      const candidates = vaultPathCandidates(target, sourceDir);
      if (!candidates.length) {
        return fullMatch;
      }
      const attrs = resolveAnchor(candidates, fragment, href);
      if (!attrs || !attrs.href) {
        return fullMatch;
      }
      return `${before}${attrs.href}${fragment}${after}`;
    },
  );
}

function extractLinks(content, sourcePath) {
  return [
    ...(content.match(wikiLinkRegex) || []).map(
      (link) =>
        link
          .slice(2, -2)
          .split("|")[0]
          .replace(/\.(md|markdown)\s?$/i, "")
          .replace("\\", "")
          .trim()
          .split("#")[0]
    ),
    ...(content.match(internalLinkRegex) || []).map(
      (link) =>
        link
          .slice(6, -1)
          .split("|")[0]
          .replace(/\.(md|markdown)\s?$/i, "")
          .replace("\\", "")
          .trim()
          .split("#")[0]
    ),
    ...(sourcePath ? extractMarkdownLinks(content, sourcePath) : []),
  ];
}

exports.wikiLinkRegex = wikiLinkRegex;
exports.internalLinkRegex = internalLinkRegex;
exports.extractLinks = extractLinks;
exports.resolveVaultPath = resolveVaultPath;
exports.convertMdHrefs = convertMdHrefs;
