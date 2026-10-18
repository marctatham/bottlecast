# BottleCast Worker

The Cloudflare Worker that slice 6 adds (`docs/design/decisions.md`, 2026-10-18). It links wallets to BottleCast accounts, and once a minute it seals one kept bottle as a keepsake on Base: `BottleCastKeepsakes` (`contracts/`). It runs on the Free plan: 10 ms of CPU per request or cron run, which slice 5's spike showed is enough on a cold isolate with secp256k1 as WebAssembly, the mint encoded by hand, and a warm-up at startup (decisions.md, 2026-10-16 and 2026-10-17).

This Worker, `bottlecast-debug`, serves debug builds: the debug Firebase project and Base Sepolia. Mainnet will be an environment of its own, in the release step the owner approves.

## Routes
Every route is a `POST` with a JSON body and `Authorization: Bearer <Firebase ID token>`. The token must be the Worker's Firebase project's, from an account with a Google identity: the same test as the rules' `hasGoogle()`, so a guest that linked Google passes. Every answer is JSON. A refusal is `{ "error": "<code>" }`, which the app turns into the spec's copy (§3.9).

| Route | Body | Answer |
|---|---|---|
| `/wallet/nonce` | `{ address }` | `{ message, expiresAt }`: the "Prove it's yours" message for the wallet to sign with plain `personal_sign` |
| `/wallet/link` | `{ message, signature, receiving?, walletName? }` | `{ address, receiving }`: the EIP-55 address, and whether it's now the receiving wallet |
| `/wallet/unlink` | `{ address }` | `{ receiving }`: the receiving wallet afterwards, or null |

- **The message** is SIWE (EIP-4361): domain `bottling-messages.web.app`, statement "Link this wallet to BottleCast", URI `https://bottling-messages.web.app`, chain `CHAIN_ID`, a 10-minute expiry. Its nonce is an HMAC of the account, the address and the issue time, so nothing is stored, and a message only works for the account that asked for it. `/wallet/link` takes only a message this Worker would have written, byte for byte.
- **The signature:** an ordinary wallet's 65 bytes are recovered in the Worker. A smart wallet's go through one batched request to the chain: its code, and an `eth_call` to ERC-6492's validator, which checks EIP-1271 and also wallets not deployed yet. A smart wallet signs for one chain, so the app must make `CHAIN_ID` the wallet's active chain before asking it to sign.
- **Receiving:** the first wallet receives. Linking again with `receiving: true` switches to that wallet, which is how the app switches (it asks the wallet to sign once, spec §3.9b). Exactly one wallet receives while any are linked.
- **`walletName`** is the wallet app's name from AppKit ("Rainbow"), up to 40 characters, for the Wallets screen.
- **Unlinking** moves receiving to the most recently linked wallet left. Seals asked for to that wallet that haven't started go to the new receiving wallet, or back to the chest (`pending_wallet`) when none is left. A mint already under way finishes.
- `/wallet/nonce` never says whether an address is linked elsewhere, so nobody can use it to look up which addresses use BottleCast. That only shows after the wallet signs.

| Code | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No token, or one that isn't valid for this project |
| `google_required` | 403 | A guest: sign in with Google first |
| `account_closing` | 403 | The account is being deleted (`deletions/{uid}` exists) |
| `bad_request` | 400 | A malformed body, address or signature |
| `bad_message` | 400 | Not a message this Worker issued to this account |
| `nonce_expired` | 400 | Its 10 minutes are up: ask for a new one ("That took a while — let's try again.") |
| `bad_signature` | 400 | The wallet didn't sign it |
| `wallet_taken` | 409 | Another account holds the wallet ("This wallet belongs to another BottleCast account. Unlink it there first.") |
| `busy` | 503 | Contention or an unreachable service; nothing changed, so try again |
| `not_configured` | 503 | The Worker's secrets aren't set yet |

## The cron
Every minute, one claim moves on, so there's one minter whose nonce never races (decisions.md, 2026-10-18).
1. **Idle check:** one query for the oldest claim that's `cooling` past its `sealAfter`, or `minting`. Nothing due ends the run. With the access token in KV, an idle run is one KV read and one Firestore read: about 1,440 of Spark's 50,000 reads a day.
2. **Read and lease:** one read-write transaction reads `minter/state`, the claim, its bottle, the wallet and the keeper's tombstone. Another run's unexpired lease stops this one.
3. **A mint under way finishes first:** by its receipt; by rebroadcasting it; by replacing it at the same nonce with higher fees when it's been stuck 5 minutes behind the network's (or, if the bottle was removed meanwhile, with a 0-value send that cancels it); or, when another transaction used its nonce, by recording the seal if the contract has it, and otherwise sending the claim back to `cooling`.
4. **Otherwise the claim is checked again:** the bottle is kept, sealable and within the contract's limits; one under review waits an hour, so it doesn't hold up the queue; one removed or gone fails; one whose wallet was unlinked goes back to the chest, unless the keeper deleted their account, when it seals to the wallet they named.
5. **One batched chain read:** the mined nonce, the fees, the balance, `tokenOfMessage`, a gas estimate (which also catches a mint the contract would refuse) and Base's L1 fee bound. Too little ETH, or a minter that lost `MINTER_ROLE`, sets `delayedSince` on the claim and holds the queue ("Sealing · delayed").
6. **Sign, record, send:** the mint is signed, recorded as `minting` with its hash before it's sent, sent, and its receipt awaited for up to 10 s.
7. **Record:** `minted` with `tokenId`, `to`, `txHash` and `mintedAt`, the bottle's `sealedAt`, and the lease released, in one commit.

The keepsake carries the message's words, its cast time, its pen name (or none), sea glass (every bottle is, for now: `BottleLook.kt`), and the verified mark: HMAC-SHA256 with `MARK_KEY` over `<writer's uid>:<messageId>`. A writer who deleted their account after the seal was asked for has no uid any more, so the mark uses `(deleted)` in its place, which no Firebase uid can equal.

## What it writes
Only the Worker writes these, as a service account the rules don't bind. `firebase/firestore.rules` lets an account read its own.

- **`users/{uid}/wallets/{address}`:** `address` (EIP-55), `receiving`, `linkedAt`, and `walletName` when the app sent one. The id is the lowercase address. Nothing goes on `users/{uid}` itself, whose keys the rules pin.
- **`walletIndex/{address}`:** `uid`, `linkedAt`. One account per address.
- **`claims/{messageId}`**, after the keeper's own ask (`pending_wallet` or `failed` to `cooling`, with `sealAfter` and `to`), as spec §1.7 has it:
  - `minting`: `txHash`, `nonce`;
  - `minted`: `tokenId`, `to`, `txHash`, `mintedAt` (`txHash` is left out in the rare case where an earlier transaction sealed the bottle and its hash isn't known);
  - `failed`: `error`, one of `reverted`, `removed`, `gone`, `not_kept`, `not_sealable`, `too_long`, `bad_recipient`;
  - `delayedSince` while the minter can't pay, cleared on `minting` and `failed`.

  A claim whose keeper deleted their account is deleted when its seal ends, so nothing keeps tying the old account to a wallet.
- **`messages/{id}.sealedAt`** when a bottle is sealed.
- **`minter/state`:** `leaseUntil`, `inFlight` (the mint under way: every hash sent for it, the signed transaction and its fees), `nextNonce`. No client can read it.

## What's here
- `src/index.ts`: the entry point. At module scope it reads the config, compiles and seeds the signer, derives the minter's address and runs the warm-up.
- `src/wallets.ts`: the three routes. `src/siwe.ts`: the message and its nonce. `src/auth.ts`: the ID token, on WebCrypto, with Google's keys cached in KV.
- `src/minter.ts`: the cron's reads, writes and sends; `src/minter-decide.ts`: its decisions, as pure functions.
- `src/firestore.ts`: Firestore over REST (`batchGet`, `runQuery`, `commit`, `rollback`), with read-write transactions started by the first read. `src/google-token.ts`: the service account's access token, cached in KV for 55 minutes.
- `src/rpc.ts`: JSON-RPC as one batch, parsed by hand, falling back to single calls when a batch is refused.
- `src/mint-tx.ts`: the mint and its EIP-1559 envelope, encoded and signed by hand. `src/secp256k1-wasm.ts`: libsecp256k1 as WebAssembly, from `tiny-secp256k1`. `src/eth.ts`: addresses, `personal_sign`, receipts and the contract's refusals. `src/erc6492-validator.ts`: ERC-6492's validator, as viem compiles it.
- `src/warm-up.ts`: 30 rounds of every hot path at startup, with a throwaway key and chain id 0, so the minter key never signs there.
- `test/`: Vitest for the pure parts, with viem, jose and noble as oracles. `e2e/`: the local end-to-end run. `bench/`: the measurement harness. `scripts/new-secrets.ts`: the deploy's secrets.

viem, jose and noble's curves are dev dependencies only, so the Worker ships no general-purpose library for V8 to interpret on a cold isolate. Its bundle is 1,313 KiB, or 1,162 KiB gzipped, most of it the WebAssembly (Free allows 3 MB).

## Config
- **Vars** (`wrangler.jsonc`, public): `CHAIN_ID` (84532), `RPC_URL` (`https://sepolia.base.org`, Base Sepolia's public endpoint; a free keyed endpoint can replace it), `CONTRACT_ADDRESS` (empty until the contract is deployed; the cron idles until then), `SIWE_DOMAIN`, `SIWE_URI`, `RECEIPT_WAIT_MS`.
- **Secrets** (`wrangler secret`, never in the repo): `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` (the service account's JSON key), `MINTER_KEY`, `SIGNER_SEED` (libsecp256k1's blinding, since Workers allows no random numbers at module scope), `MARK_KEY`, `NONCE_KEY`. Until they're all set, routes answer `not_configured` and the cron does nothing.
- **KV:** `CACHE` holds Google's keys and the access token. `wrangler.jsonc` names no namespace id: the first deploy creates it and keeps it linked (revert the id it writes back into the file).
- **Local and test only:** `FIRESTORE_EMULATOR_HOST` points it at the emulator, which takes `Bearer owner`; `JWKS_URL` replaces Google's keys with a test set.

## Running it
```bash
npm ci
npm run check    # wrangler types, then src/ (Workers) and the tests, bench, e2e and scripts (Node)
npm test         # Vitest
npm run e2e      # the local end-to-end run
npx wrangler deploy --dry-run
```

`npm run e2e` needs `contracts/` and `firebase/` installed (`npm ci` in each), Java 21 or later for the emulator, and ports 8545, 8180 and 8799 free. It starts a Hardhat node and deploys the contract with its Ignition module, starts the Firestore emulator with firebase/'s rules, and runs the Worker under `wrangler dev --test-scheduled`, all with throwaway keys. Then it:
1. links a wallet, asks to seal through the rules, fires the cron, and checks `minted`, `sealedAt`, the `tokenURI` JSON and the mark;
2. seals a bottle whose writer deleted their account after the ask, with the stand-in mark;
3. empties the minter (delayed), then tops it up (sealed);
4. leaves a mint unmined (it finishes on the next run) and drops one from the node (it's rebroadcast);
5. unlinks the receiving wallet (the seal follows the new receiving wallet), then the last one (back to the chest);
6. refuses a wallet another account holds, and a signature that isn't the wallet's;
7. links smart wallets, one deployed (EIP-1271) and one not yet (ERC-6492), from a wallet written in bytecode (`e2e/test-wallet.ts`);
8. revokes the minter's role (delayed), then grants it back (sealed).

It stops everything when it's done, and on a failure it names the folder that holds each service's output.

## Deploying
Each step needs the owner's OK (`CLAUDE.md`). Wrangler uses the owner's account, the only one it's logged in to.
1. **The Worker:** `npx wrangler deploy`. It creates the KV namespace and the cron, and idles until it's configured. Revert the KV id it writes into `wrangler.jsonc`.
2. **Its own secrets:** `node scripts/new-secrets.ts`. It generates the minter key, the blinding seed and the mark and nonce keys, pipes them straight into `wrangler secret bulk`, and prints only the minter's address. No copy is kept: a lost minter key is replaced (`--replace`) and the new address granted `MINTER_ROLE`.
3. **The contract,** naming that address as its minter (`contracts/README.md`). Then put its address in `CONTRACT_ADDRESS` and deploy again.
4. **Firebase:** the project ID with `printf %s <project-id> | npx wrangler secret put FIREBASE_PROJECT_ID`, and a service account on that project with the Cloud Datastore User role, its key piped straight in: `gcloud iam service-accounts keys create /dev/stdout --iam-account=<account> | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT`. Neither is printed or written to disk.
5. **The rules and indexes** (`firebase/`), and **test ETH** for the minter from a Base Sepolia faucet.

## Measuring
A Worker can't time itself: its clock stands still while it computes. The CPU figures are Cloudflare's, in whole milliseconds: Workers Logs' `$workers.cpuTimeMs` per invocation, on the Worker's Observability page (`wrangler.jsonc` turns Workers Logs on), or `cpuTime` from `wrangler tail --format json`, summarised by `node bench/summarise.ts <tail.jsonl>`. Some networks block tail's host; Workers Logs miss some events too.
- **Cold:** redeploy with `--var RUN:cold-<n>`, which starts a new version on fresh isolates, then send the first request. For the routes: `WORKER_URL=… ID_TOKEN=… node bench/run.ts cold <n>`, which links a throwaway wallet and unlinks it again. Every cron run is cold already.
- **Warm:** `node bench/run.ts warm <rounds>`, with `GAP_MS` to space them out.
- **A first read on this machine:** `node bench/local.ts`, each hot path's first call in a fresh Node process, then its steady cost.

The pass bar is 5 ms of CPU, cold, for every invocation (decisions.md, 2026-10-18).

## Results
Locally, on an M1 Pro with Node 24, before any warm-up: a mint's signature and encoding cost 2.0 ms of CPU on its first call and 0.2 ms after; a link's SIWE check and recovery 1.4 ms and 0.2 ms; an ID token's check 0.5 ms and under 0.1 ms.

The deployed figures come with the deploy (decisions.md). Slice 5's spike measured the same signer and encoding on the Free plan: a cold mint 1–6 ms, a cold link 1–5 ms and a cron mint 1–3 ms with the 30-round warm-up. Its harness and its full tables are in git history (`worker/README.md` before this Worker replaced the spike).
