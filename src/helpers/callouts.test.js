import { describe, expect, it } from "vitest";
import markdownIt from "markdown-it";
import { parse } from "node-html-parser";
import {
  defaultCalloutTitle,
  parseCalloutHeader,
  transformCalloutBlockquotes,
} from "./callouts.js";

function renderCallouts(html) {
  const root = parse(`<div id="root">${html}</div>`);
  transformCalloutBlockquotes(root.querySelectorAll("blockquote"));
  return root.querySelector("#root");
}

describe("Obsidian callouts", () => {
  it("keeps a title that contains ] inside rendered math", () => {
    const html = [
      "<blockquote>",
      "<p>[!example] Пример 2. Раскрытие неопределенности вида <mjx-container><math><mo>]</mo><mi>∞</mi></math></mjx-container><br>",
      "Вычислить предел:</p>",
      "</blockquote>",
    ].join("\n");
    const root = renderCallouts(html);
    const callout = root.querySelector(".callout");
    const title = callout.querySelector(".callout-title-inner").innerHTML;
    expect(callout.getAttribute("data-callout")).toBe("example");
    expect(title).toContain("Пример 2. Раскрытие неопределенности вида");
    expect(title).toContain("<mjx-container>");
    expect(title).not.toContain("<br");
    const body = callout.querySelector(".callout-content").text;
    expect(body).toContain("Вычислить предел:");
    expect(callout.querySelector(".callout-title-inner").text).not.toContain("Вычислить");
  });

  it("renders the Матан 1106 example title the way Obsidian does", () => {
    const md = markdownIt({ breaks: true, html: true });
    md.use(require("markdown-it-mathjax3"), { tex: { inlineMath: [["$", "$"]] } });
    const source = [
      "> [!example] Пример 2. Раскрытие неопределенности вида $[1^\\infty]$",
      "> Вычислить предел:",
      "> $$\\\\lim_{x \\\\to \\\\infty} x$$",
      ">",
      "> **Ответ:** $e^2$.",
    ].join("\n");
    const root = renderCallouts(md.render(source));
    const title = root.querySelector(".callout-title-inner");
    const body = root.querySelector(".callout-content");
    expect(title.text.replace(/\s+/g, " ")).toContain("Пример 2. Раскрытие неопределенности вида");
    expect(title.querySelector("mjx-container")).toBeTruthy();
    expect(body.text).toContain("Вычислить предел:");
    expect(body.text).toContain("Ответ:");
    expect(title.text).not.toContain("Вычислить");
  });

  it("uses Obsidian's name when the title is empty", () => {
    expect(defaultCalloutTitle("tldr")).toBe("TLDR");
    expect(defaultCalloutTitle("hint")).toBe("Tip");
    expect(defaultCalloutTitle("myType")).toBe("Mytype");
    const root = renderCallouts("<blockquote><p>[!warning]</p></blockquote>");
    expect(root.querySelector(".callout-title-inner").text).toBe("Warning");
    expect(root.querySelector(".callout-content")).toBeNull();
  });

  it("folds with + and - and keeps metadata off the title", () => {
    const closed = parseCalloutHeader("<p>[!note|custom]- Скрыто<br>\nТекст</p>");
    expect(closed).toMatchObject({
      type: "note",
      metadata: "custom",
      isCollapsible: true,
      isCollapsed: true,
    });
    expect(closed.titleHtml).toBe("Скрыто");
    expect(closed.contentHtml).toContain("Текст");

    const open = renderCallouts("<blockquote>\n<p>[!info]+ Открыто</p>\n<p>Дальше</p>\n</blockquote>");
    const callout = open.querySelector(".callout");
    expect(callout.classList.contains("is-collapsible")).toBe(true);
    expect(callout.classList.contains("is-collapsed")).toBe(false);
    expect(callout.querySelector(".callout-fold")).toBeTruthy();
    expect(callout.querySelector(".callout-content").text).toContain("Дальше");
  });

  it("leaves an ordinary quote alone, including one that mentions [!note]", () => {
    const root = renderCallouts("<blockquote><p>Смотри [!note] ниже</p><p>Вторая строка</p></blockquote>");
    expect(root.querySelector(".callout")).toBeNull();
    expect(root.querySelector("blockquote")).toBeTruthy();
  });

  it("converts a nested callout before its parent", () => {
    const html = "<blockquote><p>[!note] Снаружи</p><blockquote><p>[!example] Внутри</p></blockquote></blockquote>";
    const root = renderCallouts(html);
    const outer = root.querySelector(":scope > .callout");
    const inner = outer.querySelector(".callout");
    expect(outer.getAttribute("data-callout")).toBe("note");
    expect(inner.getAttribute("data-callout")).toBe("example");
    expect(inner.querySelector(".callout-title-inner").text).toBe("Внутри");
  });
});
