/**
 * Obsidian callouts, applied to markdown-it HTML.
 *
 * A callout is a blockquote whose first line is [!type] or [!type|meta],
 * optionally followed by + (open, foldable) or - (closed, foldable), then
 * the title. The ] that ends the marker is the first one: titles may contain
 * ] and rendered math (the $[1^\infty]$ case). The title is already-rendered
 * inline markdown. An empty title uses Obsidian's name for that type.
 */

const DEFAULT_TITLES = {
  note: "Note",
  abstract: "Abstract",
  summary: "Summary",
  tldr: "TLDR",
  info: "Info",
  todo: "Todo",
  tip: "Tip",
  hint: "Tip",
  important: "Important",
  success: "Success",
  check: "Success",
  done: "Success",
  question: "Question",
  help: "Question",
  faq: "Question",
  warning: "Warning",
  caution: "Warning",
  attention: "Warning",
  failure: "Failure",
  fail: "Failure",
  missing: "Failure",
  danger: "Danger",
  error: "Danger",
  bug: "Bug",
  example: "Example",
  quote: "Quote",
  cite: "Quote",
};

// The marker itself. Metadata stops at the first ], so a ] later in the
// title (or inside MathJax markup) stays part of the title.
const CALLOUT_MARKER = /\[!([\w-]*)(\|[^\]]*)?\]([+-])?([^\n]*)/;
const CALLOUT_PREFIX = /^(?:\s|<p(?:\s[^>]*)?>)*$/i;

function visibleCalloutText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[#\w]+;/g, " ")
    .trim();
}

function calloutTitleHasContent(html) {
  if (!html) return false;
  if (/<(mjx-container|math|svg|img|code)\b/i.test(html)) return true;
  return visibleCalloutText(html).length > 0;
}

function calloutContentIsEmpty(html) {
  if (!html) return true;
  if (/<(mjx-container|math|svg|img|table|ul|ol|pre|hr|blockquote|iframe|video|audio|h[1-6])\b/i.test(html)) {
    return false;
  }
  return visibleCalloutText(html).length === 0;
}

function defaultCalloutTitle(type) {
  const key = String(type || "note").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DEFAULT_TITLES, key)) {
    return DEFAULT_TITLES[key];
  }
  if (!key) return "Note";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function cleanCalloutTitle(titleHtml) {
  return String(titleHtml || "")
    .replace(/^(?:\s|<br\s*\/?>)+/gi, "")
    .replace(/(?:\s|<br\s*\/?>)+$/gi, "");
}

/**
 * Split one blockquote's inner HTML into callout parts.
 * Returns null when the quote is not a callout.
 */
function parseCalloutHeader(innerHTML) {
  if (!innerHTML || innerHTML.indexOf("[!") === -1) return null;
  const match = innerHTML.match(CALLOUT_MARKER);
  if (!match) return null;
  const before = innerHTML.slice(0, match.index);
  if (!CALLOUT_PREFIX.test(before)) return null;

  const type = (match[1] || "note").toLowerCase();
  const metadata = (match[2] || "").replace(/^\|/, "").trim();
  const fold = match[3] || "";
  // A title that is its own paragraph ends with </p> on that same line.
  // Put the closing tag back so the body paragraphs stay intact.
  let rawTitle = match[4] || "";
  let returnedTail = "";
  const closingParagraph = rawTitle.match(/<\/p>\s*$/i);
  if (closingParagraph) {
    returnedTail = closingParagraph[0];
    rawTitle = rawTitle.slice(0, closingParagraph.index);
  }
  let titleHtml = cleanCalloutTitle(rawTitle);
  if (!calloutTitleHasContent(titleHtml)) {
    titleHtml = defaultCalloutTitle(type);
  }
  let contentHtml = before + returnedTail + innerHTML.slice(match.index + match[0].length);
  contentHtml = contentHtml.replace(/^(?:\s|<p>\s*<\/p>)+/i, "");
  if (calloutContentIsEmpty(contentHtml)) contentHtml = "";

  return {
    type,
    metadata,
    isCollapsible: fold === "+" || fold === "-",
    isCollapsed: fold === "-",
    titleHtml,
    contentHtml,
  };
}

function transformCalloutBlockquotes(blockquotes) {
  for (const blockquote of blockquotes) {
    if (!blockquote || typeof blockquote.querySelectorAll !== "function") continue;
    transformCalloutBlockquotes(blockquote.querySelectorAll("blockquote"));
    const parsed = parseCalloutHeader(blockquote.innerHTML);
    if (!parsed) continue;
    const fold = parsed.isCollapsible
      ? `<div class="callout-fold"><i icon-name="chevron-down"></i></div>`
      : "";
    const titleDiv = `<div class="callout-title"><div class="callout-title-inner">${parsed.titleHtml}</div>${fold}</div>`;
    const contentDiv = parsed.contentHtml
      ? `\n<div class="callout-content">${parsed.contentHtml}</div>`
      : "";
    blockquote.tagName = "div";
    blockquote.classList.add("callout");
    if (parsed.isCollapsible) blockquote.classList.add("is-collapsible");
    if (parsed.isCollapsed) blockquote.classList.add("is-collapsed");
    blockquote.setAttribute("data-callout", parsed.type);
    if (parsed.metadata) {
      blockquote.setAttribute("data-callout-metadata", parsed.metadata);
    }
    blockquote.innerHTML = `${titleDiv}${contentDiv}`;
  }
}

module.exports = {
  DEFAULT_TITLES,
  defaultCalloutTitle,
  parseCalloutHeader,
  transformCalloutBlockquotes,
};
