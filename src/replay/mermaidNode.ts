import { JSDOM } from "jsdom";

interface MermaidApi {
  initialize: (config: unknown) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_FONT_SIZE = 16;
const LINE_HEIGHT_RATIO = 1.2;

const CHAR_WIDTH_EM: Record<string, number> = {
  " ": 0.28, "\t": 0.56,
  i: 0.28, l: 0.22, I: 0.28, j: 0.28, "!": 0.28, "|": 0.22,
  ".": 0.25, ",": 0.25, ":": 0.25, ";": 0.25, "'": 0.20, "`": 0.30, "\"": 0.36,
  f: 0.30, t: 0.32, r: 0.36, "(": 0.30, ")": 0.30, "[": 0.30, "]": 0.30, "{": 0.30, "}": 0.30,
  "-": 0.33, _: 0.50, "/": 0.30, "\\": 0.30,
  m: 0.83, w: 0.72, M: 0.83, W: 0.92, "@": 0.92, "%": 0.83
};

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function readNumber(value: string | null): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function readStyleNumber(style: string | null, prop: string): number | null {
  if (!style) return null;
  const m = style.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)\\s*(?:px)?`, "i"));
  return m ? parseFloat(m[1]) : null;
}

function effectiveFontSize(el: Element): number {
  let cur: Element | null = el;
  while (cur) {
    const styleSize = readStyleNumber(cur.getAttribute("style"), "font-size");
    if (styleSize) return styleSize;
    const attrSize = readNumber(cur.getAttribute("font-size"));
    if (attrSize) return attrSize;
    cur = cur.parentElement;
  }
  return DEFAULT_FONT_SIZE;
}

function charWidthEm(ch: string): number {
  const explicit = CHAR_WIDTH_EM[ch];
  if (explicit !== undefined) return explicit;
  const code = ch.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return 0.50;
  if (code >= 0x41 && code <= 0x5a) return 0.65;
  if (code >= 0x61 && code <= 0x7a) return 0.52;
  if (code >= 0xac00 && code <= 0xd7a3) return 1.0;
  if (code >= 0x4e00 && code <= 0x9fff) return 1.0;
  if (code >= 0x3040 && code <= 0x30ff) return 1.0;
  if (code < 0x20) return 0;
  return 0.55;
}

function measureLine(line: string, fontSize: number): number {
  let total = 0;
  for (const ch of line) total += charWidthEm(ch) * fontSize;
  return total;
}

function textBBox(el: Element): BBox {
  const raw = el.textContent ?? "";
  const fontSize = effectiveFontSize(el);
  if (!raw.trim()) return { x: 0, y: 0, width: 0, height: fontSize };
  const lines = raw.split(/\r?\n/);
  let maxWidth = 0;
  for (const line of lines) {
    const w = measureLine(line, fontSize);
    if (w > maxWidth) maxWidth = w;
  }
  return {
    x: 0,
    y: 0,
    width: Math.max(maxWidth, fontSize * 0.3),
    height: Math.max(lines.length, 1) * fontSize * LINE_HEIGHT_RATIO
  };
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const m = transform.match(/translate\(\s*([\d.\-eE]+)[,\s]+([\d.\-eE]+)?\s*\)/);
  if (m) return { x: parseFloat(m[1]), y: m[2] ? parseFloat(m[2]) : 0 };
  const single = transform.match(/translate\(\s*([\d.\-eE]+)\s*\)/);
  if (single) return { x: parseFloat(single[1]), y: 0 };
  return { x: 0, y: 0 };
}

function pathBBox(d: string): BBox | null {
  const nums = d.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = parseFloat(nums[i]);
    const y = parseFloat(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function shapeBBox(el: Element): BBox | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "path") {
    const d = el.getAttribute("d");
    if (!d) return null;
    return pathBBox(d);
  }
  if (tag === "rect") {
    const x = readNumber(el.getAttribute("x")) ?? 0;
    const y = readNumber(el.getAttribute("y")) ?? 0;
    const width = readNumber(el.getAttribute("width")) ?? 0;
    const height = readNumber(el.getAttribute("height")) ?? 0;
    return { x, y, width, height };
  }
  if (tag === "circle") {
    const cx = readNumber(el.getAttribute("cx")) ?? 0;
    const cy = readNumber(el.getAttribute("cy")) ?? 0;
    const r = readNumber(el.getAttribute("r")) ?? 0;
    return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  }
  if (tag === "ellipse") {
    const cx = readNumber(el.getAttribute("cx")) ?? 0;
    const cy = readNumber(el.getAttribute("cy")) ?? 0;
    const rx = readNumber(el.getAttribute("rx")) ?? 0;
    const ry = readNumber(el.getAttribute("ry")) ?? 0;
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  if (tag === "line") {
    const x1 = readNumber(el.getAttribute("x1")) ?? 0;
    const y1 = readNumber(el.getAttribute("y1")) ?? 0;
    const x2 = readNumber(el.getAttribute("x2")) ?? 0;
    const y2 = readNumber(el.getAttribute("y2")) ?? 0;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(parseFloat);
    if (pts.length < 2) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return null;
}

function unionBBox(a: BBox, b: BBox): BBox {
  if (a.width === 0 && a.height === 0) return b;
  if (b.width === 0 && b.height === 0) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function bboxFor(el: Element): BBox {
  const tag = el.tagName.toLowerCase();
  if (tag === "text" || tag === "tspan") return textBBox(el);
  if (tag === "foreignobject") {
    const w = readNumber(el.getAttribute("width"));
    const h = readNumber(el.getAttribute("height"));
    if (w && h) return { x: 0, y: 0, width: w, height: h };
    return textBBox(el);
  }
  const shape = shapeBBox(el);
  if (shape) return shape;

  let acc: BBox = { x: 0, y: 0, width: 0, height: 0 };
  for (const child of Array.from(el.children)) {
    const childBox = bboxFor(child);
    const { x: tx, y: ty } = parseTranslate(child.getAttribute("transform"));
    const shifted: BBox = {
      x: childBox.x + tx,
      y: childBox.y + ty,
      width: childBox.width,
      height: childBox.height
    };
    acc = unionBBox(acc, shifted);
  }
  return acc;
}

const DEFAULT_VIEWPORT_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 800;

function installLayoutPolyfill(win: Record<string, unknown>): void {
  const classes = ["Element", "HTMLElement", "SVGElement"];
  for (const name of classes) {
    const cls = win[name] as { prototype: Record<string, unknown> } | undefined;
    if (!cls || !cls.prototype) continue;
    const proto = cls.prototype;

    const defineGetter = (key: string, get: () => number): void => {
      try {
        Object.defineProperty(proto, key, { get, configurable: true });
      } catch {
        // ignore — some props are non-overridable
      }
    };

    defineGetter("clientWidth", () => DEFAULT_VIEWPORT_WIDTH);
    defineGetter("clientHeight", () => DEFAULT_VIEWPORT_HEIGHT);
    defineGetter("offsetWidth", () => DEFAULT_VIEWPORT_WIDTH);
    defineGetter("offsetHeight", () => DEFAULT_VIEWPORT_HEIGHT);
    defineGetter("scrollWidth", () => DEFAULT_VIEWPORT_WIDTH);
    defineGetter("scrollHeight", () => DEFAULT_VIEWPORT_HEIGHT);

    proto.getBoundingClientRect = function getBoundingClientRect(this: Element) {
      let b: BBox | null = null;
      const self = this as unknown as { getBBox?: () => BBox };
      if (typeof self.getBBox === "function") {
        try {
          b = self.getBBox();
        } catch {
          b = null;
        }
      }
      if (b && (b.width > 0 || b.height > 0)) {
        return {
          x: b.x,
          y: b.y,
          top: b.y,
          left: b.x,
          right: b.x + b.width,
          bottom: b.y + b.height,
          width: b.width,
          height: b.height
        };
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: DEFAULT_VIEWPORT_WIDTH,
        bottom: DEFAULT_VIEWPORT_HEIGHT,
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
      };
    };
  }
}

function installBBoxPolyfill(win: { SVGElement: { prototype: object } }): void {
  const proto = win.SVGElement.prototype as Record<string, unknown>;
  if (typeof proto.getBBox === "function") return;
  proto.getBBox = function getBBox(this: Element) {
    return bboxFor(this);
  };
  if (typeof proto.getComputedTextLength !== "function") {
    proto.getComputedTextLength = function getComputedTextLength(this: Element) {
      return measureLine(textOf(this), effectiveFontSize(this));
    };
  }
  if (typeof proto.getCTM !== "function") {
    proto.getCTM = function getCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }
  if (typeof proto.getScreenCTM !== "function") {
    proto.getScreenCTM = function getScreenCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }
}

let cached: MermaidApi | null = null;

async function getMermaid(): Promise<MermaidApi> {
  if (cached) return cached;

  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/"
  });

  const g = globalThis as unknown as Record<string, unknown>;
  const define = (key: string, value: unknown): void => {
    try {
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      g[key] = value;
    }
  };

  const w = dom.window as unknown as Record<string, unknown>;
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLCanvasElement",
    "HTMLImageElement",
    "HTMLDivElement",
    "HTMLSpanElement",
    "SVGElement",
    "SVGSVGElement",
    "SVGGraphicsElement",
    "Node",
    "Element",
    "DocumentFragment",
    "Text",
    "DOMParser",
    "XMLSerializer",
    "CSSStyleSheet",
    "CSSRule",
    "MutationObserver",
    "Event",
    "CustomEvent",
    "requestAnimationFrame",
    "cancelAnimationFrame"
  ];
  for (const key of keys) {
    if (w[key] !== undefined) {
      define(key, w[key]);
    }
  }
  define("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));

  installBBoxPolyfill(dom.window);
  installLayoutPolyfill(dom.window as unknown as Record<string, unknown>);

  const mod = (await import("mermaid")) as { default: MermaidApi };
  const mermaid = mod.default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    theme: "default",
    htmlLabels: false,
    flowchart: { useMaxWidth: false, htmlLabels: false, curve: "linear" },
    class: { useMaxWidth: false, htmlLabels: false },
    state: { useMaxWidth: false, htmlLabels: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    er: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    gitGraph: { useMaxWidth: false }
  });

  cached = mermaid;
  return mermaid;
}

let counter = 0;

// mermaid wraps text labels in <switch><foreignObject>HTML</foreignObject><text>fallback</text></switch>.
// resvg-js (usvg) doesn't render foreignObject HTML and mishandles the switch fallback selection,
// so we strip foreignObject elements outright to leave the SVG <text> fallback visible.
function stripForeignObjects(svg: string): string {
  return svg.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/g, "");
}

// Brace-aware CSS rule iterator. Skips @-rules (with potentially nested braces) and yields
// only top-level CSSStyleRules. jsdom's CSSOM doesn't parse <style> blocks embedded in SVG
// so we extract and walk the CSS text manually.
function* parseCssStyleRules(css: string): Iterable<{ selectors: string; decls: string }> {
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (i >= css.length) break;
    if (css[i] === "@") {
      while (i < css.length && css[i] !== "{" && css[i] !== ";") i += 1;
      if (i >= css.length) break;
      if (css[i] === ";") { i += 1; continue; }
      // @-rule with a block — skip the entire balanced block.
      i += 1;
      let depth = 1;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") depth -= 1;
        i += 1;
      }
      continue;
    }
    const selStart = i;
    while (i < css.length && css[i] !== "{") i += 1;
    if (i >= css.length) break;
    const selectors = css.slice(selStart, i).trim();
    i += 1;
    const declStart = i;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      if (depth > 0) i += 1;
    }
    const decls = css.slice(declStart, i).trim();
    i += 1;
    if (selectors && decls) yield { selectors, decls };
  }
}

// resvg-js does not apply CSS rules inside <style> blocks for non-trivial selectors
// (attribute, class, ID-prefixed). Convert each style rule to an inline `style="…"`
// attribute on its matching elements so the rasterizer renders them correctly.
async function inlineEmbeddedStyles(svg: string): Promise<string> {
  if (!svg.includes("<style")) return svg;
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!DOCTYPE html><body>${svg}</body>`);
  const doc = dom.window.document;
  const styleEls = Array.from(doc.querySelectorAll("style"));
  for (const styleEl of styleEls) {
    const cssText = styleEl.textContent ?? "";
    if (!cssText.trim()) continue;
    for (const { selectors, decls } of parseCssStyleRules(cssText)) {
      try {
        doc.body.querySelectorAll(selectors).forEach((el) => {
          // mermaid's <text> fallback assumes non-CSS renderers, so element XML
          // presentation attributes (e.g. fill="#191970" on a section rect) carry the
          // intended value. Skip per-property if the element already declares it as
          // an XML attribute — only fill in CSS for properties without an XML value.
          const filtered = decls
            .split(";")
            .map((d) => d.trim())
            .filter(Boolean)
            .filter((d) => {
              const colon = d.indexOf(":");
              if (colon < 0) return false;
              const prop = d.slice(0, colon).trim().toLowerCase();
              if (!el.hasAttribute(prop)) return true;
              const attrVal = (el.getAttribute(prop) ?? "").trim().toLowerCase();
              // Treat placeholder values ("", "none", "undefined") as "no value" so
              // the CSS class rule can supply the real value mermaid intends.
              return attrVal === "" || attrVal === "none" || attrVal === "undefined";
            });
          if (filtered.length === 0) return;
          const cur = el.getAttribute("style") ?? "";
          const sep = cur && !cur.trim().endsWith(";") ? ";" : "";
          el.setAttribute("style", `${cur}${sep}${filtered.join(";")}`);
        });
      } catch {
        // selector unsupported by jsdom — skip
      }
    }
  }
  // Overlay rules to repair gaps in mermaid's SVG fallback. mermaid expects browsers
  // to render labels via <foreignObject> HTML; once we strip those, the leftover
  // <text> elements inherit no readable color in some diagrams. Force visible text.
  const overlayCss = `
    text.task { fill: #ECECFF; }
  `;
  for (const { selectors, decls } of parseCssStyleRules(overlayCss)) {
    try {
      doc.body.querySelectorAll(selectors).forEach((el) => {
        const cur = el.getAttribute("style") ?? "";
        const sep = cur && !cur.trim().endsWith(";") ? ";" : "";
        el.setAttribute("style", `${cur}${sep}${decls}`);
      });
    } catch {
      // ignore
    }
  }
  // Remove the original <style> block so usvg doesn't re-apply class rules
  // (it does honor class selectors) and undo the XML-attribute preservation above.
  styleEls.forEach((el) => el.remove());
  // Unwrap `<switch>` elements — after foreignObject stripping they only carry the
  // SVG `<text>` fallback, but the wrapper hides the text from sibling traversal /
  // CSS adjacency selectors. Replace each switch with its children inline.
  doc.body.querySelectorAll("switch").forEach((sw) => {
    const parent = sw.parentNode;
    if (!parent) return;
    while (sw.firstChild) parent.insertBefore(sw.firstChild, sw);
    parent.removeChild(sw);
  });
  // Downgrade `orient="auto-start-reverse"` (SVG2) to `orient="auto"` since usvg
  // doesn't recognize the SVG2 value and falls back to no rotation, causing
  // arrowheads on right-to-left lines to point the wrong way. This is a usvg
  // compatibility fix — needed for plain rendering too.
  doc.body.querySelectorAll("marker[orient='auto-start-reverse']").forEach((m) => {
    m.setAttribute("orient", "auto");
  });
  // mermaid emits malformed inline styles like style="undefined;;;undefined;stroke:#333"
  // which causes usvg to drop the whole declaration block. Sanitize every element's
  // style so valid declarations survive.
  doc.body.querySelectorAll("[style]").forEach((el) => {
    const raw = el.getAttribute("style") ?? "";
    const cleaned = raw
      .split(";")
      .map((t) => t.trim())
      .filter((t) => t && t !== "undefined" && !t.startsWith("undefined:"))
      .join(";");
    if (cleaned !== raw) el.setAttribute("style", cleaned);
  });
  const svgEl = doc.body.querySelector("svg");
  return svgEl ? svgEl.outerHTML : svg;
}

export async function renderMermaidToSvg(code: string): Promise<string> {
  const mermaid = await getMermaid();
  counter += 1;
  const id = `mmdlog-frame-${counter}`;
  const result = await mermaid.render(id, code);
  return await inlineEmbeddedStyles(stripForeignObjects(result.svg));
}

// Highlight-only SVG hooks: marker size lock + journey task tagging. Skipped for
// plain (no-highlight) rendering so those frames stay closer to mermaid's output.
export async function applyHighlightHooks(svg: string): Promise<string> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!DOCTYPE html><body>${svg}</body>`);
  const doc = dom.window.document;
  // Markers default to markerUnits="strokeWidth", so highlight stroke-width bumps
  // (e.g. 4px) inflate the arrowhead. Lock to user-space units to keep markers
  // a constant size regardless of stroke-width.
  doc.body.querySelectorAll("marker").forEach((m) => {
    if (!m.hasAttribute("markerUnits")) m.setAttribute("markerUnits", "userSpaceOnUse");
  });
  // mermaid journey gives each task-line a unique id (`…-taskN`) but the
  // corresponding task rect / label text are unmarked. Tag those siblings with
  // the task index so highlight CSS can target them via `[data-mmdlog-task]`.
  doc.body.querySelectorAll("line.task-line[id]").forEach((line) => {
    const id = line.getAttribute("id") ?? "";
    const m = id.match(/-task(\d+)$/);
    if (!m) return;
    const taskIdx = m[1];
    let sibling: Element | null = line.nextElementSibling;
    let taggedRect = false;
    let taggedText = false;
    while (sibling && (!taggedRect || !taggedText)) {
      if (!taggedRect && sibling.tagName.toLowerCase() === "rect" && sibling.classList.contains("task")) {
        sibling.setAttribute("data-mmdlog-task", taskIdx);
        taggedRect = true;
      } else if (!taggedText && sibling.tagName.toLowerCase() === "text" && sibling.classList.contains("task")) {
        sibling.setAttribute("data-mmdlog-task", taskIdx);
        taggedText = true;
      } else if (sibling.tagName.toLowerCase() === "line" && sibling.classList.contains("task-line")) {
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  });
  const svgEl = doc.body.querySelector("svg");
  return svgEl ? svgEl.outerHTML : svg;
}
