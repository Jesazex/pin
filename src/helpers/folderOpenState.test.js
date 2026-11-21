import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DG_USER_OPEN_FOLDERS_KEY,
  dgAncestorFolderKeys,
  dgApplyFolderToggle,
  dgForgetFolderOpened,
  dgListFolderKeys,
  dgRememberFolderOpened,
  dgSyncFolderOpenState,
} from "./folderOpenState.js";

const folders = [
  "Лекции",
  "Лекции/Математический анализ",
  "Лекции/Физика",
  "Лекции2",
  "Дедлайны",
  "Дедлайны/ДЗ",
];

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function userOpen(storage) {
  return JSON.parse(storage.getItem(DG_USER_OPEN_FOLDERS_KEY) || "[]");
}

describe("folder open state", () => {
  it("closes a section the previous lecture opened and opens the new path", () => {
    const storage = memoryStorage({
      "Лекции": "true",
      "Лекции/Математический анализ": "true",
    });
    const open = dgSyncFolderOpenState(storage, folders, [
      "Лекции/Физика",
      "Лекции",
    ]);
    expect(open["Лекции/Математический анализ"]).toBe(false);
    expect(storage.getItem("Лекции/Математический анализ")).toBe("false");
    expect(storage.getItem("Лекции/Физика")).toBe("true");
    expect(storage.getItem("Лекции")).toBe("true");
    expect(storage.getItem("Дедлайны")).toBe("false");
    expect(userOpen(storage)).toEqual([]);
  });

  it("closes the revealed section on the home note, then opens the next link", () => {
    const storage = memoryStorage({});
    dgSyncFolderOpenState(storage, folders, [
      "Лекции",
      "Лекции/Математический анализ",
    ]);
    expect(storage.getItem("Лекции/Математический анализ")).toBe("true");

    dgSyncFolderOpenState(storage, folders, []);
    expect(storage.getItem("Лекции")).toBe("false");
    expect(storage.getItem("Лекции/Математический анализ")).toBe("false");

    dgSyncFolderOpenState(storage, folders, ["Лекции", "Лекции/Физика"]);
    expect(storage.getItem("Лекции/Физика")).toBe("true");
    expect(storage.getItem("Лекции/Математический анализ")).toBe("false");
    expect(userOpen(storage)).toEqual([]);
  });

  it("keeps a folder the reader opened after they leave that page", () => {
    const storage = memoryStorage({});
    dgRememberFolderOpened(storage, "Дедлайны");
    dgSyncFolderOpenState(storage, folders, ["Лекции", "Лекции/Физика"]);
    expect(storage.getItem("Дедлайны")).toBe("true");
    expect(storage.getItem("Дедлайны/ДЗ")).toBe("false");
    expect(storage.getItem("Лекции/Физика")).toBe("true");
    expect(storage.getItem("Лекции/Математический анализ")).toBe("false");
    expect(userOpen(storage)).toEqual(["Дедлайны"]);
  });

  it("forgets nested folders when the reader closes the parent", () => {
    const storage = memoryStorage({});
    dgRememberFolderOpened(storage, "Дедлайны");
    dgRememberFolderOpened(storage, "Дедлайны/ДЗ");
    dgRememberFolderOpened(storage, "Лекции");
    dgRememberFolderOpened(storage, "Лекции2");
    const collapsed = [];
    dgApplyFolderToggle(
      storage,
      { getAttribute: () => "Дедлайны" },
      false,
      (folder) => collapsed.push(folder.getAttribute("data-folder-key"))
    );
    expect(collapsed).toEqual(["Дедлайны"]);
    expect(userOpen(storage)).toEqual(["Лекции", "Лекции2"]);
    dgForgetFolderOpened(storage, "Лекции");
    expect(userOpen(storage)).toEqual(["Лекции2"]);
    dgSyncFolderOpenState(storage, folders, []);
    expect(storage.getItem("Дедлайны")).toBe("false");
    expect(storage.getItem("Дедлайны/ДЗ")).toBe("false");
    expect(storage.getItem("Лекции")).toBe("false");
    expect(storage.getItem("Лекции2")).toBe("true");
  });

  it("records a folder the reader opens and does not collapse it", () => {
    const storage = memoryStorage({});
    let collapsed = false;
    dgApplyFolderToggle(
      storage,
      { getAttribute: () => "Лекции" },
      true,
      () => {
        collapsed = true;
      }
    );
    expect(collapsed).toBe(false);
    expect(userOpen(storage)).toEqual(["Лекции"]);
  });

  it("drops remembered folders that are no longer in the tree", () => {
    const storage = memoryStorage({});
    dgRememberFolderOpened(storage, "Старая");
    dgRememberFolderOpened(storage, "");
    dgSyncFolderOpenState(storage, folders, []);
    expect(userOpen(storage)).toEqual([]);
  });

  it("ignores a corrupt remembered-folder list", () => {
    const storage = memoryStorage({
      [DG_USER_OPEN_FOLDERS_KEY]: "{nope",
    });
    dgSyncFolderOpenState(storage, folders, ["Дедлайны"]);
    expect(storage.getItem("Дедлайны")).toBe("true");
    expect(userOpen(storage)).toEqual([]);
  });

  it("reads ancestor folders from the active note and skips deadline rows", () => {
    const scroll = { parentElement: null, classList: { contains: () => false } };
    const lectures = folderEl(["inner-folder"], "Лекции", scroll);
    const physics = folderEl(["inner-folder"], "Лекции/Физика", lectures);
    const deadline = folderEl(
      ["inner-folder", "deadline-folder"],
      "Дедлайны/ДЗ",
      lectures
    );
    expect(dgAncestorFolderKeys({ parentElement: physics })).toEqual([
      "Лекции/Физика",
      "Лекции",
    ]);
    expect(dgAncestorFolderKeys({ parentElement: deadline })).toEqual(["Лекции"]);
    expect(dgAncestorFolderKeys(null)).toEqual([]);
    expect(
      dgListFolderKeys({
        querySelectorAll(selector) {
          expect(selector).toBe(".inner-folder[data-folder-key]");
          return [
            folderEl(["inner-folder"], "Лекции"),
            folderEl(["inner-folder", "deadline-folder"], "Дедлайны/Таблица"),
            folderEl(["inner-folder"], ""),
          ];
        },
      })
    ).toEqual(["Лекции"]);
  });

  it("runs the inlined browser bundle without Node globals", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, "folderOpenState.js"), "utf8");
    const clientSource = source.replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");
    const userUtils = fs.readFileSync(path.join(here, "userUtils.js"), "utf8");
    expect(userUtils).toContain('readFileSync(path.join(__dirname, "folderOpenState.js")');
    expect(userUtils).toContain("folderOpenSource");
    const sandbox = {};
    vm.runInNewContext(
      clientSource +
        "\nthis.api = { dgSyncFolderOpenState: dgSyncFolderOpenState };",
      sandbox
    );
    expect(sandbox.module).toBeUndefined();
    const storage = memoryStorage({ "Лекции/Математический анализ": "true" });
    sandbox.api.dgSyncFolderOpenState(storage, folders, []);
    expect(storage.getItem("Лекции/Математический анализ")).toBe("false");
  });
});

function folderEl(classes, key, parent) {
  return {
    classList: {
      contains(name) {
        return classes.indexOf(name) !== -1;
      },
    },
    getAttribute(name) {
      return name === "data-folder-key" ? key : null;
    },
    parentElement: parent || null,
  };
}
