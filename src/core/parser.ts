import type {
  DiagramKind,
  MmdlogEvent,
  ParseOptions,
  ParseResult,
  SetDiagramEvent
} from "./types.js";

const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const ID_PAT = "[A-Za-z_][A-Za-z0-9_-]*";
const STATE_ID_PAT = "(?:\\[\\*\\]|[A-Za-z_][A-Za-z0-9_-]*)";
const CLASS_RELATION_RE = /^([-.o*|<>]+)$/;
const ER_REL_RE = /^[|o}{.\-]+$/;

type Op = "add" | "remove";

interface ParserContext {
  diagram: DiagramKind;
  journeySection: string;
  ganttSection: string;
}

function assertId(id: string, line: number): void {
  if (!ID_RE.test(id)) {
    throw new Error(`line ${line}: invalid id "${id}"`);
  }
}

function parseDiagram(raw: string, line: number): SetDiagramEvent {
  const match = raw.match(
    /^@diagram\s+(graph|sequence|class|state|er|journey|gantt|pie|gitGraph)(?:\s+([A-Z]{2}))?$/
  );
  if (!match) {
    throw new Error(
      `line ${line}: expected "@diagram <graph|sequence|class|state|er|journey|gantt|pie|gitGraph> [TD|LR|BT|RL]"`
    );
  }
  return {
    kind: "set_diagram",
    line,
    raw,
    diagram: match[1] as DiagramKind,
    direction: match[2]
  };
}

function parseGraphLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  const edge = content.match(new RegExp(`^(${ID_PAT})\\s*-->\\s*(${ID_PAT})$`));
  if (edge) {
    const from = edge[1];
    const to = edge[2];
    return op === "remove"
      ? { kind: "remove_edge", line, raw, from, to }
      : { kind: "add_edge", line, raw, from, to };
  }
  const node = content.match(new RegExp(`^(${ID_PAT})(?:\\[(?:"([^"]+)"|([^\\]]+))\\])?$`));
  if (node) {
    const id = node[1];
    if (op === "remove") return { kind: "remove_node", line, raw, id };
    const label = node[2] ?? node[3] ?? id;
    return { kind: "add_node", line, raw, id, label };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown graph command "${raw}"`);
}

function parseSequenceLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  const part = content.match(new RegExp(`^(?:participant|actor)\\s+(${ID_PAT})(?:\\s+as\\s+(.+))?$`));
  if (part) {
    const id = part[1];
    if (op === "remove") return { kind: "remove_participant", line, raw, id };
    const label = part[2]?.trim() ?? id;
    return { kind: "add_participant", line, raw, id, label };
  }
  if (op === "remove") {
    const bare = content.match(new RegExp(`^(${ID_PAT})$`));
    if (bare) return { kind: "remove_participant", line, raw, id: bare[1] };
  }
  const msg = content.match(new RegExp(`^(${ID_PAT})\\s*->>\\s*(${ID_PAT})\\s*:\\s*(.+)$`));
  if (msg) {
    if (op === "remove") throw new Error(`line ${line}: messages cannot be removed`);
    return {
      kind: "add_message",
      line,
      raw,
      from: msg[1],
      to: msg[2],
      label: msg[3].trim()
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown sequence command "${raw}"`);
}

function parseClassLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  const cls = content.match(new RegExp(`^class\\s+(${ID_PAT})(?:\\s+(.+))?$`));
  if (cls) {
    const id = cls[1];
    if (op === "remove") return { kind: "remove_class", line, raw, id };
    const label = cls[2]?.trim() ?? id;
    return { kind: "add_class", line, raw, id, label };
  }
  if (op === "remove") {
    const bare = content.match(new RegExp(`^(${ID_PAT})$`));
    if (bare) return { kind: "remove_class", line, raw, id: bare[1] };
  }
  const member = content.match(new RegExp(`^member\\s+(${ID_PAT})\\s+(.+)$`));
  if (member) {
    if (op === "remove")
      throw new Error(`line ${line}: cannot remove single members; remove the class`);
    return {
      kind: "add_member",
      line,
      raw,
      classId: member[1],
      signature: member[2].trim()
    };
  }
  const rel = content.match(
    new RegExp(`^(${ID_PAT})\\s+([-.o*|<>]+)\\s+(${ID_PAT})(?:\\s*:\\s*(.+))?$`)
  );
  if (rel) {
    if (op === "remove")
      throw new Error(`line ${line}: cannot remove relations directly; remove a class to cascade`);
    if (!CLASS_RELATION_RE.test(rel[2]))
      throw new Error(`line ${line}: invalid relation "${rel[2]}"`);
    return {
      kind: "add_relation",
      line,
      raw,
      from: rel[1],
      to: rel[3],
      relation: rel[2],
      label: rel[4]?.trim() ?? ""
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown class command "${raw}"`);
}

function parseStateLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  const alias = content.match(new RegExp(`^state\\s+"([^"]+)"\\s+as\\s+(${ID_PAT})$`));
  if (alias) {
    const id = alias[2];
    if (op === "remove") return { kind: "remove_state", line, raw, id };
    return { kind: "add_state", line, raw, id, label: alias[1] };
  }
  const st = content.match(new RegExp(`^state\\s+(${ID_PAT})(?:\\s+(.+))?$`));
  if (st) {
    const id = st[1];
    if (op === "remove") return { kind: "remove_state", line, raw, id };
    const label = st[2]?.trim() ?? id;
    return { kind: "add_state", line, raw, id, label };
  }
  if (op === "remove") {
    const bare = content.match(new RegExp(`^(${ID_PAT})$`));
    if (bare) return { kind: "remove_state", line, raw, id: bare[1] };
  }
  const tr = content.match(
    new RegExp(`^(${STATE_ID_PAT})\\s*-->\\s*(${STATE_ID_PAT})(?:\\s*:\\s*(.+))?$`)
  );
  if (tr) {
    if (op === "remove") throw new Error(`line ${line}: cannot remove transitions directly`);
    return {
      kind: "add_transition",
      line,
      raw,
      from: tr[1],
      to: tr[2],
      label: tr[3]?.trim() ?? ""
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown state command "${raw}"`);
}

function parseErLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  const ent = content.match(new RegExp(`^entity\\s+(${ID_PAT})$`));
  if (ent) {
    const id = ent[1];
    if (op === "remove") return { kind: "remove_entity", line, raw, id };
    return { kind: "add_entity", line, raw, id };
  }
  if (op === "remove") {
    const bare = content.match(new RegExp(`^(${ID_PAT})$`));
    if (bare) return { kind: "remove_entity", line, raw, id: bare[1] };
  }
  const at = content.match(
    new RegExp(`^attr\\s+(${ID_PAT})\\s+([^\\s]+)\\s+([^\\s]+)(?:\\s+([^\\s]+))?$`)
  );
  if (at) {
    if (op === "remove") throw new Error(`line ${line}: cannot remove attrs directly`);
    return {
      kind: "add_er_attribute",
      line,
      raw,
      entityId: at[1],
      typeName: at[2],
      name: at[3],
      keyFlags: at[4] ?? ""
    };
  }
  const rel = content.match(
    new RegExp(`^(${ID_PAT})\\s+([|o}{.\\-]+)\\s+(${ID_PAT})(?:\\s*:\\s*(.+))?$`)
  );
  if (rel) {
    if (op === "remove") throw new Error(`line ${line}: cannot remove er relations directly`);
    if (!ER_REL_RE.test(rel[2]))
      throw new Error(`line ${line}: invalid ER relation token "${rel[2]}"`);
    return {
      kind: "add_er_relation",
      line,
      raw,
      left: rel[1],
      cardinality: rel[2],
      right: rel[3],
      label: rel[4]?.trim() ?? ""
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown er command "${raw}"`);
}

function parseJourneyLine(
  content: string,
  op: Op,
  line: number,
  raw: string,
  ctx: ParserContext
): MmdlogEvent {
  if (op === "remove") {
    const section = content.match(/^section\s+(.+)$/);
    if (section) return { kind: "remove_journey_section", line, raw, title: section[1].trim() };
    return { kind: "remove_journey_task", line, raw, task: content.trim() };
  }
  const section = content.match(/^section\s+(.+)$/);
  if (section) {
    const title = section[1].trim();
    ctx.journeySection = title;
    return { kind: "add_journey_section", line, raw, title };
  }
  const task = content.match(/^(.+?)\s*:\s*([1-5])\s*:\s*(.+)$/);
  if (task) {
    if (!ctx.journeySection) throw new Error(`line ${line}: journey task before any section`);
    return {
      kind: "add_journey_task",
      line,
      raw,
      section: ctx.journeySection,
      task: task[1].trim(),
      score: Number(task[2]),
      actors: task[3].split(",").map((x) => x.trim()).filter(Boolean)
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown journey command "${raw}"`);
}

function parseGanttLine(
  content: string,
  op: Op,
  line: number,
  raw: string,
  ctx: ParserContext
): MmdlogEvent {
  if (op === "remove") {
    if (content === "title") return { kind: "remove_gantt_title", line, raw };
    if (content === "dateFormat") return { kind: "remove_gantt_date_format", line, raw };
    if (content === "axisFormat") return { kind: "remove_gantt_axis_format", line, raw };
    const section = content.match(/^section\s+(.+)$/);
    if (section) return { kind: "remove_gantt_section", line, raw, title: section[1].trim() };
    return { kind: "remove_gantt_task", line, raw, task: content.trim() };
  }
  const title = content.match(/^title\s+(.+)$/);
  if (title) return { kind: "add_gantt_title", line, raw, title: title[1].trim() };
  const dateFmt = content.match(/^dateFormat\s+(.+)$/);
  if (dateFmt) return { kind: "add_gantt_date_format", line, raw, format: dateFmt[1].trim() };
  const axisFmt = content.match(/^axisFormat\s+(.+)$/);
  if (axisFmt) return { kind: "add_gantt_axis_format", line, raw, format: axisFmt[1].trim() };
  const section = content.match(/^section\s+(.+)$/);
  if (section) {
    const sectionTitle = section[1].trim();
    ctx.ganttSection = sectionTitle;
    return { kind: "add_gantt_section", line, raw, title: sectionTitle };
  }
  const task = content.match(/^(.+?)\s*:\s*(.+)$/);
  if (task) {
    if (!ctx.ganttSection) throw new Error(`line ${line}: gantt task before any section`);
    return {
      kind: "add_gantt_task",
      line,
      raw,
      section: ctx.ganttSection,
      task: task[1].trim(),
      meta: task[2].trim()
    };
  }
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown gantt command "${raw}"`);
}

function parsePieLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  if (op === "remove") {
    if (content === "title") return { kind: "remove_pie_title", line, raw };
    const sliceLabel = content.match(/^"([^"]+)"$/);
    if (sliceLabel) return { kind: "remove_pie_data", line, raw, label: sliceLabel[1] };
    throw new Error(`line ${line}: pie removal expects "title" or "\\"<label>\\""`);
  }
  const title = content.match(/^title\s+(.+)$/);
  if (title) return { kind: "add_pie_title", line, raw, title: title[1].trim() };
  const slice = content.match(/^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)$/);
  if (slice) return { kind: "add_pie_data", line, raw, label: slice[1], value: Number(slice[2]) };
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown pie command "${raw}"`);
}

function parseGitGraphLine(content: string, op: Op, line: number, raw: string): MmdlogEvent {
  if (op === "remove") throw new Error(`line ${line}: removal is not supported in gitGraph`);
  const commitId = content.match(/^commit\s+id:\s*"([^"]+)"$/);
  if (commitId) return { kind: "add_git_commit", line, raw, id: commitId[1] };
  if (/^commit$/.test(content)) return { kind: "add_git_commit", line, raw, id: "" };
  const branch = content.match(/^branch\s+([^\s]+)$/);
  if (branch) return { kind: "add_git_branch", line, raw, name: branch[1] };
  const checkout = content.match(/^checkout\s+([^\s]+)$/);
  if (checkout) return { kind: "add_git_checkout", line, raw, name: checkout[1] };
  const merge = content.match(/^merge\s+([^\s]+)$/);
  if (merge) return { kind: "add_git_merge", line, raw, name: merge[1] };
  if (op === "add") return { kind: "add_raw", line, raw, content };
  throw new Error(`line ${line}: unknown gitGraph command "${raw}"`);
}

function parseByKind(
  content: string,
  op: Op,
  line: number,
  raw: string,
  ctx: ParserContext
): MmdlogEvent {
  switch (ctx.diagram) {
    case "graph":
      return parseGraphLine(content, op, line, raw);
    case "sequence":
      return parseSequenceLine(content, op, line, raw);
    case "class":
      return parseClassLine(content, op, line, raw);
    case "state":
      return parseStateLine(content, op, line, raw);
    case "er":
      return parseErLine(content, op, line, raw);
    case "journey":
      return parseJourneyLine(content, op, line, raw, ctx);
    case "gantt":
      return parseGanttLine(content, op, line, raw, ctx);
    case "pie":
      return parsePieLine(content, op, line, raw);
    case "gitGraph":
      return parseGitGraphLine(content, op, line, raw);
    default: {
      const _never: never = ctx.diagram;
      throw new Error(`line ${line}: unsupported diagram "${_never}"`);
    }
  }
}

function assertEventIds(event: MmdlogEvent, line: number): void {
  switch (event.kind) {
    case "add_node":
    case "add_class":
    case "add_state":
    case "add_participant":
    case "add_entity":
      assertId(event.id, line);
      break;
    case "add_edge":
    case "add_relation":
    case "add_message":
      assertId(event.from, line);
      assertId(event.to, line);
      break;
    case "add_er_attribute":
      assertId(event.entityId, line);
      break;
    case "add_er_relation":
      assertId(event.left, line);
      assertId(event.right, line);
      break;
    case "add_member":
      assertId(event.classId, line);
      break;
    default:
      break;
  }
}

export function parseMmdlog(input: string, options: ParseOptions = {}): ParseResult {
  const strict = options.strict ?? true;
  const warnings: string[] = [];
  const events: MmdlogEvent[] = [];
  const ctx: ParserContext = { diagram: "graph", journeySection: "", ganttSection: "" };
  let diagramSet = false;

  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = i + 1;
    const stripped = lines[i].replace(/#.*/, "").trim();
    if (!stripped) continue;

    const silent = stripped.startsWith("!");
    const afterSilent = silent ? stripped.slice(1).trimStart() : stripped;
    if (silent && !afterSilent) {
      if (strict) throw new Error(`line ${line}: "!" must be followed by an event`);
      warnings.push(`line ${line}: stray "!" with no event`);
      continue;
    }

    try {
      if (afterSilent.startsWith("@diagram ")) {
        const event = parseDiagram(afterSilent, line);
        if (diagramSet) {
          throw new Error(`line ${line}: @diagram can only be declared once`);
        }
        ctx.diagram = event.diagram;
        diagramSet = true;
        event.silent = true;
        events.push(event);
        continue;
      }
      const opChar = afterSilent[0];
      if (opChar !== "+" && opChar !== "-") {
        throw new Error(
          `line ${line}: expected line to start with "+", "-", or "@diagram"`
        );
      }
      if (!diagramSet) {
        throw new Error(`line ${line}: events require "@diagram <kind>" before any "+" or "-"`);
      }
      const op: Op = opChar === "+" ? "add" : "remove";
      const content = afterSilent.slice(1).trim();
      if (!content) throw new Error(`line ${line}: "${opChar}" must be followed by content`);
      const event = parseByKind(content, op, line, afterSilent, ctx);
      if (op === "add") assertEventIds(event, line);
      if (silent) event.silent = true;
      events.push(event);
    } catch (err) {
      if (strict) throw err;
      warnings.push((err as Error).message);
    }
  }
  return { events, warnings };
}
