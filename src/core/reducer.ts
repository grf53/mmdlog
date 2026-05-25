import type {
  ClassRelation,
  CoreState,
  EdgeState,
  ErRelation,
  GanttTask,
  JourneyTask,
  MmdlogEvent,
  NodeState,
  SequenceMessage,
  StateTransition
} from "./types.js";

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function referencesId(line: string, id: string): boolean {
  const re = new RegExp(`(^|[^\\w-])${escapeForRegex(id)}([^\\w-]|$)`);
  return re.test(line);
}

function filterRawLines(lines: string[], id: string): string[] {
  return lines.filter((line) => !referencesId(line, id));
}

function removeEdgesForNode(edges: Map<string, EdgeState>, nodeId: string): void {
  for (const [key, edge] of edges.entries()) {
    if (edge.from === nodeId || edge.to === nodeId) edges.delete(key);
  }
}

function createInitialState(): CoreState {
  return {
    diagram: "graph",
    direction: "TD",
    graph: { nodes: new Map<string, NodeState>(), edges: new Map<string, EdgeState>() },
    sequence: { participants: new Map<string, NodeState>(), messages: [], items: [] },
    classDiagram: { classes: new Map<string, NodeState>(), relations: [], members: new Map<string, string[]>() },
    stateDiagram: { states: new Map<string, NodeState>(), transitions: [] },
    erDiagram: { entities: new Map(), relations: [] },
    journey: { sections: [], tasks: [], items: [] },
    gantt: { title: "", dateFormat: "", axisFormat: "", sections: [], tasks: [], items: [] },
    pie: { title: "", values: [] },
    gitGraph: { commands: [] },
    rawLines: []
  };
}

export function reduceEvents(events: readonly MmdlogEvent[]): CoreState {
  const state = createInitialState();

  for (const event of events) {
    switch (event.kind) {
      case "set_diagram":
        state.diagram = event.diagram;
        if (event.direction) state.direction = event.direction;
        break;
      case "add_node":
        state.graph.nodes.set(event.id, { id: event.id, label: event.label });
        break;
      case "add_edge":
        if (state.graph.nodes.has(event.from) && state.graph.nodes.has(event.to)) {
          state.graph.edges.set(edgeKey(event.from, event.to), { from: event.from, to: event.to });
        }
        break;
      case "remove_node":
        if (state.graph.nodes.delete(event.id)) {
          removeEdgesForNode(state.graph.edges, event.id);
          state.rawLines = filterRawLines(state.rawLines, event.id);
        }
        break;
      case "remove_edge":
        state.graph.edges.delete(edgeKey(event.from, event.to));
        break;
      case "add_participant":
        state.sequence.participants.set(event.id, { id: event.id, label: event.label });
        break;
      case "remove_participant":
        state.sequence.participants.delete(event.id);
        state.sequence.messages = state.sequence.messages.filter(
          (m: SequenceMessage) => m.from !== event.id && m.to !== event.id
        );
        state.sequence.items = state.sequence.items.filter((item) => {
          if (item.type === "msg") return item.value.from !== event.id && item.value.to !== event.id;
          return !referencesId(item.value, event.id);
        });
        break;
      case "add_message": {
        if (state.sequence.participants.has(event.from) && state.sequence.participants.has(event.to)) {
          const msg = { from: event.from, to: event.to, label: event.label };
          state.sequence.messages.push(msg);
          state.sequence.items.push({ type: "msg", value: msg });
        }
        break;
      }
      case "add_class":
        state.classDiagram.classes.set(event.id, { id: event.id, label: event.label });
        break;
      case "remove_class":
        state.classDiagram.classes.delete(event.id);
        state.classDiagram.members.delete(event.id);
        state.classDiagram.relations = state.classDiagram.relations.filter(
          (r: ClassRelation) => r.from !== event.id && r.to !== event.id
        );
        state.rawLines = filterRawLines(state.rawLines, event.id);
        break;
      case "add_member": {
        if (!state.classDiagram.classes.has(event.classId)) break;
        const existing = state.classDiagram.members.get(event.classId) ?? [];
        existing.push(event.signature);
        state.classDiagram.members.set(event.classId, existing);
        break;
      }
      case "add_relation":
        if (state.classDiagram.classes.has(event.from) && state.classDiagram.classes.has(event.to)) {
          state.classDiagram.relations.push({
            from: event.from,
            to: event.to,
            relation: event.relation,
            label: event.label
          });
        }
        break;
      case "add_state":
        state.stateDiagram.states.set(event.id, { id: event.id, label: event.label });
        break;
      case "remove_state":
        state.stateDiagram.states.delete(event.id);
        state.stateDiagram.transitions = state.stateDiagram.transitions.filter(
          (t: StateTransition) => t.from !== event.id && t.to !== event.id
        );
        state.rawLines = filterRawLines(state.rawLines, event.id);
        break;
      case "add_transition": {
        const fromOk = event.from === "[*]" || state.stateDiagram.states.has(event.from);
        const toOk = event.to === "[*]" || state.stateDiagram.states.has(event.to);
        if (fromOk && toOk) {
          state.stateDiagram.transitions.push({ from: event.from, to: event.to, label: event.label });
        }
        break;
      }
      case "add_entity":
        state.erDiagram.entities.set(event.id, { id: event.id, attributes: [] });
        break;
      case "remove_entity":
        state.erDiagram.entities.delete(event.id);
        state.erDiagram.relations = state.erDiagram.relations.filter(
          (r: ErRelation) => r.left !== event.id && r.right !== event.id
        );
        state.rawLines = filterRawLines(state.rawLines, event.id);
        break;
      case "add_er_attribute": {
        const entity = state.erDiagram.entities.get(event.entityId);
        if (entity) {
          entity.attributes.push({ typeName: event.typeName, name: event.name, keyFlags: event.keyFlags });
        }
        break;
      }
      case "add_er_relation":
        if (state.erDiagram.entities.has(event.left) && state.erDiagram.entities.has(event.right)) {
          state.erDiagram.relations.push({
            left: event.left,
            cardinality: event.cardinality,
            right: event.right,
            label: event.label
          });
        }
        break;
      case "add_journey_section":
        if (!state.journey.sections.includes(event.title)) state.journey.sections.push(event.title);
        state.journey.items.push({ kind: "section", name: event.title, line: `section ${event.title}` });
        break;
      case "add_journey_task":
        state.journey.tasks.push({
          section: event.section,
          task: event.task,
          score: event.score,
          actors: event.actors
        } as JourneyTask);
        if (!state.journey.sections.includes(event.section)) state.journey.sections.push(event.section);
        state.journey.items.push({
          kind: "task",
          section: event.section,
          name: event.task,
          line: `  ${event.task}: ${event.score}: ${event.actors.join(", ")}`
        });
        break;
      case "remove_journey_section":
        state.journey.sections = state.journey.sections.filter((s) => s !== event.title);
        state.journey.tasks = state.journey.tasks.filter((t) => t.section !== event.title);
        state.journey.items = state.journey.items.filter(
          (i) =>
            !(i.kind === "section" && i.name === event.title) &&
            !(i.kind === "task" && i.section === event.title) &&
            !(i.kind === "raw" && referencesId(i.line, event.title))
        );
        break;
      case "remove_journey_task":
        state.journey.tasks = state.journey.tasks.filter((t) => t.task !== event.task);
        state.journey.items = state.journey.items.filter(
          (i) => !(i.kind === "task" && i.name === event.task)
        );
        break;
      case "add_gantt_title":
        state.gantt.title = event.title;
        state.gantt.items.push({ kind: "title", line: `title ${event.title}` });
        break;
      case "add_gantt_date_format":
        state.gantt.dateFormat = event.format;
        state.gantt.items.push({ kind: "dateFormat", line: `dateFormat ${event.format}` });
        break;
      case "add_gantt_axis_format":
        state.gantt.axisFormat = event.format;
        state.gantt.items.push({ kind: "axisFormat", line: `axisFormat ${event.format}` });
        break;
      case "add_gantt_section":
        if (!state.gantt.sections.includes(event.title)) state.gantt.sections.push(event.title);
        state.gantt.items.push({ kind: "section", name: event.title, line: `section ${event.title}` });
        break;
      case "add_gantt_task":
        state.gantt.tasks.push({ section: event.section, task: event.task, meta: event.meta } as GanttTask);
        if (!state.gantt.sections.includes(event.section)) state.gantt.sections.push(event.section);
        state.gantt.items.push({
          kind: "task",
          section: event.section,
          name: event.task,
          line: `${event.task} : ${event.meta}`
        });
        break;
      case "remove_gantt_title":
        state.gantt.title = "";
        state.gantt.items = state.gantt.items.filter((i) => i.kind !== "title");
        break;
      case "remove_gantt_date_format":
        state.gantt.dateFormat = "";
        state.gantt.items = state.gantt.items.filter((i) => i.kind !== "dateFormat");
        break;
      case "remove_gantt_axis_format":
        state.gantt.axisFormat = "";
        state.gantt.items = state.gantt.items.filter((i) => i.kind !== "axisFormat");
        break;
      case "remove_gantt_section":
        state.gantt.sections = state.gantt.sections.filter((s) => s !== event.title);
        state.gantt.tasks = state.gantt.tasks.filter((t) => t.section !== event.title);
        state.gantt.items = state.gantt.items.filter(
          (i) =>
            !(i.kind === "section" && i.name === event.title) &&
            !(i.kind === "task" && i.section === event.title) &&
            !(i.kind === "raw" && referencesId(i.line, event.title))
        );
        break;
      case "remove_gantt_task":
        state.gantt.tasks = state.gantt.tasks.filter((t) => t.task !== event.task);
        state.gantt.items = state.gantt.items.filter(
          (i) => !(i.kind === "task" && i.name === event.task)
        );
        break;
      case "add_pie_title":
        state.pie.title = event.title;
        break;
      case "add_pie_data":
        state.pie.values.push({ label: event.label, value: event.value });
        break;
      case "remove_pie_title":
        state.pie.title = "";
        break;
      case "remove_pie_data":
        state.pie.values = state.pie.values.filter((v) => v.label !== event.label);
        break;
      case "add_git_commit":
        state.gitGraph.commands.push(`commit id: "${event.id}"`);
        break;
      case "add_git_branch":
        state.gitGraph.commands.push(`branch ${event.name}`);
        break;
      case "add_git_checkout":
        state.gitGraph.commands.push(`checkout ${event.name}`);
        break;
      case "add_git_merge":
        state.gitGraph.commands.push(`merge ${event.name}`);
        break;
      case "add_raw":
        if (state.diagram === "sequence") {
          state.sequence.items.push({ type: "raw", value: event.content });
        } else if (state.diagram === "gitGraph") {
          state.gitGraph.commands.push(event.content);
        } else if (state.diagram === "gantt") {
          state.gantt.items.push({ kind: "raw", line: event.content });
        } else if (state.diagram === "journey") {
          state.journey.items.push({ kind: "raw", line: event.content });
        } else {
          state.rawLines.push(event.content);
        }
        break;
      default: {
        const _never: never = event;
        throw new Error(`unknown event kind ${(_never as { kind: string }).kind}`);
      }
    }
  }

  return state;
}

export function reducePrefixes(events: readonly MmdlogEvent[]): CoreState[] {
  const states: CoreState[] = [];
  for (let i = 1; i <= events.length; i += 1) states.push(reduceEvents(events.slice(0, i)));
  return states;
}
