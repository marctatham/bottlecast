// The local stack for the end-to-end run: a Hardhat node with the contract deployed by its Ignition
// module, the Firestore emulator with firebase/'s rules, a server for a test key set standing in for
// Google's, and the Worker under `wrangler dev`. Everything binds to 127.0.0.1 and uses throwaway keys.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("../../", import.meta.url));
export const CONTRACTS = join(REPO, "contracts");
export const FIREBASE = join(REPO, "firebase");
export const WORKER = join(REPO, "worker");

export const HARDHAT_URL = "http://127.0.0.1:8545";
/** firebase/firebase.json's port. */
export const EMULATOR_HOST = "127.0.0.1:8180";
export const PROJECT_ID = "demo-bottlecast";

export class Stack {
  readonly scratch = mkdtempSync(join(tmpdir(), "bottlecast-e2e-"));
  private readonly children: ChildProcess[] = [];
  private jwks: Server | null = null;

  /** Where each service's output goes, for when something fails. */
  log(name: string): string {
    return join(this.scratch, `${name}.log`);
  }

  async startHardhat(): Promise<void> {
    await refuseIfBusy(HARDHAT_URL, "a Hardhat node or another chain");
    this.spawn("hardhat", join(CONTRACTS, "node_modules/.bin/hardhat"), ["node"], CONTRACTS);
    await waitFor("the Hardhat node", async () => {
      const response = await fetch(HARDHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      return response.ok;
    });
  }

  /** Deploys BottleCastKeepsakes with its Ignition module, naming `minter`. Returns its address. */
  async deployContract(minter: string): Promise<`0x${string}`> {
    const parameters = join(this.scratch, "ignition-parameters.json");
    writeFileSync(parameters, JSON.stringify({ BottleCastKeepsakes: { minter } }));
    await this.run(
      "ignition",
      join(CONTRACTS, "node_modules/.bin/hardhat"),
      ["ignition", "deploy", "ignition/modules/BottleCastKeepsakes.ts", "--network", "localhost", "--parameters", parameters, "--reset"],
      CONTRACTS,
      "y\n",
    );
    const deployed = JSON.parse(
      readFileSync(join(CONTRACTS, "ignition/deployments/chain-31337/deployed_addresses.json"), "utf8"),
    ) as Record<string, `0x${string}`>;
    const address = deployed["BottleCastKeepsakes#BottleCastKeepsakes"];
    if (!address) throw new Error("Ignition didn't record the contract's address");
    return address;
  }

  async startEmulator(): Promise<void> {
    await refuseIfBusy(`http://${EMULATOR_HOST}`, "a Firestore emulator");
    this.spawn(
      "emulator",
      join(FIREBASE, "node_modules/.bin/firebase"),
      ["emulators:start", "--only", "firestore", "--project", PROJECT_ID],
      FIREBASE,
    );
    await waitFor("the Firestore emulator", async () => (await fetch(`http://${EMULATOR_HOST}/`)).ok, 90_000);
  }

  /** Serves `jwks` the way Google serves Firebase's signing keys. Returns its URL. */
  async serveJwks(jwks: object): Promise<string> {
    this.jwks = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" });
      response.end(JSON.stringify(jwks));
    });
    await new Promise<void>((resolve) => this.jwks!.listen(0, "127.0.0.1", resolve));
    const address = this.jwks.address();
    if (!address || typeof address === "string") throw new Error("The key server has no port");
    return `http://127.0.0.1:${address.port}/jwks`;
  }

  /** `wrangler dev` with `vars` (secrets included) from an env file in the scratch folder. */
  async startWorker(port: number, vars: Record<string, string>): Promise<string> {
    const url = `http://127.0.0.1:${port}`;
    await refuseIfBusy(url, "something on the Worker's port");
    const envFile = join(this.scratch, "worker.env");
    writeFileSync(envFile, Object.entries(vars).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
    this.spawn(
      "wrangler",
      join(WORKER, "node_modules/.bin/wrangler"),
      [
        "dev",
        "--port",
        String(port),
        "--ip",
        "127.0.0.1",
        "--env-file",
        envFile,
        "--test-scheduled",
        "--persist-to",
        join(this.scratch, "wrangler-state"),
        "--show-interactive-dev-session=false",
      ],
      WORKER,
    );
    await waitFor("wrangler dev", async () => (await fetch(`${url}/`)).status === 404, 60_000);
    return url;
  }

  async stop(): Promise<void> {
    this.jwks?.close();
    for (const child of this.children.reverse()) {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    await Promise.all(
      this.children.map((child) => (child.exitCode === null ? new Promise((resolve) => child.once("exit", resolve)) : null)),
    );
  }

  private spawn(name: string, command: string, args: string[], cwd: string): ChildProcess {
    if (!existsSync(command)) throw new Error(`${command} is missing: run npm ci in ${cwd}`);
    const out = createWriteStream(this.log(name));
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "true" } });
    child.stdout!.pipe(out);
    child.stderr!.pipe(out);
    this.children.push(child);
    return child;
  }

  private run(name: string, command: string, args: string[], cwd: string, input: string): Promise<void> {
    if (!existsSync(command)) throw new Error(`${command} is missing: run npm ci in ${cwd}`);
    const out = createWriteStream(this.log(name));
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CI: "true" } });
    child.stdout!.pipe(out);
    child.stderr!.pipe(out);
    child.stdin!.end(input);
    return new Promise((resolve, reject) =>
      child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited ${code}: see ${this.log(name)}`)))),
    );
  }
}

async function waitFor(what: string, ready: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await ready()) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${what} didn't start within ${timeoutMs / 1000} s`);
}

async function refuseIfBusy(url: string, what: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1_000) });
  } catch {
    return;
  }
  throw new Error(`${url} already answers (${what}): stop it first, so the run starts clean`);
}
