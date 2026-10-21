import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import { userMarkdownSetup } from "./userSetup.js";

function render(source) {
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
  userMarkdownSetup(md);
  return md.render(source);
}

describe("deadline table mentions", () => {
  it("turns bracketed forms into a link that opens the table", () => {
    const html = render("Смотри <дедлайны>, <Дедлайнам> и <ДЕДЛАЙНОВ>.");
    expect(html.match(/data-open-deadline-table/g)).toHaveLength(3);
    expect(html).toContain(">дедлайны</a>");
    expect(html).toContain(">Дедлайнам</a>");
    expect(html).toContain(">ДЕДЛАЙНОВ</a>");
    expect(html).not.toContain("&lt;дедлайны&gt;");
  });

  it("leaves the words alone when they are not wrapped in brackets", () => {
    const html = render("Здесь дедлайны, Дедлайнам и дедлайнов без скобок.");
    expect(html).not.toContain("data-open-deadline-table");
    expect(html).toContain("дедлайны, Дедлайнам и дедлайнов");
  });

  it("does not link a longer word or a code span", () => {
    const html = render("`<дедлайны>` и <дедлайнами> остаются текстом.");
    expect(html).not.toContain("data-open-deadline-table");
    expect(html).toContain("<code>");
    expect(html).toContain("&lt;дедлайнами&gt;");
  });
});
