import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseDateHeading,
  resolveUpcomingDate,
  daysUntil,
  relativeSuffix,
  relativePhrase,
  relativeParen,
  controlDateLabel,
  nearestAdjective,
  academicWeekNumber,
  isPastControlDate,
  markPastControlSections,
  buildDeadlineTable,
  moscowToday,
  extractHeadings,
  getControlDeadlines,
  getControlDeadlineCandidates,
  pickControlDeadlines,
  getControlTaskCatalog,
  controlNoteIdentity,
  visibleTaskLabel,
  parseControlSections,
  getControlSubjects,
  activeDeadlinesFolder,
  deadlinesFolderName,
  folderQualifies,
  readPublishedDeadlines,
  clearPublishedDeadlinesCache,
} from "./deadlinesUtils.js";

function deadlineHomeNote(name = "Дедлайны") {
  return {
    filePathStem: "/notes/Добро пожаловать!",
    url: "/",
    data: { tags: ["gardenEntry"], Deadlines: name },
  };
}

function withDeadlineHome(data, name) {
  const collections = (data && data.collections) || {};
  return {
    ...data,
    collections: {
      ...collections,
      note: [deadlineHomeNote(name), ...(collections.note || [])],
    },
  };
}
import {
  taskStorageKey,
  dayPageHref,
  bindControlTaskChecks,
  renderDayPage,
  readTaskChecks,
  emptyDayText,
} from "./deadlinesCore.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("deadlinesUtils", () => {
  it("parses На <day> <month> headings", () => {
    expect(parseDateHeading("На 15 сентября")).toEqual({
      day: 15,
      month: 8,
      displayDate: "15 сентября",
      heading: "На 15 сентября",
    });
    expect(parseDateHeading("На 20 октября, Пт (Вчера)")).toEqual({
      day: 20,
      month: 9,
      displayDate: "20 октября",
      heading: "На 20 октября, Пт (Вчера)",
    });
    expect(parseDateHeading("Тема без даты")).toBeNull();
  });

  it("rolls a past date into next year only within half a year", () => {
    const today = new Date(2026, 8, 27); // 27 Sep 2026
    const september = resolveUpcomingDate(15, 8, today); // 15 Sep, next year is too far
    expect(september.getFullYear()).toBe(2026);
    expect(september.getMonth()).toBe(8);
    expect(daysUntil(september, today)).toBeLessThan(0);
    const march = resolveUpcomingDate(15, 2, today); // 15 Mar 2027, inside the horizon
    expect(march.getFullYear()).toBe(2027);
    expect(march.getMonth()).toBe(2);
    const future = resolveUpcomingDate(28, 8, today);
    expect(future.getFullYear()).toBe(2026);
    expect(daysUntil(future, today)).toBe(1);
    expect(daysUntil(resolveUpcomingDate(27, 8, today), today)).toBe(0);
  });

  it("formats Russian relative day suffixes", () => {
    expect(relativeSuffix(0)).toBe("Сегодня");
    expect(relativeSuffix(1)).toBe("1 день");
    expect(relativeSuffix(3)).toBe("3 дня");
    expect(relativeSuffix(5)).toBe("5 дней");
    expect(relativeSuffix(21)).toBe("21 день");
    expect(relativeSuffix(22)).toBe("22 дня");
    expect(relativeSuffix(25)).toBe("25 дней");
  });

  it("says tomorrow instead of one day from now", () => {
    expect(relativePhrase(0)).toBe("Сегодня");
    expect(relativePhrase(1)).toBe("Завтра");
    expect(relativePhrase(2)).toBe("через 2 дня");
  });

  it("labels a date relative to today for the table and headings", () => {
    expect(relativeParen(0)).toBe("Сегодня");
    expect(relativeParen(1)).toBe("Завтра");
    expect(relativeParen(2)).toBe("Через 2 дня");
    expect(relativeParen(5)).toBe("Через 5 дней");
    expect(relativeParen(21)).toBe("Через 21 день");
    expect(relativeParen(-1)).toBe("Вчера");
    expect(relativeParen(-2)).toBe("2 дня назад");
    expect(relativeParen(-5)).toBe("5 дней назад");
    expect(relativeParen(-21)).toBe("21 день назад");
    const today = new Date(2026, 9, 21);
    expect(controlDateLabel(20, 9, today)).toMatchObject({
      base: "На 20 октября, Вт",
      full: "На 20 октября, Вт (Вчера)",
      whenText: "Вчера",
      past: true,
      href: "/den/?d=20-10",
    });
    expect(controlDateLabel(23, 11, today).full).toBe("На 23 декабря, Ср (Через 63 дня)");
  });

  it("picks gender for nearest adjective", () => {
    expect(nearestAdjective("ДЗ")).toBe("Ближайшее");
    expect(nearestAdjective("БДЗ")).toBe("Ближайшее");
    expect(nearestAdjective("КР")).toBe("Ближайшая");
    expect(nearestAdjective("ЛР")).toBe("Ближайшая");
    expect(nearestAdjective("Экзамен")).toBe("Ближайшее");
    expect(nearestAdjective("Контрольная")).toBe("Ближайшая");
    expect(nearestAdjective("ДЗ", 2)).toBe("Ближайшие");
    expect(nearestAdjective("КР", 3)).toBe("Ближайшие");
    expect(nearestAdjective("ЛР", 1)).toBe("Ближайшая");
  });

  it("treats a control date as past before Moscow today or beyond half a year", () => {
    const today = new Date(2026, 8, 30);
    expect(isPastControlDate("На 25 Сентября", today)).toBe(true);
    expect(isPastControlDate("На 30 Сентября", today)).toBe(false);
    expect(isPastControlDate("На 1 Октября", today)).toBe(false);
    expect(isPastControlDate("Тема без даты", today)).toBe(false);
    const moscowSep30 = moscowToday(new Date(Date.UTC(2026, 8, 29, 22, 0, 0)));
    expect(isPastControlDate("На 29 Сентября", moscowSep30)).toBe(true);
    expect(isPastControlDate("На 30 сентября", moscowSep30)).toBe(false);

    const oct15 = new Date(2026, 9, 15);
    expect(isPastControlDate("На 15 апреля", oct15)).toBe(false);
    expect(resolveUpcomingDate(15, 3, oct15).getFullYear()).toBe(2027);
    expect(isPastControlDate("На 16 апреля", oct15)).toBe(true);
    expect(daysUntil(resolveUpcomingDate(16, 3, oct15), oct15)).toBeLessThan(0);
    expect(isPastControlDate("На 15 сентября", oct15)).toBe(true);

    const jan15 = new Date(2027, 0, 15);
    expect(isPastControlDate("На 15 июля", jan15)).toBe(false);
    expect(isPastControlDate("На 16 июля", jan15)).toBe(true);
  });

  it("dims a passed heading and the text under it, not the following date", () => {
    const classesOf = () => {
      const names = new Set();
      return {
        add(name) {
          names.add(name);
        },
        contains(name) {
          return names.has(name);
        },
      };
    };
    const el = (tag, text) => ({ tagName: tag, textContent: text, classList: classesOf() });
    const header = el("HEADER", "");
    const pastHeading = el("H2", "На 16 Сентября");
    const pastBody = el("UL", "занятие");
    const todayHeading = el("H2", "На 30 Сентября");
    const todayBody = el("UL", "занятие");
    const futureHeading = el("H2", "На 1 Октября");
    const children = [header, pastHeading, pastBody, todayHeading, todayBody, futureHeading];
    markPastControlSections(
      {
        children,
        insertBefore(node, ref) {
          children.splice(children.indexOf(ref), 0, node);
        },
      },
      new Date(2026, 8, 30)
    );
    expect(header.classList.contains("dg-past-deadline")).toBe(false);
    expect(pastHeading.classList.contains("dg-past-deadline")).toBe(true);
    expect(pastBody.classList.contains("dg-past-deadline")).toBe(true);
    expect(todayHeading.classList.contains("dg-past-deadline")).toBe(false);
    expect(todayBody.classList.contains("dg-past-deadline")).toBe(false);
    expect(futureHeading.classList.contains("dg-past-deadline")).toBe(false);
    expect(children[3].className).toBe("dg-deadline-divider");
    expect(children[4]).toBe(todayHeading);
  });

  it("extracts markdown headings without a trailing dollar", () => {
    expect(extractHeadings("## На 17 Сентября\nтекст\n## На 1 Октября\n")).toEqual([
      "На 17 Сентября",
      "На 1 Октября",
    ]);
  });

  it("treats today as the Moscow calendar day on any server timezone", () => {
    // 28 Sep 2026 22:00 UTC is 29 Sep 2026 01:00 in Moscow.
    const instant = new Date(Date.UTC(2026, 8, 28, 22, 0, 0));
    const today = moscowToday(instant);
    expect(today.getFullYear()).toBe(2026);
    expect(today.getMonth()).toBe(8);
    expect(today.getDate()).toBe(29);
    expect(daysUntil(resolveUpcomingDate(29, 8, today), today)).toBe(0);
    expect(daysUntil(resolveUpcomingDate(1, 9, today), today)).toBe(2);
    expect(relativeSuffix(daysUntil(resolveUpcomingDate(29, 8, today), today))).toBe(
      "Сегодня"
    );
  });

  it("builds deadline lines from control-form notes", () => {
    const today = moscowToday(new Date(Date.UTC(2026, 8, 28, 22, 0, 0)));
    const lines = getControlDeadlines(
      withDeadlineHome({
        collections: {
          note: [
            {
              filePathStem: "/notes/Дедлайны/ДЗ/Физика",
              url: "/formy-kontrolya/dz/fizika/",
              template: {
                inputContent: "## На 17 сентября\n\n## На 1 октября\n",
              },
            },
          ],
        },
      }),
      today
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe("Ближайшее ДЗ:");
    expect(lines[0].linkText).toBe("Физика - через 2 дня");
    expect(lines[0].whenText).toBe("через 2 дня");
    expect(lines[0].subjects.map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(lines[0].days).toBe(2);
    expect(lines[0].href).toContain("#");
  });

  it("recomputes the nearest line when Moscow today changes", () => {
    const data = withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            url: "/formy-kontrolya/dz/fizika/",
            template: {
              inputContent: "## На 17 сентября\n\n## На 1 октября\n",
            },
          },
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Матан",
            url: "/formy-kontrolya/dz/matan/",
            template: {
              inputContent: "## На 30 сентября\n",
            },
          },
        ],
      },
    });
    const september29 = moscowToday(new Date(Date.UTC(2026, 8, 28, 22, 0, 0)));
    const october1 = moscowToday(new Date(Date.UTC(2026, 8, 30, 21, 0, 0)));
    const candidates = getControlDeadlineCandidates(data);

    expect(candidates.some((item) => "days" in item)).toBe(false);
    expect(getControlDeadlines(data, september29)[0].linkText).toBe("Матан - Завтра");
    expect(pickControlDeadlines(candidates, october1)[0].linkText).toBe("Физика - Сегодня");
  });

  it("lists every subject that shares the nearest day", () => {
    const today = new Date(2026, 8, 30);
    const lines = pickControlDeadlines(
      [
        { typeName: "ДЗ", subjectName: "Физика", day: 3, month: 9, displayDate: "3 октября", href: "/fizika#a" },
        { typeName: "ДЗ", subjectName: "Информатика", day: 3, month: 9, displayDate: "3 октября", href: "/infa#a" },
        { typeName: "ДЗ", subjectName: "Матан", day: 5, month: 9, displayDate: "5 октября", href: "/matan#a" },
      ],
      today
    );
    expect(lines[0].label).toBe("Ближайшие ДЗ:");
    expect(lines[0].linkText).toBe("Информатика, Физика - через 3 дня");
    expect(lines[0].subjects.map((item) => item.href)).toEqual(["/infa#a", "/fizika#a"]);
    expect(lines[0].tomorrow).toBeUndefined();
  });

  it("adds tomorrow under the same type when today is also due", () => {
    const today = new Date(2026, 9, 14);
    const lines = pickControlDeadlines(
      [
        { typeName: "ДЗ", subjectName: "Линал", day: 14, month: 9, displayDate: "14 октября", href: "/dz-linal#today" },
        { typeName: "ДЗ", subjectName: "Матан", day: 14, month: 9, displayDate: "14 октября", href: "/dz-matan#today" },
        { typeName: "ДЗ", subjectName: "Матан", day: 15, month: 9, displayDate: "15 октября", href: "/dz-matan#tmr" },
        { typeName: "ДЗ", subjectName: "Физика", day: 15, month: 9, displayDate: "15 октября", href: "/dz-fiz#tmr" },
        { typeName: "ДЗ", subjectName: "Физика", day: 20, month: 9, displayDate: "20 октября", href: "/dz-fiz#later" },
        { typeName: "ЛР", subjectName: "Информатика", day: 14, month: 9, displayDate: "14 октября", href: "/lr#today" },
        { typeName: "КР", subjectName: "Матан", day: 16, month: 9, displayDate: "16 октября", href: "/kr#later" },
      ],
      today
    );
    const dz = lines.find((line) => line.typeName === "ДЗ");
    expect(dz.label).toBe("Ближайшие ДЗ:");
    expect(dz.linkText).toBe("Линал, Матан - Сегодня");
    expect(dz.tomorrow.linkText).toBe("Матан, Физика - Завтра");
    expect(dz.tomorrow.whenText).toBe("Завтра");
    expect(dz.tomorrow.subjects.map((item) => item.href)).toEqual([
      "/dz-matan#tmr",
      "/dz-fiz#tmr",
    ]);
    expect(lines.find((line) => line.typeName === "ЛР").tomorrow).toBeUndefined();
    expect(lines.find((line) => line.typeName === "КР").linkText).toBe("Матан - через 2 дня");
    expect(lines.find((line) => line.typeName === "КР").tomorrow).toBeUndefined();
  });

  it("keeps a tomorrow-only deadline as the single nearest line", () => {
    const today = new Date(2026, 9, 14);
    const lines = pickControlDeadlines(
      [{ typeName: "ДЗ", subjectName: "Физика", day: 15, month: 9, displayDate: "15 октября", href: "/dz#tmr" }],
      today
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].linkText).toBe("Физика - Завтра");
    expect(lines[0].tomorrow).toBeUndefined();
  });

  it("builds a row for every day from the earliest deadline through the last", () => {
    const today = new Date(2026, 8, 30);
    const table = buildDeadlineTable(
      [
        { typeName: "ЛР", subjectName: "Физика", day: 16, month: 8, displayDate: "16 сентября", href: "/lr#past" },
        { typeName: "ДЗ", subjectName: "Матан", day: 30, month: 8, displayDate: "30 сентября", href: "/dz-matan#today" },
        { typeName: "ДЗ", subjectName: "Физика", day: 1, month: 9, displayDate: "1 октября", href: "/dz-fiz#oct" },
        { typeName: "ЛР", subjectName: "Информатика", day: 1, month: 9, displayDate: "1 октября", href: "/lr-infa#oct" },
        { typeName: "БДЗ", subjectName: "Физика", day: 18, month: 11, displayDate: "18 декабря", href: "/bdz#dec" },
      ],
      today
    );
    const byLabel = Object.fromEntries(table.rows.map((row) => [row.label, row]));
    const expectedDays =
      Math.round((Date.UTC(2026, 11, 18) - Date.UTC(2026, 8, 16)) / 86400000) + 1;
    expect(table.columns).toEqual(["ДЗ", "ЛР", "БДЗ"]);
    expect(table.rows).toHaveLength(expectedDays);
    expect(table.rows[0].label).toBe("16 сентября");
    expect(table.rows[0].past).toBe(true);
    expect(table.rows[0].whenText).toBe("14 дней назад");
    expect(table.rows[0].cells["ЛР"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(byLabel["29 сентября"].whenText).toBe("Вчера");
    expect(byLabel["29 сентября"].past).toBe(true);
    expect(byLabel["30 сентября"].weekday).toBe("Ср");
    expect(byLabel["30 сентября"].weekend).toBe(false);
    expect(byLabel["30 сентября"].past).toBe(false);
    expect(byLabel["30 сентября"].whenText).toBe("Сегодня");
    expect(byLabel["30 сентября"].days).toBe(0);
    expect(byLabel["30 сентября"].href).toBe("/den/?d=30-9");
    expect(byLabel["30 сентября"].week).toBe(5);
    expect(byLabel["30 сентября"].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(byLabel["1 октября"].whenText).toBe("Завтра");
    expect(byLabel["1 октября"].href).toBe("/den/?d=1-10");
    expect(byLabel["1 октября"].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(byLabel["2 октября"].whenText).toBe("Через 2 дня");
    expect(byLabel["3 октября"].weekday).toBe("Сб");
    expect(byLabel["3 октября"].weekend).toBe(true);
    expect(byLabel["4 октября"].weekday).toBe("Вс");
    expect(byLabel["4 октября"].weekend).toBe(true);
    expect(byLabel["4 октября"].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(byLabel["5 октября"].week).toBe(6);
    expect(byLabel["5 октября"].weekLabel).toBe("6 неделя (Числитель)");
    expect(table.rows.at(-1).href).toBe("/den/?d=18-12");
    expect(table.rows.at(-1).weekLabel).toBe("16 неделя (Числитель)");
    expect(byLabel["2 октября"].cells).toEqual({ ДЗ: [], БДЗ: [], ЛР: [] });
    expect(table.rows.at(-1).label).toBe("18 декабря");
    expect(table.rows.at(-1).cells["БДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(byLabel["1 октября"].cells["ДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(byLabel["1 октября"].cells["ЛР"][0].href).toBe("/lr-infa#oct");
    expect(byLabel["30 сентября"].cells["ЛР"]).toEqual([]);
    for (let i = 1; i < table.rows.length; i++) {
      expect(table.rows[i].time - table.rows[i - 1].time).toBe(86400000);
    }
  });

  it("puts the column with the soonest deadline first", () => {
    const today = new Date(2026, 9, 13);
    const tied = buildDeadlineTable(
      [
        { typeName: "БДЗ", subjectName: "Физика", day: 29, month: 9, displayDate: "29 октября", href: "/bdz" },
        { typeName: "ЛР", subjectName: "Информатика", day: 14, month: 9, displayDate: "14 октября", href: "/lr" },
        { typeName: "КР", subjectName: "Линал", day: 14, month: 9, displayDate: "14 октября", href: "/kr" },
        { typeName: "ДЗ", subjectName: "Матан", day: 14, month: 9, displayDate: "14 октября", href: "/dz" },
      ],
      today
    );
    expect(tied.columns).toEqual(["ДЗ", "КР", "ЛР", "БДЗ"]);

    const soonerLab = buildDeadlineTable(
      [
        { typeName: "ДЗ", subjectName: "Матан", day: 20, month: 9, displayDate: "20 октября", href: "/dz" },
        { typeName: "ЛР", subjectName: "Информатика", day: 14, month: 9, displayDate: "14 октября", href: "/lr" },
      ],
      today
    );
    expect(soonerLab.columns).toEqual(["ЛР", "ДЗ"]);
  });

  it("counts academic weeks from the week that contains 1 September", () => {
    // 1 Sep 2026 is Tuesday, so week 1 is Mon 31 Aug – Sun 6 Sep.
    expect(academicWeekNumber(new Date(2026, 7, 31))).toBe(1);
    expect(academicWeekNumber(new Date(2026, 8, 1))).toBe(1);
    expect(academicWeekNumber(new Date(2026, 8, 6))).toBe(1);
    expect(academicWeekNumber(new Date(2026, 8, 7))).toBe(2);
    // 13 Oct 2026 is Tuesday of week 7 (Mon 12 Oct – Sun 18 Oct).
    expect(academicWeekNumber(new Date(2026, 9, 11))).toBe(6);
    expect(academicWeekNumber(new Date(2026, 9, 12))).toBe(7);
    expect(academicWeekNumber(new Date(2026, 9, 13))).toBe(7);
    expect(academicWeekNumber(new Date(2026, 9, 18))).toBe(7);
    expect(academicWeekNumber(new Date(2026, 9, 19))).toBe(8);
    // January continues the academic year that started the previous September.
    expect(academicWeekNumber(new Date(2027, 0, 11))).toBe(20);
    // 1 Sep 2025 is Monday, so the Sunday before is week 53 of the prior academic year.
    expect(academicWeekNumber(new Date(2025, 7, 31))).toBe(53);
    expect(academicWeekNumber(new Date(2025, 8, 1))).toBe(1);
  });

  it("shows dates at most half a year ahead and drops the rest as passed", () => {
    const today = new Date(2026, 9, 15);
    const lines = pickControlDeadlines(
      [
        { typeName: "ДЗ", subjectName: "Матан", day: 15, month: 3, displayDate: "15 апреля", href: "/april" },
        { typeName: "ДЗ", subjectName: "Физика", day: 16, month: 3, displayDate: "16 апреля", href: "/late" },
        { typeName: "ЛР", subjectName: "Физика", day: 29, month: 8, displayDate: "29 сентября", href: "/sep" },
      ],
      today
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].typeName).toBe("ДЗ");
    expect(lines[0].subjects.map((item) => item.subjectName)).toEqual(["Матан"]);
    expect(lines[0].days).toBe(daysUntil(new Date(2027, 3, 15), today));
    expect(lines[0].tomorrow).toBeUndefined();

    const table = buildDeadlineTable(
      [
        { typeName: "ДЗ", subjectName: "Матан", day: 15, month: 3, displayDate: "15 апреля", href: "/april" },
        { typeName: "ЛР", subjectName: "Физика", day: 16, month: 3, displayDate: "16 апреля", href: "/late" },
        { typeName: "БДЗ", subjectName: "Физика", day: 18, month: 11, displayDate: "18 декабря", href: "/dec" },
      ],
      today
    );
    expect(table.columns).toEqual(["БДЗ", "ДЗ", "ЛР"]);
    expect(table.rows[0].label).toBe("16 апреля");
    expect(table.rows[0].past).toBe(true);
    expect(table.rows[0].cells["ЛР"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(table.rows.at(-1).label).toBe("15 апреля");
    expect(table.rows.at(-1).past).toBe(false);
    expect(table.rows.at(-1).cells["ДЗ"].map((item) => item.subjectName)).toEqual(["Матан"]);
    const december = table.rows.find((row) => row.label === "18 декабря");
    expect(december.cells["БДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
    const openedOn = table.rows.find((row) => row.days === 0);
    expect(openedOn.label).toBe("15 октября");
  });

  it("runs the inlined browser bundle without Node globals", () => {
    const source = fs.readFileSync(path.join(here, "deadlinesCore.js"), "utf8");
    const clientSource = source.replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");
    const sandbox = {};
    vm.runInNewContext(clientSource, sandbox);
    const today = sandbox.dgDeadlinesApi.moscowToday(new Date(Date.UTC(2026, 8, 30, 21, 0, 0)));
    const lines = sandbox.dgDeadlinesApi.pickControlDeadlines(
      [{ typeName: "ЛР", subjectName: "Физика", day: 1, month: 9, displayDate: "1 октября", href: "/#x" }],
      today
    );
    expect(lines[0].linkText).toBe("Физика - Сегодня");
    expect(sandbox.dgDeadlinesApi.relativeParen(-1)).toBe("Вчера");
    expect(sandbox.dgDeadlinesApi.relativeParen(27)).toBe("Через 27 дней");
    const jan15 = new Date(2027, 0, 15);
    expect(sandbox.dgDeadlinesApi.isPastControlDate("На 16 июля", jan15)).toBe(true);
    expect(sandbox.dgDeadlinesApi.isPastControlDate("На 15 июля", jan15)).toBe(false);
    expect(sandbox.dgDeadlinesApi.dayPageHref(17, 8)).toBe("/den/?d=17-9");
    expect(sandbox.dgDeadlinesApi.taskStorageKey("ДЗ", "Физика", 8, 17, 0, " 1.39")).toBe(
      sandbox.dgDeadlinesApi.taskStorageKey("ДЗ", "Физика", 8, 17, 0, "1.39")
    );
    expect(sandbox.dgDeadlinesApi.emptyDayText).toBe("На этот день ничего не задано!");
    expect(sandbox.module).toBeUndefined();
    expect(sandbox.localStorage).toBeUndefined();
  });

  it("lists every subject file for a deadline column", () => {
    const subjects = getControlSubjects(withDeadlineHome({
      navigationOrder: {
        "/Дедлайны/ДЗ": ["Физика", "Матан"],
        "/Дедлайны/ЛР": ["Информатика"],
      },
      collections: {
        note: [
          { filePathStem: "/notes/Дедлайны/ДЗ/Матан", url: "/dz/matan/" },
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            url: "/dz/fizika/",
            template: { inputContent: "## На 17 сентября\n" },
          },
          { filePathStem: "/notes/Дедлайны/ЛР/Информатика", url: "/lr/inf/" },
          { filePathStem: "/notes/Лекции/Физика/Физика 1101", url: "/lek/" },
        ],
      },
    }));
    expect(subjects["ДЗ"].map((item) => item.subjectName)).toEqual(["Физика", "Матан"]);
    expect(subjects["ДЗ"][0].href).toBe("/dz/fizika/");
    expect(subjects["ЛР"].map((item) => item.subjectName)).toEqual(["Информатика"]);
    expect(subjects["Лекции"]).toBeUndefined();
  });

  it("names the control note from its path", () => {
    const home = withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: "## На 17 сентября\n" },
          },
        ],
      },
    });
    expect(
      controlNoteIdentity({ ...home, page: { filePathStem: "/notes/Дедлайны/ДЗ/Физика" } })
    ).toEqual({ typeName: "ДЗ", subjectName: "Физика", typeLabel: "ДЗ" });
    expect(
      controlNoteIdentity({ ...home, page: { filePathStem: "/notes/Дедлайны/{КР/Физика" } })
    ).toEqual({ typeName: "{КР", subjectName: "Физика", typeLabel: "КР" });
    expect(
      controlNoteIdentity({ ...home, page: { filePathStem: "/notes/Лекции/Физика/Физика 1101" } })
    ).toBeNull();
  });

  it("builds a day catalog with shared checkbox ids", () => {
    const catalog = getControlTaskCatalog(withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            url: "/formy-kontrolya/dz/fizika/",
            inputPath: path.join(here, "../site/notes/Дедлайны/ДЗ/Физика.md"),
          },
          {
            filePathStem: "/notes/Дедлайны/КР/Физика",
            url: "/formy-kontrolya/kr/fizika/",
            template: { inputContent: "## На 9 Октября\n- КР №1 - Кинематика\n" },
          },
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Матан",
            url: "/formy-kontrolya/dz/matan/",
            template: {
              inputContent:
                "## На 17 Сентября\n- [ ] [Занятие 2](https://example.com/z.pdf)\n",
            },
          },
        ],
      },
    }));

    const september17 = catalog["17-9"];
    expect(september17.groups.map((group) => group.title)).toEqual(["Матан (ДЗ)", "Физика (ДЗ)"]);
    const physics = september17.groups[1];
    const tasks = physics.blocks.filter((block) => block.kind === "task");
    expect(tasks.map((block) => block.html).slice(0, 2)).toEqual(["1.39", "1.41"]);
    expect(tasks[0].id).toBe(taskStorageKey("ДЗ", "Физика", 8, 17, 0, "1.39"));
    expect(visibleTaskLabel("[Занятие 2](https://example.com/z.pdf)")).toBe("Занятие 2");
    expect(september17.groups[0].blocks[0].html).toContain('href="https://example.com/z.pdf"');
    expect(september17.groups[0].blocks[0].html).toContain("Занятие 2");

    const october9 = catalog["9-10"];
    expect(october9.groups.map((group) => group.title)).toEqual(["Физика (ДЗ)", "Физика (КР)"]);
    expect(october9.groups[1].blocks).toEqual([
      { kind: "note", html: "КР №1 - Кинематика" },
    ]);
    expect(catalog["3-1"]).toBeUndefined();
    expect(parseControlSections("## Без даты\n- [ ] 1\n")).toEqual([]);
  });

  it("omits a braced type folder from the day heading and shows the name without the brace", () => {
    const catalog = getControlTaskCatalog(withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/{КР/Физика",
            template: { inputContent: "## На 9 октября\n- КР №1\n" },
          },
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: "## На 9 октября\n- задача\n" },
          },
        ],
      },
    }));
    expect(catalog["9-10"].groups.map((group) => group.title)).toEqual(["Физика (ДЗ)", "Физика"]);
    const today = new Date(2026, 9, 8);
    const lines = pickControlDeadlines(
      [
        { typeName: "{КР", subjectName: "Физика", day: 9, month: 9, displayDate: "9 октября", href: "/kr" },
        { typeName: "ДЗ", subjectName: "Матан", day: 10, month: 9, displayDate: "10 октября", href: "/dz" },
      ],
      today
    );
    expect(lines.find((line) => line.typeName === "{КР").label).toBe("Ближайшая КР:");
    const table = buildDeadlineTable(
      [{ typeName: "{КР", subjectName: "Физика", day: 9, month: 9, displayDate: "9 октября", href: "/kr" }],
      today
    );
    expect(table.columns).toEqual(["{КР"]);
  });
});

describe("shared task checkboxes", () => {
  const memory = new Map();

  function installStorage() {
    memory.clear();
    global.localStorage = {
      getItem(key) {
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        memory.set(key, String(value));
      },
      removeItem(key) {
        memory.delete(key);
      },
    };
  }

  function armParsed(root) {
    const all = [root, ...root.querySelectorAll("*")];
    for (const node of all) {
      node.addEventListener = (type, fn) => {
        node.listeners = node.listeners || {};
        node.listeners[type] = fn;
      };
      node.closest = function closest(selector) {
        let current = this;
        while (current) {
          if (selector === "li" && String(current.tagName).toUpperCase() === "LI") return current;
          current = current.parentNode;
        }
        return null;
      };
    }
  }

  afterEach(() => {
    delete global.localStorage;
    delete global.document;
  });

  it("keeps a tick on the note and on the day page", async () => {
    installStorage();
    const { parse } = await import("node-html-parser");
    const MarkdownIt = (await import("markdown-it")).default;
    const taskCheckbox = (await import("markdown-it-task-checkbox")).default;
    const markdown = [
      "## На 17 Сентября",
      "- [ ] 1.39",
      "- [ ] [Занятие 1](https://example.com/a.pdf)",
      "## На 25 Сентября",
      "- [ ] 1.66",
    ].join("\n");
    const catalog = getControlTaskCatalog(withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: markdown },
          },
        ],
      },
    }));
    const html = MarkdownIt({ breaks: true, html: true })
      .use(taskCheckbox, { disabled: true, divWrap: false, ulClass: "task-list", liClass: "task-list-item" })
      .render(markdown);
    const root = parse(`<main>${html}</main>`).querySelector("main");
    armParsed(root);
    bindControlTaskChecks(root, { typeName: "ДЗ", subjectName: "Физика" });

    const boxes = root.querySelectorAll("input[type=checkbox]");
    expect(boxes).toHaveLength(3);
    expect(boxes[0].getAttribute("disabled")).toBeUndefined();
    expect(boxes[0].getAttribute("data-task-id")).toBe(catalog["17-9"].groups[0].blocks[0].id);
    expect(boxes[1].getAttribute("data-task-id")).toBe(catalog["17-9"].groups[0].blocks[1].id);
    expect(boxes[2].getAttribute("data-task-id")).toBe(catalog["25-9"].groups[0].blocks[0].id);

    boxes[0].checked = true;
    boxes[0].listeners.change();
    expect(readTaskChecks()[boxes[0].getAttribute("data-task-id")]).toBe(1);
    expect(boxes[0].closest("li").getAttribute("data-task")).toBe("x");

    const nodes = [];
    function make(tag) {
      const node = {
        tagName: String(tag).toUpperCase(),
        className: "",
        children: [],
        parent: null,
        attrs: {},
        listeners: {},
        checked: false,
        disabled: false,
        appendChild(child) {
          child.parent = node;
          node.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          node.attrs[name] = String(value);
        },
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null;
        },
        removeAttribute(name) {
          delete node.attrs[name];
        },
        addEventListener(type, fn) {
          node.listeners[type] = fn;
        },
        closest(selector) {
          let current = node;
          while (current) {
            if (selector === "li" && current.tagName === "LI") return current;
            current = current.parent;
          }
          return null;
        },
        querySelectorAll() {
          return [];
        },
      };
      let text = "";
      Object.defineProperty(node, "textContent", {
        get() {
          return text;
        },
        set(value) {
          text = String(value);
          if (value === "") node.children = [];
        },
      });
      Object.defineProperty(node, "innerHTML", {
        get() {
          return node.attrs.html || "";
        },
        set(value) {
          node.attrs.html = String(value);
        },
      });
      nodes.push(node);
      return node;
    }
    const page = make("div");
    const title = make("h1");
    global.document = {
      title: "",
      createElement: make,
      querySelectorAll(selector) {
        if (selector !== "input[data-task-id]") return [];
        return nodes.filter((node) => node.tagName === "INPUT" && node.attrs["data-task-id"]);
      },
    };
    const fixedToday = new Date(2026, 8, 30);
    renderDayPage(page, catalog, "17-9", title, fixedToday);
    expect(title.textContent).toBe("На 17 сентября, Чт (13 дней назад)");
    expect(title.getAttribute("data-dg-outline-title")).toBe("На 17 сентября, Чт");
    expect(global.document.title).toBe("На 17 сентября, Чт (13 дней назад)");
    const dayBoxes = page.children[0].children.filter((node) => node.tagName === "UL")[0].children;
    expect(page.children[0].children[0].textContent).toBe("Физика (ДЗ)");
    expect(page.children[0].children[0].id).toBe("dg-day-0");
    expect(dayBoxes[0].children[0].checked).toBe(true);
    expect(dayBoxes[0].children[1].attrs.html).toBe("1.39");
    expect(dayBoxes[1].children[1].attrs.html).toContain("Занятие 1");

    dayBoxes[1].children[0].checked = true;
    dayBoxes[1].children[0].listeners.change();
    const fresh = parse(`<main>${html}</main>`).querySelector("main");
    armParsed(fresh);
    bindControlTaskChecks(fresh, { typeName: "ДЗ", subjectName: "Физика" });
    const again = fresh.querySelectorAll("input[type=checkbox]");
    expect(again[0].checked).toBe(true);
    expect(again[1].checked).toBe(true);
    expect(again[2].checked).toBe(false);

    renderDayPage(page, catalog, "19-10", title, fixedToday);
    expect(title.textContent).toBe("На 19 октября, Пн (Через 19 дней)");
    expect(title.getAttribute("data-dg-outline-title")).toBe("На 19 октября, Пн");
    expect(page.children).toHaveLength(1);
    expect(page.children[0].textContent).toBe(emptyDayText);
    expect(dayPageHref(19, 9)).toBe("/den/?d=19-10");
  });
});

describe("deadlines folder from the home note", () => {
  afterEach(() => {
    clearPublishedDeadlinesCache();
  });

  it("stays inactive without the Deadlines property", () => {
    const data = {
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: "## На 17 сентября\n" },
          },
        ],
      },
    };
    expect(deadlinesFolderName(data)).toBe("");
    expect(activeDeadlinesFolder(data)).toBe("");
    expect(getControlDeadlineCandidates(data)).toEqual([]);
  });

  it("stays a normal folder when nested notes have no date headings", () => {
    const data = withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: "## Задание\n" },
          },
        ],
      },
    });
    expect(deadlinesFolderName(data)).toBe("Дедлайны");
    expect(folderQualifies(data, "Дедлайны")).toBe(false);
    expect(activeDeadlinesFolder(data)).toBe("");
  });

  it("uses a root folder named by the home note when it has dated headings", () => {
    const data = withDeadlineHome(
      {
        collections: {
          note: [
            {
              filePathStem: "/notes/Сроки/ДЗ/Физика",
              template: { inputContent: "## На 20 октября, Пт\n" },
            },
          ],
        },
      },
      "Сроки"
    );
    expect(activeDeadlinesFolder(data)).toBe("Сроки");
    expect(getControlDeadlineCandidates(data).map((item) => item.subjectName)).toEqual(["Физика"]);
  });

  it("reads Deadlines from dg-note-properties", () => {
    const data = withDeadlineHome({
      collections: {
        note: [
          {
            filePathStem: "/notes/Дедлайны/ДЗ/Физика",
            template: { inputContent: "## На 17 сентября\n" },
          },
        ],
      },
    });
    data.collections.note[0].data = {
      tags: ["gardenEntry"],
      "dg-note-properties": { Deadlines: "Дедлайны" },
    };
    expect(activeDeadlinesFolder(data)).toBe("Дедлайны");
  });

  it("reads the published home note from disk", () => {
    const found = readPublishedDeadlines(path.join(here, "../site/notes"));
    expect(found).toEqual({ name: "Дедлайны", qualified: true });
  });
});
