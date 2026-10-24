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
    // Also accepts the rendered form «На 20 октября, Пт (Вчера)».
    var match = heading
      .trim()
      .match(/^На\s+(\d{1,2})\s+([А-Яа-яёЁ]+)(?:\s*,\s*[А-Яа-яЁё]{2})?(?:\s*\([^)]*\))?\s*$/i);
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

  /** A heading further out than this already belongs to the previous cycle. */
  var HORIZON_MONTHS = 6;

  function addMonths(date, months) {
    var day = date.getDate();
    var shifted = new Date(date.getFullYear(), date.getMonth() + months, day);
    if (shifted.getDate() !== day) {
      shifted = new Date(date.getFullYear(), date.getMonth() + months + 1, 0);
    }
    return startOfDay(shifted);
  }

  function resolveUpcomingDate(day, month, today) {
    var today0 = startOfDay(today || moscowToday());
    var candidate = new Date(today0.getFullYear(), month, day);
    if (candidate < today0) {
      candidate = new Date(today0.getFullYear() + 1, month, day);
    }
    // Half a year is the furthest a control date is still ahead. Beyond that
    // the next occurrence is a new cycle, so this heading already passed.
    if (candidate > addMonths(today0, HORIZON_MONTHS)) {
      return new Date(candidate.getFullYear() - 1, month, day);
    }
    return candidate;
  }

  /**
   * True when a «На <день> <месяц>» heading is already over:
   * before Moscow today, or more than half a year ahead.
   */
  function isPastControlDate(headingText, today) {
    var parsed = parseDateHeading(typeof headingText === "string" ? headingText : "");
    if (!parsed) return false;
    var today0 = startOfDay(today || moscowToday());
    return resolveUpcomingDate(parsed.day, parsed.month, today0) < today0;
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

  /** Parenthetical label in the table and on date headings. */
  function relativeParen(days) {
    if (days === 0) return "Сегодня";
    if (days === 1) return "Завтра";
    if (days === -1) return "Вчера";
    if (days > 1) return "Через " + relativeSuffix(days);
    return relativeSuffix(days) + " назад";
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

  var WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  function dayLabel(date) {
    return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
  }

  function weekdayName(date) {
    return WEEKDAY_LABELS[date.getDay()];
  }

  function isWeekend(date) {
    var dow = date.getDay();
    return dow === 0 || dow === 6;
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
   * One row per calendar day from the earliest deadline through the latest,
   * including days with no deadlines. The past edge is the earliest heading
   * still in this cycle; days before today stay in the table so it can scroll
   * backward. When every deadline is still ahead, the table still opens on
   * today. Nothing beyond half a year forward is included. Columns are ordered
   * by the soonest upcoming deadline, then by name. A type that has only
   * passed dates sorts after the upcoming ones.
   */
  function buildDeadlineTable(candidates, today) {
    var today0 = startOfDay(today || moscowToday());
    var typeSet = {};
    var nearestTime = {};
    var groups = new Map();
    var earliestTime = null;
    var latestTime = null;
    var list = candidates || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var when = resolveUpcomingDate(item.day, item.month, today0);
      typeSet[item.typeName] = true;
      if (when >= today0) {
        if (nearestTime[item.typeName] == null || when.getTime() < nearestTime[item.typeName]) {
          nearestTime[item.typeName] = when.getTime();
        }
      }
      if (earliestTime === null || when.getTime() < earliestTime) earliestTime = when.getTime();
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
      var ta = nearestTime[a] == null ? Infinity : nearestTime[a];
      var tb = nearestTime[b] == null ? Infinity : nearestTime[b];
      var byDate = ta - tb;
      if (byDate) return byDate;
      return String(a).localeCompare(String(b), "ru");
    });
    var rows = [];
    if (latestTime === null) return { columns: columns, rows: rows };
    var start = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate());
    if (earliestTime !== null && earliestTime < start.getTime()) start = new Date(earliestTime);
    var cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
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
      var days = daysUntil(cursor, today0);
      rows.push({
        label: stored ? stored.label : dayLabel(cursor),
        weekday: weekdayName(cursor),
        weekend: isWeekend(cursor),
        time: cursor.getTime(),
        href: dayPageHref(cursor.getDate(), cursor.getMonth()),
        week: week,
        weekLabel: weekLabel(week),
        days: days,
        whenText: relativeParen(days),
        past: days < 0,
        cells: cells,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { columns: columns, rows: rows };
  }

  /** `/den/?d=17-9` — day and 1-based month, matching the day page. */
  function dayPageKey(day, monthIndex) {
    return String(day) + "-" + String(monthIndex + 1);
  }

  function dayPageHref(day, monthIndex) {
    return "/den/?d=" + dayPageKey(day, monthIndex);
  }

  function formatDayLabel(day, monthIndex) {
    return day + " " + (MONTH_NAMES[monthIndex] || "");
  }

  /**
   * «На 20 октября, Пт» plus the parenthetical «(Вчера)» / «(Через 27 дней)».
   * `base` is the outline text; `full` is the heading.
   */
  function controlDateLabel(day, monthIndex, today) {
    var today0 = startOfDay(today || moscowToday());
    var when = resolveUpcomingDate(day, monthIndex, today0);
    var days = daysUntil(when, today0);
    var whenText = relativeParen(days);
    var weekday = weekdayName(when);
    var base = "На " + formatDayLabel(day, monthIndex) + ", " + weekday;
    return {
      weekday: weekday,
      whenText: whenText,
      days: days,
      past: days < 0,
      base: base,
      full: base + " (" + whenText + ")",
      href: dayPageHref(day, monthIndex),
    };
  }

  function parseDayPageKey(value) {
    var match = String(value || "").match(/^(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    var day = parseInt(match[1], 10);
    var monthNumber = parseInt(match[2], 10);
    if (day < 1 || day > 31 || monthNumber < 1 || monthNumber > 12) return null;
    return {
      day: day,
      month: monthNumber - 1,
      key: String(day) + "-" + String(monthNumber),
    };
  }

  function normalizeTaskLabel(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  /**
   * Identity of one checkbox, shared by the control-form note and the day page.
   * `month` is 0-based. `index` counts checkbox items for that day in the note.
   */
  function taskStorageKey(typeName, subjectName, month, day, index, label) {
    return [
      "dg-task",
      String(typeName),
      String(subjectName),
      String(month),
      String(day),
      String(index),
      normalizeTaskLabel(label),
    ].join("\u001f");
  }

  var TASK_STORAGE_KEY = "dg-task-checks";
  var EMPTY_DAY_TEXT = "На этот день ничего не задано!";
  var taskWatchInstalled = false;

  function readTaskChecks() {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return {};
      var raw = localStorage.getItem(TASK_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (err) {
      return {};
    }
  }

  function writeTaskCheck(id, checked) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return;
      var all = readTaskChecks();
      if (checked) all[id] = 1;
      else delete all[id];
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(all));
    } catch (err) {
      // Private mode and blocked storage leave the checkbox working for this visit.
    }
  }

  function paintTaskCheckbox(box, checked) {
    if (!box) return;
    box.checked = !!checked;
    var li = box.closest ? box.closest("li") : null;
    if (li && li.setAttribute) li.setAttribute("data-task", checked ? "x" : " ");
  }

  function refreshTaskCheckboxes() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    var checks = readTaskChecks();
    var nodes = document.querySelectorAll("input[data-task-id]");
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute("data-task-id");
      paintTaskCheckbox(nodes[i], !!checks[id]);
    }
  }

  function installTaskWatch() {
    if (taskWatchInstalled || typeof window === "undefined" || !window.addEventListener) return;
    taskWatchInstalled = true;
    window.addEventListener("storage", function (event) {
      if (!event || event.key !== TASK_STORAGE_KEY) return;
      refreshTaskCheckboxes();
    });
  }

  function armTaskCheckbox(box, id) {
    if (!box || !id) return;
    box.disabled = false;
    if (box.removeAttribute) box.removeAttribute("disabled");
    box.setAttribute("data-task-id", id);
    paintTaskCheckbox(box, !!readTaskChecks()[id]);
    if (box.getAttribute("data-dg-task-bound") === "1") return;
    box.setAttribute("data-dg-task-bound", "1");
    box.addEventListener("change", function () {
      writeTaskCheck(id, !!box.checked);
      paintTaskCheckbox(box, !!box.checked);
    });
  }

  function syncControlOutline(root) {
    if (typeof document === "undefined" || !document.querySelectorAll || !root || !root.querySelectorAll) return;
    var tocLinks = document.querySelectorAll("#page-panel .toc-container a[href^='#']");
    if (!tocLinks || !tocLinks.length) return;
    var heads = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (var i = 0; i < heads.length; i++) {
      var el = heads[i];
      var link = el.querySelector && el.querySelector("a.dg-deadline-date-link");
      if (!link || !el.id) continue;
      var hash = "#" + el.id;
      for (var t = 0; t < tocLinks.length; t++) {
        if (tocLinks[t].getAttribute("href") === hash) tocLinks[t].textContent = link.textContent;
      }
    }
  }

  /**
   * Turn «На 20 октября» into «На 20 октября, Пт (Вчера)». The date is a link
   * to that day. The parenthetical stays out of the right-hand outline.
   */
  function applyControlHeadings(root, today) {
    if (!root || !root.querySelectorAll || typeof document === "undefined" || !document.createElement) return;
    var heads = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (var i = 0; i < heads.length; i++) {
      var el = heads[i];
      var parsed = parseDateHeading(elementHeadingText(el));
      if (!parsed) continue;
      var info = controlDateLabel(parsed.day, parsed.month, today);
      var anchors = el.querySelectorAll(".header-anchor");
      var saved = [];
      for (var a = 0; a < anchors.length; a++) saved.push(anchors[a]);
      while (el.firstChild) el.removeChild(el.firstChild);
      var link = document.createElement("a");
      link.className = "dg-deadline-date-link";
      link.href = info.href;
      link.textContent = info.base;
      el.appendChild(link);
      var rel = document.createElement("span");
      rel.className = "dg-deadline-rel";
      rel.textContent = " (" + info.whenText + ")";
      el.appendChild(rel);
      for (var s = 0; s < saved.length; s++) el.appendChild(saved[s]);
    }
    syncControlOutline(root);
  }

  function elementHeadingText(el) {
    if (!el) return "";
    var text = el.textContent || "";
    if (!el.querySelectorAll) return text;
    var anchors = el.querySelectorAll(".header-anchor");
    if (!anchors || !anchors.length) return text;
    for (var i = 0; i < anchors.length; i++) {
      var extra = anchors[i].textContent || "";
      if (extra) text = text.replace(extra, "");
    }
    return text;
  }

  /**
   * Enable the task checkboxes under «На <дата>» headings and keep each one
   * in local storage. The day page uses the same key, so a tick survives
   * navigation between the file and the date.
   */
  function bindControlTaskChecks(root, identity) {
    if (!root || !root.children || !identity || !identity.typeName || !identity.subjectName) return;
    installTaskWatch();
    var counts = {};
    var current = null;
    var children = [];
    for (var n = 0; n < root.children.length; n++) children.push(root.children[n]);
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = (el.tagName || "").toUpperCase();
      if (/^H[1-6]$/.test(tag)) {
        current = parseDateHeading(elementHeadingText(el));
        continue;
      }
      if (!current || !el.querySelectorAll) continue;
      var boxes = el.querySelectorAll("input[type=checkbox]");
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        var li = box.closest ? box.closest("li") : null;
        var label = normalizeTaskLabel(li ? li.textContent : "");
        var countKey = current.month + ":" + current.day;
        var index = counts[countKey] || 0;
        counts[countKey] = index + 1;
        armTaskCheckbox(
          box,
          taskStorageKey(identity.typeName, identity.subjectName, current.month, current.day, index, label)
        );
      }
    }
  }

  function appendDayBlocks(section, blocks, seq) {
    var list = null;
    var listKind = "";
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i] || {};
      var kind = block.kind === "task" ? "task" : "note";
      if (!list || listKind !== kind) {
        list = document.createElement("ul");
        list.className = kind === "task" ? "task-list" : "dg-day-notes";
        listKind = kind;
        section.appendChild(list);
      }
      var li = document.createElement("li");
      if (kind === "task") {
        li.className = "task-list-item";
        var box = document.createElement("input");
        box.type = "checkbox";
        box.className = "task-list-item-checkbox";
        var boxId = "dg-day-task-" + seq.n;
        seq.n += 1;
        box.id = boxId;
        li.appendChild(box);
        var caption = document.createElement("label");
        caption.setAttribute("for", boxId);
        caption.innerHTML = block.html || "";
        li.appendChild(caption);
        list.appendChild(li);
        armTaskCheckbox(box, block.id);
      } else {
        li.innerHTML = block.html || "";
        list.appendChild(li);
      }
    }
  }

  /**
   * Fill the day page: either the empty sentence, or one heading per
   * subject and control type with that day's checkboxes.
   */
  function renderDayPage(root, catalog, query, titleEl, today) {
    if (!root || typeof document === "undefined" || !document.createElement) return;
    installTaskWatch();
    var parsed = parseDayPageKey(query);
    var heading = parsed ? controlDateLabel(parsed.day, parsed.month, today) : null;
    var title = heading ? heading.full : "День";
    if (titleEl) {
      titleEl.textContent = title;
      if (titleEl.setAttribute) titleEl.setAttribute("data-dg-outline-title", heading ? heading.base : title);
    }
    document.title = title;
    root.textContent = "";
    var entry = parsed && catalog ? catalog[parsed.key] : null;
    var groups = entry && entry.groups;
    if (!groups || !groups.length) {
      var empty = document.createElement("p");
      empty.className = "dg-day-empty";
      empty.textContent = EMPTY_DAY_TEXT;
      root.appendChild(empty);
      return;
    }
    var seq = { n: 0 };
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var section = document.createElement("section");
      section.className = "dg-day-group";
      var heading = document.createElement("h2");
      heading.id = "dg-day-" + g;
      heading.textContent = group.title || "";
      section.appendChild(heading);
      appendDayBlocks(section, group.blocks || [], seq);
      root.appendChild(section);
    }
  }

  return {
    moscowToday: moscowToday,
    parseDateHeading: parseDateHeading,
    resolveUpcomingDate: resolveUpcomingDate,
    daysUntil: daysUntil,
    relativeSuffix: relativeSuffix,
    relativePhrase: relativePhrase,
    relativeParen: relativeParen,
    controlDateLabel: controlDateLabel,
    applyControlHeadings: applyControlHeadings,
    nearestAdjective: nearestAdjective,
    academicWeekNumber: academicWeekNumber,
    buildDeadlineTable: buildDeadlineTable,
    isPastControlDate: isPastControlDate,
    markPastControlSections: markPastControlSections,
    pickControlDeadlines: pickControlDeadlines,
    dayPageKey: dayPageKey,
    dayPageHref: dayPageHref,
    formatDayLabel: formatDayLabel,
    parseDayPageKey: parseDayPageKey,
    normalizeTaskLabel: normalizeTaskLabel,
    taskStorageKey: taskStorageKey,
    readTaskChecks: readTaskChecks,
    writeTaskCheck: writeTaskCheck,
    bindControlTaskChecks: bindControlTaskChecks,
    renderDayPage: renderDayPage,
    emptyDayText: EMPTY_DAY_TEXT,
  };
})();

if (typeof module === "object" && module.exports) {
  module.exports = dgDeadlinesApi;
}
