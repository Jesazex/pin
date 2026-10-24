const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const matterOptions = require("./matterOptions");
const { frontmatterIsHomePage } = require("./homePage");
const { headerToId } = require("./utils");
const {
  moscowToday,
  parseDateHeading,
  resolveUpcomingDate,
  daysUntil,
  relativeSuffix,
  relativePhrase,
  relativeParen,
  controlDateLabel,
  applyControlHeadings,
  nearestAdjective,
  academicWeekNumber,
  isPastControlDate,
  markPastControlSections,
  pickControlDeadlines,
  buildDeadlineTable,
  dayPageKey,
  taskStorageKey,
  normalizeTaskLabel,
} = require("./deadlinesCore");

function noteData(item) {
  return (item && item.data) || {};
}

function isHomeNote(item) {
  const data = noteData(item);
  if (frontmatterIsHomePage(data)) return true;
  const flag = data["dg-home"];
  return flag === true || flag === "true";
}

function deadlinesFolderName(data) {
  const notes = (data && data.collections && data.collections.note) || [];
  for (const item of notes) {
    if (!isHomeNote(item)) continue;
    const raw = noteData(item).Deadlines;
    const fallback = noteData(item).deadlines;
    const name = typeof raw === "string" ? raw : fallback;
    return typeof name === "string" ? name.trim() : "";
  }
  return "";
}

function folderQualifies(data, folderName) {
  if (!folderName) return false;
  const notes = (data && data.collections && data.collections.note) || [];
  let nested = false;
  let dated = false;
  for (const item of notes) {
    const parts = notePathParts(item);
    if (parts[0] !== folderName || parts.length < 3) continue;
    nested = true;
    if (dated) continue;
    const headings = extractHeadings(readNoteBody(item));
    if (headings.some((heading) => parseDateHeading(heading))) dated = true;
  }
  return nested && dated;
}

function activeDeadlinesFolder(data) {
  const name = deadlinesFolderName(data);
  if (!name || !folderQualifies(data, name)) return "";
  return name;
}

let publishedDeadlinesCache = null;

function clearPublishedDeadlinesCache() {
  publishedDeadlinesCache = null;
}

function walkMarkdown(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (/\.(md|markdown)$/i.test(entry.name)) out.push(full);
  }
}

function markdownHasDateHeading(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  return extractHeadings(stripFrontMatter(raw)).some((heading) => parseDateHeading(heading));
}

// The wikilink filter runs outside the page data cascade, so it reads the
// home note from disk. Cleared on eleventy.before.
function readPublishedDeadlines(notesDir) {
  if (publishedDeadlinesCache) return publishedDeadlinesCache;
  const root = notesDir || path.join("src", "site", "notes");
  const files = [];
  walkMarkdown(root, files);
  let name = "";
  for (const file of files) {
    let data;
    try {
      data = matter(fs.readFileSync(file, "utf8"), matterOptions).data;
    } catch {
      continue;
    }
    const flag = data && data["dg-home"];
    const home = frontmatterIsHomePage(data) || flag === true || flag === "true";
    if (!home) continue;
    const raw = data.Deadlines != null ? data.Deadlines : data.deadlines;
    name = typeof raw === "string" ? raw.trim() : "";
    break;
  }
  let qualified = false;
  if (name) {
    const folder = path.join(root, name);
    let subs = [];
    try {
      subs = fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      subs = [];
    }
    qualified = subs.some((sub) => {
      const nested = [];
      walkMarkdown(path.join(folder, sub.name), nested);
      return nested.some((file) => markdownHasDateHeading(file));
    });
  }
  publishedDeadlinesCache = { name, qualified };
  return publishedDeadlinesCache;
}

function extractHeadings(markdown) {
  if (!markdown) return [];
  const headings = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    headings.push(m[2].trim());
  }
  return headings;
}

function stripFrontMatter(raw) {
  if (!raw) return "";
  return String(raw).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function readNoteBody(item) {
  if (item.inputPath && fs.existsSync(item.inputPath)) {
    try {
      return stripFrontMatter(fs.readFileSync(item.inputPath, "utf8"));
    } catch {
      // fall through
    }
  }
  if (item.template && typeof item.template.inputContent === "string") {
    return stripFrontMatter(item.template.inputContent);
  }
  return "";
}

function notePathParts(item) {
  const stem = (item.filePathStem || "").replace(/^\/?notes\//, "");
  return stem.split("/").filter(Boolean);
}

/**
 * Every dated heading under "Дедлайны", without a "today".
 * The page recomputes the nearest line from this list on each visit.
 */
function getControlDeadlineCandidates(data) {
  const notes = (data.collections && data.collections.note) || [];
  const candidates = [];

  for (const item of notes) {
    const parts = notePathParts(item);
    const folder = activeDeadlinesFolder(data);
    if (!folder || parts.length < 3 || parts[0] !== folder) continue;

    const typeName = parts[1];
    const subjectName = parts[parts.length - 1];
    const permalink = item.url || "/";
    const headings = extractHeadings(readNoteBody(item));

    for (const heading of headings) {
      const parsed = parseDateHeading(heading);
      if (!parsed) continue;
      candidates.push({
        typeName,
        subjectName,
        day: parsed.day,
        month: parsed.month,
        displayDate: parsed.displayDate,
        href: `${permalink}#${headerToId(parsed.heading)}`,
      });
    }
  }

  return candidates;
}

/**
 * Build upcoming-deadline lines from notes under "Дедлайны".
 * Returns [] when that folder is absent.
 */
function getControlDeadlines(data, today = moscowToday()) {
  return pickControlDeadlines(getControlDeadlineCandidates(data), today);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Visible checkbox text. Markdown links keep their label, matching the rendered note. */
function visibleTaskLabel(markdown) {
  return normalizeTaskLabel(
    String(markdown || "").replace(/\[([^\[\]]+)\]\([^)]*\)/g, "$1")
  );
}

function renderInlineMarkdown(text) {
  const source = String(text || "");
  const re = /\[([^\[\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let last = 0;
  let match;
  while ((match = re.exec(source))) {
    html += escapeHtml(source.slice(last, match.index));
    const label = match[1];
    const url = match[2];
    if (/^(https?:|mailto:)/i.test(url)) {
      html += `<a href="${escapeHtml(url)}" class="external-link" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    } else {
      html += escapeHtml(label);
    }
    last = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  return html;
}

/**
 * Date sections of one control note. Checkbox indexes keep counting for the
 * same day so they match the browser binder.
 */
function parseControlSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  const counts = {};
  let current = null;
  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      const parsed = parseDateHeading(headingMatch[2].trim());
      if (!parsed) {
        current = null;
        continue;
      }
      current = {
        day: parsed.day,
        month: parsed.month,
        displayDate: parsed.displayDate,
        heading: parsed.heading,
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const taskMatch = /^\s*[-*+]\s+\[[ xX]\]\s+(.*?)\s*$/.exec(line);
    if (taskMatch) {
      const raw = taskMatch[1];
      const label = visibleTaskLabel(raw);
      const countKey = current.month + ":" + current.day;
      const index = counts[countKey] || 0;
      counts[countKey] = index + 1;
      current.blocks.push({
        kind: "task",
        label,
        html: renderInlineMarkdown(raw.trim()),
        index,
      });
      continue;
    }
    const noteMatch = /^\s*[-*+]\s+(.*?)\s*$/.exec(line);
    if (noteMatch && noteMatch[1]) {
      current.blocks.push({
        kind: "note",
        html: renderInlineMarkdown(noteMatch[1].trim()),
      });
    }
  }
  return sections;
}

/**
 * Every subject file under a deadline type (ДЗ, ЛР, …), in sidebar order.
 * The table header menu uses this list, including files with no upcoming date.
 */
function getControlSubjects(data) {
  const notes = (data.collections && data.collections.note) || [];
  const order = (data && data.navigationOrder) || {};
  const byType = new Map();
  const folder = activeDeadlinesFolder(data);

  for (const item of notes) {
    const parts = notePathParts(item);
    if (!folder || parts.length < 3 || parts[0] !== folder) continue;
    const typeName = parts[1];
    const subjectName = parts[parts.length - 1];
    if (!byType.has(typeName)) byType.set(typeName, []);
    byType.get(typeName).push({
      subjectName,
      href: item.url || "/",
    });
  }

  const catalog = {};
  byType.forEach((subjects, typeName) => {
    const orderList = order[`/${folder}/${typeName}`] || [];
    subjects.sort((a, b) => {
      const ia = orderList.indexOf(a.subjectName);
      const ib = orderList.indexOf(b.subjectName);
      const ar = ia === -1 ? orderList.length : ia;
      const br = ib === -1 ? orderList.length : ib;
      if (ar !== br) return ar - br;
      return String(a.subjectName).localeCompare(String(b.subjectName), "ru");
    });
    catalog[typeName] = subjects;
  });
  return catalog;
}

function controlNoteIdentity(data) {
  const folder = activeDeadlinesFolder(data);
  const stem = (data && data.page && data.page.filePathStem) || "";
  const parts = String(stem).split("/").filter(Boolean);
  const rootAt = folder ? parts.indexOf(folder) : -1;
  if (!folder || rootAt < 0 || parts.length < rootAt + 3) return null;
  return {
    typeName: parts[rootAt + 1],
    subjectName: parts[parts.length - 1],
  };
}

/**
 * Tasks for every «На <дата>» heading, keyed by `day-month` (`17-9`).
 * Checkbox ids are the same ones the note page writes into local storage.
 */
function getControlTaskCatalog(data) {
  const notes = (data.collections && data.collections.note) || [];
  const byDay = new Map();

  for (const item of notes) {
    const parts = notePathParts(item);
    const folder = activeDeadlinesFolder(data);
    if (!folder || parts.length < 3 || parts[0] !== folder) continue;
    const typeName = parts[1];
    const subjectName = parts[parts.length - 1];
    const sections = parseControlSections(readNoteBody(item));
    for (const section of sections) {
      const key = dayPageKey(section.day, section.month);
      if (!byDay.has(key)) byDay.set(key, []);
      const blocks = section.blocks.map((block) => {
        if (block.kind !== "task") return { kind: "note", html: block.html };
        return {
          kind: "task",
          id: taskStorageKey(
            typeName,
            subjectName,
            section.month,
            section.day,
            block.index,
            block.label
          ),
          html: block.html,
        };
      });
      byDay.get(key).push({
        title: `${subjectName} (${typeName})`,
        subjectName,
        typeName,
        blocks,
      });
    }
  }

  const catalog = {};
  for (const [key, groups] of byDay) {
    groups.sort(
      (a, b) =>
        a.subjectName.localeCompare(b.subjectName, "ru") ||
        a.typeName.localeCompare(b.typeName, "ru")
    );
    catalog[key] = {
      groups: groups.map((group) => ({ title: group.title, blocks: group.blocks })),
    };
  }
  return catalog;
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function deadlineTableAnchor(label) {
  return `<a href="#дедлайны" class="internal-link" data-open-deadline-table>${escapeHtmlText(label)}</a>`;
}

// [[/Folder|label]] and [[/Folder]] open the table when that root folder
// qualifies. Obsidian writes the pipe as \|. Any other wikilink is left as is.
function rewriteDeadlineWikilinks(str, published) {
  if (!str || !published || !published.qualified || !published.name) return str;
  const escaped = published.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const piped = new RegExp(`\\[\\[\\s*/${escaped}\\s*\\\\?\\|([^\\]]*)\\]\\]`, "g");
  const unpiped = new RegExp(`\\[\\[\\s*/${escaped}\\s*\\]\\]`, "g");
  return String(str)
    .replace(piped, (_, label) => {
      const text = String(label).trim() || published.name;
      return deadlineTableAnchor(text);
    })
    .replace(unpiped, () => deadlineTableAnchor(published.name));
}

module.exports = {
  deadlinesFolderName,
  folderQualifies,
  activeDeadlinesFolder,
  readPublishedDeadlines,
  clearPublishedDeadlinesCache,
  rewriteDeadlineWikilinks,
  moscowToday,
  parseDateHeading,
  resolveUpcomingDate,
  daysUntil,
  relativeSuffix,
  relativePhrase,
  relativeParen,
  controlDateLabel,
  applyControlHeadings,
  nearestAdjective,
  academicWeekNumber,
  isPastControlDate,
  markPastControlSections,
  buildDeadlineTable,
  extractHeadings,
  pickControlDeadlines,
  getControlDeadlineCandidates,
  getControlDeadlines,
  visibleTaskLabel,
  renderInlineMarkdown,
  parseControlSections,
  controlNoteIdentity,
  getControlTaskCatalog,
  getControlSubjects,
};
