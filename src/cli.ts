#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseMmdlog, reduceEvents, emitMermaid, replayTimeline } from "./core/index.js";
import { writeFrames, writeGif } from "./replay/renderer.js";
import { renderMermaidToSvg } from "./replay/mermaidNode.js";
import { svgToPngIsolated } from "./replay/rasterize.js";

type Command = "render" | "check" | "print-state" | "replay" | "frames" | "gif";
type FrameFormat = "mmd" | "svg" | "png";

interface ParsedArgs {
  command: Command;
  inputPath: string;
  outPath?: string;
  json?: boolean;
  format?: FrameFormat;
  fps?: number;
  width?: number;
  height?: number;
  collapse?: boolean;
  holdMs?: number;
  highlight?: boolean;
  flashMs?: number;
}

function usage(): string {
  return [
    "Usage:",
    "  mmdlog render <input.mmdlog> [-o <output>] [--format mmd|svg|png] [--width N] [--height N]",
    "  mmdlog check <input.mmdlog>",
    "  mmdlog print-state <input.mmdlog>",
    "  mmdlog replay <input.mmdlog> [--json]",
    "  mmdlog frames <input.mmdlog> [-o <dir>] [--format mmd|svg|png] [--width N] [--height N] [--no-collapse] [--highlight]",
    "  mmdlog gif <input.mmdlog> [-o <output.gif>] [--fps N] [--width N] [--height N] [--no-collapse] [--hold-ms N] [--highlight] [--flash-ms N]"
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length < 2) {
    throw new Error(usage());
  }

  const [commandRaw, inputPath, ...rest] = argv;
  if (
    commandRaw !== "render" &&
    commandRaw !== "check" &&
    commandRaw !== "print-state" &&
    commandRaw !== "replay" &&
    commandRaw !== "frames" &&
    commandRaw !== "gif"
  ) {
    throw new Error(`unknown command "${commandRaw}"\n\n${usage()}`);
  }

  let outPath: string | undefined;
  let json = false;
  let format: FrameFormat | undefined;
  let fps: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let collapse: boolean | undefined;
  let holdMs: number | undefined;
  let highlight: boolean | undefined;
  let flashMs: number | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "-o") {
      const next = rest[i + 1];
      if (!next) {
        throw new Error("missing value for -o");
      }
      outPath = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--json") {
      json = true;
      continue;
    }
    if (rest[i] === "--format") {
      const next = rest[i + 1];
      if (next !== "mmd" && next !== "svg" && next !== "png") {
        throw new Error(`invalid --format "${next ?? ""}"`);
      }
      format = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--fps") {
      const next = Number(rest[i + 1]);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("invalid --fps value");
      }
      fps = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--width") {
      const next = Number(rest[i + 1]);
      if (!Number.isInteger(next) || next <= 0) {
        throw new Error("invalid --width value");
      }
      width = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--height") {
      const next = Number(rest[i + 1]);
      if (!Number.isInteger(next) || next <= 0) {
        throw new Error("invalid --height value");
      }
      height = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--no-collapse") {
      collapse = false;
      continue;
    }
    if (rest[i] === "--highlight") {
      highlight = true;
      continue;
    }
    if (rest[i] === "--flash-ms") {
      const next = Number(rest[i + 1]);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("invalid --flash-ms value");
      }
      flashMs = next;
      i += 1;
      continue;
    }
    if (rest[i] === "--hold-ms") {
      const next = Number(rest[i + 1]);
      if (!Number.isFinite(next) || next < 0) {
        throw new Error("invalid --hold-ms value");
      }
      holdMs = next;
      i += 1;
      continue;
    }
    throw new Error(`unknown flag "${rest[i]}"`);
  }

  if (!inputPath) {
    throw new Error(`missing input path\n\n${usage()}`);
  }

  return { command: commandRaw, inputPath, outPath, json, format, fps, width, height, collapse, holdMs, highlight, flashMs };
}

function formatReplayFrames(inputPath: string, frames: ReturnType<typeof replayTimeline>): string {
  return frames
    .map((frame) => {
      const header = `# step ${frame.step} (line ${frame.event.line}) ${frame.event.kind}`;
      return [header, `source: ${inputPath}`, frame.mermaid].join("\n");
    })
    .join("\n\n");
}

function formatState(state: ReturnType<typeof reduceEvents>): string {
  const graph = {
    nodes: [...state.graph.nodes.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => ({ id: n.id, label: n.label })),
    edges: [...state.graph.edges.values()]
      .sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)))
      .map((e) => ({ from: e.from, to: e.to }))
  };

  const sequence = {
    participants: [...state.sequence.participants.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, label: p.label })),
    messages: state.sequence.messages
  };

  const classDiagram = {
    classes: [...state.classDiagram.classes.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({ id: c.id, label: c.label })),
    relations: state.classDiagram.relations
  };

  const stateDiagram = {
    states: [...state.stateDiagram.states.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({ id: s.id, label: s.label })),
    transitions: state.stateDiagram.transitions
  };

  return JSON.stringify(
    {
      diagram: state.diagram,
      direction: state.direction,
      graph,
      sequence,
      classDiagram,
      stateDiagram,
      erDiagram: {
        entities: [...state.erDiagram.entities.values()],
        relations: state.erDiagram.relations
      },
      journey: state.journey,
      gantt: state.gantt,
      pie: state.pie,
      gitGraph: state.gitGraph
    },
    null,
    2
  );
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = await readFile(args.inputPath, "utf-8");
  const { events, warnings } = parseMmdlog(source, { strict: args.command !== "check" });
  const state = reduceEvents(events);

  if (args.command === "check") {
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.error(warning);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`OK: ${events.length} events parsed`);
    return;
  }

  if (args.command === "print-state") {
    console.log(formatState(state));
    return;
  }

  if (args.command === "replay") {
    const frames = replayTimeline(events);
    if (args.json) {
      console.log(
        JSON.stringify(
          frames.map((f) => ({
            step: f.step,
            line: f.event.line,
            kind: f.event.kind,
            raw: f.event.raw,
            mermaid: f.mermaid
          })),
          null,
          2
        )
      );
      return;
    }
    console.log(formatReplayFrames(args.inputPath, frames));
    return;
  }

  if (args.command === "frames") {
    const frames = replayTimeline(events, { highlight: args.highlight });
    const outDir = args.outPath ?? "frames";
    const format = args.format ?? "svg";
    const collapse = args.collapse ?? true;
    const written = await writeFrames(frames, outDir, format, args.width, args.height, collapse);
    console.log(`Wrote ${written.length} frame(s) to ${outDir} as ${format}`);
    return;
  }

  if (args.command === "gif") {
    const frames = replayTimeline(events, { highlight: args.highlight, flash: args.highlight });
    const outGif = args.outPath ?? "changes.gif";
    const collapse = args.collapse ?? true;
    const holdMs = args.holdMs ?? 0;
    const outputPath = await writeGif(frames, outGif, args.fps, args.width, args.height, collapse, holdMs, args.flashMs);
    console.log(`Wrote GIF: ${outputPath}`);
    return;
  }

  const mermaid = emitMermaid(state);
  const format = args.format ?? "mmd";
  if (format === "mmd") {
    if (args.outPath) {
      await writeFile(args.outPath, `${mermaid}\n`, "utf-8");
      return;
    }
    console.log(mermaid);
    return;
  }

  if (!args.outPath) {
    throw new Error(`render --format ${format} requires -o <output>`);
  }
  const svg = await renderMermaidToSvg(mermaid);
  if (format === "svg") {
    await writeFile(args.outPath, svg, "utf-8");
    return;
  }
  const png = svgToPngIsolated(svg, { width: args.width ?? 1280, height: args.height ?? 720 });
  await writeFile(args.outPath, png);
}

run().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
