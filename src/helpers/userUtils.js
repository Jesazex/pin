const fs = require("fs");
const path = require("path");
const {
  getControlDeadlineCandidates,
  pickControlDeadlines,
  controlNoteIdentity,
  getControlSubjects,
  activeDeadlinesFolder,
} = require("./deadlinesUtils");
const { lectureDownloadFromStem } = require("./filetreeUtils");

const deadlinesClientSource = fs
  .readFileSync(path.join(__dirname, "deadlinesCore.js"), "utf8")
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
    deadlinesClientSource,
  };
}

exports.userComputed = userComputed;
exports.deadlinesClientSource = deadlinesClientSource;
exports.jsonForInlineScript = jsonForInlineScript;
