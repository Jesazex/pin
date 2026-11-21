/**
 * Which sidebar folders stay open across page loads.
 *
 * Following a link reveals the folders that contain that note. That reveal
 * is not remembered: the next page closes it and opens the new path.
 * A folder stays open only after the reader opens it themselves.
 * Alpine persist reads the folder keys at init, so call the sync before Alpine.
 * Keep this file free of Node APIs.
 */
var DG_USER_OPEN_FOLDERS_KEY = "dg-user-open-folders";

function dgReadUserOpenFolders(storage) {
  var raw = dgStorageGet(storage, DG_USER_OPEN_FOLDERS_KEY);
  var list;
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    list = [];
  }
  var open = {};
  if (!Array.isArray(list)) return open;
  var i;
  for (i = 0; i < list.length; i++) {
    if (typeof list[i] === "string" && list[i]) open[list[i]] = true;
  }
  return open;
}

function dgWriteUserOpenFolders(storage, userOpen) {
  var list = [];
  var key;
  for (key in userOpen) {
    if (Object.prototype.hasOwnProperty.call(userOpen, key) && userOpen[key]) {
      list.push(key);
    }
  }
  list.sort();
  dgStorageSet(storage, DG_USER_OPEN_FOLDERS_KEY, JSON.stringify(list));
}

function dgStorageGet(storage, key) {
  try {
    if (!storage || !storage.getItem) return null;
    return storage.getItem(key);
  } catch (e) {
    return null;
  }
}

function dgStorageSet(storage, key, value) {
  try {
    if (!storage || !storage.setItem) return;
    storage.setItem(key, value);
  } catch (e) {}
}

function dgFolderIsUserOrAncestor(key, ancestorKeys, userOpen) {
  if (userOpen && userOpen[key]) return true;
  if (!ancestorKeys) return false;
  var i;
  for (i = 0; i < ancestorKeys.length; i++) {
    if (ancestorKeys[i] === key) return true;
  }
  return false;
}

function dgPruneUserOpenFolders(userOpen, folderKeys) {
  var known = {};
  var i;
  for (i = 0; i < folderKeys.length; i++) {
    if (folderKeys[i]) known[folderKeys[i]] = true;
  }
  var next = {};
  var key;
  for (key in userOpen) {
    if (Object.prototype.hasOwnProperty.call(userOpen, key) && known[key]) {
      next[key] = true;
    }
  }
  return next;
}

/**
 * Write Alpine persist flags for this page.
 * `folderKeys` is every expandable folder. `ancestorKeys` are the folders
 * that contain the active note, outermost or not.
 * Returns a map of folder key to whether it should be open.
 */
function dgSyncFolderOpenState(storage, folderKeys, ancestorKeys) {
  var keys = folderKeys || [];
  var userOpen = dgPruneUserOpenFolders(dgReadUserOpenFolders(storage), keys);
  dgWriteUserOpenFolders(storage, userOpen);
  var open = {};
  var i;
  for (i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!key) continue;
    var should = dgFolderIsUserOrAncestor(key, ancestorKeys, userOpen);
    open[key] = should;
    dgStorageSet(storage, key, should ? "true" : "false");
  }
  return open;
}

function dgRememberFolderOpened(storage, key) {
  if (!key) return;
  var userOpen = dgReadUserOpenFolders(storage);
  userOpen[key] = true;
  dgWriteUserOpenFolders(storage, userOpen);
}

function dgForgetFolderOpened(storage, key) {
  if (!key) return;
  var userOpen = dgReadUserOpenFolders(storage);
  var prefix = key + "/";
  var next = {};
  var existing;
  for (existing in userOpen) {
    if (!Object.prototype.hasOwnProperty.call(userOpen, existing)) continue;
    if (existing === key || existing.indexOf(prefix) === 0) continue;
    next[existing] = true;
  }
  dgWriteUserOpenFolders(storage, next);
}

function dgApplyFolderToggle(storage, folder, isOpen, collapseNested) {
  var key = folder && folder.getAttribute ? folder.getAttribute("data-folder-key") : "";
  if (isOpen) dgRememberFolderOpened(storage, key);
  else dgForgetFolderOpened(storage, key);
  if (!isOpen && typeof collapseNested === "function") collapseNested(folder);
}

function dgListFolderKeys(root) {
  var keys = [];
  if (!root || !root.querySelectorAll) return keys;
  var folders = root.querySelectorAll(".inner-folder[data-folder-key]");
  var i;
  for (i = 0; i < folders.length; i++) {
    var folder = folders[i];
    if (folder.classList && folder.classList.contains("deadline-folder")) continue;
    var key = folder.getAttribute ? folder.getAttribute("data-folder-key") : "";
    if (key) keys.push(key);
  }
  return keys;
}

function dgAncestorFolderKeys(active) {
  var keys = [];
  var node = active ? active.parentElement : null;
  while (node) {
    if (
      node.classList &&
      node.classList.contains("inner-folder") &&
      !node.classList.contains("deadline-folder")
    ) {
      var key = node.getAttribute ? node.getAttribute("data-folder-key") : "";
      if (key) keys.push(key);
    }
    node = node.parentElement;
  }
  return keys;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DG_USER_OPEN_FOLDERS_KEY: DG_USER_OPEN_FOLDERS_KEY,
    dgReadUserOpenFolders: dgReadUserOpenFolders,
    dgSyncFolderOpenState: dgSyncFolderOpenState,
    dgRememberFolderOpened: dgRememberFolderOpened,
    dgForgetFolderOpened: dgForgetFolderOpened,
    dgApplyFolderToggle: dgApplyFolderToggle,
    dgListFolderKeys: dgListFolderKeys,
    dgAncestorFolderKeys: dgAncestorFolderKeys,
  };
}
