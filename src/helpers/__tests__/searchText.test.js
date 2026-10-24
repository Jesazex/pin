import { describe, it, expect } from "vitest";
import { sectionsForSearch, textForSearch } from "../../plugins/dg-search/index.js";

describe("search text", () => {
  it("indexes heading and prose text and drops links", () => {
    const html = [
      "<h2 id=\"lekcii\">Лекции</h2>",
      "<p>Смотри <a class=\"internal-link\" href=\"/matan\">Матан 1101</a> и текст про предел.</p>",
      "<p>[[Другая страница|ещё ссылка]] и [[/Дедлайны]]</p>",
    ].join("");
    const text = textForSearch(html);
    expect(text).toContain("Лекции");
    expect(text).toContain("текст про предел");
    expect(text).not.toContain("Матан 1101");
    expect(text).not.toContain("ещё ссылка");
    expect(text).not.toContain("Другая страница");
    expect(text).not.toContain("Дедлайны");

    const sections = sectionsForSearch(html);
    expect(sections[0]).toMatchObject({ id: "lekcii", text: "Лекции" });
    expect(sections[0].body).toContain("текст про предел");
    expect(sections[0].body).not.toContain("Матан 1101");
    expect(sections[0].body).not.toContain("ещё ссылка");
  });

  it("keeps a heading that is not wrapped in a link", () => {
    const html = "<p>вступление</p><h3 id=\"zakon\">Законы Ньютона</h3><p>формула</p>";
    const sections = sectionsForSearch(html);
    expect(sections.map((section) => section.text)).toEqual(["", "Законы Ньютона"]);
    expect(sections[1].body).toBe("формула");
    expect(sections[0].body).toBe("вступление");
  });
});
