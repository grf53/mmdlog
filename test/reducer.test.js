import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMmdlog, reduceEvents } from "../dist/core/index.js";

function reduce(src) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  const { events } = parseMmdlog(full, { strict: true });
  return reduceEvents(events);
}

test("add_node: stored by id", () => {
  const state = reduce("+A[API]\n+B[DB]");
  assert.equal(state.graph.nodes.size, 2);
  assert.equal(state.graph.nodes.get("A").label, "API");
});

test("add_node: same id updates label", () => {
  const state = reduce("+A[first]\n+A[second]");
  assert.equal(state.graph.nodes.size, 1);
  assert.equal(state.graph.nodes.get("A").label, "second");
});

test("add_edge: stored when both nodes exist", () => {
  const state = reduce("+A\n+B\n+A --> B");
  assert.equal(state.graph.edges.size, 1);
});

test("add_edge: dangling edge filtered by reducer", () => {
  const state = reduce("+A\n+A --> Z");
  assert.equal(state.graph.edges.size, 0);
});

test("remove_node: cascades connected edges", () => {
  const state = reduce("+A\n+B\n+A --> B\n-B");
  assert.equal(state.graph.nodes.has("B"), false);
  assert.equal(state.graph.edges.size, 0);
});

test("remove_edge: only removes that edge", () => {
  const state = reduce("+A\n+B\n+A --> B\n-A --> B");
  assert.equal(state.graph.nodes.size, 2);
  assert.equal(state.graph.edges.size, 0);
});

test("duplicate edge: collapsed to one", () => {
  const state = reduce("+A\n+B\n+A --> B\n+A --> B");
  assert.equal(state.graph.edges.size, 1);
});

test("recreate after remove: fresh node, no resurrected edges", () => {
  const state = reduce("+A\n+B\n+A --> B\n-B\n+B[y2]");
  assert.equal(state.graph.nodes.get("B").label, "y2");
  assert.equal(state.graph.edges.size, 0);
});

test("silent event still mutates state", () => {
  const state = reduce("!+A\n!+B\n+A --> B");
  assert.equal(state.graph.nodes.size, 2);
  assert.equal(state.graph.edges.size, 1);
});

test("class: members tracked per class", () => {
  const state = reduce(
    "@diagram class\n+class User\n+member User -string id\n+member User +login(p) bool"
  );
  const members = state.classDiagram.members.get("User");
  assert.ok(members);
  assert.equal(members.length, 2);
});

test("class: remove drops members", () => {
  const state = reduce(
    "@diagram class\n+class User\n+member User -string id\n-User"
  );
  assert.equal(state.classDiagram.classes.has("User"), false);
  assert.equal(state.classDiagram.members.has("User"), false);
});

test("class: relation involving removed class is cleaned up", () => {
  const state = reduce(
    "@diagram class\n+class A\n+class B\n+A --|> B\n-B"
  );
  assert.equal(state.classDiagram.relations.length, 0);
});

test("remove_node: also cascades raw lines referencing the id", () => {
  const state = reduce("+A\n+B\n+A --> B\n+note over A,B: shared\n-B");
  assert.equal(state.rawLines.length, 0);
});

test("remove_participant: cascades raw items referencing the id", () => {
  const src = "@diagram sequence\n+participant A\n+participant B\n+A->>B: hi\n+Note over A,B: shared\n-B";
  const state = reduce(src);
  assert.equal(state.sequence.items.length, 0);
});

test("journey: remove section cascades its tasks", () => {
  const src = "@diagram journey\n+section A\n+T1 : 4 : User\n+section B\n+T2 : 3 : User\n-section A";
  const state = reduce(src);
  assert.equal(state.journey.sections.length, 1);
  assert.equal(state.journey.sections[0], "B");
  assert.equal(state.journey.tasks.length, 1);
  assert.equal(state.journey.tasks[0].task, "T2");
});

test("gantt: remove section cascades its tasks", () => {
  const src = "@diagram gantt\n+section Core\n+P : done, p1, 2026-05-01, 7d\n+section Other\n+Q : active, p2\n-section Core";
  const state = reduce(src);
  assert.equal(state.gantt.sections.length, 1);
  assert.equal(state.gantt.tasks.length, 1);
  assert.equal(state.gantt.tasks[0].task, "Q");
});

test("gantt: remove title clears it", () => {
  const src = "@diagram gantt\n+title X\n+section S\n+T : meta\n-title";
  const state = reduce(src);
  assert.equal(state.gantt.title, "");
  assert.equal(state.gantt.items.filter((i) => i.kind === "title").length, 0);
});

test("pie: remove slice by label", () => {
  const src = '@diagram pie\n+"A" : 1\n+"B" : 2\n-"A"';
  const state = reduce(src);
  assert.equal(state.pie.values.length, 1);
  assert.equal(state.pie.values[0].label, "B");
});

test("state: transition with [*] pseudo-state stored", () => {
  const state = reduce("@diagram state\n+state Idle\n+[*] --> Idle");
  assert.equal(state.stateDiagram.transitions.length, 1);
  assert.equal(state.stateDiagram.transitions[0].from, "[*]");
});
