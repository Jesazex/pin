import { describe, it, expect } from "vitest";
import { normalizePrefix, prefixRootUrls, versionIconUrls } from "./pathPrefix.js";

describe("normalizePrefix", () => {
  it("treats an empty prefix as the domain root", () => {
    expect(normalizePrefix("")).toBe("");
    expect(normalizePrefix("/")).toBe("");
    expect(normalizePrefix(undefined)).toBe("");
  });

  it("accepts a repository path with or without slashes", () => {
    expect(normalizePrefix("PIN16")).toBe("/PIN16");
    expect(normalizePrefix("/PIN16")).toBe("/PIN16");
    expect(normalizePrefix("/PIN16/")).toBe("/PIN16");
  });

  it("rejects prefixes that are not a URL path", () => {
    expect(() => normalizePrefix("/../etc")).toThrow(/PATH_PREFIX/);
    expect(() => normalizePrefix("https://example.com")).toThrow(/PATH_PREFIX/);
  });
});

describe("prefixRootUrls", () => {
  const prefix = "/PIN16";

  it("prefixes quoted root paths and leaves the rest of the document", () => {
    const input = '<link href="/styles/custom-style.css"><a href="/">home</a>';
    expect(prefixRootUrls(input, prefix)).toBe(
      '<link href="/PIN16/styles/custom-style.css"><a href="/PIN16/">home</a>'
    );
  });

  it("prefixes fetch calls, srcset candidates, and css urls", () => {
    const input = [
      "fetch('/searchIndex.json?v=1')",
      'srcset="/img/a.webp 500w, /img/b.webp 700w"',
      'url("/img/outgoing.svg")',
      "url(/img/outgoing.svg)",
    ].join("\n");
    expect(prefixRootUrls(input, prefix)).toBe(
      [
        "fetch('/PIN16/searchIndex.json?v=1')",
        'srcset="/PIN16/img/a.webp 500w, /PIN16/img/b.webp 700w"',
        'url("/PIN16/img/outgoing.svg")',
        "url(/PIN16/img/outgoing.svg)",
      ].join("\n")
    );
  });

  it("does not rewrite JavaScript regular expressions", () => {
    const input = [
      '.match(/^На\\s+(\\d{1,2})\\s+([А-Яа-яёЁ]+)\\s*$/i)',
      '.replace(/\\u00a0/g, " ")',
      '.match(/translate\\(\\s*(-?[\\d.]+)/)',
      '.split(/[\\s,]+/)',
    ].join("\n");
    expect(prefixRootUrls(input, prefix)).toBe(input);
  });

  it("does not prefix protocol-relative urls, absolute urls, or css ratios", () => {
    const input = 'src="//cdn.example/a.js" href="https://example.com/a" font: 16px / 1.5;';
    expect(prefixRootUrls(input, prefix)).toBe(input);
  });

  it("does not prefix a path twice", () => {
    const once = prefixRootUrls('href="/lekczii/"', prefix);
    expect(prefixRootUrls(once, prefix)).toBe('href="/PIN16/lekczii/"');
  });

  it("returns the text unchanged when there is no prefix", () => {
    const input = 'href="/styles/custom-style.css"';
    expect(prefixRootUrls(input, "")).toBe(input);
  });
});

describe("versionIconUrls", () => {
  it("gives the tab icon a new address when the picture changes", () => {
    const input = '<link rel="icon" href="/pin16/favicon.ico" sizes="any">';
    expect(versionIconUrls(input, "abc123")).toBe(
      '<link rel="icon" href="/pin16/favicon-abc123.ico" sizes="any">'
    );
  });

  it("leaves ordinary links alone", () => {
    const input = 'href="/pin16/lekczii/"';
    expect(versionIconUrls(input, "abc123")).toBe(input);
  });
});
