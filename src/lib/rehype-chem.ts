import { splitChem, splitScripts } from "@/lib/chem";

type Node = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const SKIP = new Set(["code", "pre", "script", "style", "svg"]);

const el = (tagName: string, children: Node[], className?: string): Node => ({
  type: "element",
  tagName,
  properties: className ? { className: [className] } : {},
  children,
});
const text = (value: string): Node => ({ type: "text", value });

function scripts(value: string): Node[] {
  return splitScripts(value).map((s) => (s.k === "sub" ? el("sub", [text(s.v)]) : s.k === "sup" ? el("sup", [text(s.v)]) : text(s.v)));
}

function convert(value: string): Node[] {
  const out: Node[] = [];
  for (const p of splitChem(value)) {
    if (p.chem) {
      out.push(
        el(
          "strong",
          p.segs.map((s) => (s.k === "sub" ? el("sub", [text(s.v)]) : s.k === "sup" ? el("sup", [text(s.v)]) : text(s.v))),
          "chem",
        ),
      );
    } else out.push(...scripts(p.text));
  }
  return out;
}

function walk(node: Node) {
  if (!node.children) return;
  const cls = node.properties?.className;
  const classes = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? [cls] : [];
  if ((node.tagName && SKIP.has(node.tagName)) || classes.some((c) => c.startsWith("katex"))) return;
  const next: Node[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value) next.push(...convert(child.value));
    else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** A rehype plugin: chemical formulas in the explanation text get the same bold, real sub/superscript look as in the question. */
export function rehypeChem() {
  return (tree: Node) => walk(tree);
}
