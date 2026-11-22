import { describe, expect, it } from "vitest";
import markdownIt from "markdown-it";
import { parse } from "node-html-parser";
import { setupMarkdown } from "../../plugins/dg-mermaid/index.js";

function render(source) {
  const md = markdownIt({ breaks: true, html: true, linkify: true });
  setupMarkdown(md);
  return md.render(source);
}

// The build re-parses the whole page. Diagram source has to survive that
// with its line breaks and <br/> labels intact.
function textAfterHtmlParse(html) {
  const parsed = parse(`<main class="markdown-preview-view">${html}</main>`);
  return parsed.querySelectorAll("pre.mermaid").map((node) => node.text);
}

describe("mermaid fences", () => {
  it("renders a mermaid fence as a pre.mermaid block", () => {
    const html = render("```mermaid\ngraph TD\n  A --> B\n```\n");
    expect(html).toContain('<pre class="mermaid">');
    expect(html).not.toContain("language-mermaid");
    expect(textAfterHtmlParse(html)[0]).toContain("A --> B");
  });

  it("keeps <br/> labels as text so the browser does not swallow them", () => {
    const html = render(
      '```mermaid\ngraph TD\n  A["one<br/>two"]\n```\n'
    );
    expect(html).toContain("&lt;br/&gt;");
    expect(html).not.toContain("<br");
    expect(textAfterHtmlParse(html)[0]).toContain('A["one<br/>two"]');
  });

  it("leaves other fenced code to the normal highlighter", () => {
    const html = render("```js\nconst n = 1;\n```\n");
    expect(html).toContain("language-js");
    expect(html).not.toContain("mermaid");
  });

  it("renders each diagram as its own block", () => {
    const html = render(
      "```mermaid\ngraph TD\n  A --> B\n```\n\n```mermaid\nflowchart LR\n  C --> D\n```\n"
    );
    expect(textAfterHtmlParse(html)).toHaveLength(2);
  });
});
