import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ReplayFrame } from "../core/types.js";
import { encodeGif, type RgbaFrame } from "./encodeGif.js";
import { rasterizeSvgIsolated, svgToPngIsolated } from "./rasterize.js";
import { renderMermaidToSvg } from "./mermaidNode.js";

export type FrameFormat = "mmd" | "svg" | "png";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 2;
const DEFAULT_FLASH_MS = 150;

function frameBase(step: number): string {
  return `frame-${String(step).padStart(5, "0")}`;
}

function isBodyEmpty(code: string): boolean {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length <= 1;
}

function isInvisibleFrame(frame: ReplayFrame): boolean {
  return isBodyEmpty(frame.mermaid);
}

function collapseConsecutive(frames: ReplayFrame[]): ReplayFrame[] {
  const out: ReplayFrame[] = [];
  let prev: string | null = null;
  for (const f of frames) {
    if (f.mermaid === prev) continue;
    out.push(f);
    prev = f.mermaid;
  }
  return out;
}

function blankFrame(width: number, height: number): RgbaFrame {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

export async function writeFrames(
  frames: ReplayFrame[],
  outputDir: string,
  format: FrameFormat,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  collapse = true
): Promise<string[]> {
  const outDir = resolve(outputDir);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  const work = collapse ? collapseConsecutive(frames) : frames;

  if (format === "mmd") {
    for (const frame of work) {
      const p = join(outDir, `${frameBase(frame.step)}.mmd`);
      await writeFile(p, `${frame.mermaid}\n`, "utf8");
      written.push(p);
    }
    return written;
  }

  if (format === "svg") {
    for (const frame of work) {
      if (isInvisibleFrame(frame)) continue;
      try {
        const svg = await renderMermaidToSvg(frame.mermaid);
        const p = join(outDir, `${frameBase(frame.step)}.svg`);
        await writeFile(p, svg, "utf8");
        written.push(p);
      } catch (err) {
        console.error(`warn: frame ${frame.step} (line ${frame.event.line}) render failed: ${(err as Error).message}`);
      }
    }
    return written;
  }

  for (const frame of work) {
    if (isInvisibleFrame(frame)) continue;
    try {
      const svg = await renderMermaidToSvg(frame.mermaid);
      const png = svgToPngIsolated(svg, { width, height });
      const p = join(outDir, `${frameBase(frame.step)}.png`);
      await writeFile(p, png);
      written.push(p);
    } catch (err) {
      console.error(`warn: frame ${frame.step} (line ${frame.event.line}) render failed: ${(err as Error).message}`);
    }
  }
  return written;
}

export async function renderFramesToRgba(
  frames: ReplayFrame[],
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  delayFor?: (frame: ReplayFrame) => number
): Promise<RgbaFrame[]> {
  const out: RgbaFrame[] = [];
  let previous: RgbaFrame | null = null;
  for (const frame of frames) {
    if (isInvisibleFrame(frame)) continue;
    const delayMs = delayFor ? delayFor(frame) : undefined;
    try {
      const svg = await renderMermaidToSvg(frame.mermaid);
      const rgba = rasterizeSvgIsolated(svg, { width, height });
      out.push(delayMs === undefined ? rgba : { ...rgba, delayMs });
      previous = rgba;
    } catch (err) {
      const message = (err as Error).message;
      console.error(`warn: frame ${frame.step} (line ${frame.event.line}) render failed: ${message}`);
      const base = previous ?? blankFrame(width, height);
      out.push(delayMs === undefined ? base : { ...base, delayMs });
    }
  }
  return out;
}

export async function writeGif(
  frames: ReplayFrame[],
  outputGifPath: string,
  fps = DEFAULT_FPS,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  collapse = true,
  holdMs = 0,
  flashMs = DEFAULT_FLASH_MS
): Promise<string> {
  const input = collapse ? collapseConsecutive(frames) : frames;
  const delayMs = Math.max(20, Math.round(1000 / fps));
  const rgbaFrames = await renderFramesToRgba(input, width, height, (f) => (f.flash ? flashMs : delayMs));
  if (holdMs > 0 && rgbaFrames.length > 0) {
    const last = rgbaFrames[rgbaFrames.length - 1];
    rgbaFrames[rgbaFrames.length - 1] = { ...last, delayMs: Math.max(holdMs, delayMs) };
  }
  const bytes = encodeGif(rgbaFrames, { defaultDelayMs: delayMs });
  const out = resolve(outputGifPath);
  await writeFile(out, bytes);
  return out;
}
