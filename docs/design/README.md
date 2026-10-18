# Moonlit Shore: the BottleCast redesign

Moonlit Shore is the redesign the owner approved on 2026-10-12. It keeps the current app's Roboto Slab, pills, cyan glass bottle and big arc, and turns the sage-and-charcoal colours in screenshots of 1.1.1 (they come from dynamic colour) into a fixed brand with two themes: Night, the hero, and Dawn. The arc becomes a dome with a moon, each message sits on a parchment card, and a wax seal is the only visual that means "on-chain". Around that, it adds one bottle a day, a chest of kept bottles, streaks and reminders, gifts, achievements, on-device translation and writing help, and keepsakes: a finder can seal a bottle as an NFT on Base, and BottleCast pays the fee.

## Where the design lives
- **Canvas:** [BottleCast Mockup](https://claude.ai/artifact/3N8hta9pzWkKSyvPL81H56), 45 boards. It is private: only the owner, and Claude sessions running as the owner, can open it. Such a session reads one board with the Artifact tool (`action: "read"`, the canvas URL, `path: "<Board>.dc.html"`).
- **Snapshot:** `boards/` holds a copy of every board, taken on 2026-10-12. From slice 1 on, this copy, not the canvas, is the reference. If the owner changes the canvas, copy the changed boards in as part of the same PR and record the change in `decisions.md`.
- **When sources disagree:** `decisions.md` beats `spec.md`, which beats `boards/`, which beats `wallets.md` and `research/`. Spec §6 lists the board layouts that win anyway and the board wording that doesn't. The owner may still prefer a board in some of those cases (`open-issues.md`), so ask when your slice touches one.

## Files
| File | Use it for |
|---|---|
| [`decisions.md`](decisions.md) | The owner's decisions, dated, with the spec sections each one changes. It's short, so read it for every slice |
| [`spec.md`](spec.md) | The spec, v1.1 (over 75 KB). §1 foundations (theme, tokens and contrast, type, shape, motion and haptics, illustration and icons, vocabulary, copy rules), §2 navigation and flows, §3.1–3.19 each screen's layout, copy and states, §4 accessibility, §6 boards versus spec. The slices below replace §5. Read one section at a time |
| [`open-issues.md`](open-issues.md) | Owner questions and review findings that are still open, each tagged with the slice it affects |
| [`wallets.md`](wallets.md) | A plain-language guide to accounts, wallets, sealing and the Worker. Background for slices 5–7 |
| [`boards/*.dc.html`](boards/) | The 45 boards: phone boards at 390×844 (Settings is 390×1400), Night theme unless the name says Dawn, plus two Foundations boards at 1440×1000. They have the exact copy, hex values, px sizes and inline SVG |
| [`boards/canvas.json`](boards/canvas.json) | Board titles, rows and positions on the canvas |
| [`boards/TEMPLATE.md`](boards/TEMPLATE.md) | The values the boards were drawn with: Night and Dawn token hex values, type scale, component sizes, icon SVGs, the bottle rig, the wax seal and the sample data |
| [`research/current-app.md`](research/current-app.md) | How the app worked at 1.1.1, before the redesign: UI, data and auth |
| [`research/platform.md`](research/platform.md) | On-device AI, daily limits, notifications, App Links, the Firebase free tier, achievements and haptics (researched 2026-10-12) |
| [`research/web3.md`](research/web3.md) | Chains, costs, wallet SDKs, minting options and Play policy (researched 2026-10-12; prices and limits change) |

The screenshot-test commands (record, compare and verify with Roborazzi) live in [`android/CLAUDE.md`](../../android/CLAUDE.md), not here.

## Decisions
This is a summary. `decisions.md` has the exact wording, the dates and the spec sections each decision changes.
- **Look:** Moonlit Shore, with Night and Dawn themes and dynamic colour off. Settings offers System (the default), Night or Dawn.
- **Mint on keep, wallet-last:** Keep is instant, free and stored only in Firestore ("Kept"). Sealing mints the keepsake into the finder's own linked wallet after a 24-hour safety check. BottleCast pays the network fee and never takes custody.
- **Chain:** Base. Release builds seal on Base mainnet. Debug builds seal on Base Sepolia, which is the only place the "Test network" chip appears. Polygon PoS can be swapped in later (same contract, new label).
- **Writer identity on-chain:** every keepsake says "Bottled by a verified account ✓". That mark is a keyed hash (HMAC with a Worker secret over the writer's uid and the messageId), never a name, email, photo or raw uid. A pen name goes on-chain only if the writer signed that bottle with it when casting. Bottles are anonymous by default ("— A stranger at sea").
- **Accounts and wallets:** the Google/Firebase account is the passport. Wallets are display cases linked to it, many to one, by a free "Prove it's yours" signature (SIWE signed with plain `personal_sign` and checked by the Worker). One wallet is marked "Receiving". A wallet never signs anyone in.
- **Calendar-day tides:** a new bottle washes up at local midnight, and each day allows one find. The reminder fires at a time the user picks (default 9:00 AM) and respects quiet hours (default 10 PM to 8 AM). There is no 20-hour cooldown.
- **Reporting:** a report hides the bottle for the reporter straight away. The bottle leaves the sea after several reports (3 is proposed) or an admin review. Reporting is never rewarded. The Report dialog and gifts offer "Block this writer".
- **Casting:** only a Google account casts, up to 5 bottles a day, which the rules enforce. A guest is asked to sign in when they first cast, and one who signs in to an existing account brings today's find along. Offline casts are queued.
- **Writer choices:** Preview has the opt-in pen name and "Let the finder seal this as a keepsake" (on by default). The first cast needs an explicit terms checkbox.
- **Gifts:** a recipient can keep a gift from the `/b/{token}` web page with a wallet, without the app or a sign-in. The sender's notification says "Your bottle for Mum was opened".
- **On the phone** (from the owner's original brief, specified in spec §3.4 and §3.7): translation (ML Kit) and writing help (Gemini Nano where available, hidden otherwise) run on the device.
- **Copy for a real chain:** no prices, "BottleCast covers the tiny network fee", and permanence claimed only on mainnet.
- **Contrast fixes:** chips on parchment use ink tokens, the editor border uses `outline`, the counter near the character limit shows text as well as colour, and the Translate chip's stroke is solid.

## Slices
Build the slices in this order. Each one ships on its own. This list replaces spec §5 and `wallets.md` §9. Tick a slice in the PR that finishes it. Spec §1.8 (copy) and §4 (accessibility) apply to every slice. Each slice's "Open" line names its main questions; `open-issues.md` has the full list, tagged by slice.

- [x] **0. Setup.** `docs/design/`, `CLAUDE.md` and Roborazzi screenshot tests.
- [x] **1. Theme, navigation and Shore.** Night and Dawn tokens with dynamic colour off; type, shapes and the dome; edge-to-edge with transparent bars and a splash screen; `supportsRtl` on; type-safe routes and the Shore/Chest/Me navigation bar; Shore A and B (B gets real data in slice 2). Ship the theme change first, on its own, so the owner can sign off on the look (§1.1).
  Spec §1.1–1.5, §1.6 (icons), §2, §3.3. Boards: Foundations-DesignSystem, Main (Shore A), Shore-A-Dawn, Shore-B.
  Open: what the Chest and Me tabs, the streak pill and the stats show before slices 2 and 4 fill them in.
- [x] **2. Discover, Reveal and the data model.** The bottle rig; shake, tap or hold to uncork; prefetch; Reveal; the real Report (hidden for the reporter, a report threshold, block); the message fields (`createdAt`, `lang`, `status`, `rand`, `id`, `penName`, `sealable`, `reportCount`); the daily find record; a silent guest uid created when first needed (the first prefetch or find); and `firestore.rules`.
  Spec §1.5 (haptics), §1.6, §1.7, §2 (flow 2), §3.6, §3.7, §3.18, §3.19. Boards: Discover-Idle, Discover-Progress, Reveal, Report-Dialog, Edge-SeaCalm, Edge-Offline.
  Open: what needs a Worker now (blocking, the report threshold, a server-pinned daily bottle) and what stays client-only until slice 6; daily-limit holes (peeking, reinstalling, changing the time zone); bottles that drift back to the sea while the model has a single `foundBy`.
- [x] **3. Compose, Cast, sign-in and first run.** Compose; Preview with the pen name, the seal opt-out and terms; the cast animation and success screen; the lazy Google sign-in sheet and the guest upgrade; onboarding.
  Spec §2 (flows 1 and 3), §3.1, §3.2, §3.4, §3.4b, §3.5. Boards: Compose, Compose-Preview, Cast-Success, SignIn-Sheet, Onboarding-1, Onboarding-3.
  Decided: a guest who signs in to an existing Google account hands today's find over; onboarding page 3 keeps the spec's copy, and nothing is released before slices 4 and 6 (`decisions.md`, slice 3 planning).
- [x] **4. Chest, Keep, streak and reminders.** Keep (Firestore only); the Chest tabs; Keepsake detail in its Kept state; the streak and calm-sea shields; the Me tab; the daily reminder with quiet hours; Settings with the rows that exist so far.
  Spec §2 (flows 4, 5 and 7), §3.3 (streak rules), §3.10, §3.11, §3.12, §3.16, §3.17. Boards: Chest-Found, Chest-Cast, Keepsake-Detail, Profile, Notify-Rationale, Notify-Examples, Settings.
  Decided: the Me tab is headed by the pen name; the first cast each day still gives a shield; quiet hours hold every notification, and "found" waits for push; deleting an account leaves bottles others hold or kept in their chests, anonymised; Keep writes at once until slice 6's Claim sheet (`decisions.md`, slice 4 planning). It ships as two PRs: Keep and the Chest, then Me, Settings and reminders, account deletion included (`decisions.md`, choices made while building).
- [ ] **5. Spikes.** Can a Worker sign within its 10 ms CPU limit? Does Privy's free plan accept a Firebase custom JWT? Get a Reown project ID. Record the answers in `decisions.md`.
  See `wallets.md` §8 and `research/web3.md`.
  - Answered (`decisions.md`, 2026-10-16 and 2026-10-17): signing fits Workers Free, even on a cold isolate, with secp256k1 as WebAssembly, the mint encoded by hand and every hot path warmed up at startup. The spike is in `worker/`. AppKit builds in the app, with a manifest override.
  - Privy is dropped along with the embedded wallet (`decisions.md`, 2026-10-18). So slice 5 waits only on the owner's Reown project ID (`open-issues.md`).
- [ ] **6. Contract, Worker, wallet linking and sealing, on Base Sepolia.** The contract (`contracts/`); the Cloudflare Worker (`/wallet/nonce`, `/wallet/link`, `/wallet/unlink`, and a once-a-minute cron that mints one claim per run); adding and managing wallets; the Claim sheet; the 24-hour safety check; Sealed. Moving to Base mainnet is a separate release step that the owner approves.
  Spec §1.6, §1.7, §3.8, §3.9, §3.11. Boards: Foundations-Wallets, Claim-Sheet, Claim-Waiting, Sealed, Wallet-Add-1, Wallet-Add-2, Wallets-Manage, Keepsake-Detail, Keepsake-Testnet, Edge-SealFailed.
  Decided: the verified mark hashes the uid together with the messageId (`decisions.md`, setup session). The slice's plan (`decisions.md`, 2026-10-18): the 24-hour check counts from the cast; keepsakes keep their metadata on-chain, with a hosted picture; there's no embedded wallet; and only the cron mints.
  Open, before mainnet: who funds the minter, Play's Financial features declaration, and the production Auth tier.
  It ships as four PRs into `develop`, in order, each planned in its own session:
  1. The contract and the decisions (`contracts/`, `docs/design/`), then the deploy to Base Sepolia, with the owner's OK.
  2. The Worker and the rules (`worker/`, `firebase/`). Each is deployed with the owner's OK, then the cold CPU re-measure runs.
  3. Wallets in the app (`android/`), with the keepsake pictures on Hosting. Slice 5 is ticked once the Reown project ID is in place.
  4. Sealing in the app (`android/`). Then slice 6 is ticked.
- [ ] **7. Gifts, App Links and web pages.** Sending to someone; gift links (30-day expiry, call back) and the Worker's `/share` and `/gift/claim`; keeping from `/b/{token}` with a wallet; the share card and `/u/{handle}`; App Links, with the web side in `web/`.
  Spec §2 (flow 6), §3.13, §3.15. Boards: Gift-Compose, Gift-Link, Web-Gift, Gift-Open, Share-Profile, Web-Profile.
  Open: a server-side text check or an admin queue before any gift is sealed.
- [ ] **8. Achievements, translation, on-device AI and edge states.** Badges and the unlock moment; on-device translation; Nudge, Polish and the tone check; the remaining edge states.
  Spec §3.4 (AI chips), §3.7 (translation), §3.14, §3.18. Boards: Achievements, Achievement-Unlock, Reveal-Translated, Translate-Download, Edge-NoAI, Edge-HarbourClosed, Edge-UnderReview.
  Open: which of the two achievement lists to use; "Night owl" versus quiet hours.
- [ ] **9. Tidy-up.** Loose ends from earlier slices: the owner reviews and deploys the Terms and Community guidelines in `web/` (drafted on the local branch `web-terms-drafts`); a flow for queued casts the server refuses after the app restarts, using the saved pending cast; anything else found along the way.
  The Terms item can't wait for the slice: it blocks the next release.
  Open: the items tagged slice 9 in `open-issues.md`.

## How a session should use these docs
1. Take the first unticked slice, or the one the owner names. Read `decisions.md`, the slice's entry above, and only the spec sections it lists. Put the slice's "Open" items in your plan, and ask the owner about them before building anything that depends on them.
2. Read the slice's boards for exact values, and hand several boards to a subagent. The markup has literal hex values, px sizes, copy and inline SVG. `boards/TEMPLATE.md` maps the hex values to token names.
3. When reading a board: 1 px is 1 dp. The top 44 px is left for the status bar, so content starts near y = 48. Each `<sc-if>` block is an alternative state: the canvas shows one at a time, but the markup holds them all. `{{…}}` holes and `data-props` carry sample values.
4. Work from the markup. Seeing a board rendered needs the canvas, which only the owner can open. Local rendering is untested: the Browser pane can't screenshot a `file://` page, and the canvas runtime (`support.js`) wasn't copied, so every `<sc-if>` branch would show at once.
5. Use the sample data in `boards/TEMPLATE.md` (user, pen name, stats, wallets, keepsake #142, messages) in previews and screenshot tests, so that a screenshot and its board show the same content.
6. Check screens with screenshot tests at 390×844 dp in Night and in Dawn (see `android/CLAUDE.md`), and Read each PNG next to its board's markup. Layouts must also hold at the spec's 360×800 dp reference frame and at 200% text size (§4).
7. When the owner decides something, add it to `decisions.md` with the date, fix the spec text, and close the item in `open-issues.md`, all in the same PR.
8. Treat `wallets.md` and `research/` as background. Their prices, limits and versions date from when they were written, and the spec wins where they disagree.
