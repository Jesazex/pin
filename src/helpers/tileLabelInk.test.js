import { describe, expect, it } from "vitest";
import { dgCoreLabelInk } from "./tileLabelInk.js";

// Bounds measured from the site's ui-sans-serif stack: "д" and "Ц" do
// descend, "б" and "Й" rise. Centering still follows the flat line.
const GLYPHS = {
  а: { ascent: 9, descent: 0 },
  б: { ascent: 13, descent: 0 },
  в: { ascent: 9, descent: 0 },
  г: { ascent: 9, descent: 0 },
  д: { ascent: 9, descent: 4 },
  В: { ascent: 12, descent: 0 },
  п: { ascent: 9, descent: 0 },
  р: { ascent: 9, descent: 4 },
  о: { ascent: 9, descent: 0 },
  л: { ascent: 9, descent: 0 },
  ж: { ascent: 9, descent: 0 },
  Й: { ascent: 16, descent: 0 },
  Ц: { ascent: 12, descent: 4 },
  У: { ascent: 12, descent: 0 },
  К: { ascent: 12, descent: 0 },
  Е: { ascent: 12, descent: 0 },
  Н: { ascent: 12, descent: 0 },
  А: { ascent: 12, descent: 0 },
};

function measure(ch) {
  return GLYPHS[ch];
}

describe("dgCoreLabelInk", () => {
  it("centers абвгд on the flat letters, not the ascender of б", () => {
    expect(dgCoreLabelInk("абвгд", measure)).toEqual({ ascent: 9, descent: 0 });
  });

  it("centers a mixed name on the capital", () => {
    expect(dgCoreLabelInk("Вапролдж", measure)).toEqual({ ascent: 12, descent: 0 });
  });

  it("centers capitals on the cap line and ignores the breve of Й", () => {
    expect(dgCoreLabelInk("ЙЦУКЕН", measure)).toEqual({ ascent: 12, descent: 0 });
  });

  it("accepts А and rejects a lone descender or breve", () => {
    expect(dgCoreLabelInk("А", measure)).toEqual({ ascent: 12, descent: 0 });
    expect(dgCoreLabelInk("р", measure)).toEqual({ ascent: 9, descent: 0 });
    expect(dgCoreLabelInk("Й", measure)).toEqual({ ascent: 12, descent: 0 });
  });
});
