const fs = require("fs");
const { headerToId } = require("./utils");
const {
  moscowToday,
  parseDateHeading,
  resolveUpcomingDate,
  daysUntil,
  relativeSuffix,
  relativePhrase,
  nearestAdjective,
  academicWeekNumber,
  isPastControlDate,
  markPastControlSections,
  pickControlDeadlines,
  buildDeadlineTable,
} = require("./deadlinesCore");

const ROOT_FOLDER = "Формы контроля";

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
 * Every dated heading under "Формы контроля", without a "today".
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
 * Build upcoming-deadline lines from notes under "Формы контроля".
 * Returns [] when that folder is absent.
 */
function getControlDeadlines(data, today = moscowToday()) {
  return pickControlDeadlines(getControlDeadlineCandidates(data), today);
}

module.exports = {
  ROOT_FOLDER,
  moscowToday,
  parseDateHeading,
  resolveUpcomingDate,
  daysUntil,
  relativeSuffix,
  relativePhrase,
  nearestAdjective,
  academicWeekNumber,
  isPastControlDate,
  markPastControlSections,
  buildDeadlineTable,
  extractHeadings,
  pickControlDeadlines,
  getControlDeadlineCandidates,
  getControlDeadlines,
};
