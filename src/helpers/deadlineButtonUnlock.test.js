import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DG_DEADLINES_BUTTON_KEY,
  dgDeadlineQueryUnlocks,
  dgDeadlinesButtonUnlocked,
  dgRememberDeadlinesButton,
} from "./deadlineButtonUnlock.js";

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

describe("deadlines button unlock", () => {
  it("stays locked until the search is remembered", () => {
    const storage = memoryStorage();
    expect(dgDeadlinesButtonUnlocked(storage)).toBe(false);
    expect(dgDeadlinesButtonUnlocked(memoryStorage({ [DG_DEADLINES_BUTTON_KEY]: "0" }))).toBe(
      false
    );
    dgRememberDeadlinesButton(storage);
    expect(storage.getItem(DG_DEADLINES_BUTTON_KEY)).toBe("1");
    expect(dgDeadlinesButtonUnlocked(storage)).toBe(true);
  });

  it("leaves a blocked store alone", () => {
    const storage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(dgDeadlinesButtonUnlocked(storage)).toBe(false);
    expect(() => dgRememberDeadlinesButton(storage)).not.toThrow();
    expect(dgDeadlinesButtonUnlocked(null)).toBe(false);
    expect(() => dgRememberDeadlinesButton(null)).not.toThrow();
  });

  it("matches the folder name in any case", () => {
    expect(dgDeadlineQueryUnlocks("Дедлайны", "Дедлайны")).toBe(true);
    expect(dgDeadlineQueryUnlocks("дедлайны", "Дедлайны")).toBe(true);
    expect(dgDeadlineQueryUnlocks("ДЕДЛАЙНЫ", "Дедлайны")).toBe(true);
    expect(dgDeadlineQueryUnlocks("  дедлайны  ", "Дедлайны")).toBe(true);
  });

  it("ignores a different query and an unnamed folder", () => {
    expect(dgDeadlineQueryUnlocks("дедлайн", "Дедлайны")).toBe(false);
    expect(dgDeadlineQueryUnlocks("мои дедлайны", "Дедлайны")).toBe(false);
    expect(dgDeadlineQueryUnlocks("", "Дедлайны")).toBe(false);
    expect(dgDeadlineQueryUnlocks("Дедлайны", "")).toBe(false);
    expect(dgDeadlineQueryUnlocks("Дедлайны", null)).toBe(false);
    expect(dgDeadlineQueryUnlocks(null, "Дедлайны")).toBe(false);
  });

  it("runs the inlined browser bundle without Node globals", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, "deadlineButtonUnlock.js"), "utf8");
    const clientSource = source.replace(/\nif \(typeof module === "object"[\s\S]*$/, "\n");
    const userUtils = fs.readFileSync(path.join(here, "userUtils.js"), "utf8");
    expect(userUtils).toContain('readFileSync(path.join(__dirname, "deadlineButtonUnlock.js")');
    expect(userUtils).toContain("deadlineButtonSource");
    const sandbox = {};
    vm.runInNewContext(
      clientSource +
        "\nthis.api = { dgDeadlineQueryUnlocks: dgDeadlineQueryUnlocks, dgRememberDeadlinesButton: dgRememberDeadlinesButton, dgDeadlinesButtonUnlocked: dgDeadlinesButtonUnlocked };",
      sandbox
    );
    expect(sandbox.module).toBeUndefined();
    const storage = memoryStorage();
    expect(sandbox.api.dgDeadlineQueryUnlocks("дедлайны", "Дедлайны")).toBe(true);
    expect(sandbox.api.dgDeadlinesButtonUnlocked(storage)).toBe(false);
    sandbox.api.dgRememberDeadlinesButton(storage);
    expect(sandbox.api.dgDeadlinesButtonUnlocked(storage)).toBe(true);
  });
});
