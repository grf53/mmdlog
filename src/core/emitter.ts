import type { CoreState } from "./types.js";

function escapeLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function emitGraph(state: CoreState): string {
  const lines: string[] = [`graph ${state.direction}`];
  for (const [, node] of state.graph.nodes) {
    lines.push(`  ${node.id}["${escapeLabel(node.label)}"]`);
  }
  for (const edge of state.graph.edges.values()) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }
  return lines.join("\n");
}

function emitSequence(state: CoreState): string {
  const lines: string[] = ["sequenceDiagram"];
  for (const [, p] of state.sequence.participants) {
    lines.push(`  participant ${p.id} as ${escapeLabel(p.label)}`);
  }
  for (const item of state.sequence.items) {
    if (item.type === "msg") {
      lines.push(`  ${item.value.from}->>${item.value.to}: ${escapeLabel(item.value.label)}`);
    } else {
      lines.push(`  ${item.value}`);
    }
  }
  return lines.join("\n");
}

function emitClass(state: CoreState): string {
  const lines: string[] = ["classDiagram"];
  for (const [id, c] of state.classDiagram.classes) {
    if (c.label === c.id) lines.push(`  class ${id}`);
    else lines.push(`  class ${id}["${escapeLabel(c.label)}"]`);
  }
  for (const [id, members] of state.classDiagram.members) {
    for (const signature of members) {
      lines.push(`  ${id} : ${signature}`);
    }
  }
  for (const r of state.classDiagram.relations) {
    const suffix = r.label ? ` : ${escapeLabel(r.label)}` : "";
    lines.push(`  ${r.from} ${r.relation} ${r.to}${suffix}`);
  }
  return lines.join("\n");
}

function emitState(state: CoreState): string {
  const lines: string[] = ["stateDiagram-v2"];
  for (const [, s] of state.stateDiagram.states) {
    if (s.label === s.id) lines.push(`  state ${s.id}`);
    else lines.push(`  state "${escapeLabel(s.label)}" as ${s.id}`);
  }
  for (const t of state.stateDiagram.transitions) {
    const suffix = t.label ? ` : ${escapeLabel(t.label)}` : "";
    lines.push(`  ${t.from} --> ${t.to}${suffix}`);
  }
  return lines.join("\n");
}

function emitEr(state: CoreState): string {
  const lines: string[] = ["erDiagram"];
  for (const [, entity] of state.erDiagram.entities) {
    lines.push(`  ${entity.id} {`);
    for (const a of entity.attributes) {
      const flags = a.keyFlags ? ` ${a.keyFlags}` : "";
      lines.push(`    ${a.typeName} ${a.name}${flags}`);
    }
    lines.push("  }");
  }
  for (const r of state.erDiagram.relations) {
    const suffix = r.label ? ` : ${escapeLabel(r.label)}` : "";
    lines.push(`  ${r.left} ${r.cardinality} ${r.right}${suffix}`);
  }
  return lines.join("\n");
}

function emitJourney(state: CoreState): string {
  const lines: string[] = ["journey"];
  for (const item of state.journey.items) lines.push(`  ${item.line}`);
  return lines.join("\n");
}

function emitGantt(state: CoreState): string {
  const lines: string[] = ["gantt"];
  for (const item of state.gantt.items) lines.push(`  ${item.line}`);
  return lines.join("\n");
}

function emitPie(state: CoreState): string {
  const lines: string[] = ["pie"];
  if (state.pie.title) lines.push(`  title ${escapeLabel(state.pie.title)}`);
  for (const v of state.pie.values) {
    lines.push(`  "${escapeLabel(v.label)}" : ${v.value}`);
  }
  return lines.join("\n");
}

function emitGitGraph(state: CoreState): string {
  const lines: string[] = ["gitGraph"];
  for (const cmd of state.gitGraph.commands) lines.push(`  ${cmd}`);
  return lines.join("\n");
}

function emitByKind(state: CoreState): string {
  switch (state.diagram) {
    case "graph":
      return emitGraph(state);
    case "sequence":
      return emitSequence(state);
    case "class":
      return emitClass(state);
    case "state":
      return emitState(state);
    case "er":
      return emitEr(state);
    case "journey":
      return emitJourney(state);
    case "gantt":
      return emitGantt(state);
    case "pie":
      return emitPie(state);
    case "gitGraph":
      return emitGitGraph(state);
    default: {
      const _never: never = state.diagram;
      throw new Error(`unsupported diagram ${_never}`);
    }
  }
}

export function emitMermaid(state: CoreState): string {
  const body = emitByKind(state);
  if (state.rawLines.length === 0) return body;
  const rawBlock = state.rawLines.map((l) => `  ${l}`).join("\n");
  return `${body}\n${rawBlock}`;
}

const DELTA_WIDTH = "2.5px";
const ADD_STYLE = { cls: "_mmdlog_new", fill: "#dcfce7", stroke: "#16a34a", text: "#166534" };
const DEL_STYLE = { cls: "_mmdlog_del", fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" };

type HighlightStyle = { cls: string; fill: string; stroke: string; text: string };

// Highlights graph elements present in `base` but absent in `other`.
function graphHighlightLines(base: CoreState, other: CoreState | null, style: HighlightStyle): string[] {
  const nodes: string[] = [];
  for (const id of base.graph.nodes.keys()) {
    if (!other || !other.graph.nodes.has(id)) nodes.push(id);
  }
  const edgeIndices: number[] = [];
  let idx = 0;
  for (const key of base.graph.edges.keys()) {
    if (!other || !other.graph.edges.has(key)) edgeIndices.push(idx);
    idx += 1;
  }
  if (nodes.length === 0 && edgeIndices.length === 0) return [];
  const lines: string[] = [
    `  classDef ${style.cls} fill:${style.fill},stroke:${style.stroke},stroke-width:${DELTA_WIDTH},color:${style.text}`
  ];
  if (nodes.length > 0) lines.push(`  class ${nodes.join(",")} ${style.cls}`);
  if (edgeIndices.length > 0) {
    lines.push(`  linkStyle ${edgeIndices.join(",")} stroke:${style.stroke},stroke-width:${DELTA_WIDTH}`);
  }
  return lines;
}

// Renders `state` with newly-added elements (vs `prev`) tinted green.
export function emitMermaidWithDelta(state: CoreState, prev: CoreState | null): string {
  const base = emitMermaid(state);
  if (state.diagram !== "graph") return base;
  const lines = graphHighlightLines(state, prev, ADD_STYLE);
  return lines.length === 0 ? base : `${base}\n${lines.join("\n")}`;
}

// Renders the pre-removal `prev` state with elements absent in `next` tinted red.
export function emitMermaidWithRemoval(prev: CoreState, next: CoreState): string {
  const base = emitMermaid(prev);
  if (prev.diagram !== "graph") return base;
  const lines = graphHighlightLines(prev, next, DEL_STYLE);
  return lines.length === 0 ? base : `${base}\n${lines.join("\n")}`;
}
