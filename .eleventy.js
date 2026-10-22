const markdownIt = require("markdown-it");
const fs = require("fs");
const matter = require("gray-matter");
// See src/helpers/matterOptions.js for why frontmatter needs a custom YAML engine.
const matterOptions = require("./src/helpers/matterOptions");
const faviconsPlugin = require("eleventy-plugin-gen-favicons");
const { convertMdHrefs } = require("./src/helpers/linkUtils");
const nodePath = require("path");

const FAVICON_SOURCE = "./src/site/favicon.png";
const tocPlugin = require("eleventy-plugin-nesting-toc");
const { tocMarkup } = require("./src/helpers/tocMarkup");
const { parse } = require("node-html-parser");
const htmlMinifier = require("html-minifier-terser");

// Minifying inline JS/CSS is the single most expensive part of the build, and
// nearly every page carries the same inline scripts and styles from the
// layouts. These cached wrappers mirror html-minifier-terser's built-in
// terser/clean-css invocations (same options, same error fallbacks) but only
// pay for each distinct input once per process. Resolve the exact terser and
// clean-css instances html-minifier-terser itself uses.
const htmlMinifierRequire = require("module").createRequire(
  require.resolve("html-minifier-terser")
);
const terser = htmlMinifierRequire("terser");
const CleanCSS = htmlMinifierRequire("clean-css");

const MINIFY_CACHE_MAX = 2000;
const minifyJsCache = new Map();
const minifyCssCache = new Map();

function cachePut(cache, key, value) {
  if (cache.size >= MINIFY_CACHE_MAX) {
    cache.clear();
  }
  cache.set(key, value);
}

async function cachedMinifyJS(text, inline) {
  const key = `${inline ? 1 : 0}:${text}`;
  if (minifyJsCache.has(key)) {
    return minifyJsCache.get(key);
  }
  let result;
  try {
    const start = text.match(/^\s*<!--.*/);
    const code = start
      ? text.slice(start[0].length).replace(/\n\s*-->\s*$/, "")
      : text;
    const minified = await terser.minify(code, {
      parse: { bare_returns: inline },
    });
    result = minified.code.replace(/;$/, "");
  } catch {
    result = text;
  }
  cachePut(minifyJsCache, key, result);
  return result;
}

function wrapCSS(text, type) {
  switch (type) {
    case "inline":
      return `*{${text}}`;
    case "media":
      return `@media ${text}{a{top:0}}`;
    default:
      return text;
  }
}

function unwrapCSS(text, type) {
  let matches;
  switch (type) {
    case "inline":
      matches = text.match(/^\*\{([\s\S]*)\}$/);
      break;
    case "media":
      matches = text.match(/^@media ([\s\S]*?)\s*{[\s\S]*}$/);
      break;
  }
  return matches ? matches[1] : text;
}

function cachedMinifyCSS(text, type) {
  const key = `${type || ""}:${text}`;
  if (minifyCssCache.has(key)) {
    return minifyCssCache.get(key);
  }
  let result;
  const output = new CleanCSS({}).minify(wrapCSS(text, type));
  if (output.errors.length > 0) {
    result = text;
  } else {
    result = unwrapCSS(output.styles, type);
  }
  cachePut(minifyCssCache, key, result);
  return result;
}

const {
  headerToId,
  namedHeadingsFilter,
  cachedSlugify: slugify,
} = require("./src/helpers/utils");
const {
  userMarkdownSetup,
  userEleventySetup,
} = require("./src/helpers/userSetup");
const pluginLoader = require("./src/helpers/pluginLoader");
const { copyLectureMarkdown } = require("./src/helpers/filetreeUtils");

function getAnchorLink(filePath, linkTitle) {
  const { attributes, innerHTML } = getAnchorAttributes(filePath, linkTitle);
  return `<a ${Object.keys(attributes).map(key => `${key}="${attributes[key]}"`).join(" ")}>${innerHTML}</a>`;
}

// Resolving a wikilink target reads and YAML-parses the target note's
// frontmatter from disk. The same targets are linked from many notes, so
// cache per (target, title). Cleared in eleventy.before so watch-mode
// rebuilds see frontmatter edits.
const anchorAttributesCache = new Map();

function getAnchorAttributes(filePath, linkTitle) {
  const cacheKey = `${filePath}\x00${linkTitle || ""}`;
  let cached = anchorAttributesCache.get(cacheKey);
  if (!cached) {
    cached = computeAnchorAttributes(filePath, linkTitle);
    anchorAttributesCache.set(cacheKey, cached);
  }
  return cached;
}

function computeAnchorAttributes(filePath, linkTitle) {
  let fileName = filePath.replaceAll("&amp;", "&");
  let header = "";
  let headerLinkPath = "";
  if (fileName.includes("#")) {
    [fileName, header] = fileName.split("#");
    headerLinkPath = `#${headerToId(header)}`;
  }

  let noteIcon = process.env.NOTE_ICON_DEFAULT;
  const title = linkTitle ? linkTitle : fileName;
  let permalink = `/notes/${slugify(fileName)}`;
  let deadLink = false;
  try {
    const startPath = "./src/site/notes/";
    let fullPath;
    if (fileName.endsWith(".md")) {
      fullPath = `${startPath}${fileName}`;
    } else {
      fullPath = `${startPath}${fileName}.md`;
    }
    const file = fs.readFileSync(fullPath, "utf8");
    const frontMatter = matter(file, matterOptions);
    if (frontMatter.data.permalink) {
      permalink = frontMatter.data.permalink;
    }
    if (
      frontMatter.data.tags &&
      frontMatter.data.tags.indexOf("gardenEntry") != -1
    ) {
      permalink = "/";
    }
    if (frontMatter.data.noteIcon) {
      noteIcon = frontMatter.data.noteIcon;
    }
  } catch {
    deadLink = true;
  }

  if (deadLink) {
    return {
      attributes: {
        "class": "internal-link is-unresolved",
        "href": "/404",
        "target": "",
      },
      innerHTML: title,
    }
  }
  return {
    attributes: {
      "class": "internal-link",
      "target": "",
      "data-note-icon": noteIcon,
      "href": `${permalink}${headerLinkPath}`,
    },
    innerHTML: title,
  }
}

const tagRegex = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?><]+)(?!([^<]*>))/g;

const markdownFileTypeRegex = /\.(md|markdown)$/i;
const isMarkdownPage = (inputPath) => inputPath && inputPath.match(markdownFileTypeRegex);

module.exports = function(eleventyConfig) {
  eleventyConfig.setLiquidOptions({
    dynamicPartials: true,
  });

  eleventyConfig.setFrontMatterParsingOptions(matterOptions);
  let markdownLib = markdownIt({
    breaks: true,
    html: true,
    linkify: true,
  })
    .use(require("markdown-it-anchor"), {
      slugify: headerToId,
    })
    .use(function(md) {
      md.renderer.rules.hashtag_open = function(tokens, idx) {
        return '<a class="tag">';
      };
    })
    .use(require("markdown-it-attrs"))
    .use(require("markdown-it-task-checkbox"), {
      disabled: true,
      divWrap: false,
      divClass: "checkbox",
      idPrefix: "cbx_",
      ulClass: "task-list",
      liClass: "task-list-item",
    })
    .use(namedHeadingsFilter)
    .use(function(md) {
      const defaultImageRule =
        md.renderer.rules.image ||
        function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const imageName = tokens[idx].content;
        //"image.png|metadata?|width"
        const [fileName, ...widthAndMetaData] = imageName.split("|");
        const lastValue = widthAndMetaData[widthAndMetaData.length - 1];
        const lastValueIsNumber = !isNaN(lastValue);
        const width = lastValueIsNumber ? lastValue : null;

        let metaData = "";
        if (widthAndMetaData.length > 1) {
          metaData = widthAndMetaData.slice(0, widthAndMetaData.length - 1).join(" ");
        }

        if (!lastValueIsNumber) {
          metaData += ` ${lastValue}`;
        }

        if (width) {
          const widthIndex = tokens[idx].attrIndex("width");
          const widthAttr = `${width}px`;
          if (widthIndex < 0) {
            tokens[idx].attrPush(["width", widthAttr]);
          } else {
            tokens[idx].attrs[widthIndex][1] = widthAttr;
          }
        }

        return defaultImageRule(tokens, idx, options, env, self);
      };

      const defaultLinkRule =
        md.renderer.rules.link_open ||
        function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      function isExternalHref(href) {
        if (!href) return false;
        const trimmed = href.trim();
        if (
          trimmed.startsWith("/") ||
          trimmed.startsWith("#") ||
          trimmed.startsWith("?") ||
          trimmed.startsWith("./") ||
          trimmed.startsWith("../")
        ) {
          return false;
        }
        // Any explicit scheme (http, https, mailto, etc) is treated as external.
        return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
      }

      md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
        const hrefIndex = tokens[idx].attrIndex("href");
        const href =
          hrefIndex >= 0 && tokens[idx].attrs && tokens[idx].attrs[hrefIndex]
            ? tokens[idx].attrs[hrefIndex][1]
            : "";
        const isExternal = isExternalHref(href);

        if (isExternal) {
          const aIndex = tokens[idx].attrIndex("target");
          const classIndex = tokens[idx].attrIndex("class");

          if (aIndex < 0) {
            tokens[idx].attrPush(["target", "_blank"]);
          } else {
            tokens[idx].attrs[aIndex][1] = "_blank";
          }

          if (classIndex < 0) {
            tokens[idx].attrPush(["class", "external-link"]);
          } else if (
            !tokens[idx].attrs[classIndex][1].includes("external-link")
          ) {
            tokens[idx].attrs[classIndex][1] += " external-link";
          }
        } else {
          const classIndex = tokens[idx].attrIndex("class");
          if (classIndex < 0) {
            tokens[idx].attrPush(["class", "internal-link"]);
          } else if (
            !tokens[idx].attrs[classIndex][1].includes("internal-link")
          ) {
            tokens[idx].attrs[classIndex][1] += " internal-link";
          }
        }

        return defaultLinkRule(tokens, idx, options, env, self);
      };
    })
    .use((md) => pluginLoader.applyMarkdownHooks(md))
    .use(userMarkdownSetup);

  eleventyConfig.setLibrary("md", markdownLib);

  eleventyConfig.addFilter("isoDate", function(date) {
    return date && date.toISOString();
  });

  eleventyConfig.addFilter("link", function(str) {
    return (
      str &&
      str.replace(/\[\[(.*?\|.*?)\]\]/g, function(match, p1) {
        // MathJax can emit sequences that look like wikilinks.
        if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
          return match;
        }
        const [fileLink, linkTitle] = p1.split("|");

        return getAnchorLink(fileLink, linkTitle);
      })
    );
  });

  // Resolve markdown-style relative links to .md files (e.g. [X](../a/b.md))
  // to their real permalinks. Obsidian resolves these in-app, but they reach
  // the rendered HTML untouched, where trailing-slash page URLs make the
  // browser resolve them one directory too deep.
  // pageInputPath overrides this.page for contexts like the feed, where the
  // rendered content belongs to a looped-over note rather than the current page.
  eleventyConfig.addFilter("resolveMdLinks", function(str, pageInputPath) {
    const inputPath = pageInputPath || (this.page && this.page.inputPath);
    if (!str || !inputPath) {
      return str;
    }
    const notesRoot = "src/site/notes/";
    const normalizedInput = inputPath.replace(/^\.\//, "");
    const rootIndex = normalizedInput.indexOf(notesRoot);
    if (rootIndex === -1) {
      return str;
    }
    const vaultFilePath = normalizedInput.slice(rootIndex + notesRoot.length);
    const sourceDir = nodePath.posix.dirname(vaultFilePath);
    return convertMdHrefs(str, sourceDir === "." ? "" : sourceDir, (candidates) => {
      let firstAttempt = null;
      for (const vaultPath of candidates) {
        const { attributes } = getAnchorAttributes(vaultPath);
        if (!attributes.class.includes("is-unresolved")) {
          return attributes;
        }
        firstAttempt = firstAttempt || attributes;
      }
      // Unresolved targets keep getAnchorAttributes' /404 behavior, matching
      // how dead wikilinks are handled.
      return firstAttempt;
    });
  });

  eleventyConfig.addFilter("taggify", function(str) {
    return (
      str &&
      str.replace(tagRegex, function(match, precede, tag) {
        return `${precede}<a class="tag" data-content="${tag}">${tag}</a>`;
      })
    );
  });

  eleventyConfig.addFilter("hideDataview", function(str) {
    return (
      str &&
      str.replace(/\(\S+\:\:(.*)\)/g, function(_, value) {
        return value.trim();
      })
    );
  });

  // Callouts and table wrappers share one HTML parse per page.
  function transformDataviewJsLinks(parsed) {
    for (const dataViewJsLink of parsed.querySelectorAll("a[data-href].internal-link")) {
      const notePath = dataViewJsLink.getAttribute("data-href");
      const title = dataViewJsLink.innerHTML;
      const { attributes, innerHTML } = getAnchorAttributes(notePath, title);
      for (const key in attributes) {
        dataViewJsLink.setAttribute(key, attributes[key]);
      }
      dataViewJsLink.innerHTML = innerHTML;
    }
  }

  // Shared helper to transform callout blockquotes - used by both callout-block transform and canvas-markdown
  const calloutMeta = /\[!([\w-]*)\|?(\s?.*)\](\+|\-){0,1}(\s?.*)/;
  function transformCalloutBlockquotes(blockquotes) {
    for (const blockquote of blockquotes) {
      // Process nested blockquotes first
      transformCalloutBlockquotes(blockquote.querySelectorAll("blockquote"));

      let content = blockquote.innerHTML;

      let titleDiv = "";
      let calloutType = "";
      let calloutMetaData = "";
      let isCollapsable;
      let isCollapsed;
      if (!content.match(calloutMeta)) {
        continue;
      }

      content = content.replace(
        calloutMeta,
        function(metaInfoMatch, callout, metaData, collapse, title) {
          isCollapsable = Boolean(collapse);
          isCollapsed = collapse === "-";
          const titleText = title.replace(/(<\/{0,1}\w+>)/, "")
            ? title
            : `${callout.charAt(0).toUpperCase()}${callout
              .substring(1)
              .toLowerCase()}`;
          const fold = isCollapsable
            ? `<div class="callout-fold"><i icon-name="chevron-down"></i></div>`
            : ``;

          calloutType = callout;
          calloutMetaData = metaData;
          titleDiv = `<div class="callout-title"><div class="callout-title-inner">${titleText}</div>${fold}</div>`;
          return "";
        }
      );

      /* Hacky fix for callouts with only a title */
      if (content === "\n<p>\n") {
        content = "";
      }
      let contentDiv = content ? `\n<div class="callout-content">${content}</div>` : "";

      blockquote.tagName = "div";
      blockquote.classList.add("callout");
      blockquote.classList.add(isCollapsable ? "is-collapsible" : "");
      blockquote.classList.add(isCollapsed ? "is-collapsed" : "");
      blockquote.setAttribute("data-callout", calloutType.toLowerCase());
      calloutMetaData && blockquote.setAttribute("data-callout-metadata", calloutMetaData);
      blockquote.innerHTML = `${titleDiv}${contentDiv}`;
    }
  }


  function transformTables(parsed) {
    for (const t of parsed.querySelectorAll(".cm-s-obsidian > table")) {
      let inner = t.innerHTML;
      t.tagName = "div";
      t.classList.add("table-wrapper");
      t.innerHTML = `<table>${inner}</table>`;
    }
  }

  eleventyConfig.addTransform("obsidian-html", function(str) {
    if (!str || !isMarkdownPage(this.page.inputPath)) {
      return str;
    }
    const parsed = parse(str);
    transformDataviewJsLinks(parsed);
    transformCalloutBlockquotes(parsed.querySelectorAll("blockquote"));
    transformTables(parsed);
    return parsed.innerHTML;
  });

  eleventyConfig.addTransform("htmlMinifier", async function(content) {
    if (
      (process.env.NODE_ENV === "production" || process.env.ELEVENTY_ENV === "prod") &&
      (this.page.outputPath || "").endsWith(".html")
    ) {
      try {
        // preserveLineBreaks is intentionally off: its trailing-whitespace
        // regex is quadratic on large text chunks and was one of the biggest
        // single costs of the whole build. conservativeCollapse still keeps a
        // whitespace character wherever there was one (a newline renders the
        // same as a space), so output is visually identical.
        return await htmlMinifier.minify(content, {
          useShortDoctype: true,
          removeComments: true,
          collapseWhitespace: true,
          conservativeCollapse: true,
          minifyCSS: cachedMinifyCSS,
          minifyJS: cachedMinifyJS,
          keepClosingSlash: true,
        });
      } catch {
        // If the html minifying fails for some reason due to some malformed text, just return the content as is.
        return content;
      }
    }
    return content;
  });

  eleventyConfig.addTransform("jsonMinifier", async (content, outputPath) => {
    if (
      (process.env.NODE_ENV === "production" || process.env.ELEVENTY_ENV === "prod") &&
      outputPath &&
      outputPath.endsWith(".json")
    ) {
      try {
        return JSON.stringify(JSON.parse(content));
      } catch {
        // If the JSON minifying fails for some reason due to malformed JSON, just return the content as is.
        return content;
      }
    }
    return content;
  });

  eleventyConfig.on("eleventy.after", () => {
    copyLectureMarkdown("dist");
  });

  eleventyConfig.addPassthroughCopy("src/site/img");
  eleventyConfig.addPassthroughCopy("src/site/scripts");
  eleventyConfig.addPassthroughCopy("src/site/styles/_theme.*.css");
  eleventyConfig.addPassthroughCopy({ "src/site/logo.*": "/" });
  eleventyConfig.on("eleventy.before", () => {
    anchorAttributesCache.clear();
  });
  eleventyConfig.addWatchTarget(FAVICON_SOURCE);
  eleventyConfig.addPlugin(faviconsPlugin, { outputDir: "dist" });
  eleventyConfig.addPlugin(tocPlugin, {
    ul: true,
    tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
  });
  // Outline entries keep MathJax markup from the headings. The nesting-toc
  // filter above stays for anything that still wants a plain-text outline.
  eleventyConfig.addFilter("tocMarkup", (content) =>
    tocMarkup(content, { tags: ["h1", "h2", "h3", "h4", "h5", "h6"] })
  );

  eleventyConfig.addFilter("jsonify", function(variable) {
    return JSON.stringify(variable) || '""';
  });

  eleventyConfig.addFilter("notHidden", function (arr) {
    return (arr || []).filter((item) => !item.data.hide);
  });

  pluginLoader.applyEleventyHooks(eleventyConfig);

  userEleventySetup(eleventyConfig);

  return {
    dir: {
      input: "src/site",
      output: "dist",
      data: `_data`,
    },
    templateFormats: ["njk", "md", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
    passthroughFileCopy: true,
  };
};
