/**
 * The deadlines button stays hidden until the reader types the deadlines
 * folder name into search and presses Enter. Case does not matter.
 * That choice is kept in localStorage, the same store as task checkboxes,
 * and is never cleared.
 * Keep this file free of Node APIs.
 */
var DG_DEADLINES_BUTTON_KEY = "dg-deadlines-button";

function dgDeadlinesButtonUnlocked(storage) {
  try {
    if (!storage || !storage.getItem) return false;
    return storage.getItem(DG_DEADLINES_BUTTON_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function dgRememberDeadlinesButton(storage) {
  try {
    if (!storage || !storage.setItem) return;
    storage.setItem(DG_DEADLINES_BUTTON_KEY, "1");
  } catch (e) {
    // Private mode and blocked storage leave the button visible for this visit.
  }
}

function dgFoldDeadlineQuery(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

/**
 * True when the search field holds the deadlines folder name.
 * Comparison ignores case and surrounding space. A shorter or longer
 * query does not count, and an unnamed folder never matches.
 */
function dgDeadlineQueryUnlocks(query, folderName) {
  var folder = dgFoldDeadlineQuery(folderName);
  if (!folder) return false;
  return dgFoldDeadlineQuery(query) === folder;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DG_DEADLINES_BUTTON_KEY: DG_DEADLINES_BUTTON_KEY,
    dgDeadlinesButtonUnlocked: dgDeadlinesButtonUnlocked,
    dgRememberDeadlinesButton: dgRememberDeadlinesButton,
    dgDeadlineQueryUnlocks: dgDeadlineQueryUnlocks,
  };
}
