import { describe, it, expect } from "vitest";
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
} from "./deadlinesUtils.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("deadlinesUtils", () => {
  it("parses На <day> <month> headings", () => {
    expect(parseDateHeading("На 15 сентября")).toEqual({
      day: 15,
      month: 8,
      displayDate: "15 сентября",
      heading: "На 15 сентября",
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
      {
        collections: {
          note: [
            {
              filePathStem: "/notes/Формы контроля/ДЗ/Физика",
              url: "/formy-kontrolya/dz/fizika/",
              template: {
                inputContent: "## На 17 сентября\n\n## На 1 октября\n",
              },
            },
          ],
        },
      },
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
    const data = {
      collections: {
        note: [
          {
            filePathStem: "/notes/Формы контроля/ДЗ/Физика",
            url: "/formy-kontrolya/dz/fizika/",
            template: {
              inputContent: "## На 17 сентября\n\n## На 1 октября\n",
            },
          },
          {
            filePathStem: "/notes/Формы контроля/ДЗ/Матан",
            url: "/formy-kontrolya/dz/matan/",
            template: {
              inputContent: "## На 30 сентября\n",
            },
          },
        ],
      },
    };
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

  it("builds a row for every day from today through the last recorded date", () => {
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
    const expectedDays =
      Math.round((Date.UTC(2026, 11, 18) - Date.UTC(2026, 8, 30)) / 86400000) + 1;
    expect(table.columns).toEqual(["ДЗ", "ЛР", "БДЗ"]);
    expect(table.rows).toHaveLength(expectedDays);
    expect(table.rows[0].label).toBe("30 сентября");
    expect(table.rows[0].week).toBe(5);
    expect(table.rows[0].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(table.rows[1].label).toBe("1 октября");
    expect(table.rows[1].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(table.rows[2].label).toBe("2 октября");
    expect(table.rows[4].weekLabel).toBe("5 неделя (Знаменатель)");
    expect(table.rows[5].label).toBe("5 октября");
    expect(table.rows[5].week).toBe(6);
    expect(table.rows[5].weekLabel).toBe("6 неделя (Числитель)");
    expect(table.rows.at(-1).weekLabel).toBe("16 неделя (Числитель)");
    expect(table.rows[2].cells).toEqual({ ДЗ: [], БДЗ: [], ЛР: [] });
    expect(table.rows.at(-1).label).toBe("18 декабря");
    expect(table.rows.at(-1).cells["БДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(table.rows[1].cells["ДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
    expect(table.rows[1].cells["ЛР"][0].href).toBe("/lr-infa#oct");
    expect(table.rows[0].cells["ЛР"]).toEqual([]);
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
    expect(table.columns).toEqual(["БДЗ", "ДЗ"]);
    expect(table.rows[0].label).toBe("15 октября");
    expect(table.rows.at(-1).label).toBe("15 апреля");
    expect(table.rows).toHaveLength(lines[0].days + 1);
    expect(table.rows.at(-1).cells["ДЗ"].map((item) => item.subjectName)).toEqual(["Матан"]);
    const december = table.rows.find((row) => row.label === "18 декабря");
    expect(december.cells["БДЗ"].map((item) => item.subjectName)).toEqual(["Физика"]);
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
    const jan15 = new Date(2027, 0, 15);
    expect(sandbox.dgDeadlinesApi.isPastControlDate("На 16 июля", jan15)).toBe(true);
    expect(sandbox.dgDeadlinesApi.isPastControlDate("На 15 июля", jan15)).toBe(false);
    expect(sandbox.module).toBeUndefined();
  });
});
