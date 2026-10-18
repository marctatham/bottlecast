# Accounts and wallets for BottleCast: a plain-language guide

> Background guide written 2026-10-12. Where it disagrees with [spec.md](spec.md) or [decisions.md](decisions.md), those win, and the slices in [README.md](README.md) replace its §9 order of work. Prices and free-tier limits change — re-check before relying on them.

Written for the owner, 2026-10-12. Everything below is free unless the table at the end says otherwise. I've marked anything I couldn't confirm as **UNVERIFIED**.

## 1. Short answer
- **Your Google sign-in is the account. Wallets are optional add-ons.**
  - A person has exactly one BottleCast account: their Firebase `uid`.
  - That account can have zero, one or many wallets linked to it.
  - One wallet is marked "Receiving". New keepsakes (NFTs) are sent there.
- **A wallet never signs anyone in.** It is only somewhere to deliver keepsakes.
- **Claiming never needs a wallet.** "Keep" works instantly and is stored in Firestore. The NFT is minted only when the person has linked a wallet, and only once the bottle is 24 hours old, counted from its cast (the safety check). This is the "mint on keep, wallet-last" decision in `decisions.md`; this guide also calls it "mint on link".
- **Target Base mainnet; build and test on Base Sepolia** (owner decision, 2026-10-12). Debug builds and the debug Firebase project seal on Base Sepolia with free test ETH; release builds seal on Base mainnet, and BottleCast pays the fee. Do the minting from a free Cloudflare Worker. A mainnet mint with the text stored on-chain costs under 1¢, realistically $0.004–0.006 (the \$0.002 figure is for a plain mint; unverified, and it moves with gas and ETH prices). Polygon PoS stays a drop-in swap.

## 2. How to think about it
- **The account is like a passport.** It says who you are: your streak, chest, achievements, reports and daily bottle.
- **A wallet is like a display case** that lives in another app (MetaMask, Rainbow, Coinbase Wallet…).
  - People lose, swap and collect wallets, which is why one person often has several.
  - If the wallet were the login, the person's history would split across those wallets.
  - Wallets are free to create, so anyone could dodge "one bottle a day" by making a new one.
  - Push notifications and moderation would have nothing stable to attach to.
  - Most of your users won't have a wallet at all.
- **Linking a wallet is a free signature.** The wallet signs a short "Sign-In with Ethereum" message (SIWE, EIP-4361). That proves the person owns that address. No money moves. The Worker writes the message (`/wallet/nonce`), the wallet signs it with plain `personal_sign`, and the Worker verifies it (`/wallet/link`). Don't use Reown Auth, one-click auth or SIWX: Reown's free Starter plan counts those users against a 500-MAU cap and cuts off at the limit.
- **One address can belong to only one account.** If someone tries to link an address that is already linked elsewhere, the app refuses. It never merges two accounts silently.

## 3. What users experience ("wallet-last")
1. **Guests:** the app silently creates a Firebase anonymous "guest" the first time it needs one (the first prefetch or find), not at install, to spare the Auth daily-user cap (`research/platform.md`, section E). Guests can find, read and translate bottles, report, and build a streak. They never see a sign-in screen.
2. **Lazy Google sign-in:** the sign-in sheet appears only when someone tries to cast, keep, gift, share their profile or add a wallet.
   - It uses `linkWithCredential` to upgrade the guest, so today's find and streak carry over.
   - The "Sign in anonymously" button goes away.
3. **Keep:** the Worker's `/claim` endpoint runs a Firestore transaction. It marks the message claimed and writes `claims/{messageId}` with status `pending_wallet`. Nothing goes on-chain, and it costs nothing.
4. **Optional sealing:**
   - If the person has a receiving wallet, the claim waits until the bottle is 24 hours old, counted from its cast (moderation can still pull it), then the Worker mints. If the writer switched "Let the finder seal this as a keepsake" off, it's never minted and stays Kept.
   - If they have no wallet, the bottle simply sits in their chest as "Kept".
5. **Linking a wallet later:**
   - Reown AppKit opens their wallet app.
   - They tap "Prove it's yours" and sign.
   - The Worker verifies the signature (EIP-1271 too, for smart-contract wallets) and writes `users/{uid}/wallets/{chain:address}` plus `walletIndex/{chain:address} → uid`.
   - Every pending claim then mints, one claim per Worker invocation, with the single minter's nonce serialized (cron-only or a Durable Object). The Free plan's 10 ms CPU and 50-subrequest limits apply to cron runs too.
6. **Success screen:** shows "Sealed on Base", "Keepsake #142" and a "View on Basescan" link (basescan.org). Debug builds add a "Test network" chip, link to sepolia.basescan.org and offer copy buttons for the contract and token ID, because wallets don't auto-detect testnet NFTs.
7. **Gift recipients without the app** can keep a gift on `/b/{token}`: they connect a wallet (Reown AppKit for the web), sign the Worker's SIWE message with `personal_sign`, and the Worker's `/gift/claim` records that wallet as the keeper and mints to it after the safety check. No Firebase account is created.

## 4. Recommended stack (primary)
Settled since this guide was written, so see [decisions.md](decisions.md): 2026-10-16 and 2026-10-17 for the Worker on the Free plan, and 2026-10-18 for the rest of slice 6. In short:
- Firebase Auth and Firestore on Spark;
- a Cloudflare Worker on the Free plan that links wallets and mints only from a once-a-minute cron;
- Reown AppKit, only to connect a wallet and ask it to sign;
- `BottleCastKeepsakes` on Base (Base Sepolia for development), with its metadata on-chain and its picture on Firebase Hosting.

The free limits are in `research/platform.md` (section E) and `research/web3.md`. The original table is in git history.

## 5. Fallback: "everyone gets a wallet automatically"
Dropped on 2026-10-18 ([decisions.md](decisions.md)). BottleCast has no embedded wallet, so "Create one with Google" and Privy are gone. Someone without a wallet keeps their bottles in their chest until they add one.

## 6. Social identity on the NFT: what goes on-chain, and what never does
- **On-chain** (permanent, public):
  - the message text;
  - the cast date;
  - "BottleCast #N";
  - the seeded art traits;
  - the writer's **pen name**, but only if they signed that bottle with it when they cast it (snapshotted on the message, so changing settings later changes nothing);
  - "Bottled by a verified account ✓": a keyed hash (HMAC-SHA256 with a Worker secret over the uid and the messageId) that proves a signed-in account wrote it without saying which, and can't link two keepsakes to the same writer.
- **Never on-chain** (and never on bottles or share cards): Google name, email, photo, or the raw `uid`.
  - Provenance comes only from that verified-account mark (owner decision, 2026-10-12). It must be an HMAC keyed with a server secret, never a plain hash, which could be guessed and linked back to the person.
- **Why:**
  - Anything on-chain can't be erased, so GDPR deletion can't reach it.
  - Your README and login copy currently promise anonymity.
- **Consent:** writers agree on the Preview screen ("If they keep and seal it, your words go on Base, a public blockchain, for good"), and can switch "Let the finder seal this as a keepsake" off for any bottle. Delete-account copy says plainly that sealed keepsakes stay.
- **The 24-hour safety window** before minting gives reports time to pull harmful text before it becomes permanent.

## 7. Free vs not free

| Item | Free | Could cost money |
|---|---|---|
| Firebase Auth, Firestore, Hosting, FCM, Crashlytics, App Check | Yes, within the Spark quotas above (Play Integrity: 10K requests/day) | Only if you move to Blaze and exceed quotas. Spend caps don't cover Firestore |
| Cloud Functions | Not on Spark | Needs Blaze plus a card (2M invocations/month free, plus a few cents for container storage). Avoided by using a Worker |
| Cloudflare Worker | 100k requests/day | Paid plan only if you outgrow that |
| Base Sepolia gas | Free (faucet) | — |
| Base mainnet gas (release builds) | No | Under 1¢ per mint, about $0.004–0.006 with the text on-chain (unverified); BottleCast pre-funds the minter, and ~\$5 covers roughly a thousand seals |
| Paymasters (gas sponsorship) | Testnets: Alchemy (unlimited), Pimlico | Mainnet: gas plus 7% (CDP), 8% (Alchemy) or 10% (Pimlico) |
| CDP Server Wallet | 5,000 operations/month | $0.005 per operation |
| On-chain metadata | Only the gas | — |
| IPFS / Firebase Storage | Not needed | Pinata's free plan caps at 500 files. New Firebase Storage buckets need billing |
| Reown AppKit | Free SDK, Starter plan | 2.5M RPC calls a month, then cut off. Reown Auth (500 MAU) isn't used |
| Embedded wallets | Privy ≤499 MAU (custom JWT **UNVERIFIED**); MetaMask devnet only | $69–\$299+/month |
| ML Kit Translation / Language ID | No price stated (**UNVERIFIED**). Runs on the device | — |
| Gemini Nano (ML Kit GenAI) | No server cost. Flagship phones only, pre-GA, unpublished quotas | — |

## 8. Before you build (checklist)
1. ~~Ask Privy whether custom JWT auth works on the free plan.~~ Dropped with the embedded wallet (decisions.md, 2026-10-18).
2. Prototype one SIWE verification and one `viem` signing call in a Worker, to check the 10 ms CPU limit. Done in slice 5 (`worker/`); the numbers are in `decisions.md`, 2026-10-16.
3. Get a Reown Cloud project ID. The Starter limits are in `research/web3.md`; keep Reown Auth off.
4. **Play policy:**
   - Declare "earn tokenized digital assets" in the Financial features declaration.
   - Never use earnings language.
   - Never charge, or show ads, for extra bottles or chances.
   - Keep the line "Keepsakes are mementos, not money." wherever chain data appears (the copy rules ban "value").
   - Avoid custodial wallets; "mint on link" keeps you non-custodial.
5. Do all of this against the debug Firebase project first, and get your explicit go-ahead before anything touches `bottlecast-prod`. The same applies to deploying the contract to Base mainnet and funding the mainnet minter.
6. Keep Firestore as the source of truth. Release keepsakes live on Base mainnet; Base Sepolia keepsakes are dev-only and disposable (testnets get retired, as Base Goerli was). Re-mint policy: each messageId is sealed at most once across production chains, so a later switch to Polygon only affects new seals.
7. Once the Worker exists, move discovery behind it (`/discover`), so modified clients can't list message documents. Rules alone can enforce the daily limit, but they can't hide content.

## 9. Order of work
1. Guest upgrade plus the Firestore data model (`id`, `createdAt`, `lang`, `status`, `rand`).
2. Keep and Chest, Firestore only.
3. Worker `/claim`, then wallet linking (AppKit to connect; SIWE via `personal_sign`, verified in the Worker).
4. Contract on Base Sepolia, then mint on link with the 24-hour window. Deploying to Base mainnet is a separate step the owner approves.
5. Gift links, including keeping from the web page with a wallet.
6. Optional: the embedded-wallet fallback.
