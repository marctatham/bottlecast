# BottleCast

BottleCast is a message-in-a-bottle app. People cast short messages into a shared sea, and other people find them. It is being rebuilt, slice by slice, to the "Moonlit Shore" redesign:
- fixed Night and Dawn themes
- one bottle a day
- a chest of kept bottles
- gifts
- keepsakes a finder can seal as an NFT on Base

The design source is in `docs/design/`. Start with `docs/design/README.md`, then read only the spec sections and boards for your slice. Never load the whole spec (over 75 KB) or every board.

## Repo layout
This is the BottleCast monorepo. Each part has its own folder.
- `android/` is the Android app, a Gradle project with one module, `:app`, package `com.bottlecast.app`. **Before working in it, read `android/CLAUDE.md`**: its stack and layout, conventions, build and test commands, and gotchas.
- `web/` is the static site on the production project's Firebase Hosting: the privacy and my-data pages, and the Terms of Use and Community guidelines once they're deployed. The app opens `/terms.html`, `/guidelines.html` and `/privacy.html` (`common/legal/LegalLinks.kt`), and Hosting has no `cleanUrls`, so those exact paths must keep working.
- `contracts/` is the Hardhat 3 project (viem, node:test) for `BottleCastKeepsakes`, the keepsake contract. `contracts/README.md` says what it does, and how to test and deploy it.
- `firebase/` holds `firestore.rules`, `firestore.indexes.json` and the rules' emulator tests (Node). `scripts/` holds the Python tools for Play uploads, the message migration and the admin claim; `scripts/README.md` says how to run each.
- `worker/` is the Cloudflare Worker (TypeScript, wrangler): it links wallets for the app, and a once-a-minute cron seals kept bottles as keepsakes. `worker/README.md` has its routes and error codes, the data it writes, and how to run, deploy and measure it.
- `docs/design/` is the design source for every platform (above).

## Build and verify
- There is no CI, so these commands are the only gate.
- **Android:** the verify command and the rest are in `android/CLAUDE.md`.
- **Worker:** `cd worker && npm ci && npm run check && npm test` typechecks it and runs its Vitest tests, and `npx wrangler deploy --dry-run` bundles it without uploading. `npm run e2e` runs it end to end on this machine, against a Hardhat node, the Firestore emulator and `wrangler dev`, with throwaway keys. It needs `contracts/` and `firebase/` installed, Java 21 or later, and ports 8545, 8180 and 8799 free.
- **Firestore rules:** `cd firebase && npm ci && npm run test:emulator` runs the rules tests in the emulator, against a demo project. It needs Java 21 or later on PATH (JBR 25 is) and Node 22.12 or later. Use the `firebase-tools` that `package.json` pins, never an older global CLI. The emulator doesn't check indexes, so try new queries against the debug project.
- **Contracts:** `cd contracts && npm ci && npx hardhat test` compiles the contract and runs its node:test tests on Hardhat's in-process network. `npm run check` type-checks the tests and the Ignition module. Both need Node 22.10 or later.
- **Web:** plain HTML with no build step. Open the pages in `web/public/` in a browser to check them.

## Environments and safety
- **Firebase projects:** debug builds (`com.bottlecast.app.debug`) use the debug Firebase project; release builds (`com.bottlecast.app`) use production. Never commit, print or paste either `google-services.json`.
- **Production is off limits without asking.** Never sign in to, read or write production Firebase without asking first.
  - A production write needs an explicit yes, a backup and a dry run.
  - Before a Firebase smoke test, check that `project_id` in `android/app/build/generated/res/processDebugGoogleServices/values/values.xml` is the debug project.
- **Rules, indexes and data scripts** (`firebase/`, `scripts/`) change a live project, debug included, so each step needs the owner's OK.
  - A deploy replaces what the project runs: run a rules deploy with `--dry-run` first.
  - Always pass `--project`. Never run `firebase init`, and keep every `.firebaserc` (`firebase/`, `web/`) out of git: it names the project.
  - `scripts/migrate_messages.py` and `scripts/set_admin_claim.py` change nothing without `--apply`. The migration backs the project up first, outside the repo, and never prints message text or uids.
- **Web hosting:** `web/` deploys to the production Firebase project, and a deploy replaces the whole live site with `web/public/`, so each deploy needs the owner's OK. Run it from `web/` with the `firebase-tools` that `firebase/package.json` pins, pass `--project`, and try a change on a preview channel (`hosting:channel:deploy`) before the live site.
- **Secrets** stay out of the repo, the logs and the chat: keystores, the signing values in `android/local.properties`, Worker secrets, minter keys and API tokens. The owner signs releases; never ask for or handle keystore passwords.
- **Releases are the owner's call.** Only when asked:
  - fast-forward `master` with `git push origin develop:master` (never force)
  - upload with `scripts/play_upload.py`. It needs `gcloud`, `bundletool`, and `PLAY_UPLOAD_ACCOUNT` when the active gcloud account isn't the right one.

  Show the owner the script's dry run (track, versionCode, notes) and get an explicit yes before running `release --yes`.
- **Cloudflare:** wrangler deploys to the owner's own account, the only one it's logged in to. `wrangler.jsonc` names no `account_id` and no KV namespace id, so the public repo holds neither: a deploy writes the KV id back into the file, so revert it. Deploying, adding a cron or changing an account setting needs the owner's OK, and spike Workers are deleted once measured. Wrangler registers a workers.dev subdomain by itself if the account has none.
  - The Worker's own keys come from `worker/scripts/new-secrets.ts`, which pipes them straight into `wrangler secret bulk` and prints only the minter's address. The service account's key goes from `gcloud` straight into `wrangler secret put`. Neither is ever printed or written to disk.
- **Chain work** runs on Base Sepolia. Deploying to Base mainnet, or funding a mainnet minter, needs the owner's approval. Ask before deploying from `contracts/` to any network. The deployer's key lives in Hardhat's keystore (`npx hardhat keystore set BASE_SEPOLIA_DEPLOYER_KEY`), which the owner fills in. A deploy asks for the keystore's password, so it runs in the owner's own terminal.
- Notes specific to one machine belong in `CLAUDE.local.md` (gitignored), not here.

## Git and PRs
- **Branches:** branch from `develop` with a kebab-case name and open the PR into `develop` (`gh pr create --base develop`). Commit straight to `develop` only when the owner says so.
- **Commit messages:**
  - Subject: imperative, sentence case, no full stop, about 72 characters at most.
  - Body wrapped at 72 characters: the why or root cause first, then `- ` bullets listing the changes.
- **PR description:** what changed and why, and how you verified it (commands run, screenshot tests added). The golden PNGs in the diff show the UI.
- **Version bumps:** changing `versionCode`/`versionName` in `android/app/build.gradle.kts` is a commit of its own.
- **The repo is public.** Never add any of these to code, docs, commits or PRs:
  - personal emails or account names
  - keys, tokens or signing values
  - new console identifiers (Firebase project IDs, Play account or app IDs)

  The one exception is the contact address the legal pages already published (`web/public/privacy.html`, `mydata.html` and `web/README.md`). `docs/design/open-issues.md` tracks replacing it; never add it anywhere else.

## Implementing a redesign slice
1. **Plan first, in plan mode.** Read `docs/design/README.md` and `docs/design/decisions.md`, then the slice's sections of `docs/design/spec.md` and its boards in `docs/design/boards/`. Hand several boards to a subagent rather than reading them all yourself. Raise the slice's open items from `docs/design/open-issues.md`.
2. **Plan the files, states and tests,** and say what is out of scope. Get the plan approved.
3. **Branch from `develop` and implement.** When sources disagree: `decisions.md` beats `spec.md` (its §6 lists where a board wins), which beats the boards, which beat `wallets.md` and `research/`.
4. **Add or extend a `*ScreenshotTest`** for every new or changed screen state, in Night and in Dawn. Record it, then Read each PNG.
5. **Compare each PNG with its board's markup** (you can't render the boards): layout, spacing, colour, type, copy and icons. Fix and re-record until they match, or until the only difference is one that spec §6 accepts.
6. **Run Android's verify command (`android/CLAUDE.md`), then `verifyRoborazziDebug`.** For new navigation or flows, add instrumented tests and run them on a read-only emulator.
7. **Finish up:**
   - run `/code-review` and fix what it finds
   - tick the slice in `docs/design/README.md`
   - update this file or `android/CLAUDE.md` if a command, convention or gotcha changed
   - open the PR

## Copy rules
- Sentence case. No emoji in labels, buttons or titles; user messages may contain them.
- Never use "earn", "value", "worth", "rare", "rarity", "profit" or "invest". Say "keep", "collect" and "seal". Badges are "collected".
- Warm, never shaming: "Streak resting", not "You lost your streak!". Every error says what is safe and what to do next.
- No prices. For fees, say "Free for you — BottleCast covers the tiny network fee." Where a no-money line is needed, say "Keepsakes are mementos, not money."
- Claim permanence ("for good", "can't be erased") only for Base mainnet. Only debug builds show the "Test network" chip, and they say test-network keepsakes may be reset.
- Keep crypto jargon out of primary copy. Detail rows name each technical term once (spec §1.7).

## Gotchas
These involve the Firestore rules or the Worker as well as the app. Android's own gotchas are in `android/CLAUDE.md`.
- **Who counts as a Google account:** a guest that linked Google can still name `anonymous` as its sign-in provider. So the rules look for `'google.com'` in `request.auth.token.firebase.identities` (`hasGoogle()`), and the app refreshes the ID token after linking or switching. In the app, `UserEntity.googleUid` is the one check. Firebase tells `user` about a new account on the main thread, a moment after a sign-in returns, so code that runs straight after one uses the uid it returned (`switchToGoogle`).
- **Firestore's write queue belongs to the signed-in user.** Writes still pending when the account switches stay behind with the old user. `SignInWithGoogleUseCase` calls `SeaActions.settle()` first, which writes any throw back or report still waiting.
- **Kept bottles and the rules:** `keptAt` on a message is set once and never removed, so the rules know a bottle was kept without reading its claim (a billed access call). Rules read it with `.get('keptAt', null)`, because older documents lack it. A kept bottle never goes back to the sea, even through moderation.
- **Deleting an account** needs a fresh Google sign-in with the same account, and every write waits for the server. The rules allow most of the deletes only while `deletions/{uid}` exists, and each of those reads it, so they go in batches of 10. An `orphaned` bottle (its writer deleted their account while it was held) has a null `userId`, which the mapper reads as `""`.
- **Worker CPU on the Free plan:** 10 ms per invocation, cron included, and the owner won't pay for more. With BottleCast's traffic nearly every invocation starts on a fresh isolate, where V8 still interprets JavaScript: noble's secp256k1 costs 20–40 ms there, and `jose`, viem and keccak a few ms each.
  - What fits (`worker/src/warm-up.ts`): secp256k1 as WebAssembly, the mint encoded by hand, and every hot path run 30 times at module scope, which left a cold mint at 1–6 ms in slice 5's spike. Keep viem, jose and noble out of `worker/src/` (they're dev dependencies, for tests and the bench).
  - Workers allows no random numbers at module scope, so the signer's blinding is seeded from a secret. It won't compile WebAssembly from bytes either, so a `.wasm` is imported as a module.
  - A Worker's clock stands still while it computes, so measure CPU with `wrangler tail --format json` (`cpuTime`) or Workers Logs (`$workers.cpuTimeMs`), never with `Date.now()`.
- **Only the cron mints,** one claim a run, so the minter's nonce never races. A mint is recorded in `minter/state` (with its signed transaction) and on its claim before it's sent, so a run that dies leaves it for the next run to finish. Never mint from a route.
- **Firestore over REST** (`worker/src/firestore.ts`):
  - an `update` creates a missing document unless it carries the precondition `exists: true`, so the Worker adds it wherever that matters;
  - a read-write transaction locks what it reads (pessimistic concurrency, the Standard edition's default), so roll back one you don't commit;
  - the emulator takes `Bearer owner` for the Worker and an unsigned mock token for a user, whose writes the rules check.
- **Asking to seal is the keeper's own write,** checked by the rules: the claim goes from `pending_wallet` or `failed` to `cooling` with `sealAfter` exactly the cast plus 24 hours, `to` a lowercase address the keeper has linked, and `error` removed. Every later status is the Worker's.
