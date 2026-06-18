import type { CoreState, HighlightedEmit, SequenceItem } from "./types.js";

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
const FOCUS_STYLE = { fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12" };

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

function sequenceItemsEqual(a: SequenceItem, b: SequenceItem): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "msg" && b.type === "msg") {
    return a.value.from === b.value.from && a.value.to === b.value.to && a.value.label === b.value.label;
  }
  if (a.type === "raw" && b.type === "raw") {
    return a.value === b.value;
  }
  return false;
}

// Returns indices in `base.items` of items absent from `other.items` (multiset-aware).
function sequenceItemDiff(base: SequenceItem[], other: SequenceItem[] | null): number[] {
  if (!other) return base.map((_, i) => i);
  const used = new Set<number>();
  const diff: number[] = [];
  for (let i = 0; i < base.length; i += 1) {
    let matched = -1;
    for (let j = 0; j < other.length; j += 1) {
      if (used.has(j)) continue;
      if (sequenceItemsEqual(base[i], other[j])) { matched = j; break; }
    }
    if (matched === -1) diff.push(i);
    else used.add(matched);
  }
  return diff;
}

// Mermaid skips config-like items (autonumber, activate/deactivate, etc.) when
// numbering message/note ids — its `iN` counter only advances on renderable items.
function isSequenceConfigItem(item: SequenceItem): boolean {
  if (item.type !== "raw") return false;
  const c = item.value.trim().toLowerCase();
  return (
    c.startsWith("autonumber") ||
    c.startsWith("activate") ||
    c.startsWith("deactivate") ||
    c.startsWith("link ") ||
    c.startsWith("links ") ||
    c.startsWith("properties ") ||
    c.startsWith("title ")
  );
}

// CSS injected after mermaid renders the sequence SVG. Uses mermaid's data-id attributes.
function sequenceHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const participants: string[] = [];
  for (const id of base.sequence.participants.keys()) {
    if (!other || !other.sequence.participants.has(id)) participants.push(id);
  }
  const itemIndices = sequenceItemDiff(base.sequence.items, other ? other.sequence.items : null);
  // First visible step after silent participant declarations — viewer sees the
  // participants for the first time, so treat them as freshly introduced.
  // (Matches the same intent as journey's "section's first task triggers section
  // highlight" rule when sections are declared silently.)
  const isFirstVisibleStep = !other || other.sequence.items.length === 0;
  if (isFirstVisibleStep) {
    for (const id of base.sequence.participants.keys()) {
      if (!participants.includes(id)) participants.push(id);
    }
  }
  if (participants.length === 0 && itemIndices.length === 0) return "";
  // Map state-items index → mermaid's iN id, skipping config-like items.
  const iNumber = new Map<number, number>();
  let counter = 1;
  base.sequence.items.forEach((item, idx) => {
    if (isSequenceConfigItem(item)) return;
    iNumber.set(idx, counter);
    counter += 1;
  });
  const rules: string[] = [];
  for (const id of participants) {
    rules.push(`[data-id="${id}"] rect.actor{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`line.actor-line[data-id="${id}"]{stroke:${style.stroke}!important;stroke-width:2px!important}`);
    rules.push(`[data-id="${id}"] text.actor>tspan{fill:${style.text}!important}`);
  }
  for (const i of itemIndices) {
    const n = iNumber.get(i);
    if (n === undefined) continue; // config item — no rendered element to tint
    const sel = `[data-id="i${n}"]`;
    // Thick stroke + glow filter so the line stands out at GIF resolution.
    rules.push(
      `${sel}.messageLine0,${sel}.messageLine1{stroke:${style.stroke}!important;stroke-width:6px!important;filter:drop-shadow(0 0 3px ${style.stroke})!important}`
    );
    rules.push(`${sel} rect.note{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`${sel} text.noteText,${sel} text.noteText>tspan{fill:${style.text}!important;font-weight:bold!important}`);
    // The message label `<text class="messageText">` is the PRECEDING sibling of
    // the line in mermaid SVG, so we use :has() to color it from the line side.
    rules.push(`text.messageText:has(+${sel}){fill:${style.text}!important;font-weight:bold!important;font-size:1.1em!important}`);
  }
  return rules.join("");
}

function isClassMethod(signature: string): boolean {
  return signature.includes("(");
}

function classDiagramHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const c = base.classDiagram;
  const o = other ? other.classDiagram : null;
  const addedClasses = new Set<string>();
  for (const id of c.classes.keys()) {
    if (!o || !o.classes.has(id)) addedClasses.add(id);
  }
  // Per-member highlights for existing classes
  const memberHl: { classId: string; isMethod: boolean; idx: number }[] = [];
  for (const [classId, members] of c.members) {
    if (!c.classes.has(classId) || addedClasses.has(classId)) continue;
    const oldMembers = o?.members.get(classId) ?? [];
    let fieldIdx = 0;
    let methodIdx = 0;
    for (const sig of members) {
      const method = isClassMethod(sig);
      const isNew = !oldMembers.includes(sig);
      if (isNew) memberHl.push({ classId, isMethod: method, idx: method ? methodIdx : fieldIdx });
      if (method) methodIdx += 1;
      else fieldIdx += 1;
    }
  }
  const addedRelations: { from: string; to: string }[] = [];
  for (const r of c.relations) {
    const inOther = o?.relations.some(
      (x) => x.from === r.from && x.to === r.to && x.relation === r.relation && x.label === r.label
    );
    if (!inOther) addedRelations.push(r);
  }
  // Raw passthrough lines that the parser couldn't structure (cardinality-style
  // relations like `User "1" --o "*" Order : places`, or `note for X "..."`) still
  // produce SVG edges/notes — heuristically detect those and emit highlight rules.
  const oldRaw = new Set(o ? other!.rawLines : []);
  const rawEdges: { from: string; to: string }[] = [];
  const rawNotes: string[] = []; // class id the note is attached to
  for (const line of base.rawLines) {
    if (oldRaw.has(line)) continue;
    const noteMatch = line.match(/^\s*note\s+for\s+(\w[\w-]*)/i);
    if (noteMatch) {
      rawNotes.push(noteMatch[1]);
      continue;
    }
    // Class relation: optional quoted cardinality before/after the arrow.
    const relMatch = line.match(/^\s*(\w[\w-]*)\s*(?:"[^"]*"\s*)?(?:--|\.\.)\S*\s*(?:"[^"]*"\s*)?(\w[\w-]*)/);
    if (relMatch) rawEdges.push({ from: relMatch[1], to: relMatch[2] });
  }
  if (
    addedClasses.size === 0 &&
    memberHl.length === 0 &&
    addedRelations.length === 0 &&
    rawEdges.length === 0 &&
    rawNotes.length === 0
  ) {
    return "";
  }
  const rules: string[] = [];
  for (const id of addedClasses) {
    const sel = `[id*="-classId-${id}-"]`;
    rules.push(`${sel} rect.basic{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`${sel} .label-group text{fill:${style.text}!important}`);
  }
  for (const { classId, isMethod, idx } of memberHl) {
    const group = isMethod ? "methods-group" : "members-group";
    const sel = `[id*="-classId-${classId}-"] g.${group}>g.label:nth-of-type(${idx + 1})`;
    rules.push(`${sel} text,${sel} tspan{fill:${style.text}!important;font-weight:bold!important}`);
  }
  for (const r of [...addedRelations, ...rawEdges]) {
    const sel = `[data-id^="id_${r.from}_${r.to}_"]`;
    rules.push(
      `path${sel}{stroke:${style.stroke}!important;stroke-width:4px!important;fill:none!important}`
    );
    rules.push(`${sel} text{fill:${style.text}!important;font-weight:bold!important}`);
  }
  // Notes render as `<g id="…-noteN"><g class="outer-path"><path …></g></g>`.
  // mermaid doesn't expose the target class in the id; tint every note (typically
  // there's at most one new note per flash event, and stale ones would have
  // already been tinted in their own flash frame).
  if (rawNotes.length > 0) {
    rules.push(
      `[id*="-note"] g.outer-path>path{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    rules.push(`[id*="-note"] text,[id*="-note"] tspan{fill:${style.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function stateDiagramHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const s = base.stateDiagram;
  const o = other ? other.stateDiagram : null;
  const addedStates: string[] = [];
  for (const id of s.states.keys()) {
    if (!o || !o.states.has(id)) addedStates.push(id);
  }
  const addedTransitionIdx: number[] = [];
  for (let i = 0; i < s.transitions.length; i += 1) {
    const t = s.transitions[i];
    const inOther = o?.transitions.some((x) => x.from === t.from && x.to === t.to && x.label === t.label);
    if (!inOther) addedTransitionIdx.push(i);
  }
  // `+note right/left of X : ...` lines come through as raw passthrough; detect new notes.
  const oldRaw = new Set(o ? other!.rawLines : []);
  const newNoteTargets: string[] = [];
  for (const line of base.rawLines) {
    if (oldRaw.has(line)) continue;
    const m = line.match(/^\s*note\s+(?:right\s+of|left\s+of|over|above|below)\s+(\w[\w-]*)/i);
    if (m) newNoteTargets.push(m[1]);
  }
  if (
    addedStates.length === 0 &&
    addedTransitionIdx.length === 0 &&
    newNoteTargets.length === 0
  ) {
    return "";
  }
  const rules: string[] = [];
  for (const id of addedStates) {
    const sel = `[id*="-state-${id}-"]`;
    rules.push(`${sel} rect.basic,${sel} rect.label-container{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`${sel} text{fill:${style.text}!important}`);
  }
  for (const idx of addedTransitionIdx) {
    rules.push(`[data-id="edge${idx}"]{stroke:${style.stroke}!important;stroke-width:2.5px!important;fill:none!important}`);
    rules.push(`g.label[data-id="edge${idx}"] text{fill:${style.text}!important;stroke:none!important}`);
  }
  // state notes render as `<g class="node statediagram-note">` with id like `…-state-X----note-N`,
  // and their body is a `<g class="outer-path"><path>` pair (no rect.basic).
  for (const target of newNoteTargets) {
    const baseSel = `g.statediagram-note[id*="-state-${target}-"]`;
    rules.push(
      `${baseSel} g.outer-path>path{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    rules.push(`${baseSel} text,${baseSel} tspan{fill:${style.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function erDiagramHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const e = base.erDiagram;
  const o = other ? other.erDiagram : null;
  // Newly added entities (whole-box tint)
  const addedEntities = new Set<string>();
  for (const id of e.entities.keys()) {
    if (!o || !o.entities.has(id)) addedEntities.add(id);
  }
  // Per-attribute additions on existing entities (row-level tint)
  const memberHl: { entityId: string; rowIdx: number }[] = [];
  for (const [id, ent] of e.entities) {
    if (addedEntities.has(id)) continue;
    const oldAttrs = o?.entities.get(id)?.attributes ?? [];
    ent.attributes.forEach((a, idx) => {
      const seen = oldAttrs.some((x) => x.name === a.name && x.typeName === a.typeName && x.keyFlags === a.keyFlags);
      if (!seen) memberHl.push({ entityId: id, rowIdx: idx });
    });
  }
  const addedRelations: { left: string; right: string }[] = [];
  for (const r of e.relations) {
    const inOther = o?.relations.some(
      (x) => x.left === r.left && x.right === r.right && x.cardinality === r.cardinality && x.label === r.label
    );
    if (!inOther) addedRelations.push(r);
  }
  if (addedEntities.size === 0 && memberHl.length === 0 && addedRelations.length === 0) return "";
  const rules: string[] = [];
  // Whole-entity tint covers both representations:
  //   - 0-attr entities render as <rect class="basic label-container">
  //   - with-attr entities render as <g class="outer-path"><path …></g> + row-rect groups
  for (const id of addedEntities) {
    const sel = `[id*="-entity-${id}-"]`;
    rules.push(
      `${sel} rect.basic,${sel} g.outer-path>path,${sel} g.row-rect-odd>path,${sel} g.row-rect-even>path{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    rules.push(`${sel} text{fill:${style.text}!important}`);
  }
  // Per-attribute tint: the Nth attribute row is the Nth row-rect group (alternating odd/even).
  for (const { entityId, rowIdx } of memberHl) {
    const baseSel = `[id*="-entity-${entityId}-"]`;
    const rowClass = rowIdx % 2 === 0 ? "row-rect-odd" : "row-rect-even";
    const nth = Math.floor(rowIdx / 2) + 1;
    // CSS lacks "Nth element of class X" — chain :nth-of-type then class filter.
    // Since outer-path is the 1st g and rows follow, the (rowIdx+2)th g sibling is the target.
    rules.push(
      `${baseSel}>g:nth-of-type(${rowIdx + 2}).${rowClass}>path{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    void nth;
  }
  for (const r of addedRelations) {
    const sel = `[data-id*="entity-${r.left}-"][data-id*="_entity-${r.right}-"]`;
    rules.push(
      `path${sel}{stroke:${style.stroke}!important;stroke-width:4px!important;fill:none!important}`
    );
    rules.push(`g${sel} text{fill:${style.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function journeyHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const j = base.journey;
  const o = other ? other.journey : null;
  // A section is "first seen" by the viewer either when it's literally added now,
  // OR when its first task is rendered (silent !+section declarations don't get
  // their own frame, so we treat the section's first task as its intro moment).
  const sectionsToHighlight = new Set<number>();
  j.sections.forEach((name, idx) => {
    if (!o || !o.sections.includes(name)) sectionsToHighlight.add(idx);
  });
  const sectionsWithTasksInPrev = new Set((o?.tasks ?? []).map((t) => t.section));
  j.sections.forEach((name, idx) => {
    if (sectionsToHighlight.has(idx)) return;
    const hasTasksNow = j.tasks.some((t) => t.section === name);
    if (hasTasksNow && !sectionsWithTasksInPrev.has(name)) sectionsToHighlight.add(idx);
  });
  const addedSectionIdx = Array.from(sectionsToHighlight);
  const addedTaskIdx: number[] = [];
  j.tasks.forEach((t, idx) => {
    const inOther = o?.tasks.some((x) => x.task === t.task && x.section === t.section && x.score === t.score);
    if (!inOther) addedTaskIdx.push(idx);
  });
  if (addedSectionIdx.length === 0 && addedTaskIdx.length === 0) return "";
  const rules: string[] = [];
  for (const idx of addedSectionIdx) {
    rules.push(`rect.journey-section.section-type-${idx}{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`text.journey-section.section-type-${idx}{fill:${style.text}!important}`);
  }
  for (const idx of addedTaskIdx) {
    // dashed task-line (vertical guide)
    rules.push(`[id*="-task${idx}"]{stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    // task rect + label — tagged by mermaidNode post-processing.
    rules.push(
      `rect[data-mmdlog-task="${idx}"]{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    rules.push(`text[data-mmdlog-task="${idx}"],text[data-mmdlog-task="${idx}"] tspan{fill:${style.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function ganttHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const g = base.gantt;
  const o = other ? other.gantt : null;
  const titleAdded = !!g.title && g.title !== (o?.title ?? "");
  const addedSectionIdx: number[] = [];
  g.sections.forEach((name, idx) => {
    if (!o || !o.sections.includes(name)) addedSectionIdx.push(idx);
  });
  // mermaid gantt meta format: `[status,] [id,] [after X | startDate,] [duration]`.
  // Skip status keywords / dates / durations / after-clauses; the remaining token is the user id.
  const TASK_STATUS = new Set(["done", "active", "crit", "milestone"]);
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s);
  const isDuration = (s: string) => /^\d+(?:\.\d+)?[a-z]+$/i.test(s);
  const isAfter = (s: string) => /^after\s+\S/.test(s);
  function extractTaskId(meta: string): string | null {
    for (const raw of meta.split(",")) {
      const tok = raw.trim();
      if (!tok || TASK_STATUS.has(tok.toLowerCase())) continue;
      if (isDate(tok) || isDuration(tok) || isAfter(tok)) continue;
      if (/^[A-Za-z_][\w-]*$/.test(tok)) return tok;
    }
    return null;
  }
  const addedTaskIds: string[] = [];
  for (const t of g.tasks) {
    const inOther = o?.tasks.some((x) => x.task === t.task && x.section === t.section && x.meta === t.meta);
    if (inOther) continue;
    const id = extractTaskId(t.meta);
    if (id) addedTaskIds.push(id);
  }
  if (!titleAdded && addedSectionIdx.length === 0 && addedTaskIds.length === 0) return "";
  const rules: string[] = [];
  if (titleAdded) rules.push(`.titleText{fill:${style.text}!important;font-weight:bold!important}`);
  for (const idx of addedSectionIdx) {
    rules.push(`rect.section.section${idx}{fill:${style.fill}!important;opacity:.5!important}`);
    rules.push(`text.sectionTitle.sectionTitle${idx}{fill:${style.text}!important;font-weight:bold!important}`);
  }
  for (const id of addedTaskIds) {
    // Bar (rect) gets a green fill + thicker green border so the highlight is visible
    // against mermaid's default done/active/crit fills.
    rules.push(
      `rect[id$="-${id}"]{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`
    );
    // Task label text (rendered alongside the bar) inherits the styled fill.
    rules.push(`text.taskText[id$="-${id}-text"],text[id$="-${id}-text"] tspan{fill:${style.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function pieHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  const p = base.pie;
  const o = other ? other.pie : null;
  const titleAdded = !!p.title && p.title !== (o?.title ?? "");
  const addedSliceIdx: number[] = [];
  p.values.forEach((v, idx) => {
    const inOther = o?.values.some((x) => x.label === v.label && x.value === v.value);
    if (!inOther) addedSliceIdx.push(idx);
  });
  if (!titleAdded && addedSliceIdx.length === 0) return "";
  const rules: string[] = [];
  if (titleAdded) rules.push(`.pieTitleText{fill:${style.text}!important;font-weight:bold!important}`);
  for (const idx of addedSliceIdx) {
    // pie slice paths are unclassed; target the percentage text and legend entry by position.
    rules.push(`text.slice:nth-of-type(${idx + 1}){fill:${style.text}!important;font-weight:bold!important}`);
    rules.push(`g.legend:nth-of-type(${idx + 1}) rect{stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
  }
  return rules.join("");
}

function gitGraphHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  // gitGraph is structurally append-only in mmdlog → only addition tinting matters.
  const oldCommands = new Set(other ? other.gitGraph.commands : []);
  const newCommits: string[] = [];
  const newBranches = new Set<string>();
  const checkouts = new Set<string>();
  let newMergeCount = 0;
  for (const cmd of base.gitGraph.commands) {
    if (oldCommands.has(cmd)) continue;
    let m: RegExpMatchArray | null = null;
    if ((m = cmd.match(/^commit\s+id:\s*"([^"]+)"/))) newCommits.push(m[1]);
    else if ((m = cmd.match(/^branch\s+(\S+)/))) newBranches.add(m[1]);
    else if ((m = cmd.match(/^checkout\s+(\S+)/))) checkouts.add(m[1]);
    else if (/^merge\s/.test(cmd)) newMergeCount += 1;
  }
  // Mermaid assigns branch index by creation order, with `main` implicitly at 0.
  const branchIdx = new Map<string, number>();
  branchIdx.set("main", 0);
  let nextIdx = 1;
  for (const cmd of base.gitGraph.commands) {
    const m = cmd.match(/^branch\s+(\S+)/);
    if (m && !branchIdx.has(m[1])) branchIdx.set(m[1], nextIdx++);
  }
  if (newCommits.length === 0 && newBranches.size === 0 && checkouts.size === 0 && newMergeCount === 0) return "";
  const rules: string[] = [];
  const branchLabelSelector = (i: number): string =>
    `g.label.branch-label${i} rect,rect.branchLabelBkg.label${i}`;
  const branchTextSelector = (i: number): string => `g.label.branch-label${i} text`;
  for (const id of newCommits) {
    rules.push(`circle.commit.${id}{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`text.commit-label.${id}{fill:${style.text}!important;font-weight:bold!important}`);
  }
  for (const name of newBranches) {
    const i = branchIdx.get(name);
    if (i === undefined) continue;
    rules.push(`${branchLabelSelector(i)}{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`${branchTextSelector(i)}{fill:${style.text}!important;font-weight:bold!important}`);
  }
  if (newMergeCount > 0) {
    // Merge commits don't carry user ids; tint by mermaid's `.commit-merge` class.
    rules.push(`circle.commit.commit-merge{fill:${style.fill}!important;stroke:${style.stroke}!important;stroke-width:2.5px!important}`);
  }
  // Checkout is a focus shift, not a structural change → yellow.
  for (const name of checkouts) {
    const i = branchIdx.get(name);
    if (i === undefined) continue;
    rules.push(`${branchLabelSelector(i)}{fill:${FOCUS_STYLE.fill}!important;stroke:${FOCUS_STYLE.stroke}!important;stroke-width:2.5px!important}`);
    rules.push(`${branchTextSelector(i)}{fill:${FOCUS_STYLE.text}!important;font-weight:bold!important}`);
  }
  return rules.join("");
}

function computeHighlightCss(base: CoreState, other: CoreState | null, style: HighlightStyle): string {
  switch (base.diagram) {
    case "sequence": return sequenceHighlightCss(base, other, style);
    case "class": return classDiagramHighlightCss(base, other, style);
    case "state": return stateDiagramHighlightCss(base, other, style);
    case "er": return erDiagramHighlightCss(base, other, style);
    case "journey": return journeyHighlightCss(base, other, style);
    case "gantt": return ganttHighlightCss(base, other, style);
    case "pie": return pieHighlightCss(base, other, style);
    case "gitGraph": return gitGraphHighlightCss(base, other, style);
    default: return "";
  }
}

function computeHighlightEmit(base: CoreState, other: CoreState | null, style: HighlightStyle): HighlightedEmit {
  const mermaid = emitMermaid(base);
  if (base.diagram === "graph") {
    const lines = graphHighlightLines(base, other, style);
    return { mermaid: lines.length === 0 ? mermaid : `${mermaid}\n${lines.join("\n")}` };
  }
  const css = computeHighlightCss(base, other, style);
  return css ? { mermaid, svgStyle: css } : { mermaid };
}

// Renders `state` with newly-added elements (vs `prev`) tinted green.
export function emitMermaidWithDelta(state: CoreState, prev: CoreState | null): HighlightedEmit {
  return computeHighlightEmit(state, prev, ADD_STYLE);
}

// Renders the pre-removal `prev` state with elements absent in `next` tinted red.
export function emitMermaidWithRemoval(prev: CoreState, next: CoreState): HighlightedEmit {
  return computeHighlightEmit(prev, next, DEL_STYLE);
}
