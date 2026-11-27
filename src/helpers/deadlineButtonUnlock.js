/**
 * The deadlines button stays hidden until the reader opens the left menu
 * and clicks its bottom-left corner five times within three seconds.
 * That choice is kept in localStorage, the same store as task checkboxes,
 * and is never cleared.
 * Keep this file free of Node APIs.
 */
var DG_DEADLINES_BUTTON_KEY = "dg-deadlines-button";
var DG_DEADLINES_UNLOCK_CLICKS = 5;
var DG_DEADLINES_UNLOCK_MS = 3000;

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

/**
 * Record one corner click at `now` (ms). Drops clicks older than three
 * seconds and returns true once five remain inside that window.
 * `times` is the running list for this visit; it is mutated.
 */
function dgNoteDeadlineUnlockClick(times, now) {
  times.push(now);
  var cutoff = now - DG_DEADLINES_UNLOCK_MS;
  while (times.length && times[0] < cutoff) times.shift();
  return times.length >= DG_DEADLINES_UNLOCK_CLICKS;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DG_DEADLINES_BUTTON_KEY: DG_DEADLINES_BUTTON_KEY,
    DG_DEADLINES_UNLOCK_CLICKS: DG_DEADLINES_UNLOCK_CLICKS,
    DG_DEADLINES_UNLOCK_MS: DG_DEADLINES_UNLOCK_MS,
    dgDeadlinesButtonUnlocked: dgDeadlinesButtonUnlocked,
    dgRememberDeadlinesButton: dgRememberDeadlinesButton,
    dgNoteDeadlineUnlockClick: dgNoteDeadlineUnlockClick,
  };
}
