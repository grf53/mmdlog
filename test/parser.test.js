import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMmdlog } from "../dist/core/index.js";

function parseGraph(src, opts = { strict: true }) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  return parseMmdlog(full, opts);
}

function graphEvents(result) {
  return result.events.filter((e) => e.kind !== "set_diagram");
}

test("empty input produces no events", () => {
  const { events, warnings } = parseMmdlog("", { strict: true });
  assert.equal(events.length, 0);
  assert.equal(warnings.length, 0);
});

test("blank lines and comments are ignored", () => {
  const events = graphEvents(parseGraph("\n# comment\n+A[API]\n# trailing\n"));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "add_node");
});

test("graph: node with bracket label", () => {
  const events = graphEvents(parseGraph("+A[API Service]"));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "add_node");
  assert.equal(events[0].id, "A");
  assert.equal(events[0].label, "API Service");
});

test("graph: bare id uses id as label", () => {
  const events = graphEvents(parseGraph("+A"));
  assert.equal(events[0].id, "A");
  assert.equal(events[0].label, "A");
});

test("graph: quoted bracket label preserves spaces", () => {
  const events = graphEvents(parseGraph('+A["API Service v2"]'));
  assert.equal(events[0].label, "API Service v2");
});

test("graph: edge and -edge removal", () => {
  const events = graphEvents(parseGraph("+A\n+B\n+A --> B\n-A --> B"));
  assert.deepEqual(
    events.map((e) => e.kind),
    ["add_node", "add_node", "add_edge", "remove_edge"]
  );
});

test("graph: bare id removal", () => {
  const events = graphEvents(parseGraph("+A\n-A"));
  assert.equal(events[1].kind, "remove_node");
  assert.equal(events[1].id, "A");
});

test("unrecognized add line becomes raw passthrough", () => {
  const events = graphEvents(parseGraph("+1bad mermaid line"));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "add_raw");
  assert.equal(events[0].content, "1bad mermaid line");
});

test("remove of unrecognized id still throws", () => {
  assert.throws(() => parseGraph("-1bad"), /unknown graph command/);
});

test("missing @diagram before events throws", () => {
  assert.throws(
    () => parseMmdlog("+A", { strict: true }),
    /events require "@diagram <kind>"/
  );
});

test("@diagram declared twice rejected", () => {
  assert.throws(
    () => parseMmdlog("@diagram graph\n@diagram sequence", { strict: true }),
    /can only be declared once/
  );
});

test("sequence: participant with `as` alias", () => {
  const src = "@diagram sequence\n+participant Client as Web Client";
  const { events } = parseMmdlog(src, { strict: true });
  const p = events.find((e) => e.kind === "add_participant");
  assert.equal(p.id, "Client");
  assert.equal(p.label, "Web Client");
});

test("sequence: message ->> syntax", () => {
  const src = "@diagram sequence\n+participant A\n+participant B\n+A->>B: hello";
  const { events } = parseMmdlog(src, { strict: true });
  const m = events.find((e) => e.kind === "add_message");
  assert.equal(m.from, "A");
  assert.equal(m.to, "B");
  assert.equal(m.label, "hello");
});

test("class: +member parses classId and signature", () => {
  const src = "@diagram class\n+class User\n+member User -string id";
  const { events } = parseMmdlog(src, { strict: true });
  const member = events.find((e) => e.kind === "add_member");
  assert.ok(member);
  assert.equal(member.classId, "User");
  assert.equal(member.signature, "-string id");
});

test("class: mermaid-style relation", () => {
  const src = "@diagram class\n+class A\n+class B\n+A --|> B : extends";
  const { events } = parseMmdlog(src, { strict: true });
  const rel = events.find((e) => e.kind === "add_relation");
  assert.equal(rel.from, "A");
  assert.equal(rel.relation, "--|>");
  assert.equal(rel.to, "B");
  assert.equal(rel.label, "extends");
});

test("state: transition with [*] pseudo-state", () => {
  const src = "@diagram state\n+state Idle\n+[*] --> Idle";
  const { events } = parseMmdlog(src, { strict: true });
  const t = events.find((e) => e.kind === "add_transition");
  assert.equal(t.from, "[*]");
  assert.equal(t.to, "Idle");
});

test("state: aliased label", () => {
  const src = '@diagram state\n+state "Long Name" as ID';
  const { events } = parseMmdlog(src, { strict: true });
  const s = events.find((e) => e.kind === "add_state");
  assert.equal(s.id, "ID");
  assert.equal(s.label, "Long Name");
});

test("er: inline cardinality relation", () => {
  const src = "@diagram er\n+entity USER\n+entity ORDER\n+USER ||--o{ ORDER : places";
  const { events } = parseMmdlog(src, { strict: true });
  const r = events.find((e) => e.kind === "add_er_relation");
  assert.equal(r.left, "USER");
  assert.equal(r.cardinality, "||--o{");
  assert.equal(r.right, "ORDER");
  assert.equal(r.label, "places");
});

test("journey: section context is tracked across tasks", () => {
  const src = "@diagram journey\n+section Discover\n+Search docs : 4 : User\n+Read examples : 3 : User";
  const { events } = parseMmdlog(src, { strict: true });
  const tasks = events.filter((e) => e.kind === "add_journey_task");
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].section, "Discover");
  assert.equal(tasks[1].section, "Discover");
});

test("gantt: section context is tracked across tasks", () => {
  const src = "@diagram gantt\n+section Core\n+Parser : done, p1, 2026-05-01, 7d";
  const { events } = parseMmdlog(src, { strict: true });
  const task = events.find((e) => e.kind === "add_gantt_task");
  assert.equal(task.section, "Core");
  assert.equal(task.task, "Parser");
  assert.equal(task.meta, "done, p1, 2026-05-01, 7d");
});

test("pie: quoted slice parses label and value", () => {
  const src = '@diagram pie\n+"Search" : 50';
  const { events } = parseMmdlog(src, { strict: true });
  const s = events.find((e) => e.kind === "add_pie_data");
  assert.equal(s.label, "Search");
  assert.equal(s.value, 50);
});

test("gitGraph: commit with explicit id", () => {
  const src = '@diagram gitGraph\n+commit id: "c1"';
  const { events } = parseMmdlog(src, { strict: true });
  const c = events.find((e) => e.kind === "add_git_commit");
  assert.equal(c.id, "c1");
});

test("silent prefix marks event silent", () => {
  const events = graphEvents(parseGraph("!+A\n+B"));
  assert.equal(events.length, 2);
  assert.equal(events[0].silent, true);
  assert.equal(events[1].silent, undefined);
});

test("silent prefix preserves event content", () => {
  const events = graphEvents(parseGraph("!+A[API]"));
  assert.equal(events[0].kind, "add_node");
  assert.equal(events[0].id, "A");
  assert.equal(events[0].label, "API");
});

test("lone ! rejected", () => {
  assert.throws(() => parseGraph("!"), /must be followed by an event/);
});

test("line without +/-/@diagram rejected", () => {
  assert.throws(() => parseGraph("A[API]"), /expected line to start/);
});
