/**
 * Low-level loader for the Stillgrid WebAssembly engine.
 *
 * The engine is built with a plain `cargo build --target wasm32-unknown-unknown`
 * and exposes a hand-rolled C ABI (see `engine/src/wasm.rs`) rather than using
 * wasm-bindgen, so there is no generated glue to keep in sync — this file is
 * the entire binding layer.
 *
 * Every call that returns data hands back a pointer to a length-prefixed
 * buffer: a little-endian u32 length followed by that many bytes of UTF-8
 * JSON. We copy the payload out and immediately release the buffer.
 */

// Vite emits this as a content-hashed asset, so the URL changes whenever the
// engine does and the file can be cached immutably.
import WASM_URL from "./stillgrid-engine.wasm?url";

interface EngineExports {
  memory: WebAssembly.Memory;
  sg_alloc(len: number): number;
  sg_free(ptr: number, len: number): void;
  sg_result_free(ptr: number): void;
  sg_generate(
    variantPtr: number,
    variantLen: number,
    size: number,
    minClues: number,
    seed: bigint,
  ): number;
  sg_solve(ptr: number, len: number): number;
  sg_grade(ptr: number, len: number): number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Engine {
  private constructor(private readonly ex: EngineExports) {}

  static async load(url: string = WASM_URL): Promise<Engine> {
    // The engine imports nothing from the host, so an empty import object is
    // correct — if that ever changes, instantiation will throw loudly here
    // rather than misbehaving at call time.
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`could not load the puzzle engine (${res.status})`);
    }
    const { instance } = await WebAssembly.instantiateStreaming(res, {}).catch(
      async (streamErr: unknown) => {
        // Some CDNs and dev servers serve .wasm with the wrong Content-Type,
        // which makes instantiateStreaming reject. Fall back to the buffered
        // path rather than failing the page.
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          return await WebAssembly.instantiate(buf, {});
        } catch {
          throw streamErr;
        }
      },
    );
    return new Engine(instance.exports as unknown as EngineExports);
  }

  /** Copy a string into engine memory. Returns the pointer and byte length. */
  private write(s: string): { ptr: number; len: number } {
    const bytes = encoder.encode(s);
    const ptr = this.ex.sg_alloc(bytes.length);
    new Uint8Array(this.ex.memory.buffer, ptr, bytes.length).set(bytes);
    return { ptr, len: bytes.length };
  }

  /** Read and release a length-prefixed result buffer. */
  private read(ptr: number): string {
    // The memory buffer is re-read on every access: any allocation can grow
    // the underlying ArrayBuffer and detach previously created views.
    const len = new DataView(this.ex.memory.buffer).getUint32(ptr, true);
    const bytes = new Uint8Array(this.ex.memory.buffer, ptr + 4, len).slice();
    this.ex.sg_result_free(ptr);
    return decoder.decode(bytes);
  }

  private call(fn: (ptr: number, len: number) => number, input: string): unknown {
    const { ptr, len } = this.write(input);
    try {
      return JSON.parse(this.read(fn(ptr, len)));
    } finally {
      this.ex.sg_free(ptr, len);
    }
  }

  generate(variant: string, size: number, minClues: number, seed: number): unknown {
    const { ptr, len } = this.write(variant);
    try {
      // Seeds are u64 on the Rust side; JS numbers only carry 53 bits safely,
      // so callers stay under that and we widen here.
      const out = this.ex.sg_generate(ptr, len, size, minClues, BigInt(Math.floor(seed)));
      return JSON.parse(this.read(out));
    } finally {
      this.ex.sg_free(ptr, len);
    }
  }

  solve(puzzle: string): unknown {
    return this.call(this.ex.sg_solve.bind(this.ex), puzzle);
  }

  /** `input` is either a bare puzzle string or the JSON payload form. */
  grade(input: string): unknown {
    return this.call(this.ex.sg_grade.bind(this.ex), input);
  }
}

let cached: Promise<Engine> | null = null;

/** Load the engine once per context and share it across callers. */
export function engine(): Promise<Engine> {
  cached ??= Engine.load().catch((e: unknown) => {
    // Don't cache a failure — a transient network error shouldn't permanently
    // break the page.
    cached = null;
    throw e;
  });
  return cached;
}
