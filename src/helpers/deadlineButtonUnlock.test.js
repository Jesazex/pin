import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DG_DEADLINES_BUTTON_KEY,
  DG_DEADLINES_UNLOCK_CLICKS,
  DG_DEADLINES_UNLOCK_MS,
  dgDeadlinesButtonUnlocked,
  dgNoteDeadlineUnlockClick,
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

function clickAt(times, stamps) {
  let unlocked = false;
  stamps.forEach((stamp) => {
    unlocked = dgNoteDeadlineUnlockClick(times, stamp);
  });
  return unlocked;
}

describe("deadlines button unlock", () => {
  it("stays locked until the corner gesture is remembered", () => {
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

  it("unlocks on the fifth click inside three seconds", () => {
    const times = [];
    expect(DG_DEADLINES_UNLOCK_CLICKS).toBe(5);
    expect(DG_DEADLINES_UNLOCK_MS).toBe(3000);
    expect(clickAt(times, [0, 400, 800, 1200])).toBe(false);
    expect(dgNoteDeadlineUnlockClick(times, 1600)).toBe(true);
  });

  it("counts a span of exactly three seconds", () => {
    const times = [];
    expect(clickAt(times, [0, 750, 1500, 2250])).toBe(false);
    expect(dgNoteDeadlineUnlockClick(times, 3000)).toBe(true);
  });

  it("drops clicks that fall outside the three second window", () => {
    const times = [];
    expect(clickAt(times, [0, 1000, 2000, 3000, 4000])).toBe(false);
    expect(times).toEqual([1000, 2000, 3000, 4000]);
    expect(dgNoteDeadlineUnlockClick(times, 7001)).toBe(false);
    expect(times).toEqual([7001]);
    expect(clickAt(times, [7100, 7200, 7300])).toBe(false);
    expect(dgNoteDeadlineUnlockClick(times, 7400)).toBe(true);
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
        "\nthis.api = { dgNoteDeadlineUnlockClick: dgNoteDeadlineUnlockClick, dgRememberDeadlinesButton: dgRememberDeadlinesButton, dgDeadlinesButtonUnlocked: dgDeadlinesButtonUnlocked };",
      sandbox
    );
    expect(sandbox.module).toBeUndefined();
    const storage = memoryStorage();
    const times = [];
    expect(sandbox.api.dgNoteDeadlineUnlockClick(times, 10)).toBe(false);
    sandbox.api.dgRememberDeadlinesButton(storage);
    expect(sandbox.api.dgDeadlinesButtonUnlocked(storage)).toBe(true);
  });
});
