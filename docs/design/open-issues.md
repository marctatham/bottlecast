# Open issues

Questions for the owner and review findings that are still open, each tagged with the slice it affects (the slices are listed in [README.md](README.md)). They come from the 2026-10-12 review of the spec and from reconciling the spec with the owner's decisions. Review findings that spec v1.1 already fixed aren't listed.

When an item is settled, record the answer in [decisions.md](decisions.md), fix `spec.md`, and move the item to "Resolved" with its answer, all in the same PR.

## Questions for the owner

- [ ] **Board or spec where they differ** (Slice 7)
  - Spec §6 lets the spec win for Gift-Compose's own pen-name switch (slice 7). The owner may prefer the board.
  - Proposed: the spec, unless the owner picks the board. The owner chose the spec for slices 2, 3 and 4 (2026-10-13, 2026-10-14 and 2026-10-15), and for slice 6's three-step wallet sheet (2026-10-18). See [decisions.md](decisions.md).

- [ ] **Review and deploy the Terms and Community guidelines** (Slice 9, before any release)
  - Slice 3's sign-in sheet and first cast link to `terms.html` and `guidelines.html`, which are drafted as hobby-project boilerplate on the local branch `web-terms-drafts`, under `web/public/`. Until they're deployed, those links don't open anything.
  - The owner reviews the wording (it isn't legal advice), then merges `web-terms-drafts` and deploys `web/`. This blocks the next release, even if slice 9 hasn't started.
  - `privacy.html` dates from 2023 and needs the same review. It says no third parties and no cookies, but the app now uses Firebase Analytics, Crashlytics and Google sign-in, stores pen names and the accepted Terms, and will write sealed keepsakes to a public chain.

- [ ] **A Reown project ID** (Slice 5, before slice 6)
  - AppKit needs a Reown Cloud project ID, and only the owner can create the account.
  - At dashboard.reown.com (the Starter plan, free), create one project, "BottleCast", for AppKit:
    - allow `com.bottlecast.app` and `com.bottlecast.app.debug` (slice 7 adds the web origin);
    - leave Reown Auth, email and social login off, since the Starter plan caps those at 500 monthly users.
  - Put the ID in `android/local.properties` as `reownProjectId=…`, never in the repo. Slice 6 reads it into `BuildConfig`.

- [ ] **Before Base mainnet** (Slice 6)
  - [ ] Who funds the minter. While it's empty, seals wait with "Sealing · delayed" (spec §3.8b).
  - [ ] File Play's Financial features declaration before a release with mainnet keepsakes.
  - [ ] Check which Auth tier `bottlecast-prod` is on: Identity Platform means a cap of 3,000 daily active users. This is a console check for the owner.

- [ ] **Moderating gifts before they're sealed** (Slice 7)
  - A gift is read only by whoever holds its link, so reports can't catch abuse: a sender could open their own link with a second account or a web wallet and seal any text.
  - Options: a server-side text check, or an admin queue, before any gift is sealed.

- [ ] **Which achievement list** (Slice 8)
  - The spec and the Profile board use one 15-badge list; the Achievements and Achievement-Unlock boards use another ("Sealed with care" against "Sealed with wax").
  - "Night owl" (a find between midnight and 4 AM) now rewards staying up for the midnight tide, against quiet hours. The board list already drops it.
  - Proposed: spec §3.14's list, which wins until the owner picks (spec §6). Night owl: keep or drop.

- [ ] **A contact address of BottleCast's own** (Slice 9)
  - `privacy.html`, `mydata.html` and `web/README.md` give the owner's personal email as the contact. It was already public there before the monorepo, and the owner wants to change it later.
  - Proposed: once BottleCast has a domain, route an address on it (Cloudflare Email Routing) to the owner, and use it on every page. Git history keeps the old address either way.

- [ ] **What the site's root shows** (Slice 9)
  - The last Hosting deploy (2023) included Firebase's "Hosting Setup Complete" placeholder as `index.html`. It was never committed, so the next deploy from `web/` takes it away and the root falls back to `404.html`.
  - Options: a short index page that links the legal pages, or leave the root on the 404.

## Open review findings

- [ ] **Hosting leaves out dotfiles** (Slice 7)
  - `web/firebase.json` ignores `**/.*`, so a deploy would skip the `/.well-known/assetlinks.json` that App Links need ([wallets.md](wallets.md)).
  - Proposed: narrow the rule so `.well-known/` deploys, and add the rewrites for `/b/{token}` and `/u/{handle}` at the same time.

- [ ] **Accessibility timeouts left at fixed times** (Slice 8)
  - Spec §4 says timed controls stay up for at least `AccessibilityManager.getRecommendedTimeoutMillis()`, and that snackbars with an action don't time out while TalkBack is on. But §3.14 still gives the achievement toast 4 s.
  - Proposed: read 4 s as a minimum and follow §4, as slice 2 did for its undo windows (5 s or the recommended timeout, with no timeout under TalkBack).

- [ ] **Push for "found", "kept" and gift events** (Slice 7)
  - These need a push sender (the Worker calling FCM HTTP v1 with a service-account token). No slice builds it, and the spec doesn't describe it.
  - Slice 4 built the spec's v1 fallback (§3.16b): the Chest's dot and the Shore's "While you were away" banner, and Settings shows "When my bottles are found" as "Coming soon". Push itself is still unplanned.

- [ ] **Worker within the free limits** (Slice 6)
  - The spec mints one claim per invocation and shows "Sealing · delayed" when it can't. The owner rules out Workers Paid (2026-10-17), so it has to fit the Free plan's 10 ms of CPU.
  - Slice 5 measured it ([decisions.md](decisions.md), 2026-10-16 and 2026-10-17):
    - With BottleCast's traffic nearly every invocation starts on a fresh isolate, so the cold figures are the ones that count.
    - noble's secp256k1 ran 25–41 ms cold, and 4–10 ms even with a warm-up at module scope.
    - secp256k1 as WebAssembly, the mint encoded by hand, and every hot path run 30 times at module scope bring a cold mint to 1–6 ms, a cold link to 1–5 ms and a cron mint to 1–3 ms.
    - A cron mint needs about 7 of the 50 subrequests.
  - Slice 6's second PR built the Worker that way (`worker/README.md`):
    - the WebAssembly signer with its own blinding-seed secret, the hand-encoded mint, and a 30-round warm-up at startup;
    - the Firestore token signed once an hour and kept in KV, and Google's keys kept there too;
    - one batched chain read, falling back to single calls when Base Sepolia's public endpoint refuses a batch;
    - no viem or jose in the Worker at all.

    Still to do: measure the real invocations again, cold, on the Free plan, once it's deployed. In reserve: keccak as WebAssembly, and the SIWE check on-chain through `eth_call`.
  - The nonce is settled (2026-10-18, [decisions.md](decisions.md)): minting runs only in the once-a-minute cron, one claim per run under a Firestore lease, so the single minter's nonce never races.
  - Still open: someone has to watch the minter's balance (the Base Sepolia faucet gives 0.1 ETH per rolling 24 hours).

- [ ] **Queued casts refused after a restart** (Slice 9)
  - An offline cast is queued in Firestore's offline cache. If the app is closed before the server answers, and the server then refuses it (the daily cap, say, or Terms that changed), nothing tells the writer, and the words aren't restored.
  - The draft store already saves the pending cast for this, but nothing reads it yet.
  - Proposed: on start, check a saved pending cast against the server; if it never landed, restore it as the draft and say so on Compose.

- [ ] **A data-deletion page on the web** (Slice 9, before a release with account deletion)
  - Play asks apps that offer accounts for a web link where people can ask for their account and data to be deleted. Slice 4 deletes the account in the app (Settings › Account), and its goodbye screen leaves room for that link.
  - Proposed: a page in `web/` that says how to delete the account in the app, or by email if the app is gone, and what stays (below). Link it from the goodbye screen and the Play listing.

- [ ] **What deleting an account can't reach** (Slice 9, with the privacy policy's review)
  - The rules let only an admin remove reports and handoffs, so a deleted account's reports (who reported which bottle, and why) and any handoff it armed stay. Bottles someone else holds or kept stay too, without the writer's uid or pen name, and the account's tombstone (`deletions/{uid}`, holding only when) stays for good.
  - From slice 6, keepsakes already sealed on-chain can't be erased.
  - Proposed: say all of this in the privacy policy and on the data-deletion page. An admin script could clear a deleted account's reports once they're resolved.

- [ ] **Public profile data for `/u/{handle}`** (Slice 7)
  - The page needs a publicly readable copy of the profile (for example `publicProfiles/{handle}`) with its own security rules, holding only what the "Show my…" switches allow. The read path is settled: one Firestore REST `get` (spec §3.15c).

- [ ] **Gift link to a removed or reported bottle** (Slice 7)
  - Spec §3.15b and §3.15c cover kept, invalid, expired and called-back links, but not a bottle that was reported or taken out of the sea.

- [ ] **A way back to an unopened gift** (Slice 7)
  - A gift opens from its App Link (spec §3.15b). If the recipient closes it or taps "Not now", nothing on the Shore leads back to it.

- [ ] **Quota states still missing** (Slices 7 and 8)
  - "Harbour closed" now covers the Firestore, Auth and Worker daily limits, and a low minter shows "Sealing · delayed". Not yet designed: Firebase Hosting's 360 MB a day running out (the gift and profile pages and `assetlinks.json` go down) and a Shore variant of Harbour closed.

## Resolved

- [x] **"Create one with Google"** (Slices 5 and 6)
  - The embedded-wallet option on Add a wallet waited, behind a remote flag, on whether Privy's free plan accepts a Firebase custom JWT.
  - Answer (2026-10-18, slice 6 planning): remove it. Spec §3.9a loses the option, its flag and "Creating your wallet…". Someone without a wallet keeps their bottles in their chest until they add one. See [decisions.md](decisions.md).

- [x] **When the 24-hour safety check starts** (Slice 6)
  - The spec and the Claim-Waiting board counted from the cast, while the Keepsake-Detail board assumed the find.
  - Answer (2026-10-18, slice 6 planning): from the cast, `sealAfter = createdAt + 24h` (spec §1.7). See [decisions.md](decisions.md).

- [x] **Testnet keepsakes in a wallet (debug builds)** (Slice 6)
  - Wallets don't auto-detect testnet NFTs, and no board drew an "Add to my wallet" sheet with MetaMask's manual "Import NFT" steps.
  - Answer (2026-10-18, slice 6 planning): the copy buttons for the contract address and keepsake ID alone, as spec §3.8b has them. See [decisions.md](decisions.md).

- [x] **In-app licences** (Slice 4)
  - Material Symbols and Roboto Slab are Apache 2.0, which asks for the licence text to reach people who get the app, and the Roboto Flex and Mono fonts' OFL asks the same.
  - Answer (2026-10-15, slice 4): Settings › About › Open-source licences lists every library, from the AboutLibraries Gradle plugin's build-time list, and shows the bundled fonts' and icons' licence texts, which ship as assets. See [decisions.md](decisions.md).

- [x] **Quiet hours and "found" notifications** (Slice 4)
  - Spec §3.16b holds every notification, the daily reminder included, until quiet hours end. The Notify-Rationale and Settings boards promise "found" notifications, which the spec defers until push exists.
  - Answer (2026-10-15, slice 4 planning): as the spec has it. Quiet hours hold every notification; until push exists, Settings marks the "found" row "Coming soon" and the rationale's checkbox stays hidden. See [decisions.md](decisions.md).

- [x] **Shields for the first cast each day** (Slice 4)
  - A calm-sea shield for each day's first cast (10-character minimum) may invite filler casts that moderation then has to absorb.
  - Answer (2026-10-15, slice 4 planning): keep the rule, up to 2 shields. See [decisions.md](decisions.md).

- [x] **What deleting an account does to other people's chests** (Slice 4)
  - The delete dialog (spec §3.17) covers the user's own profile, chest, streak and drifting bottles, but not a deleted writer's bottles in other people's chests, or seals still pending.
  - Answer (2026-10-15, slice 4 planning): bottles someone else holds or kept stay in their chest, anonymised; drifting ones are deleted with everything else; pending seals (slice 6) finish. See [decisions.md](decisions.md).

- [x] **Which name the Me tab shows** (Slice 4)
  - Spec §3.12 headed the Me tab with the Google name, while its fallbacks only fit a pen-name heading.
  - Answer (2026-10-15, slice 4 planning): the pen name and its initial, or "Anonymous sailor"; the Google name appears only in Settings › Account. See [decisions.md](decisions.md).

- [x] **Merging a guest into an existing Google account** (Slice 3)
  - The sign-in chip promises that the streak and today's find come with you, but if that Google account already exists, `linkWithCredential` fails and the guest's day would be lost.
  - Answer (2026-10-14, slice 3 planning): hand today's find over. The guest arms a one-time handoff with a token the rules check, and the find moves only if the account has no find today and has never found that bottle. Slice 4 reuses it for the streak. See [decisions.md](decisions.md).

- [x] **Onboarding page 3 mentions sealing** (Slice 3)
  - Onboarding ships in slice 3, but sealing only arrives in slice 6.
  - Answer (2026-10-14, slice 3 planning): keep the spec's copy, and release nothing before Keep (slice 4) and sealing (slice 6). See [decisions.md](decisions.md).

- [x] **The cast-success bottle's Lottie licence** (Slice 3)
  - Spec §1.6 flagged `message_in_bottle.json` for a licence check, or a redraw in the rig.
  - Answer (2026-10-14, slice 3 planning): redraw it in the rig, and delete the Lottie and its dependency. See [decisions.md](decisions.md).

- [x] **How much of the Worker comes forward to slice 2** (Slice 2)
  - Blocking, the report threshold and a server-pinned daily bottle all seemed to need discovery to go through a Worker, which is planned for slice 6.
  - Answer (2026-10-13, slice 2 planning): rules only. Firestore rules enforce the create-only daily record, one report per finder and a threshold of 3; blocking happens on the phone. Slice 6's Worker takes over discovery and blocking. See [decisions.md](decisions.md).

- [x] **Keeping it to one bottle a day** (Slice 2)
  - The daily rule had to hold when someone peeks at a prefetched bottle and backs out, reinstalls as a guest, or changes the phone's time zone.
  - Answer (2026-10-13, slice 2 planning): accept the small holes. The candidate is pinned for the account and day, the rules accept a date that's real somewhere on Earth at that moment, and a reinstall makes a fresh guest. See [decisions.md](decisions.md).

- [x] **Bottles that drift again** (Slice 2)
  - Thrown-back and expired bottles drift back, so a bottle can be found more than once, but the data model had a single `foundBy`/`foundAt`.
  - Answer (2026-10-13, slice 2 planning): one finder at a time. A find holds the bottle for 7 days, `findCount` counts the finds, nobody finds the same bottle twice, and each find has its own `finds/{messageId}_{uid}` record. See [decisions.md](decisions.md).

- [x] **Old app versions after the data model changes** (Slice 2)
  - Installs on 1.1.1 would keep writing messages in the old shape once the rules and new fields arrive.
  - Answer (2026-10-13, slice 2 planning): strict. The new rules and the production migration ship together at release, and 1.1.1 can't find or cast until it updates. See [decisions.md](decisions.md).

- [x] **Guest accounts removed by automatic clean-up** (Slice 2)
  - Automatic clean-up of anonymous accounts would remove a guest's finds without warning.
  - Answer (2026-10-13, slice 2): leave clean-up off, and check it at release. See [decisions.md](decisions.md).

- [x] **The Dawn dialog scrim** (Slice 2)
  - A platform dialog's window dim is always black, but the spec's Dawn scrim is #1A2320 at 40%.
  - Answer (2026-10-13, slice 2 planning): `BottlingDialog` turns the dim off and draws the theme's scrim. See [decisions.md](decisions.md).

- [x] **What the Chest and Me tabs show before they're built** (Slice 1)
  - Slice 1 adds the Shore/Chest/Me navigation bar, but the Chest arrives in slice 4, and the streak pill and stats need data from slices 2 and 4.
  - Answer (2026-10-13, slice 1 part 2): honest empty states for the Chest and Me, and the live Shore hides the streak pill and stats until slices 2 and 4 supply them. See [decisions.md](decisions.md).

- [x] **Material3 1.5 beta or the spec's fallbacks** (Slice 1)
  - Expressive motion, the wavy progress indicators and MaterialShapes need Material3 1.5, which Compose BOM 2026.09.00 doesn't include.
  - Answer (2026-10-13, slice 1 planning): pin material3 1.5.0-beta01 ahead of the BOM. See [decisions.md](decisions.md).

- [x] **What the verified mark hashes** (Slice 6)
  - The plan's "HMAC of the uid" would give every keepsake from one writer the same value, so anyone could group them on-chain, and one bottle signed with a pen name would name the rest.
  - Answer (2026-10-12, setup session): HMAC-SHA256, keyed with a Worker secret, over the writer's uid and the messageId. See [decisions.md](decisions.md).
