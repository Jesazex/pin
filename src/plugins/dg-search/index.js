const fs = require("fs");
const path = require("path");

// Same tag pattern as the core taggify filter (.eleventy.js).
const tagRegex = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?><]+)(?!([^<]*>))/g;

module.exports = {
  setupEleventy(eleventyConfig, context) {
    eleventyConfig.addFilter("stripForSearch", function (content) {
      return content
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    });

    // One entry per section: heading text plus the body under it, so a match
    // can scroll to the heading it belongs to. Ids come from the rendered HTML.
    eleventyConfig.addFilter("sectionsForSearch", function (content) {
      const html = String(content || "");
      const strip = (value) =>
        String(value || "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
      const marks = [];
      let match;
      while ((match = re.exec(html)) !== null) {
        const attrs = match[2] || "";
        const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
        marks.push({
          start: match.index,
          end: re.lastIndex,
          id: idMatch ? idMatch[1] : "",
          text: strip(match[3]),
        });
      }
      if (marks.length === 0) {
        const body = strip(html);
        return body ? [{ id: "", text: "", body }] : [];
      }
      const sections = [];
      const preamble = strip(html.slice(0, marks[0].start));
      if (preamble) sections.push({ id: "", text: "", body: preamble });
      marks.forEach((mark, index) => {
        const next = marks[index + 1] ? marks[index + 1].start : html.length;
        sections.push({
          id: mark.id,
          text: mark.text,
          body: strip(html.slice(mark.end, next)),
        });
      });
      return sections;
    });

    eleventyConfig.addFilter("searchableTags", function (str) {
      let tags;
      let match = str && str.match(tagRegex);
      if (match) {
        tags = match
          .map((m) => {
            return `"${m.split("#")[1]}"`;
          })
          .join(", ");
      }
      if (tags) {
        return `${tags},`;
      } else {
        return "";
      }
    });

    eleventyConfig.addFilter("validJson", function (variable) {
      if (Array.isArray(variable)) {
        return variable.map((x) => x.replaceAll("\\", "\\\\")).join(",");
      } else if (typeof variable === "string") {
        return variable.replaceAll("\\", "\\\\");
      }
      return variable;
    });

    // The search index needs collections.note, which slot templates don't
    // get — register it as a virtual template so it joins the data cascade.
    const indexTemplate = fs.readFileSync(
      path.join(context.pluginDir, "templates", "search-index.njk"),
      "utf8"
    );
    eleventyConfig.addTemplate("dg-search-index.njk", indexTemplate, {
      permalink: "/searchIndex.json",
      eleventyExcludeFromCollections: true,
    });
  },
};
