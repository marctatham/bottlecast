// Shared by the unit tests: the WebAssembly signer, compiled from the package's file as the local
// bench does (the Worker imports it as a module instead).
import { readFileSync } from "node:fs";
import { instantiateSecp256k1, type Secp256k1Wasm } from "../src/secp256k1-wasm.ts";

const wasm = new WebAssembly.Module(readFileSync(new URL("../node_modules/tiny-secp256k1/lib/secp256k1.wasm", import.meta.url)));

export function signer(seed: Uint8Array = new Uint8Array(32).fill(7)): Secp256k1Wasm {
  return instantiateSecp256k1(wasm, seed);
}
