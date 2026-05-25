import { encodeGif, type RgbaFrame, type EncodeGifOptions } from "./encodeGif.js";

export { encodeGif };
export type { RgbaFrame, EncodeGifOptions };

export interface BrowserGifOptions extends EncodeGifOptions {
  width?: number;
  height?: number;
  background?: string;
}

export async function svgStringToRgba(
  svg: string,
  width: number,
  height: number,
  background = "#ffffff"
): Promise<RgbaFrame> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offX = (width - drawW) / 2;
    const offY = (height - drawH) / 2;
    ctx.drawImage(img, offX, offY, drawW, drawH);
    const data = ctx.getImageData(0, 0, width, height);
    return { rgba: new Uint8Array(data.data.buffer.slice(0)), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolveImg, rejectImg) => {
    const img = new Image();
    img.onload = () => resolveImg(img);
    img.onerror = () => rejectImg(new Error(`failed to load svg image: ${src}`));
    img.src = src;
  });
}

export async function encodeMermaidFramesToGif(
  mermaidCodes: string[],
  renderSvg: (code: string, index: number) => Promise<string> | string,
  options: BrowserGifOptions = {}
): Promise<Uint8Array> {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const background = options.background ?? "#ffffff";
  const frames: RgbaFrame[] = [];
  for (let i = 0; i < mermaidCodes.length; i += 1) {
    const svg = await renderSvg(mermaidCodes[i], i);
    frames.push(await svgStringToRgba(svg, width, height, background));
  }
  return encodeGif(frames, options);
}
