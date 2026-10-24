/**
 * Vertical ink of a tile label, shared by the page script.
 * The box is the line of letters that do not stick out of it:
 * no diacritics (Й), no ascenders (б), no descenders (р).
 * A capital in the name selects the capital line (В), otherwise
 * the lowercase line (а). Keep this file free of Node APIs.
 */
function dgCoreLabelInk(text, measure) {
  var chars = Array.from(String(text || "")).filter(isLabelLetter);
  var useUpper = false;
  var i;
  for (i = 0; i < chars.length; i++) {
    if (isLabelUpper(chars[i])) {
      useUpper = true;
      break;
    }
  }
  var flat = measure(useUpper ? "В" : "а");
  var candidates = [];
  for (i = 0; i < chars.length; i++) {
    var ch = chars[i];
    if (isLabelUpper(ch) !== useUpper) continue;
    if (hasLabelDiacritic(ch)) continue;
    candidates.push(ch);
  }
  if (!flat || !(flat.ascent > 0)) {
    return tightestInk(candidates, measure);
  }
  var slackA = Math.max(flat.ascent * 0.08, 0.6);
  var slackD = Math.max(flat.ascent * 0.08, 0.6);
  var ascents = [];
  var descents = [];
  for (i = 0; i < candidates.length; i++) {
    var box = measure(candidates[i]);
    if (!box || !(box.ascent > 0)) continue;
    if (Math.abs(box.ascent - flat.ascent) <= slackA) ascents.push(box.ascent);
    if (Math.abs(box.descent - flat.descent) <= slackD) descents.push(box.descent);
  }
  return {
    ascent: ascents.length ? medianInk(ascents) : flat.ascent,
    descent: descents.length ? medianInk(descents) : flat.descent,
  };
}

function isLabelLetter(ch) {
  return /\p{L}/u.test(ch);
}

function isLabelUpper(ch) {
  var upper = ch.toLocaleUpperCase("ru");
  var lower = ch.toLocaleLowerCase("ru");
  return upper !== lower && ch === upper;
}

function hasLabelDiacritic(ch) {
  return /\p{M}/u.test(ch.normalize("NFD"));
}

function tightestInk(chars, measure) {
  var ascent = Infinity;
  var descent = Infinity;
  for (var i = 0; i < chars.length; i++) {
    var box = measure(chars[i]);
    if (!box || !(box.ascent > 0)) continue;
    if (box.ascent < ascent) ascent = box.ascent;
    if (box.descent < descent) descent = box.descent;
  }
  if (!isFinite(ascent) || !(ascent > 0)) return null;
  if (!isFinite(descent) || descent < 0) descent = 0;
  return { ascent: ascent, descent: descent };
}

function medianInk(values) {
  var sorted = values.slice().sort(function (a, b) {
    return a - b;
  });
  var mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

if (typeof module === "object" && module.exports) {
  module.exports = { dgCoreLabelInk: dgCoreLabelInk };
}
