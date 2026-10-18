// Drives the deployed Worker's wallet routes for the CPU measurements in README.md. The CPU figures
// come from Workers Logs or `wrangler tail`, not from here: a Worker's clock stands still while it
// computes. It needs a Firebase ID token with a Google identity for the Worker's project.
//   WORKER_URL=https://bottlecast-debug.<subdomain>.workers.dev ID_TOKEN=… node bench/run.ts cold <label>
//   WORKER_URL=… ID_TOKEN=… node bench/run.ts warm [rounds]
// Each round links a throwaway wallet (/wallet/nonce, then /wallet/link) and unlinks it again, so the
// account ends as it started. `?run=` labels each request for the logs. GAP_MS spaces warm rounds.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const base = process.env.WORKER_URL;
const token = process.env.ID_TOKEN;
if (!base || !token) {
  console.error("Set WORKER_URL and ID_TOKEN (never commit or paste the token)");
  process.exit(1);
}
const gapMs = Number(process.env.GAP_MS ?? 0);
const [mode = "cold", arg] = process.argv.slice(2);

async function call(route: string, run: string, body: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${route}?run=${run}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** One link and unlink of a fresh throwaway wallet; returns each route's status. */
async function round(run: string): Promise<string> {
  const wallet = privateKeyToAccount(generatePrivateKey());
  const nonce = await call("/wallet/nonce", run, { address: wallet.address });
  if (nonce.status !== 200) return `nonce ${nonce.status} ${JSON.stringify(nonce.body)}`;
  const message = nonce.body.message as string;
  const link = await call("/wallet/link", run, { message, signature: await wallet.signMessage({ message }) });
  const unlink = await call("/wallet/unlink", run, { address: wallet.address });
  return `nonce ${nonce.status}, link ${link.status} ${link.status === 200 ? "" : JSON.stringify(link.body)}, unlink ${unlink.status}`;
}

if (mode === "cold") {
  // After a redeploy (README.md), so the first request lands on a fresh isolate.
  console.log(await round(`cold-${arg ?? "0"}`));
} else if (mode === "warm") {
  const rounds = Number(arg ?? 20);
  for (let i = 0; i < rounds; i++) {
    if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
    console.log(await round("warm"));
  }
} else {
  console.error(`Unknown mode ${mode}: use cold or warm`);
  process.exit(1);
}
