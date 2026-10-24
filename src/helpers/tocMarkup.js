"use strict";

// eleventy-plugin-nesting-toc keeps only the text of a heading, so a formula
// that MathJax has already drawn in the note becomes a flat string in the
// outline. Copy the heading's markup instead, including the SVG formula.

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function decodeAttr(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingId(attrs) {
  const match = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs);
  if (!match) return "";
  return decodeAttr(match[1] || match[2] || match[3] || "");
}

function excluded(attrs) {
  return /\sdata-toc-exclude\b/i.test(attrs);
}

function unwrapAnchors(html) {
  return html.replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
}

function visibleText(html) {
  return decodeAttr(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// A copied formula must not reuse clip-path or aria ids from the note.
function namespaceIds(html, prefix) {
  const ids = [];
  const idRe = /\sid\s*=\s*(["'])([^"']+)\1/gi;
  let match;
  while ((match = idRe.exec(html))) ids.push(match[2]);
  if (!ids.length) return html;

  const unique = [...new Set(ids)].sort((a, b) => b.length - a.length);
  const mapped = new Map(unique.map((id) => [id, prefix + id]));
  let out = html.replace(idRe, (full, quote, id) => {
    const next = mapped.get(id);
    return next ? ` id=${quote}${next}${quote}` : full;
  });
  const alt = unique.map(escapeRegExp).join("|");
  const refRe = new RegExp(
    `(url\\(#|(?:xlink:href|href)=(["'])#|(?:aria-labelledby|aria-describedby)=(["']))(${alt})`,
    "g"
  );
  out = out.replace(refRe, (full, lead, _quote, _ariaQuote, id) => {
    const next = mapped.get(id);
    return next ? lead + next : full;
  });
  return out;
}

function getParent(prev, current) {
  if (current.level > prev.level) return prev;
  if (current.level === prev.level) return prev.parent;
  return getParent(prev.parent, current);
}

function renderItem(item) {
  let markup = "";
  if (item.slug && item.html) {
    markup += `<li><a href="#${escapeAttr(item.slug)}">${item.html}</a>`;
  }
  if (item.children.length) {
    markup += `<ol>${item.children.map(renderItem).join("")}</ol>`;
  }
  if (item.slug && item.html) markup += "</li>";
  return markup;
}

function tocMarkup(content, options = {}) {
  if (!content) return "";
  const tags = new Set(
    (options.tags || ["h1", "h2", "h3", "h4", "h5", "h6"]).map((tag) => tag.toLowerCase())
  );
  const root = { level: 0, slug: "", html: "", children: [] };
  root.parent = root;
  let previous = root;
  let index = 0;
  const headingRe = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRe.exec(content))) {
    const tag = "h" + match[1];
    if (!tags.has(tag)) continue;
    const attrs = match[2] || "";
    if (excluded(attrs)) continue;
    const slug = headingId(attrs);
    if (!slug) continue;
    const rawInner = match[3];
    if (!visibleText(rawInner) && !/<mjx-container\b/i.test(rawInner)) continue;
    const html = namespaceIds(unwrapAnchors(rawInner), `dg-toc-${index}-`);
    index += 1;
    const current = {
      level: Number(match[1]),
      slug,
      html,
      children: [],
      parent: null,
    };
    const parent = getParent(previous, current);
    current.parent = parent;
    parent.children.push(current);
    previous = current;
  }
  if (!root.children.length) return "";
  return `<nav class="toc">${renderItem(root)}</nav>`;
}

module.exports = { tocMarkup };
