// A smart wallet for the end-to-end run, small enough to write in EVM bytecode, so the run needs no
// Solidity of its own: any call returns EIP-1271's magic value when ecrecover(hash, signature) is its
// owner, and 0xffffffff otherwise. With a one-line CREATE2 factory, the same wallet can be checked
// before it exists (ERC-6492), as a Coinbase Smart Wallet is before its first transaction.
import { concat, encodeAbiParameters, getContractAddress, type Hex } from "viem";

/** The wallet's code. Calldata is isValidSignature(bytes32 hash, bytes signature) with r, s, v at 100. */
export function walletRuntime(owner: Hex): Hex {
  return `0x${[
    "600435600052", // mem[0x00] = hash
    "60a43560f81c602052", // mem[0x20] = v, the byte at 164
    "606435604052", // mem[0x40] = r
    "608435606052", // mem[0x60] = s
    "602060806080600060015afa50", // staticcall(gas, ecrecover, 0, 0x80, 0x80, 0x20)
    "608051", // the recovered address
    `73${owner.slice(2).toLowerCase()}14`, // == owner
    "605457", // if so, jump to 0x54
    "63ffffffff60e01b60005260206000f3", // return 0xffffffff
    "5b631626ba7e60e01b60005260206000f3", // 0x54: return 0x1626ba7e
  ].join("")}`;
}

/** Code that deploys the wallet: copies the runtime after it into memory and returns it. */
export function walletInitCode(owner: Hex): Hex {
  const runtime = walletRuntime(owner);
  const length = (runtime.length - 2) / 2;
  if (length !== 0x65) throw new Error(`The wallet's runtime is ${length} bytes, not 101`);
  // PUSH1 0x65, DUP1, PUSH1 0x0b, PUSH1 0, CODECOPY, PUSH1 0, RETURN, then the runtime at byte 11
  return `0x606580600b6000396000f3${runtime.slice(2)}`;
}

/**
 * A factory whose calldata is init code, which it deploys with CREATE2 and salt 0:
 * CALLDATACOPY(0, 0, size), then CREATE2(0, 0, size, 0), then STOP.
 */
export const FACTORY_RUNTIME: Hex = "0x36600060003760003660006000f500";

/** Where the factory would deploy the wallet. */
export function counterfactualAddress(factory: Hex, owner: Hex): Hex {
  return getContractAddress({ opcode: "CREATE2", from: factory, salt: `0x${"00".repeat(32)}`, bytecode: walletInitCode(owner) });
}

/** ERC-6492's wrapping of a signature by a wallet that doesn't exist yet. */
export function wrap6492(factory: Hex, owner: Hex, signature: Hex): Hex {
  const wrapped = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }, { type: "bytes" }],
    [factory, walletInitCode(owner), signature],
  );
  return concat([wrapped, `0x${"6492".repeat(16)}`]);
}
