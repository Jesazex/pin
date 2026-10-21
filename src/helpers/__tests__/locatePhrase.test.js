import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

const templatePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugins",
  "dg-search",
  "templates",
  "searchContainer.njk"
);
const template = fs.readFileSync(templatePath, "utf8");
const start = template.indexOf("function normalizePhrase");
const end = template.indexOf("// Tags rendered by the core");
const sandbox = {};
vm.runInNewContext(template.slice(start, end), sandbox);

describe("locatePhrase", () => {
  it("scrolls to the heading title when the phrase is also in earlier text", () => {
    const located = sandbox.locatePhrase(
      {
        title: "Физика 1103",
        content: "законы Ньютона",
        sections: [
          { id: "", text: "", body: "Тема: Динамика, законы Ньютона" },
          { id: "zakony-nyutona", text: "Законы Ньютона и границы их применимости", body: "" },
          { id: "vtoroj-zakon-nyutona", text: "Второй закон Ньютона", body: "сила" },
        ],
      },
      "ньютона"
    );
    expect(located.inHeading).toBe(true);
    expect(located.matchId).toBe("zakony-nyutona");
  });

  it("scrolls to the section heading when the phrase is only in its text", () => {
    const located = sandbox.locatePhrase(
      {
        title: "Физика 1104",
        content: "релятивистским импульсом",
        sections: [
          {
            id: "dinamika-materialnoj-tochki-i-impulsnaya-forma",
            text: "Динамика материальной точки и импульсная форма",
            body: "связь с релятивистским импульсом",
          },
        ],
      },
      "релятивистским импульсом"
    );
    expect(located.inHeading).toBe(false);
    expect(located.matchId).toBe("dinamika-materialnoj-tochki-i-impulsnaya-forma");
  });

  it("does not treat the file name as a heading", () => {
    const located = sandbox.locatePhrase(
      {
        title: "Физика 1102",
        content: "",
        sections: [{ id: "tema", text: "Кинематика", body: "скорость" }],
      },
      "физика"
    );
    expect(located.inHeading).toBe(false);
    expect(located.matchId).toBe("");
  });

  it("uses the body section when the file name also contains the phrase", () => {
    const located = sandbox.locatePhrase(
      {
        title: "Физика 1101",
        content: "Савельев. Физика",
        sections: [
          { id: "uchebnaya-literatura", text: "Учебная литература", body: "Савельев. Физика" },
        ],
      },
      "физика"
    );
    expect(located.inHeading).toBe(false);
    expect(located.matchId).toBe("uchebnaya-literatura");
  });

  it("omits a file that does not contain the phrase", () => {
    expect(
      sandbox.locatePhrase(
        { title: "Матан 1101", content: "предел", sections: [] },
        "ньютона"
      )
    ).toBeNull();
  });
});

describe("keyboard layout search", () => {
  const docs = [
    {
      title: "Оценка",
      url: "/error",
      content: "оценка погрешности измерения",
      sections: [{ id: "err", text: "Погрешность", body: "оценка погрешности измерения" }],
      tags: ["note"],
    },
    {
      title: "Латиница",
      url: "/latin",
      content: "строка gjuhtiyjcnm в тексте",
      sections: [{ id: "lat", text: "Заметка", body: "строка gjuhtiyjcnm в тексте" }],
      tags: [],
    },
    {
      title: "Другое",
      url: "/other",
      content: "ничего похожего",
      sections: [{ id: "x", text: "Другое", body: "ничего похожего" }],
      tags: [],
    },
  ];

  it("maps a query typed in the other layout", () => {
    expect(sandbox.swapLayout("gjuhtiyjcnm")).toBe("погрешность");
    expect(sandbox.swapLayout("Погрешность")).toBe("Gjuhtiyjcnm");
    expect(sandbox.phraseVariants("gjuhtiyjcnm")).toEqual(["gjuhtiyjcnm", "погрешность"]);
  });

  it("lists matches in the typed layout before the swapped layout", () => {
    sandbox.window = { docs };
    const typedLatin = sandbox.offlineSearch("gjuhtiyjcnm").map((doc) => doc.url);
    expect(typedLatin).toEqual(["/latin", "/error"]);

    const typedRussian = sandbox.offlineSearch("погрешность").map((doc) => doc.url);
    expect(typedRussian).toEqual(["/error", "/latin"]);
    expect(sandbox.offlineSearch("погрешность")[0].matchId).toBe("err");
  });

  it("keeps a file that matches both layouts once, in the typed group", () => {
    sandbox.window = {
      docs: [
        {
          title: "Оба",
          url: "/both",
          content: "погрешность и gjuhtiyjcnm",
          sections: [{ id: "both", text: "Оба", body: "погрешность и gjuhtiyjcnm" }],
          tags: [],
        },
      ],
    };
    expect(sandbox.offlineSearch("gjuhtiyjcnm")).toHaveLength(1);
  });
});
