// secp256k1 as compiled code: libsecp256k1, through the Rust crate, built to
// WebAssembly by tiny-secp256k1 (MIT, bitcoinjs). noble's JavaScript pays
// 20–40 ms on a fresh isolate before V8 has optimised its BigInt maths. This
// pays far less, but not nothing: deployed, a first call cost about 4–5 ms more
// than later ones, probably V8 compiling each function on first use, so the
// Worker makes that call at module scope (src/warm-up.ts).
//
// The package's own loaders don't fit a Worker: one reads the file with `fs`,
// the other relies on a bundler's ESM-integration import, and Workers refuses
// to compile WebAssembly from bytes at runtime. So the caller hands in the
// compiled module: the Worker imports the .wasm, which wrangler uploads as a
// WebAssembly.Module, and the local bench compiles the file itself.
//
// The binding follows the package's lib/index.js. Each input goes into a fixed
// buffer in the module's memory, the call works on those buffers in place, and
// they're zeroed afterwards so no key or signature lingers there.

export interface Secp256k1Wasm {
  /** A low-s signature (r ‖ s, 64 bytes) over a 32-byte hash, nonce per RFC 6979, and its recovery id. */
  signRecoverable(hash: Uint8Array, privateKey: Uint8Array): { signature: Uint8Array; recoveryId: number };
  /** The uncompressed public key (65 bytes) that made the signature, or null if none did. */
  recover(hash: Uint8Array, signature: Uint8Array, recoveryId: number): Uint8Array | null;
  /** The uncompressed public key (65 bytes) of a private key, without signing anything. */
  publicKey(privateKey: Uint8Array): Uint8Array;
}

interface Exports {
  memory: WebAssembly.Memory;
  PRIVATE_INPUT: WebAssembly.Global;
  PUBLIC_KEY_INPUT: WebAssembly.Global;
  HASH_INPUT: WebAssembly.Global;
  SIGNATURE_INPUT: WebAssembly.Global;
  signRecoverable(withExtraData: 0 | 1): number;
  recover(outputLength: number, recoveryId: number): number;
  pointFromScalar(outputLength: number): number;
}

const PRIVATE_KEY_SIZE = 32;
const PUBLIC_KEY_SIZE = 65;
const HASH_SIZE = 32;
const SIGNATURE_SIZE = 64;

/**
 * Instantiates the module. libsecp256k1 seeds its side-channel blinding once,
 * on the first signature or recovery, from 32 random bytes. Workers allows
 * random numbers only inside a handler, so a Worker that signs at module scope
 * passes a secret 32-byte seed instead. Without one, that first call must come
 * from a handler.
 */
export function instantiateSecp256k1(module: WebAssembly.Module, blindingSeed?: Uint8Array): Secp256k1Wasm {
  if (blindingSeed) expectLength(blindingSeed, 32, "blinding seed");
  // A copy, zeroed and dropped once libsecp256k1 has drawn all 32 bytes.
  let seed: Uint8Array | undefined = blindingSeed?.slice();
  let seedUsed = 0;
  const generateInt32 = (): number => {
    if (seed) {
      const value = new DataView(seed.buffer, seedUsed, 4).getInt32(0);
      seedUsed += 4;
      if (seedUsed === 32) {
        seed.fill(0);
        seed = undefined;
      }
      return value;
    }
    return crypto.getRandomValues(new Int32Array(1))[0];
  };
  const instance = new WebAssembly.Instance(module, {
    "./rand.js": { generateInt32 },
    "./validate_error.js": {
      throwError: (code: number) => {
        throw new TypeError(`secp256k1 refused its input (error ${code})`);
      },
    },
  });
  const wasm = instance.exports as unknown as Exports;

  // The module never grows its memory, so these views stay valid.
  const memory = new Uint8Array(wasm.memory.buffer);
  const buffer = (pointer: WebAssembly.Global, size: number) =>
    memory.subarray(pointer.value as number, (pointer.value as number) + size);
  const privateKeyInput = buffer(wasm.PRIVATE_INPUT, PRIVATE_KEY_SIZE);
  const publicKeyInput = buffer(wasm.PUBLIC_KEY_INPUT, PUBLIC_KEY_SIZE);
  const hashInput = buffer(wasm.HASH_INPUT, HASH_SIZE);
  const signatureInput = buffer(wasm.SIGNATURE_INPUT, SIGNATURE_SIZE);

  return {
    signRecoverable(hash, privateKey) {
      expectLength(hash, HASH_SIZE, "hash");
      expectLength(privateKey, PRIVATE_KEY_SIZE, "private key");
      // As lib/index.js checks: a key outside [1, n) would reach the Rust code,
      // which refuses it by trapping, not with a clear error.
      if (!inScalarRange(privateKey)) throw new TypeError("The private key is out of range");
      try {
        hashInput.set(hash);
        privateKeyInput.set(privateKey);
        const recoveryId = wasm.signRecoverable(0);
        return { signature: signatureInput.slice(), recoveryId };
      } finally {
        hashInput.fill(0);
        privateKeyInput.fill(0);
        signatureInput.fill(0);
      }
    },

    recover(hash, signature, recoveryId) {
      expectLength(hash, HASH_SIZE, "hash");
      expectLength(signature, SIGNATURE_SIZE, "signature");
      // Ethereum's v carries only 0 or 1. Ids 2 and 3 mean r overflowed the
      // curve order, which lib/index.js checks before it lets them through.
      if (recoveryId !== 0 && recoveryId !== 1) throw new TypeError(`Bad recovery id ${recoveryId}`);
      // A wallet's signature is untrusted input: r and s must each lie in
      // [1, n), as lib/index.js checks before calling in.
      if (!inScalarRange(signature.subarray(0, 32)) || !inScalarRange(signature.subarray(32))) return null;
      try {
        hashInput.set(hash);
        signatureInput.set(signature);
        return wasm.recover(PUBLIC_KEY_SIZE, recoveryId) === 1 ? publicKeyInput.slice() : null;
      } finally {
        hashInput.fill(0);
        signatureInput.fill(0);
        publicKeyInput.fill(0);
      }
    },

    publicKey(privateKey) {
      expectLength(privateKey, PRIVATE_KEY_SIZE, "private key");
      if (!inScalarRange(privateKey)) throw new TypeError("The private key is out of range");
      try {
        privateKeyInput.set(privateKey);
        if (wasm.pointFromScalar(PUBLIC_KEY_SIZE) !== 1) throw new TypeError("secp256k1 refused the private key");
        return publicKeyInput.slice();
      } finally {
        privateKeyInput.fill(0);
        publicKeyInput.fill(0);
      }
    },
  };
}

// secp256k1's group order n, big-endian.
const ORDER = Uint8Array.from([
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
  0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b, 0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
]);

/** Whether a 32-byte big-endian scalar is in [1, n). */
function inScalarRange(scalar: Uint8Array): boolean {
  if (scalar.every((byte) => byte === 0)) return false;
  for (let i = 0; i < 32; i++) {
    if (scalar[i] !== ORDER[i]) return scalar[i] < ORDER[i];
  }
  return false;
}

function expectLength(bytes: Uint8Array, size: number, name: string): void {
  if (bytes.length !== size) throw new TypeError(`Expected a ${size}-byte ${name}, got ${bytes.length}`);
}
