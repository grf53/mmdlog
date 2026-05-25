import { GIFEncoder, quantize, applyPalette } from "gifenc/dist/gifenc.esm.js";

export interface RgbaFrame {
  rgba: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  delayMs?: number;
}

export interface EncodeGifOptions {
  defaultDelayMs?: number;
  loop?: number;
}

export function encodeGif(frames: RgbaFrame[], options: EncodeGifOptions = {}): Uint8Array {
  if (frames.length === 0) {
    throw new Error("encodeGif requires at least one frame");
  }

  const defaultDelayMs = options.defaultDelayMs ?? 500;
  const gif = GIFEncoder();

  for (const frame of frames) {
    const rgba = frame.rgba instanceof Uint8Array ? frame.rgba : new Uint8Array(frame.rgba.buffer, frame.rgba.byteOffset, frame.rgba.byteLength);
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, frame.width, frame.height, {
      palette,
      delay: frame.delayMs ?? defaultDelayMs
    });
  }

  gif.finish();
  return gif.bytes();
}
