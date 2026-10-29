import { describe, expect, it } from "vitest";
import { computeStats, countElements, detectRegions, scan } from "../../src/analyzer/regions.ts";
import { dom, items } from "./helpers.ts";

const regionsOf = (body: string) => {
  const s = scan(dom(body));
  return detectRegions(s, computeStats(s));
};
const roles = (body: string) => regionsOf(body).map((r) => r.role);

describe("regions", () => {
  it("finds landmarks by tag and role", () => {
    expect(roles("<header>h</header><nav>n</nav><main>m</main><aside>a</aside><footer>f</footer>")).toEqual(["header", "nav", "main", "aside", "footer"]);
    expect(roles('<div role="banner">x</div><div role="navigation">x</div><div role="main">x</div><div role="contentinfo">x</div>')).toEqual(["header", "nav", "main", "footer"]);
  });

  it("ignores header and footer scoped inside an article", () => {
    expect(roles("<article><header>h</header><p>t</p><footer>f</footer></article>")).toEqual([]);
  });

  it("finds headings, forms and button groups", () => {
    expect(roles("<h1>a</h1><h2>b</h2><h4>c</h4><form><input></form>")).toEqual(["heading", "heading", "form"]);
    expect(roles('<div><button>a</button><button>b</button></div>')).toEqual(["button-group"]);
  });

  it("accepts tables with a header, 3 rows and 2 columns only", () => {
    const row = "<tr><td>a</td><td>b</td></tr>";
    expect(roles(`<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody>${row}${row}</tbody></table>`)).toEqual(["table"]);
    expect(roles(`<table>${row}${row}${row}</table>`)).toEqual([]);
    expect(roles(`<table><tr><th>a</th><th>b</th></tr>${row}</table>`)).toEqual([]);
    expect(roles("<table><thead><tr><th>a</th></tr></thead><tr><td>1</td></tr><tr><td>2</td></tr></table>")).toEqual([]);
  });

  it("finds a link-list from four similar link items", () => {
    expect(roles(`<div><ul>${items(5, () => '<li class="item"><a href="#">x</a></li>')}</ul></div>`)).toEqual(["link-list"]);
  });

  it("finds a card-list from four similar cards", () => {
    const card = '<div class="card"><h3>t</h3><p>some text here</p><button>go</button></div>';
    expect(roles(`<section class="grid">${items(4, () => card)}</section>`)).toEqual(["card-list", "heading", "heading", "heading", "heading"]);
  });

  it("needs at least four similar siblings", () => {
    expect(roles(`<ul>${items(3, () => '<li class="item"><a href="#">x</a></li>')}</ul>`)).toEqual([]);
    expect(roles(`<ul>${items(5, (i) => `<li class="c${i % 2 ? "x" : "y"}${i}"><a href="#">x</a></li>`)}</ul>`)).toEqual([]);
  });

  it("lets a landmark win over a repeated group on the same element", () => {
    expect(roles(`<nav>${items(6, () => '<a class="l" href="#">x</a>')}</nav>`)).toEqual(["nav"]);
  });

  it("gives ids r1..rN in document order, at most 40, deterministic", () => {
    const body = items(60, () => "<nav>n</nav>");
    const a = regionsOf(body);
    expect(a).toHaveLength(40);
    expect(a.map((r) => r.id)).toEqual(Array.from({ length: 40 }, (_, i) => `r${i + 1}`));
    expect(regionsOf(body).map((r) => r.idx)).toEqual(a.map((r) => r.idx));
  });

  it("keeps the highest-priority regions when over the cap", () => {
    const r = regionsOf(items(45, () => "<h4>x</h4><h1>y</h1>") + "<main>m</main>");
    expect(r.some((x) => x.role === "main")).toBe(true);
    expect(r).toHaveLength(40);
  });

  it("counts links in a region and children", () => {
    const [nav] = regionsOf('<nav><a href="#">a</a><a href="#">b</a><span>c</span></nav>');
    expect(nav).toMatchObject({ role: "nav", childCount: 3, linkCount: 2, depth: 0 });
  });

  it("counts elements by kind", () => {
    const s = scan(dom('<h1>a</h1><a href="#">l</a><a>no href</a><img><form></form><table></table><iframe></iframe>'));
    expect(countElements(s)).toEqual({ nodes: 7, links: 1, forms: 1, tables: 1, images: 1, headings: 1, iframes: 1 });
  });
});

describe("node cap", () => {
  it("returns too-large without scanning past the cap on a 20,000-node page", () => {
    const s = scan(dom(items(20000, () => "<i></i>")));
    expect(s.tooLarge).toBe(true);
    expect(s.visited).toBe(15001);
    expect(s.nodes.length).toBeLessThanOrEqual(15000);
  });
  it("accepts a page exactly at the cap", () => {
    const s = scan(dom(items(100, () => "<i></i>")), 100);
    expect(s.tooLarge).toBe(false);
    expect(s.visited).toBe(100);
  });
});
