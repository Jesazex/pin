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

  it("ranks the open file, then its folder, ahead of other matches", () => {
    sandbox.window = {
      location: { pathname: "/lekczii/linejnaya-algebra/linal-1104/" },
      docs: [
        {
          title: "Другое",
          url: "/other/",
          content: "плоскость",
          sections: [{ id: "a", text: "Плоскость", body: "плоскость" }],
          tags: [],
        },
        {
          title: "Сосед тело",
          url: "/lekczii/linejnaya-algebra/linal-1105/",
          content: "плоскость в тексте",
          sections: [{ id: "b", text: "Тема", body: "плоскость в тексте" }],
          tags: [],
        },
        {
          title: "Линал 1104",
          url: "/lekczii/linejnaya-algebra/linal-1104/",
          content: "плоскость",
          sections: [{ id: "c", text: "Уравнение", body: "плоскость" }],
          tags: [],
        },
        {
          title: "Сосед заголовок",
          url: "/lekczii/linejnaya-algebra/linal-1103/",
          content: "",
          sections: [{ id: "d", text: "Плоскость", body: "" }],
          tags: [],
        },
        {
          title: "Чужой заголовок",
          url: "/fizika/fizika-1101/",
          content: "",
          sections: [{ id: "e", text: "Плоскость", body: "" }],
          tags: [],
        },
      ],
    };
    expect(sandbox.offlineSearch("плоскость").map((doc) => doc.url)).toEqual([
      "/lekczii/linejnaya-algebra/linal-1104/",
      "/lekczii/linejnaya-algebra/linal-1103/",
      "/lekczii/linejnaya-algebra/linal-1105/",
      "/other/",
      "/fizika/fizika-1101/",
    ]);
  });

  it("treats е and ё as the same letter, including the other layout", () => {
    expect(sandbox.normalizePhrase("Ёлка")).toBe("елка");
    expect(sandbox.phraseInText("ёлка у дома", "елка")).toBe(true);
    expect(sandbox.phraseInText("елка у дома", "ёлка")).toBe(true);
    expect(sandbox.swapLayout("`krf")).toBe("ёлка");
    expect(sandbox.swapLayout("tkrf")).toBe("елка");
    expect(sandbox.phraseVariants("`krf")).toEqual(["`krf", "елка"]);
    sandbox.window = {
      docs: [
        {
          title: "Теорема Кёнига",
          url: "/yo",
          content: "теорема Кёнига",
          sections: [{ id: "kenig", text: "Теорема Кёнига", body: "её формулировка" }],
          tags: [],
        },
        {
          title: "Другое",
          url: "/other",
          content: "ничего похожего",
          sections: [{ id: "x", text: "Другое", body: "ничего похожего" }],
          tags: [],
        },
      ],
    };
    expect(sandbox.offlineSearch("Кенига").map((doc) => doc.url)).toEqual(["/yo"]);
    expect(sandbox.offlineSearch("Кёнига")[0].matchId).toBe("kenig");
    expect(sandbox.offlineSearch("R`ybuf").map((doc) => doc.url)).toEqual(["/yo"]);
    expect(sandbox.offlineSearch("ее").map((doc) => doc.url)).toEqual(["/yo"]);
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

describe("search result in the open file", () => {
  it("closes the search window and moves to the heading", () => {
    const removed = [];
    sandbox.URL = URL;
    sandbox.document = {
      getElementById() {
        return { classList: { remove: (name) => removed.push(name) } };
      },
    };
    sandbox.clearSearchQuery = () => {};
    sandbox.history = {
      pushState(_state, _title, hash) {
        sandbox.window.location.hash = hash;
      },
    };
    const scrolled = [];
    sandbox.headingFromHash = (hash) => ({ id: hash });
    sandbox.scrollHeadingSmooth = (el) => scrolled.push(el);
    sandbox.window = {
      location: {
        href: "http://localhost/lekczii/fizika/fizika-1104/",
        origin: "http://localhost",
        pathname: "/lekczii/fizika/fizika-1104/",
        search: "",
        hash: "",
      },
    };
    sandbox.openSearchTarget("/lekczii/fizika/fizika-1104/#teorema-kyoniga");
    expect(removed).toContain("active");
    expect(sandbox.window.location.hash).toBe("#teorema-kyoniga");
    expect(scrolled).toEqual([{ id: "#teorema-kyoniga" }]);
    expect(sandbox.window.location.href).toBe("http://localhost/lekczii/fizika/fizika-1104/");
  });

  it("follows a result that points at another file", () => {
    let closed = false;
    sandbox.URL = URL;
    sandbox.closeSearchPanel = () => {
      closed = true;
    };
    sandbox.window = {
      location: {
        href: "http://localhost/lekczii/fizika/fizika-1104/",
        origin: "http://localhost",
        pathname: "/lekczii/fizika/fizika-1104/",
        search: "",
        hash: "",
      },
    };
    sandbox.openSearchTarget("/lekczii/fizika/fizika-1105/#teorema-kyoniga");
    expect(closed).toBe(false);
    expect(sandbox.window.location.href).toBe("/lekczii/fizika/fizika-1105/#teorema-kyoniga");
  });
});

describe("search highlight", () => {
  const highlightStart = template.indexOf("function highlightPattern");
  const highlightEnd = template.indexOf("function getContextualExcerpt");
  const highlight = {};
  vm.runInNewContext(template.slice(highlightStart, highlightEnd), highlight);

  it("does not highlight inside the markup of an earlier term", () => {
    const html = highlight.highlightTerms("Определение принципа", ["пр", "gh"]);
    expect(html).toBe(
      'О<span class="search-highlight">пр</span>еделение <span class="search-highlight">пр</span>инципа'
    );
    expect(html).not.toMatch(/search-hi</);
  });

  it("highlights е and ё as the same letter", () => {
    const html = highlight.highlightTerms("Теорема Кёнига и Кенига", ["кенига"]);
    expect(html).toBe(
      'Теорема <span class="search-highlight">Кёнига</span> и <span class="search-highlight">Кенига</span>'
    );
  });

  it("still highlights the swapped letters when they are real text", () => {
    const html = highlight.highlightTerms("high принцип", ["пр", "gh"]);
    expect(html).toBe(
      'hi<span class="search-highlight">gh</span> <span class="search-highlight">пр</span>инцип'
    );
    expect(html).not.toMatch(/search-hi</);
  });
});
