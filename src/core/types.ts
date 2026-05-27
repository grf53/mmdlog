export type DiagramKind =
  | "graph"
  | "sequence"
  | "class"
  | "state"
  | "er"
  | "journey"
  | "gantt"
  | "pie"
  | "gitGraph";

export type EventKind =
  | "set_diagram"
  | "add_node"
  | "add_edge"
  | "remove_node"
  | "remove_edge"
  | "add_participant"
  | "remove_participant"
  | "add_message"
  | "add_class"
  | "remove_class"
  | "add_relation"
  | "add_member"
  | "add_state"
  | "remove_state"
  | "add_transition"
  | "add_entity"
  | "remove_entity"
  | "add_er_attribute"
  | "add_er_relation"
  | "add_journey_section"
  | "add_journey_task"
  | "remove_journey_section"
  | "remove_journey_task"
  | "add_gantt_title"
  | "add_gantt_date_format"
  | "add_gantt_axis_format"
  | "add_gantt_section"
  | "add_gantt_task"
  | "remove_gantt_title"
  | "remove_gantt_date_format"
  | "remove_gantt_axis_format"
  | "remove_gantt_section"
  | "remove_gantt_task"
  | "add_pie_title"
  | "add_pie_data"
  | "remove_pie_title"
  | "remove_pie_data"
  | "add_git_commit"
  | "add_git_branch"
  | "add_git_checkout"
  | "add_git_merge"
  | "add_raw";

export interface BaseEvent {
  kind: EventKind;
  line: number;
  raw: string;
  silent?: boolean;
}

export interface SetDiagramEvent extends BaseEvent {
  kind: "set_diagram";
  diagram: DiagramKind;
  direction?: string;
}

export interface AddNodeEvent extends BaseEvent {
  kind: "add_node";
  id: string;
  label: string;
}

export interface AddEdgeEvent extends BaseEvent {
  kind: "add_edge";
  from: string;
  to: string;
}

export interface RemoveNodeEvent extends BaseEvent {
  kind: "remove_node";
  id: string;
}

export interface RemoveEdgeEvent extends BaseEvent {
  kind: "remove_edge";
  from: string;
  to: string;
}

export interface AddParticipantEvent extends BaseEvent {
  kind: "add_participant";
  id: string;
  label: string;
}

export interface RemoveParticipantEvent extends BaseEvent {
  kind: "remove_participant";
  id: string;
}

export interface AddMessageEvent extends BaseEvent {
  kind: "add_message";
  from: string;
  to: string;
  label: string;
}

export interface AddClassEvent extends BaseEvent {
  kind: "add_class";
  id: string;
  label: string;
}

export interface RemoveClassEvent extends BaseEvent {
  kind: "remove_class";
  id: string;
}

export interface AddRelationEvent extends BaseEvent {
  kind: "add_relation";
  from: string;
  to: string;
  relation: string;
  label: string;
}

export interface AddMemberEvent extends BaseEvent {
  kind: "add_member";
  classId: string;
  signature: string;
}

export interface AddStateEvent extends BaseEvent {
  kind: "add_state";
  id: string;
  label: string;
}

export interface RemoveStateEvent extends BaseEvent {
  kind: "remove_state";
  id: string;
}

export interface AddTransitionEvent extends BaseEvent {
  kind: "add_transition";
  from: string;
  to: string;
  label: string;
}

export interface AddEntityEvent extends BaseEvent {
  kind: "add_entity";
  id: string;
}

export interface RemoveEntityEvent extends BaseEvent {
  kind: "remove_entity";
  id: string;
}

export interface AddErAttributeEvent extends BaseEvent {
  kind: "add_er_attribute";
  entityId: string;
  typeName: string;
  name: string;
  keyFlags: string;
}

export interface AddErRelationEvent extends BaseEvent {
  kind: "add_er_relation";
  left: string;
  cardinality: string;
  right: string;
  label: string;
}

export interface AddJourneySectionEvent extends BaseEvent {
  kind: "add_journey_section";
  title: string;
}

export interface AddJourneyTaskEvent extends BaseEvent {
  kind: "add_journey_task";
  section: string;
  task: string;
  score: number;
  actors: string[];
}

export interface AddGanttTitleEvent extends BaseEvent {
  kind: "add_gantt_title";
  title: string;
}

export interface AddGanttDateFormatEvent extends BaseEvent {
  kind: "add_gantt_date_format";
  format: string;
}

export interface AddGanttAxisFormatEvent extends BaseEvent {
  kind: "add_gantt_axis_format";
  format: string;
}

export interface AddGanttSectionEvent extends BaseEvent {
  kind: "add_gantt_section";
  title: string;
}

export interface AddGanttTaskEvent extends BaseEvent {
  kind: "add_gantt_task";
  section: string;
  task: string;
  meta: string;
}

export interface AddPieTitleEvent extends BaseEvent {
  kind: "add_pie_title";
  title: string;
}

export interface AddPieDataEvent extends BaseEvent {
  kind: "add_pie_data";
  label: string;
  value: number;
}

export interface RemoveJourneySectionEvent extends BaseEvent {
  kind: "remove_journey_section";
  title: string;
}

export interface RemoveJourneyTaskEvent extends BaseEvent {
  kind: "remove_journey_task";
  task: string;
}

export interface RemoveGanttTitleEvent extends BaseEvent {
  kind: "remove_gantt_title";
}

export interface RemoveGanttDateFormatEvent extends BaseEvent {
  kind: "remove_gantt_date_format";
}

export interface RemoveGanttAxisFormatEvent extends BaseEvent {
  kind: "remove_gantt_axis_format";
}

export interface RemoveGanttSectionEvent extends BaseEvent {
  kind: "remove_gantt_section";
  title: string;
}

export interface RemoveGanttTaskEvent extends BaseEvent {
  kind: "remove_gantt_task";
  task: string;
}

export interface RemovePieTitleEvent extends BaseEvent {
  kind: "remove_pie_title";
}

export interface RemovePieDataEvent extends BaseEvent {
  kind: "remove_pie_data";
  label: string;
}

export interface AddGitCommitEvent extends BaseEvent {
  kind: "add_git_commit";
  id: string;
}

export interface AddGitBranchEvent extends BaseEvent {
  kind: "add_git_branch";
  name: string;
}

export interface AddGitCheckoutEvent extends BaseEvent {
  kind: "add_git_checkout";
  name: string;
}

export interface AddGitMergeEvent extends BaseEvent {
  kind: "add_git_merge";
  name: string;
}

export interface AddRawEvent extends BaseEvent {
  kind: "add_raw";
  content: string;
}

export type MmdlogEvent =
  | SetDiagramEvent
  | AddNodeEvent
  | AddEdgeEvent
  | RemoveNodeEvent
  | RemoveEdgeEvent
  | AddParticipantEvent
  | RemoveParticipantEvent
  | AddMessageEvent
  | AddClassEvent
  | RemoveClassEvent
  | AddRelationEvent
  | AddMemberEvent
  | AddStateEvent
  | RemoveStateEvent
  | AddTransitionEvent
  | AddEntityEvent
  | RemoveEntityEvent
  | AddErAttributeEvent
  | AddErRelationEvent
  | AddJourneySectionEvent
  | AddJourneyTaskEvent
  | RemoveJourneySectionEvent
  | RemoveJourneyTaskEvent
  | AddGanttTitleEvent
  | AddGanttDateFormatEvent
  | AddGanttAxisFormatEvent
  | RemoveGanttTitleEvent
  | RemoveGanttDateFormatEvent
  | RemoveGanttAxisFormatEvent
  | RemoveGanttSectionEvent
  | RemoveGanttTaskEvent
  | RemovePieTitleEvent
  | RemovePieDataEvent
  | AddGanttSectionEvent
  | AddGanttTaskEvent
  | AddPieTitleEvent
  | AddPieDataEvent
  | AddGitCommitEvent
  | AddGitBranchEvent
  | AddGitCheckoutEvent
  | AddGitMergeEvent
  | AddRawEvent;

export interface NodeState {
  id: string;
  label: string;
}

export interface EdgeState {
  from: string;
  to: string;
}

export interface GraphState {
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
}

export interface SequenceState {
  participants: Map<string, NodeState>;
  messages: SequenceMessage[];
  items: Array<{ type: "msg"; value: SequenceMessage } | { type: "raw"; value: string }>;
}

export interface ClassRelation {
  from: string;
  to: string;
  relation: string;
  label: string;
}

export interface ClassState {
  classes: Map<string, NodeState>;
  relations: ClassRelation[];
  members: Map<string, string[]>;
}

export interface StateTransition {
  from: string;
  to: string;
  label: string;
}

export interface StateDiagramState {
  states: Map<string, NodeState>;
  transitions: StateTransition[];
}

export interface ErAttribute {
  typeName: string;
  name: string;
  keyFlags: string;
}

export interface ErRelation {
  left: string;
  cardinality: string;
  right: string;
  label: string;
}

export interface ErEntity {
  id: string;
  attributes: ErAttribute[];
}

export interface ErState {
  entities: Map<string, ErEntity>;
  relations: ErRelation[];
}

export interface JourneyTask {
  section: string;
  task: string;
  score: number;
  actors: string[];
}

export type DiagramItem =
  | { kind: "title"; line: string }
  | { kind: "dateFormat"; line: string }
  | { kind: "axisFormat"; line: string }
  | { kind: "section"; name: string; line: string }
  | { kind: "task"; section: string; name: string; line: string }
  | { kind: "raw"; line: string };

export interface JourneyState {
  sections: string[];
  tasks: JourneyTask[];
  items: DiagramItem[];
}

export interface GanttTask {
  section: string;
  task: string;
  meta: string;
}

export interface GanttState {
  title: string;
  dateFormat: string;
  axisFormat: string;
  sections: string[];
  tasks: GanttTask[];
  items: DiagramItem[];
}

export interface PieState {
  title: string;
  values: Array<{ label: string; value: number }>;
}

export interface GitGraphState {
  commands: string[];
}

export interface CoreState {
  diagram: DiagramKind;
  direction: string;
  graph: GraphState;
  sequence: SequenceState;
  classDiagram: ClassState;
  stateDiagram: StateDiagramState;
  erDiagram: ErState;
  journey: JourneyState;
  gantt: GanttState;
  pie: PieState;
  gitGraph: GitGraphState;
  rawLines: string[];
}

export interface ParseOptions {
  strict?: boolean;
}

export interface ParseResult {
  events: MmdlogEvent[];
  warnings: string[];
}

export interface ReplayFrame {
  step: number;
  event: MmdlogEvent;
  state: CoreState;
  mermaid: string;
  flash?: boolean;
}
