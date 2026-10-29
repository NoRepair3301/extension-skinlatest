import type { RegionRole, SummaryCounts } from "../core/types.ts";

export const NODE_CAP = 15000;
export const MAX_REGIONS = 40;

/** Elements that are never entered. */
const SKIP = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);
/** Elements that are counted but whose children are not walked. */
const OPAQUE = new Set(["svg", "canvas", "video", "audio", "object", "embed", "iframe", "select", "datalist", "picture"]);
const TABLE_PARTS = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"]);
const SECTIONING = new Set(["article", "section", "aside", "nav", "main"]);
const NO_GROUP_CONTAINER = new Set([...TABLE_PARTS, "select", "datalist", "optgroup", "dl", "svg", "picture", "p", "button", "a"]);
const NO_GROUP_MEMBER = new Set(["option", "optgroup", "br", "hr", "source", "tr", "td", "th", "script", "style"]);

export interface ScanNode {
  el: Element;
  depth: number;
  parent: number;
}

export interface Scan {
  tooLarge: boolean;
  visited: number;
  nodes: ScanNode[];
  shadowCount: number;
}

/** One pass over the body in document order. Stops as soon as more than `cap` elements have been entered. */
export function scan(doc: Document, cap: number = NODE_CAP): Scan {
  const root = doc.body ?? doc.documentElement;
  const nodes: ScanNode[] = [];
  let visited = 0;
  let shadowCount = 0;
  const stack: Array<{ el: Element; idx: number; depth: number; next: number }> = [{ el: root, idx: -1, depth: -1, next: 0 }];
  while (stack.length > 0) {
    const f = stack[stack.length - 1]!;
    const child = f.el.children[f.next++];
    if (!child) {
      stack.pop();
      continue;
    }
    const name = child.localName;
    if (SKIP.has(name) || child.hasAttribute("data-skinly-ui")) continue;
    visited++;
    if (visited > cap) return { tooLarge: true, visited, nodes, shadowCount };
    const idx = nodes.length;
    nodes.push({ el: child, depth: f.depth + 1, parent: f.idx });
    if (child.shadowRoot) shadowCount++;
    if (!OPAQUE.has(name)) stack.push({ el: child, idx, depth: f.depth + 1, next: 0 });
  }
  return { tooLarge: false, visited, nodes, shadowCount };
}

export function countElements(s: Scan): SummaryCounts {
  const c: SummaryCounts = { nodes: s.nodes.length, links: 0, forms: 0, tables: 0, images: 0, headings: 0, iframes: 0 };
  for (const { el } of s.nodes) {
    const n = el.localName;
    if (n === "a" && el.hasAttribute("href")) c.links++;
    else if (n === "form") c.forms++;
    else if (n === "table") c.tables++;
    else if (n === "img") c.images++;
    else if (/^h[1-6]$/.test(n)) c.headings++;
    else if (n === "iframe") c.iframes++;
  }
  return c;
}

export interface Stats {
  textLen: number;
  linkTextLen: number;
  links: number;
  elements: number;
  images: number;
  buttons: number;
}

const isButton = (el: Element): boolean => {
  const n = el.localName;
  if (n === "button") return true;
  if (n === "input") return /^(button|submit|reset)$/i.test(el.getAttribute("type") ?? "");
  return (el.getAttribute("role") ?? "").toLowerCase() === "button";
};

/** Subtree statistics. Only text lengths are read; no text is kept. */
export function computeStats(s: Scan): Stats[] {
  const n = s.nodes.length;
  const stats: Stats[] = [];
  const inLink: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const { el, parent } = s.nodes[i]!;
    const link = el.localName === "a" && el.hasAttribute("href");
    const within = link || (parent >= 0 && inLink[parent] === true);
    inLink.push(within);
    let len = 0;
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3) len += (c.nodeValue ?? "").trim().length;
    stats.push({
      textLen: len,
      linkTextLen: within ? len : 0,
      links: link ? 1 : 0,
      elements: 1,
      images: el.localName === "img" ? 1 : 0,
      buttons: isButton(el) ? 1 : 0,
    });
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = s.nodes[i]!.parent;
    if (p < 0) continue;
    const a = stats[p]!;
    const b = stats[i]!;
    a.textLen += b.textLen;
    a.linkTextLen += b.linkTextLen;
    a.links += b.links;
    a.elements += b.elements;
    a.images += b.images;
    a.buttons += b.buttons;
  }
  return stats;
}

export interface RegionNode {
  id: string;
  idx: number;
  el: Element;
  role: RegionRole;
  tag: string;
  childCount: number;
  linkCount: number;
  depth: number;
  priority: number;
}

const BASE_PRIORITY: Record<RegionRole, number> = {
  main: 100,
  nav: 90,
  "card-list": 86,
  "link-list": 85,
  header: 80,
  table: 75,
  footer: 70,
  form: 65,
  aside: 60,
  heading: 30,
  "button-group": 40,
  section: 35,
  other: 10,
};

export const rolePriority = (role: RegionRole): number => BASE_PRIORITY[role];

interface Candidate {
  idx: number;
  role: RegionRole;
  priority: number;
}

const classSet = (el: Element): Set<string> => new Set((el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const shapeOf = (el: Element): string[] => Array.from(el.children, (c) => c.localName).slice(0, 8);

const shapeSimilar = (a: string[], b: string[]): boolean => {
  if (a.length === 0 && b.length === 0) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const pool = [...b];
  let hit = 0;
  for (const t of a) {
    const k = pool.indexOf(t);
    if (k >= 0) {
      pool.splice(k, 1);
      hit++;
    }
  }
  return hit / Math.max(a.length, b.length) >= 0.6;
};

interface Cluster {
  classes: Set<string>;
  shape: string[];
  members: number[];
}

/** Largest cluster of sibling elements that share tag, class signature and child shape, as node indexes. */
function repeatedGroup(byEl: Map<Element, number>, el: Element): number[] {
  if (el.children.length < 4) return [];
  const byTag = new Map<string, Cluster[]>();
  for (const child of Array.from(el.children)) {
    const idx = byEl.get(child);
    const tag = child.localName;
    if (idx === undefined || NO_GROUP_MEMBER.has(tag)) continue;
    const cl = classSet(child);
    const shape = shapeOf(child);
    const clusters = byTag.get(tag) ?? [];
    const home = clusters.find((c) => jaccard(c.classes, cl) >= 0.5 && shapeSimilar(c.shape, shape));
    if (home) home.members.push(idx);
    else clusters.push({ classes: cl, shape, members: [idx] });
    byTag.set(tag, clusters);
  }
  let best: number[] = [];
  for (const clusters of byTag.values()) for (const c of clusters) if (c.members.length > best.length) best = c.members;
  return best.length >= 4 ? best : [];
}

function tableQualifies(el: Element): boolean {
  const rows = el.querySelectorAll("tr");
  if (rows.length < 3) return false;
  let cols = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) cols = Math.max(cols, rows[i]!.children.length);
  return cols >= 2 && el.querySelector("th, thead") !== null;
}

const ROLE_ATTR: Record<string, RegionRole> = {
  banner: "header",
  navigation: "nav",
  main: "main",
  complementary: "aside",
  contentinfo: "footer",
  form: "form",
  region: "section",
};

/** Finds regions: landmarks, headings, forms, tables, button groups and repeated groups. Deterministic. */
export function detectRegions(s: Scan, stats: Stats[]): RegionNode[] {
  const byEl = new Map<Element, number>();
  s.nodes.forEach((n, i) => byEl.set(n.el, i));
  const inSectioning: boolean[] = [];
  const cands: Candidate[] = [];

  s.nodes.forEach(({ el, parent }, i) => {
    const pn = parent >= 0 ? s.nodes[parent]!.el.localName : "";
    inSectioning.push((parent >= 0 && inSectioning[parent] === true) || SECTIONING.has(pn));
    const tag = el.localName;
    const roleAttr = (el.getAttribute("role") ?? "").toLowerCase();
    let role: RegionRole | null = null;
    let bonus = 0;

    if (tag === "table") {
      if (tableQualifies(el)) role = "table";
    } else if (ROLE_ATTR[roleAttr] && !TABLE_PARTS.has(tag)) {
      role = ROLE_ATTR[roleAttr]!;
    } else if (tag === "header" || tag === "footer") {
      if (!inSectioning[i]) role = tag;
    } else if (tag === "nav" || tag === "main" || tag === "aside" || tag === "form") {
      role = tag;
    } else if (tag === "section") {
      if (el.children.length > 0) role = "section";
    } else if (tag === "h1" || tag === "h2" || tag === "h3") {
      role = "heading";
      bonus = tag === "h1" ? 20 : tag === "h2" ? 5 : 0;
    }

    if ((role === null || role === "section") && !NO_GROUP_CONTAINER.has(tag)) {
      const members = repeatedGroup(byEl, el);
      if (members.length >= 4) {
        const meaningful = members.filter((m) => {
          const st = stats[m]!;
          return st.textLen > 0 || st.images > 0 || st.elements > 1;
        });
        if (meaningful.length >= 4) {
          const linky = members.filter((m) => {
            const st = stats[m]!;
            return st.links >= 1 && st.elements <= 6 && (st.textLen === 0 || st.linkTextLen / st.textLen >= 0.6);
          });
          role = linky.length / members.length >= 0.75 ? "link-list" : "card-list";
          bonus = Math.min(10, members.length);
        }
      }
    }
    if (role === null && !isButton(el) && tag !== "a" && !TABLE_PARTS.has(tag) && el.children.length >= 2) {
      const kids = Array.from(el.children);
      const buttons = kids.filter(isButton).length;
      if (buttons >= 2 && buttons / kids.length >= 0.75) role = "button-group";
    }
    if (role !== null) cands.push({ idx: i, role, priority: BASE_PRIORITY[role] + bonus });
  });

  const kept = [...cands].sort((a, b) => b.priority - a.priority || a.idx - b.idx).slice(0, MAX_REGIONS);
  kept.sort((a, b) => a.idx - b.idx);
  return kept.map((c, k) => {
    const node = s.nodes[c.idx]!;
    return {
      id: `r${k + 1}`,
      idx: c.idx,
      el: node.el,
      role: c.role,
      tag: node.el.localName,
      childCount: node.el.children.length,
      linkCount: stats[c.idx]!.links,
      depth: node.depth,
      priority: c.priority,
    };
  });
}
