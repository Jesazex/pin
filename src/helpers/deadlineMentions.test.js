import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import { userMarkdownSetup } from "./userSetup.js";
import { rewriteDeadlineWikilinks } from "./deadlinesUtils.js";

const published = { name: "Дедлайны", qualified: true };

function render(source) {
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
  userMarkdownSetup(md);
  return md.render(source);
}

describe("deadline table links", () => {
  it("turns a slash wikilink into a link that opens the table", () => {
    const html = rewriteDeadlineWikilinks(
      "Смотри [[/Дедлайны|Ссылка на таблицу]] и [[/Дедлайны]].",
      published
    );
    expect(html.match(/data-open-deadline-table/g)).toHaveLength(2);
    expect(html).toContain(">Ссылка на таблицу</a>");
    expect(html).toContain(">Дедлайны</a>");
    expect(html).not.toContain("[[/Дедлайны");
  });

  it("accepts the backslash Obsidian writes before the pipe", () => {
    const html = rewriteDeadlineWikilinks("[[/Дедлайны\\|Дедлайнам]]", published);
    expect(html).toContain(">Дедлайнам</a>");
    expect(html).toContain("data-open-deadline-table");
  });

  it("uses the folder named in the home note", () => {
    const html = rewriteDeadlineWikilinks(
      "[[/Сроки|к таблице]] [[/Дедлайны]]",
      { name: "Сроки", qualified: true }
    );
    expect(html).toContain(">к таблице</a>");
    expect(html).toContain("[[/Дедлайны]]");
  });

  it("leaves the wikilink alone when the folder does not qualify", () => {
    const html = rewriteDeadlineWikilinks("[[/Дедлайны|Ссылка]] и [[/Дедлайны]]", {
      name: "Дедлайны",
      qualified: false,
    });
    expect(html).not.toContain("data-open-deadline-table");
    expect(html).toContain("[[/Дедлайны|Ссылка]]");
    expect(html).toContain("[[/Дедлайны]]");
  });

  it("does not convert an ordinary wikilink or angle brackets", () => {
    const source = "[[Лекции/Матан|Матан]] и <Дедлайнам> остаются текстом.";
    const html = rewriteDeadlineWikilinks(source, published);
    expect(html).toBe(source);
    const rendered = render("<Дедлайнам> и <дедлайны>.");
    expect(rendered).not.toContain("data-open-deadline-table");
    expect(rendered).toContain("&lt;Дедлайнам&gt;");
  });
});
