import { Resvg } from "@resvg/resvg-js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RgbaFrame } from "./encodeGif.js";

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), "rasterize-worker.js");

export interface RasterizeOptions {
  width?: number;
  height?: number;
  background?: string;
}

function makeResvg(svg: string, options: RasterizeOptions): Resvg {
  const fitTo = options.width
    ? { mode: "width" as const, value: options.width }
    : options.height
      ? { mode: "height" as const, value: options.height }
      : undefined;

  return new Resvg(svg, {
    background: options.background ?? "white",
    fitTo
  });
}

export function rasterizeSvg(svg: string, options: RasterizeOptions = {}): RgbaFrame {
  const rendered = makeResvg(svg, options).render();
  const rgba = new Uint8Array(rendered.pixels);
  const { width, height } = rendered;

  if (options.width && options.height && (width !== options.width || height !== options.height)) {
    return padToCanvas(rgba, width, height, options.width, options.height, options.background ?? "white");
  }

  return { rgba, width, height };
}

export function svgToPng(svg: string, options: RasterizeOptions = {}): Uint8Array {
  const rendered = makeResvg(svg, options).render();
  return new Uint8Array(rendered.asPng());
}

function runWorker(mode: "rgba" | "png", svg: string, options: RasterizeOptions): Buffer {
  const args = [
    WORKER_PATH,
    mode,
    String(options.width ?? 0),
    String(options.height ?? 0),
    options.background ?? "white"
  ];
  const result = spawnSync(process.execPath, args, {
    input: svg,
    maxBuffer: 1024 * 1024 * 256
  });
  if (result.status !== 0 || result.signal) {
    const stderr = result.stderr?.toString().trim();
    const reason = result.signal
      ? `rasterize worker killed by signal ${result.signal}`
      : stderr || `rasterize worker exited with code ${result.status}`;
    throw new Error(reason);
  }
  if (!result.stdout || result.stdout.length === 0) {
    throw new Error("rasterize worker produced no output");
  }
  return result.stdout;
}

export function rasterizeSvgIsolated(svg: string, options: RasterizeOptions = {}): RgbaFrame {
  const buf = runWorker("rgba", svg, options);
  if (buf.length < 8) throw new Error("rasterize worker output too short");
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const expected = 8 + width * height * 4;
  if (buf.length < expected) {
    throw new Error(`rasterize worker output truncated: got ${buf.length}, expected ${expected}`);
  }
  const rgba = new Uint8Array(buf.subarray(8, expected));

  if (options.width && options.height && (width !== options.width || height !== options.height)) {
    return padToCanvas(rgba, width, height, options.width, options.height, options.background ?? "white");
  }
  return { rgba, width, height };
}

export function svgToPngIsolated(svg: string, options: RasterizeOptions = {}): Uint8Array {
  const buf = runWorker("png", svg, options);
  return new Uint8Array(buf);
}

function parseColor(input: string): [number, number, number, number] {
  if (input === "white") return [255, 255, 255, 255];
  if (input === "black") return [0, 0, 0, 255];
  if (input === "transparent") return [0, 0, 0, 0];
  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255];
  }
  return [255, 255, 255, 255];
}

function padToCanvas(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  bg: string
): RgbaFrame {
  const [br, bgg, bb, ba] = parseColor(bg);
  const out = new Uint8Array(dstW * dstH * 4);
  for (let i = 0; i < dstW * dstH; i += 1) {
    out[i * 4] = br;
    out[i * 4 + 1] = bgg;
    out[i * 4 + 2] = bb;
    out[i * 4 + 3] = ba;
  }
  const offX = Math.max(0, Math.floor((dstW - srcW) / 2));
  const offY = Math.max(0, Math.floor((dstH - srcH) / 2));
  const copyW = Math.min(srcW, dstW);
  const copyH = Math.min(srcH, dstH);
  for (let y = 0; y < copyH; y += 1) {
    const srcRow = y * srcW * 4;
    const dstRow = (y + offY) * dstW * 4 + offX * 4;
    out.set(src.subarray(srcRow, srcRow + copyW * 4), dstRow);
  }
  return { rgba: out, width: dstW, height: dstH };
}
