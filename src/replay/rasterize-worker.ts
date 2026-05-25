#!/usr/bin/env node
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";

const mode = process.argv[2] === "png" ? "png" : "rgba";
const width = Number(process.argv[3]);
const height = Number(process.argv[4]);
const background = process.argv[5] || "white";

function svgIntrinsicSize(svg: string): { w: number; h: number } | null {
  const vb = svg.match(/viewBox="([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)"/);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 0 && h > 0) return { w, h };
  }
  const wm = svg.match(/<svg[^>]*\bwidth="([\d.]+)/);
  const hm = svg.match(/<svg[^>]*\bheight="([\d.]+)/);
  if (wm && hm) {
    const w = parseFloat(wm[1]);
    const h = parseFloat(hm[1]);
    if (w > 0 && h > 0) return { w, h };
  }
  return null;
}

function chooseFit(svgW: number, svgH: number): { mode: "width" | "height"; value: number } | undefined {
  if (width > 0 && height > 0) {
    const svgAspect = svgW / svgH;
    const targetAspect = width / height;
    if (svgAspect > targetAspect) return { mode: "width", value: width };
    return { mode: "height", value: height };
  }
  if (width > 0) return { mode: "width", value: width };
  if (height > 0) return { mode: "height", value: height };
  return undefined;
}

try {
  const svg = readFileSync(0, "utf-8");
  const intrinsic = svgIntrinsicSize(svg);
  const fitTo = intrinsic
    ? chooseFit(intrinsic.w, intrinsic.h)
    : width > 0
      ? ({ mode: "width", value: width } as const)
      : height > 0
        ? ({ mode: "height", value: height } as const)
        : undefined;

  const resvg = new Resvg(svg, { background, fitTo });
  const rendered = resvg.render();

  if (mode === "png") {
    process.stdout.write(Buffer.from(rendered.asPng()));
  } else {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(rendered.width, 0);
    header.writeUInt32LE(rendered.height, 4);
    process.stdout.write(header);
    process.stdout.write(Buffer.from(rendered.pixels));
  }
} catch (err) {
  process.stderr.write((err as Error).message);
  process.exit(2);
}
