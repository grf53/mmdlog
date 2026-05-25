declare module "gifenc/dist/gifenc.esm.js" {
  export * from "gifenc";
}

declare module "gifenc" {
  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        first?: boolean;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance;

  export function quantize(
    rgba: Uint8Array,
    maxColors: number,
    options?: { format?: "rgb444" | "rgb565" | "rgba4444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number }
  ): number[][];

  export function applyPalette(rgba: Uint8Array, palette: number[][], format?: string): Uint8Array;
}
