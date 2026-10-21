const fs = require("fs");
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

const ROOT_FOLDER = "Дедлайны";

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
    if (parts.length < 3) continue;
    if (parts[0] !== ROOT_FOLDER) continue;

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

  for (const item of notes) {
    const parts = notePathParts(item);
    if (parts.length < 3 || parts[0] !== ROOT_FOLDER) continue;
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
    const orderList = order[`/${ROOT_FOLDER}/${typeName}`] || [];
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
  const stem = (data && data.page && data.page.filePathStem) || "";
  const parts = String(stem).split("/").filter(Boolean);
  const rootAt = parts.indexOf(ROOT_FOLDER);
  if (rootAt < 0 || parts.length < rootAt + 3) return null;
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
    if (parts.length < 3 || parts[0] !== ROOT_FOLDER) continue;
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

module.exports = {
  ROOT_FOLDER,
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
