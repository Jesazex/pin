/**
 * Deadline day math shared by the Eleventy build and the browser.
 * The build inlines this file so each visit recomputes "today" in Moscow.
 * Keep the browser bundle free of Node APIs.
 */
var dgDeadlinesApi = (function () {
  var MONTHS = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };

  var FEMININE_TYPES = { КР: true, ЛР: true };
  var MOSCOW_TZ = "Europe/Moscow";

  function moscowYMD(instant) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: MOSCOW_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    function get(type) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) return Number(parts[i].value);
      }
      return NaN;
    }
    return { y: get("year"), m: get("month") - 1, d: get("day") };
  }

  /** Local Date whose calendar day is the Moscow calendar day of `now`. */
  function moscowToday(now) {
    var ymd = moscowYMD(now || new Date());
    return new Date(ymd.y, ymd.m, ymd.d);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function calendarUTC(date) {
    var day = startOfDay(date);
    return Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  }

  function parseDateHeading(heading) {
    if (!heading || typeof heading !== "string") return null;
    var match = heading.trim().match(/^На\s+(\d{1,2})\s+([А-Яа-яёЁ]+)\s*$/i);
    if (!match) return null;
    var day = parseInt(match[1], 10);
    var monthToken = match[2].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MONTHS, monthToken) || day < 1 || day > 31) {
      return null;
    }
    return {
      day: day,
      month: MONTHS[monthToken],
      displayDate: day + " " + monthToken,
      heading: heading.trim(),
    };
  }

  function resolveUpcomingDate(day, month, today) {
    var today0 = startOfDay(today || moscowToday());
    var candidate = new Date(today0.getFullYear(), month, day);
    if (candidate < today0) {
      candidate = new Date(today0.getFullYear() + 1, month, day);
    }
    return candidate;
  }

  /** True when a «На <день> <месяц>» heading is strictly before Moscow today. */
  function isPastControlDate(headingText, today) {
    var parsed = parseDateHeading(typeof headingText === "string" ? headingText : "");
    if (!parsed) return false;
    var today0 = startOfDay(today || moscowToday());
    var candidate = new Date(today0.getFullYear(), parsed.month, parsed.day);
    return candidate < today0;
  }

  /**
   * Mark a passed date heading and the blocks under it until the next heading.
   * `root` is the note body; only its direct children are considered.
   */
  function markPastControlSections(root, today) {
    if (!root || !root.children) return;
    var today0 = today || moscowToday();
    var past = false;
    var seenPast = false;
    var boundary = null;
    var children = [];
    for (var n = 0; n < root.children.length; n++) children.push(root.children[n]);
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = el.tagName || "";
      if (/^H[1-6]$/.test(tag)) {
        past = isPastControlDate(el.textContent, today0);
        if (seenPast && !past && !boundary) boundary = el;
      }
      if (past && el.classList) {
        el.classList.add("dg-past-deadline");
        seenPast = true;
      }
    }
    if (!boundary || typeof root.insertBefore !== "function") return;
    var hr;
    if (typeof document !== "undefined" && document.createElement) {
      hr = document.createElement("hr");
      hr.className = "dg-deadline-divider";
    } else {
      hr = { tagName: "HR", className: "dg-deadline-divider" };
    }
    root.insertBefore(hr, boundary);
  }

  function daysUntil(target, today) {
    var a = calendarUTC(today || moscowToday());
    var b = calendarUTC(target);
    return Math.round((b - a) / 86400000);
  }

  function relativeSuffix(days) {
    if (days === 0) return "Сегодня";
    var n = Math.abs(days);
    var mod10 = n % 10;
    var mod100 = n % 100;
    var word;
    if (mod100 >= 11 && mod100 <= 14) word = "дней";
    else if (mod10 === 1) word = "день";
    else if (mod10 >= 2 && mod10 <= 4) word = "дня";
    else word = "дней";
    return n + " " + word;
  }

  function relativePhrase(days) {
    if (days === 0) return "Сегодня";
    if (days === 1) return "Завтра";
    return "через " + relativeSuffix(days);
  }

  function compareSubjects(a, b) {
    return String(a.subjectName).localeCompare(String(b.subjectName), "ru");
  }

  function nearestAdjective(typeName, count) {
    if (count > 1) return "Ближайшие";
    if (FEMININE_TYPES[typeName]) return "Ближайшая";
    var lower = String(typeName || "").toLowerCase();
    if (/[ая]я$/i.test(lower)) return "Ближайшая";
    return "Ближайшее";
  }

  function detailFor(subjects, days) {
    var names = [];
    for (var s = 0; s < subjects.length; s++) names.push(subjects[s].subjectName);
    var whenText = relativePhrase(days);
    return {
      subjects: subjects,
      whenText: whenText,
      linkText: names.join(", ") + " - " + whenText,
      days: days,
    };
  }

  function upcomingItems(items, today0) {
    var bestDays = null;
    var grouped = {};
    for (var j = 0; j < items.length; j++) {
      var candidate = items[j];
      var when = resolveUpcomingDate(candidate.day, candidate.month, today0);
      var days = daysUntil(when, today0);
      if (days < 0) continue;
      var key = String(days);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ subjectName: candidate.subjectName, href: candidate.href });
      if (bestDays === null || days < bestDays) bestDays = days;
    }
    if (bestDays === null) return { days: null, subjects: [], tomorrow: null };
    var subjects = grouped[String(bestDays)];
    subjects.sort(compareSubjects);
    var tomorrow = null;
    if (bestDays === 0 && grouped["1"]) {
      tomorrow = grouped["1"];
      tomorrow.sort(compareSubjects);
    }
    return { days: bestDays, subjects: subjects, tomorrow: tomorrow };
  }

  /**
   * Soonest upcoming date per control type.
   * Every subject that shares that date is listed. No calendar date in the text.
   * When that date is today and the same type is also due tomorrow, tomorrow
   * is attached as a second line. Any other gap stays on the nearest day only.
   */
  function pickControlDeadlines(candidates, today) {
    var today0 = today || moscowToday();
    var byType = new Map();
    var list = candidates || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!byType.has(item.typeName)) byType.set(item.typeName, []);
      byType.get(item.typeName).push(item);
    }

    var lines = [];
    byType.forEach(function (items, typeName) {
      var upcoming = upcomingItems(items, today0);
      if (upcoming.days === null || !upcoming.subjects.length) return;
      var detail = detailFor(upcoming.subjects, upcoming.days);
      var adj = nearestAdjective(typeName, upcoming.subjects.length);
      var line = {
        typeName: typeName,
        adjective: adj,
        label: adj + " " + typeName + ":",
        subjects: detail.subjects,
        whenText: detail.whenText,
        linkText: detail.linkText,
        href: upcoming.subjects[0].href,
        days: upcoming.days,
      };
      if (upcoming.tomorrow && upcoming.tomorrow.length) {
        line.tomorrow = detailFor(upcoming.tomorrow, 1);
      }
      lines.push(line);
    });

    lines.sort(function (a, b) {
      return a.days - b.days || String(a.typeName).localeCompare(b.typeName, "ru");
    });
    return lines;
  }

  var MONTH_NAMES = [];
  for (var monthName in MONTHS) {
    if (Object.prototype.hasOwnProperty.call(MONTHS, monthName)) {
      MONTH_NAMES[MONTHS[monthName]] = monthName;
    }
  }

  function dayLabel(date) {
    return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
  }

  /** Monday of the calendar week that contains `date` (Monday–Sunday). */
  function mondayOnOrBefore(date) {
    var day = startOfDay(date);
    var dow = day.getDay();
    var offset = dow === 0 ? 6 : dow - 1;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
  }

  /**
   * Academic week index. Week 1 is the Monday–Sunday week that contains 1 September.
   * A date before that Monday belongs to the previous academic year.
   */
  function academicWeekNumber(date) {
    var day = startOfDay(date);
    var year = day.getFullYear();
    var weekStart = mondayOnOrBefore(new Date(year, 8, 1));
    if (day < weekStart) weekStart = mondayOnOrBefore(new Date(year - 1, 8, 1));
    var monday = mondayOnOrBefore(day);
    var days = Math.round((calendarUTC(monday) - calendarUTC(weekStart)) / 86400000);
    return Math.round(days / 7) + 1;
  }

  function weekLabel(week) {
    var kind = week % 2 === 0 ? "Числитель" : "Знаменатель";
    return week + " неделя (" + kind + ")";
  }

  /**
   * One row per calendar day from today through the latest heading still ahead,
   * including days with no deadlines. Columns are ordered by the soonest
   * upcoming deadline, then by name.
   */
  function buildDeadlineTable(candidates, today) {
    var today0 = startOfDay(today || moscowToday());
    var year = today0.getFullYear();
    var typeSet = {};
    var nearestTime = {};
    var groups = new Map();
    var latestTime = null;
    var list = candidates || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var when = new Date(year, item.month, item.day);
      if (when < today0) continue;
      typeSet[item.typeName] = true;
      if (nearestTime[item.typeName] == null || when.getTime() < nearestTime[item.typeName]) {
        nearestTime[item.typeName] = when.getTime();
      }
      if (latestTime === null || when.getTime() > latestTime) latestTime = when.getTime();
      var key = String(when.getTime());
      if (!groups.has(key)) {
        groups.set(key, { label: item.displayDate, time: when.getTime(), byType: {} });
      }
      var row = groups.get(key);
      if (!row.byType[item.typeName]) row.byType[item.typeName] = [];
      row.byType[item.typeName].push({ subjectName: item.subjectName, href: item.href });
    }
    var columns = Object.keys(typeSet).sort(function (a, b) {
      var byDate = nearestTime[a] - nearestTime[b];
      if (byDate) return byDate;
      return String(a).localeCompare(String(b), "ru");
    });
    var rows = [];
    if (latestTime === null) return { columns: columns, rows: rows };
    var cursor = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate());
    while (cursor.getTime() <= latestTime) {
      var stored = groups.get(String(cursor.getTime()));
      var cells = {};
      for (var c = 0; c < columns.length; c++) {
        var typeName = columns[c];
        var subjects = (stored && stored.byType[typeName]) || [];
        subjects.sort(compareSubjects);
        cells[typeName] = subjects;
      }
      var week = academicWeekNumber(cursor);
      rows.push({
        label: stored ? stored.label : dayLabel(cursor),
        time: cursor.getTime(),
        week: week,
        weekLabel: weekLabel(week),
        cells: cells,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { columns: columns, rows: rows };
  }

  return {
    moscowToday: moscowToday,
    parseDateHeading: parseDateHeading,
    resolveUpcomingDate: resolveUpcomingDate,
    daysUntil: daysUntil,
    relativeSuffix: relativeSuffix,
    relativePhrase: relativePhrase,
    nearestAdjective: nearestAdjective,
    academicWeekNumber: academicWeekNumber,
    buildDeadlineTable: buildDeadlineTable,
    isPastControlDate: isPastControlDate,
    markPastControlSections: markPastControlSections,
    pickControlDeadlines: pickControlDeadlines,
  };
})();

if (typeof module === "object" && module.exports) {
  module.exports = dgDeadlinesApi;
}
