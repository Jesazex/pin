const fs = require("fs");
const path = require("path");
const {
  getControlDeadlineCandidates,
  pickControlDeadlines,
  controlNoteIdentity,
  getControlSubjects,
  activeDeadlinesFolder,
} = require("./deadlinesUtils");
const { lectureDownloadFromStem, lectureNeighbors } = require("./filetreeUtils");

const deadlinesClientSource = fs
  .readFileSync(path.join(__dirname, "deadlinesCore.js"), "utf8")
  .replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");

const tileLabelInkSource = fs
  .readFileSync(path.join(__dirname, "tileLabelInk.js"), "utf8")
  .replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");

const folderOpenSource = fs
  .readFileSync(path.join(__dirname, "folderOpenState.js"), "utf8")
  .replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");

const deadlineButtonSource = fs
  .readFileSync(path.join(__dirname, "deadlineButtonUnlock.js"), "utf8")
  .replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Put your computations here.

function userComputed(data) {
  const candidates = getControlDeadlineCandidates(data);
  const deadlinesFolder = activeDeadlinesFolder(data);
  return {
    controlDeadlines: pickControlDeadlines(candidates),
    controlDeadlineCandidatesJson: jsonForInlineScript(candidates),
    controlSubjectsJson: jsonForInlineScript(getControlSubjects(data)),
    controlNote: controlNoteIdentity(data),
    deadlinesFolder,
    insideDeadlines: Boolean(controlNoteIdentity(data)),
    lectureDownload: lectureDownloadFromStem(
      (data.page && data.page.filePathStem) || ""
    ),
    lectureNav: lectureNeighbors(data),
    deadlinesClientSource,
    tileLabelInkSource,
    folderOpenSource,
    deadlineButtonSource,
  };
}

exports.userComputed = userComputed;
exports.deadlinesClientSource = deadlinesClientSource;
exports.folderOpenSource = folderOpenSource;
exports.deadlineButtonSource = deadlineButtonSource;
exports.jsonForInlineScript = jsonForInlineScript;
