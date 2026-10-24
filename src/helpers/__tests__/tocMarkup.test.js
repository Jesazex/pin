import { describe, it, expect } from "vitest";
import { tocMarkup } from "../tocMarkup.js";

describe("tocMarkup", () => {
  it("keeps rendered formulas inside outline links", () => {
    const html =
      '<h2 id="e">Число <mjx-container id="mjx-1"><svg><path d="M1" clip-path="url(#mjx-1)"/></svg></mjx-container></h2>';
    const toc = tocMarkup(html);
    expect(toc).toContain('<a href="#e">');
    expect(toc).toContain("<mjx-container");
    expect(toc).toContain("<svg>");
    expect(toc).toContain('id="dg-toc-0-mjx-1"');
    expect(toc).toContain("url(#dg-toc-0-mjx-1)");
    expect(toc).not.toContain('id="mjx-1"');
  });

  it("nests headings and leaves plain labels untouched", () => {
    const html = '<h2 id="a">A</h2><h3 id="b">B</h3><h4 id="d">D</h4><h2 id="c">C</h2>';
    expect(tocMarkup(html)).toBe(
      '<nav class="toc"><ol><li><a href="#a">A</a><ol><li><a href="#b">B</a><ol><li><a href="#d">D</a></li></ol></li></ol></li><li><a href="#c">C</a></li></ol></nav>'
    );
  });

  it("skips headings without an id and headings excluded from the outline", () => {
    const html = '<h2>No id</h2><h2 id="x" data-toc-exclude>Skip</h2><h2 id="y">Keep</h2>';
    const toc = tocMarkup(html);
    expect(toc).toContain('href="#y"');
    expect(toc).toContain(">Keep<");
    expect(toc).not.toContain("No id");
    expect(toc).not.toContain("Skip");
  });

  it("unwraps the heading permalink so the outline has a single link", () => {
    const html =
      '<h2 id="a"><a class="header-anchor" href="#a">Title <mjx-container></mjx-container></a></h2>';
    const toc = tocMarkup(html);
    expect(toc.match(/<a\b/g)).toHaveLength(1);
    expect(toc).toContain("Title <mjx-container></mjx-container>");
    expect(toc).toContain('href="#a"');
  });

  it("returns an empty string when there is nothing to list", () => {
    expect(tocMarkup("")).toBe("");
    expect(tocMarkup(null)).toBe("");
    expect(tocMarkup("<p>No headings</p>")).toBe("");
    expect(tocMarkup('<h2 id="empty"></h2>')).toBe("");
  });

  it("keeps emphasis and decodes the heading id into the link", () => {
    const html = '<h3 id="a&amp;b"><em>Name</em></h3>';
    expect(tocMarkup(html)).toContain('<a href="#a&amp;b"><em>Name</em></a>');
  });

  it("respects the heading tags it is asked to list", () => {
    const html = '<h2 id="a">A</h2><h3 id="b">B</h3>';
    const toc = tocMarkup(html, { tags: ["h2"] });
    expect(toc).toContain(">A<");
    expect(toc).not.toContain(">B<");
  });
});
