# Decisions

This file overrides `spec.md`. Whenever the owner decides something, add it here, dated, in the same PR that applies it.

## 2026-10-12 — Mockup session

Owner's raw answers (2026-10-12, mockup session): visual direction "Moonlit Shore (Recommended)"; NFT model "Mint on keep (Recommended)"; chain: "I was thinking something like BASE or POL"; writer identity on-chain "Verified-human badge".

### Decisions (confirmed with the owner)

| Topic | Decision | Changes spec |
|---|---|---|
| Visual direction | **Moonlit Shore.** It keeps Roboto Slab, sage pills, the cyan glass bottle and the arc, which becomes a "dome" with a moon. The message sits on a parchment card. A wax seal is the only visual that means "on-chain". Night (hero) and Dawn (light) themes. | §0 (the spec was written for this direction) |
| NFT model | **Mint on keep, wallet-last.** "Keep" is instant, free and stored in Firestore. The NFT is minted into the finder's *own* linked wallet after a 24h safety window, and the app pays the gas. No custody. | §0, §5 (the spec was already wallet-last) |
| Chain | **Base.** The UI labels the network "Base"; Polygon PoS is a drop-in swap, since it is the same EVM contract and only the label changes. Develop on Base Sepolia (shown as a "Test network" chip variant on one board). Mainnet costs under 1¢ per mint, so a small pre-funded minter covers it, and users never pay. | §0, §1.7, §2 (flow 4), §3.8b, §3.9a, §3.9b, §3.11, §3.16b, §5 |
| Writer identity on-chain | **Verified-human badge.** The record carries "Bottled by a verified account ✓", stored as a keyed hash (HMAC of the uid), never a name or email. An optional pen name is added only if the writer opts in, and that choice is snapshotted at cast time. Bottles are anonymous by default ("— A stranger at sea"). | §0, §1.6, §1.7, §3.4, §3.4b, §3.7, §3.8a, §3.8b, §3.11, §3.17 |
| Account vs wallets | The Google/Firebase account is the passport. Wallets are optional display cases linked to it (many to one) with a free "Prove it's yours" signature (SIWE via plain `personal_sign`, verified server-side). One wallet is marked Receiving. A wallet never signs anyone in. | §0, §1.7, §3.9a |

The setup session below refined what the verified mark hashes.

### Changes to the spec from the review

Spec v1.1 merged these. The italic line under each item names the spec sections it changed.

1. **Calendar-day tides.** A new bottle arrives at local midnight, and the reminder fires at a user-set time (default 9:00, with quiet hours). The 20h cooldown is dropped.

   *Changes spec: §0, §2 (flow 7), §3.1, §3.3, §3.16a, §3.16b, §3.17.*

2. **Reporting.**
   - A report hides the bottle for the reporter at once. It leaves the sea only after several reports or a review.
   - There is no replacement-find reward (graft G4 is dropped).
   - Add **Block this writer** to the report dialog and to gift links.
   - Terms acceptance becomes an explicit step before the first cast.

   *Changes spec: §0 (grafts G4 and G15), §2 (flow 2), §3.4b, §3.11, §3.15b, §3.17, §3.18, §3.19, §5.*

3. **Gift recipients can claim on the web.** The `/b/{token}` page gets "Connect a wallet to keep it" (WalletConnect + SIWE), so recipients without the app can claim. Notification copy becomes "Your bottle for Mum was opened".

   *Changes spec: §0, §2 (flow 6), §3.15c, §3.16b, §5.*

4. **Writers can opt a bottle out of sealing** on Preview ("Let the finder keep this as a keepsake", on by default). (Implemented with the label "Let the finder seal this as a keepsake", because keeping is always allowed.)

   *Changes spec: §0 (graft G15), §1.7, §3.4b, §3.5, §3.8a, §3.15c.*

5. **Copy for a real chain.** No "Test network" chip except on the dev-variant board. Only claim "kept forever" on mainnet. Show "BottleCast covers the tiny network fee". Never use "earn", "value" or "rare".

   *Changes spec: §0 (graft G2), §1.2, §1.7, §1.8, §3.3, §3.4b, §3.8a, §3.8b, §3.9b, §3.11, §3.12, §3.13, §3.14.*

6. **Contrast fixes.**
   - Near the character limit, the counter shows text ("20 left") as well as a colour change, in ink tokens.
   - Chips on parchment use ink tokens.
   - The editor border uses `outline`.
   - The Translate chip stroke is solid.

   *Changes spec: §1.2 (contrast table, chips on parchment), §3.1 (page dots), §3.3 (today's-find chip), §3.4 (editor border, counter), §3.7 (Translate chip).*

## 2026-10-12 — Setup session

- **Verified mark input:** the on-chain "Bottled by a verified account" mark is HMAC-SHA256 (keyed with a Worker secret) over the writer's uid **and the messageId**, so a writer's keepsakes can't be linked to each other on-chain. (Refines "HMAC of the uid" above; resolves review item "what the verified mark hashes".)

  *Changes spec: §0 (the owner decisions) and §1.7 (the "Bottled by a verified account ✓" row).*

- **Docs are public:** the design docs, board snapshot and research are published in this public repo, after redactions (no local paths, no debug-project ID, no live-gap details).

- **Sample user** in the boards and spec stays "Marc T." / "@marct" (the owner's public identity).

- **Workflow:** the redesign is built in slices (see README), one branch and PR into `develop` per slice, verified with Roborazzi screenshot tests against the boards.

  *Replaces spec §5 and `wallets.md` §9 with the slices in `README.md`.*

## 2026-10-13 — Slice 1 planning

The owner's answers while planning slice 1 (theme, navigation and Shore). The theme PR applies these; the navigation and Shore PR adds the rest of the slice's decisions below.

- **Material3:** pin `material3` 1.5.0-beta01 ahead of the Compose BOM (which resolves 1.4.0), rather than the hand-written fallbacks. It needs Compose 1.12.0, compileSdk 37 and AGP 9.1 or later; the BOM already provides Compose 1.12.1. Drop the pin when the BOM ships 1.5. Resolves the open issue "Material3 1.5 beta or the spec's fallbacks".

  *Changes spec: the header, §1.4 (badges), §1.5 (motion, the cork ring).*

- **Icons:** Material Symbols Rounded (weight 400, fill 0, 24dp), bundled as `ic_symbol_*` vector drawables from google/material-design-icons, including the filled flag for a reported message. The Shore's house-with-waves and the bottle have no Symbol, so they're custom `ic_glyph_*` vectors drawn from the TEMPLATE.md paths.

  *Changes spec: §1.6 (icons).*

- **Fonts:** all three families are bundled; nothing downloads. Roboto Flex is the official variable font, with weights selected through its `wght` axis and `opsz` set per style; Roboto Mono is Regular only; Roboto Slab keeps its existing files, minus the weights the scale never uses. Sources and licences are in `android/licenses/`.

  *Changes spec: §1.3 (fonts).*

- **Look details:**
  - The Dawn moon is the boards' pale sun-moon: a #F6E8CC disc (Dawn moonContainer) with a soft moon glow at 12%, not "moon at 30%".
  - The outlined pill's stroke is 1dp `primary`, as the spec says; the boards' 1.5px is superseded.
  - Avatars are plain circles, as the boards draw them; badges keep the MaterialShapes shapes.

  *Changes spec: §1.4 (avatars), §1.6 (the Dawn moon).*

- **Delivery:** slice 1 ships as two PRs. The first applies the theme to today's screens and is signed off from its screenshots; the second brings edge-to-edge, the splash, RTL, type-safe routes, the navigation bar, Chest, Me and the Shore.

## 2026-10-13 — Slice 1 part 2

The owner's answers while planning the navigation and Shore PR, which applies them.

- **Order:** finish slice 1 before slice 2.
- **Chest and Me before slice 4:** honest empty states.
  - The Chest shows its compact dome header and the spec's own empty state: "Your chest is empty" / "Today's bottle is waiting on the shore." [Go to the shore] (spec §3.10).
  - Me shows the avatar in its compact dome, then "Your profile is on its way" / "Your streak, badges and pen name will live here soon." [Go to the shore].
  - Slice 4 replaces both. Resolves the open issue "What the Chest and Me tabs show before they're built".
- **Streak pill and stats before slices 2 and 4:** the live Shore hides them until real data exists. The screen can draw both, and the screenshot tests use the boards' sample data so they compare with the boards.
- **Splash:** the dome colour with the bottle glyph in `glass`. No board draws a splash.

  *Changes spec: §1.1 (the splash glyph).*

Choices made while building it, which the owner can revisit at review:

- **The Me avatar** is a person glyph on moonContainer until slice 4 settles which name its initial comes from (open issue "Which name the Me tab shows").
- **Analytics screen names** keep their old values, so the Shore still reports `home`; the new tabs report `chest` and `me`.
- **Where the Shore's boards and the spec differ,** the spec wins:

  | Spec value, taken | Board value, not taken |
  |---|---|
  | Stats 24dp apart in one 48dp target | Stats 40 apart, 56 tall |
  | Glints drifting | Glints static |
  | Only the moon's halo pulses | The whole disc fades |
  | Moonpath at 25%, fading at both ends | Moonpath at 28%, no fade |
  | Nav labels in `labelLarge` 14/20 | Nav labels 12/16 |
  | "Not kept · 7d left" on Shore B | "5d left" |
  | The bottle Lottie on Shore A | The SVG rig, which slice 2 brings |

- **From the boards, where the spec is silent:**
  - the stars
  - the dome glow's centres
  - "NEXT TIDE IN" in onSurfaceVariant
  - the tide ring's end marker
  - the today's-find card's padding and "TODAY'S FIND" overline
  - the 8dp moon badge dot

  The admin's "Moderation" menu, which no board draws, sits at the end of the top row.
- **Large text:** from 175% text the bottle and the glints step aside, and the streak pill wraps under the wordmark (spec §3.3 hides the bottle at 200%).
- **Landscape:** the dome's radius widens to three quarters of the screen's width, so the arc still spans it.
- **No failure screen on the Shore:** if its inputs fail, it logs and still offers today's bottle.
- **Predictive back:** full-screen routes shrink to 90% with 32dp corners over the screen underneath (spec §1.5), and tabs fade back to the Shore.

## 2026-10-13 — Slice 2 planning

The owner's answers while planning slice 2 (Discover, Reveal and the data model), which its PR applies.

- **Rules only, no Worker.** Firestore rules enforce the create-only daily record, one report per finder and a threshold of 3 reports. Blocking happens on the phone, by the writer id each bottle carries. Slice 6's Worker takes over discovery and blocking. Accepted until then: a modified app can read bottles without using up its day, or group one writer's bottles. Resolves the open issue "How much of the Worker comes forward to slice 2".
- **One finder at a time.** A find holds the bottle for 7 days. Throwing it back, or 7 days without a Keep, returns it to the sea. `findCount` counts the finds, nobody finds the same bottle twice, and the writer is told once (later slices). Resolves "Bottles that drift again".
- **Small daily-limit holes accepted.** The candidate is pinned in memory for the account and the day. The rules accept a date that's real somewhere on Earth at that moment (UTC−12 to +14). A reinstall makes a fresh guest. Resolves "Keeping it to one bottle a day".
- **Keep waits for slice 4.** Reveal ships with Share and Throw back only. Not in slice 2: the Keep pill and its helper, the "It'll wait in your chest" snackbar, and Shore B's "Not kept" chip.
- **Old versions: strict.** The new rules and the production migration ship together at release. 1.1.1 can't find or cast until it updates. Resolves "Old app versions after the data model changes".
- **The spec wins over the boards** where they differ, and the boards fill in where it's silent, as in slice 1. Resolves "Board or spec where they differ" for slice 2.
- **Dialog scrim:** `BottlingDialog` turns the platform's dim off and draws the theme's `scrim`, so Dawn gets its #1A2320 at 40%. Resolves "The Dawn dialog scrim".
- **One PR** for the whole slice.
- **Icons:** the share, help and refresh Symbols come from the same pinned commit as the rest.

  *Changes spec: §1.7 (the data model), §3.6 and §3.7 (no Keep yet), §3.19 (blocking and the threshold).*

Choices made while building it, which the owner can revisit at review:

- **Casting stays as it is until slice 3.** The rules let any signed-in user cast, guests included, and only a Google account skips today's sign-in sheet. Slice 3 adds a Google-only rule.
- **Signing in with Google links a guest** (`linkWithCredential`), which keeps the uid and today's find. If that Google account already exists, it signs in instead and the guest's day is lost (slice 3's merge rule).
- **Admin is a custom claim** (`admin: true`), set per project with `scripts/set_admin_claim.py`. The hard-coded admin uid is gone.
- **Bottles cast before slice 3** get `lang` "und", `penName` null and `sealable` false, since their writers never saw the choice.
- **The threshold lives in the queries and the rules** (`reportCount` in [0, 1, 2], and below 3), so no client writes a moderation status. `under_review` means an admin pulled the bottle.
- **Reports:** only the live holder can report, and the report keeps the hold, so the bottle stays out of the sea for the rest of its 7 days. Undo works inside the window, before anything is written. Blocking is a write of its own. The finder's hidden list is their find marked `reported`.
- **Timed actions:** undo windows last 5 s, or the system's recommended timeout if longer, and wait for the user while TalkBack is on (spec §4). Throw backs and reports commit from an app-scoped coordinator, and leaving Reveal commits a report still waiting. If the app dies first, the action is lost and the bottle drifts back when its hold ends. Analytics count a throw back or report once it's written, so an undone one doesn't count.
- **Moderation:** restoring a bottle that a finder still holds clears its reports and gives it back to that finder for the rest of the hold. It goes back to the sea only once the hold has ended, so a bottle never has two holders. The rules insist on both.
- **A look at the sea** reads on, page by page, from a random point up, then round from the bottom, then through holds that have ended, until it has today's candidate and two to fall back on. It skips the account's own bottles, blocked writers' and any it found before. It reads from the server, so an offline look fails instead of finding a calm sea. The blocked writers are read again for each day's look.
- **The Shore's bottle is the rig,** as spec §3.3 plans for phase 2. The bottle Lottie stays only on cast success until slice 3, and Discover's Lottie is gone.
- **The rig** is drawn on a Canvas from TEMPLATE.md's paths. Its seed is SHA-256 of the bottle id: byte 0 mod 3 picks the silhouette, and (byte 1 / 255) · 12 − 6 turns the tint's hue that many degrees. The contract and the web pages port the same formula. It leans 12° with its neck towards the start edge, mirrored in RTL.
- **Copy with no spec source:**
  - the share text, `“{message}” — found in a bottle on BottleCast` and the Play link, under "Share this bottle"
  - bylines that say "cast today", "cast yesterday" or "cast n days, months or years ago"
  - Discover's calm-sea note, "This didn't use up today's bottle." (slice 4 adds ", and your streak is safe")
  - "How to uncork" for the help button's label
  - the reported bar and the thanks after it
- **Anonymous auto clean-up stays off,** checked at release. Resolves "Guest accounts removed by automatic clean-up".
- **Where the boards and the spec differ,** the spec wins:

  | Spec value, taken | Board value, not taken |
  |---|---|
  | "Shake to uncork" / "Give your phone a few gentle shakes." | "Give it a shake" / "Shake your phone to pop the cork — or press and hold the bottle." |
  | An outlined "Tap to uncork" and "or press and hold the bottle", with help behind the "?" button | A filled "Tap to uncork", a "No shaking needed?" button and an optional-shaking hint |
  | Discover's text ends 32dp above the arc and its pill sits 40dp below, as the spec's y≈470 and 600 put them | Text from y 436, the pill at 622 |
  | Tonal Share and "Throw back" pills 20dp under the card | A pinned Keep pill, an outlined Share and a "Throw it back" text button |
  | The card at least 220dp tall, 8dp under its overline | 236dp, 12dp under it |
  | The spec's five report reasons, in its order | "Hateful or harassing", "Spam or a scam" and the board's order |

- **From the boards, where the spec is silent:**
  - Discover's stars, glints and "n of 3" counter
  - Reveal's moon, stars and drifting empty bottle
  - a short message's byline sitting at the foot of its card
  - the report dialog's "Reason (optional)" heading
  - the calm Shore's second pill, "Open your chest"
- **Layout:**
  - Discover's moon hangs just below the top bar, since the help button sits where the board puts it.
  - The bottle stays put while the counter comes and goes and "Unrolling…" takes over.
  - A message runs in its own script's direction, whichever way the app is laid out: Reveal's card and the Shore's excerpt.
  - At large text, Reveal's card grows with the page, its pills stack, and the drifting bottle steps aside.
  - Long edge-state titles break into even lines, and the countdown keeps "7h 12m" on one line.
  - The calm Shore hides the sky's moon, since its illustration brings one.


## 2026-10-14 — Slice 3 planning

The owner's answers while planning slice 3 (Compose, Cast, sign-in and first run), which its PR applies.

- **A guest who signs in to an existing Google account brings today's find.** Linking still keeps the uid. When that Google account already exists:
  - the guest first arms a one-time handoff (`handoffs/{messageId}`), holding the SHA-256 of a token only that phone knows, then signs in;
  - the Google account claims the live hold by presenting the token within 10 minutes;
  - the rules move the find only if that account has no find today and has never found the bottle.

  Slice 4 reuses the handoff for the streak. Resolves "Merging a guest into an existing Google account".
- **Onboarding page 3 keeps the spec's copy,** sealing line included, and no release goes out before Keep (slice 4) and sealing (slice 6). Resolves "Onboarding page 3 mentions sealing".
- **Terms and Community guidelines** are drafted as plain boilerplate for a free hobby project: provided as is, with no warranty, liability limited as far as the law allows, and flagged as not legal advice. The owner reviews and deploys them before any release (slice 9).
- **Cast success is redrawn with the bottle rig.** `message_in_bottle.json` and the Lottie dependency are deleted. Resolves "The cast-success bottle's Lottie licence".
- **The bottle tint row waits for slice 4.** Every bottle is Sea glass until then, and messages carry no tint field.
- **5 casts a day, enforced by the rules,** through a per-account `castTally/{uid}` that each cast's batch bumps.
- **Offline casts are queued,** as the spec has it. A queued cast that the server refuses after the app has restarted gets its own flow in the tidy-up slice (9). The pending cast is already saved for it.
- **The spec wins over the boards** where they differ, as in slice 2. Resolves "Board or spec where they differ" for slice 3.

  *Changes spec: §1.6 (no Lottie), §3.2 (the carry-over chip and the handover), §3.3 (the Shore's bottle), §3.4 (the cap).*

Choices made while building it, which the owner can revisit at review:

- **Casting needs Google.** The rules look for `google.com` in the token's `firebase.identities`, not at the sign-in provider: a guest that linked Google can still name `anonymous` as its provider. Linking and switching both refresh the ID token.
- **A cast is one batch:**
  - the message;
  - the tally, incremented on the same day, or reset to 1 on a later one;
  - `users/{uid}`, but only when the bottle is signed or the Terms are being accepted.

  The rules read the profile and the tally with `getAfter`. So the first cast can accept the Terms (version 1) in the same commit, and a signed bottle's pen name must match the profile's.
- **The cap's time-zone hole is accepted,** like the daily one. The tally's date may be any date that's real somewhere on Earth, so moving the phone's time zone forward can start a new day early.
- **Waiting for the server:**
  - Online, a cast waits up to 8 s for the server, then counts as queued.
  - A refusal brings the words back as the draft, unless a newer draft exists, and Compose says "We kept your draft."
- **Switching accounts settles first.** Firestore keeps a write queue per user, so a throw back or report still waiting would be stranded once the account switches. `SeaActions.settle()` writes them first and waits up to 5 s.
- **A guest's earlier casts stay with its uid** when it switches to an existing account. They date from before slice 3, when guests could cast. Only today's find moves.
- **The sign-in chip** reads "Today's find comes with you", and shows only while the guest holds a live find today. Slice 4 adds the streak half.
- **Onboarding never makes a guest.** The Shore isn't drawn behind it, so nothing prefetches until it's done. The app holds its first frame until it knows whether to show onboarding.
- **Language:** ML Kit's language identification (the unbundled model) runs on the phone. A cast gets `und` if detection fails or takes over 1 s.
- **`inkError` (#B3261E)** is a new ink token, for Compose's "At least 10 characters" error on the parchment. It reaches 4.9:1 on Night's parchment and 6.2:1 on Dawn's, and `InkContrastTest` pins both.
- **The queued variant** splits the spec's line into the title "Corked" and the body "It'll set sail when you're back online.", to fit the screen's title and body.
- **Legal links** point at `terms.html`, `guidelines.html` and `privacy.html` on the web project's hosting, which has no `cleanUrls`. The Terms and guidelines are drafted on the local branch `web-terms-drafts`, under `web/public/`, and nothing is deployed yet.
- **Copy with no spec source:**
  - "A pen name needs 3 to 20 characters."
  - the Terms row's "First cast only" (from the board)
  - onboarding page 3's sample message
  - the accessibility labels for the art, the page dots and the journey row
- **Where the boards and the spec differ,** the spec wins:

  | Spec value, taken | Board value, not taken |
  |---|---|
  | Compose's editor right under the top bar, since the "Into the sea / To someone" row waits for slice 7 (editor at y≈116) | The editor under the segmented row |
  | The cast's bottle at 12% scale on the horizon (about 23dp tall) | A 63dp bottle |

## 2026-10-15 — Slice 4 planning

The owner's answers while planning slice 4 (Chest, Keep, streak and reminders). The slice ships as two PRs: Keep and the Chest first, then Me, Settings and reminders. The first PR applies all of these except where noted.

- **The Me tab is headed by the pen name,** with its initial in the avatar. Without one it reads "Anonymous sailor" with [Set a pen name]. The Google name appears only in Settings › Account (second PR). Resolves "Which name the Me tab shows".
- **Shields keep the rule:** each day's first cast gives one, up to 2. Resolves "Shields for the first cast each day".
- **Deleting an account** removes drifting bottles and everything else of the user's. Bottles someone else holds or kept stay in their chest, anonymised: the writer link and pen name are stripped. Seals pending at deletion (slice 6) finish. The second PR builds it. Resolves "What deleting an account does to other people's chests".
- **Quiet hours** hold back every notification, the daily reminder included, until they end. Until push exists, Settings shows "When my bottles are found" disabled with "Coming soon", and the rationale's "found" checkbox stays hidden. The stand-in is the Chest's dot and the Shore's "While you were away" banner, which the first PR brings. Resolves "Quiet hours and 'found' notifications".
- **Keep writes at once.** A guest signs in first. Slice 6 brings the Claim sheet, the full-screen Kept result and "Seal it".
- **The spec wins over the boards** where they differ, and the boards fill in where it's silent, as in slices 2 and 3. Resolves "Board or spec where they differ" for slice 4.

  *Changes spec: §1.7 (Kept, and the streak's records), §3.3 (the shield's order, the Shore's notices), §3.7 (Keep without the Claim sheet), §3.10 (rows still to come), §3.11 (what waits for slice 6), §3.12 (the heading).*

Choices made while building the first PR, which the owner can revisit at review:

- **The data model:**
  - Keep is one transaction: the bottle becomes `kept` with `keptAt`, the finder's find becomes `kept`, and `claims/{messageId}` holds the keeper (`pending_wallet`). The rules check the find's `foundAt` against the bottle's, so only the live holder keeps it. `keptAt` is never removed, so the rules know a bottle was kept without reading its claim.
  - Only the keeper reads a claim, and the keeper can read the bottle while it's kept or under review, but not once it's removed. The writer sees Kept and its date, never who kept it.
  - Moderation only ever moves a kept bottle among kept, under review and removed, so it never goes back to the sea.
  - The writer can pull a bottle while it drifts (afloat, or a hold that has ended, and not reported out of the sea).
- **Kept is final this slice:** a kept bottle can't be thrown back or reported, in the rules or the app.
- **The streak is folded on the phone** from the account's daily find records and `streakDays/{uid}_{date}` marks: the day's first cast (written in the cast's own commit, checked against the tally), a calm sea (written when a look finds one), and a streak carried over from a guest. Each day: a carried streak counts as far as it reaches, then the day's cast gives a shield, then a find adds a day, a calm sea holds, and any other day uses a shield or rests the streak. So a day with a cast but no find never rests a streak; at the cap of 2 it ends with one shield fewer.
- **Accepted, until a Worker takes over:** the rules can't check a calm sea or a carried streak, so a modified app could protect or lengthen its own streak.
- **The fold up to three days ago is kept on the phone** (DataStore), so each look reads only the last few days, and it moves on only once the server has confirmed them. A new phone folds the whole history once. Production starts everyone at 0.
- **A guest's streak is carried** when it signs in to a Google account that already exists, whether or not today's find moves with it: the guest notes its streak before the switch, and the account marks it on today's streak day after. Linking keeps the uid, so nothing needs carrying.
- **The chest is read in parts:** kept bottles from the claims and unkept ones from the last week's finds, in pages of 20, and casts from the writer's own bottles, filtered on the phone. A bottle's words come from the phone's cache when it has them, since they never change.
- **The counts are server counts** (`count()`, and `sum(findCount)` for "While you were away"), kept per account, asked for again only when something changed, and hidden offline. The first count on a phone is the baseline, so old finds aren't news.
- **The Shore's "It'll wait in your chest for 7 days."** shows when Reveal closes on a fresh find that wasn't kept, thrown back or reported, however it closed.
- **Keepsake detail** shows the status chip, the traits line and the journey. "On-chain record" and "What's public" wait for slice 6, since they describe a keepsake's public record. An unkept find's Throw back and Report go back to the Chest, which offers the Undo.
- **Copy with no spec source:**
  - the sign-in title "Sign in to track your bottles" (a guest's Cast tab) and the chip "Your 3-day streak comes with you"
  - the "Removed" chip
  - the trait names: Classic, Flask, Gourd, Sea glass, Amber glass, Moonglass
  - "Drifts away today — keep it to hold on to it." and "This bottle drifts away today. Keep it to hold on to it.", beside the spec's "tomorrow" lines
  - the keep errors: "This bottle has drifted on, so it can't be kept." and "Couldn't keep it just now. It's still yours to keep — try again in a moment."
  - the pull errors, and Keepsake detail's "This bottle has drifted on" / "It isn't in your chest any more." [Back to your chest]
  - the journey's "Not yet"
- **Where the boards and the spec differ,** the spec wins:

  | Spec value, taken | Board value, not taken |
  |---|---|
  | The chip at the end of a chest item | The chip in the meta row, under the excerpt |
  | "Found (14)" \| "Cast (12)", and the summary line | "Found · 30" \| "Cast · 12", no summary |
  | The Chest's dome edge at y≈180, "Your chest" in headlineSmall | Edge at 236, headlineMedium |
  | Reveal's Share and Throw back under the card, Keep pinned at the foot | Keep first |

- **From the boards, where the spec is silent:** the Chest's moon, the filter row scrolling sideways edge to edge, the bottle glyph's circle in its tint's container colour, Keepsake detail's compact dome (edge at 236) and its 20dp section gaps.

Choices made while building the second PR (Me, Settings and reminders), which the owner can revisit at review:

- **Deleting an account** (spec §3.17), in this order:
  1. It needs a connection, and a fresh sign-in with the same Google account, since Firebase needs one to delete an account. Offline, with the picker closed or with another account, nothing changes.
  2. Any throw back or report still waiting is written first.
  3. The account leaves a tombstone, `deletions/{uid}`, which holds only when. While it exists the rules refuse the account's finds and casts, and let it delete the records they otherwise keep for good. It's never removed.
  4. Its bottles: one someone kept, or whose finder's hold still runs, loses its writer's uid and pen name, and a held one becomes `orphaned`, which stays with its finder until the hold ends and never drifts again. Every other bottle is deleted.
  5. Its finds, unsealed claims, daily records, streak days, cast tally, blocked writers and profile are deleted. Its reports and handoffs stay, since only an admin removes those (open-issues.md, slice 9).
  6. The Firebase account is deleted, and the phone forgets the streak's checkpoint, what the chest had seen and the unsent draft. Settings and the reminder stay with the phone.

  Each step waits for the server. If one fails part way, the account stays, can't find or cast, and running the deletion again picks up where it stopped. Firestore's offline cache isn't cleared: the deletes the app wrote take its documents out of it.
- **An orphan** can still be read, kept, reported or thrown back by its finder; a throw back only marks the find. Moderation puts one under review and back, or removes it once nobody holds it, but never back in the sea.
- **Signing out** writes whatever's waiting first, then forgets the account Credential Manager picked, and the phone is a guest again.
- **The daily reminder** is off until it's turned on. It's one WorkManager job, scheduled again at each start of the app (so a new time zone counts), after each run and whenever its settings change. A run more than 2 hours late, or inside quiet hours, posts nothing and is scheduled again. A time inside quiet hours goes out when they end, and the "Reminders on" snackbar says that time.
- **The reminder sheet** opens by itself once, after a find, when the Shore is back on top; after that only from the Shore's chip or Settings. The chip shows while reminders are off or Android holds them back, and hides for a week after Android's prompt is refused. Once Android won't ask any more, or notifications are off in its settings, the sheet says so with [Open settings], and coming back with them allowed turns the reminder on.
- **The theme** is applied with `UiModeManager.setApplicationNightMode`, so the splash and window colours follow it too. **Reduce motion** forces reduced motion on; off, it "Follows system".
- **Open-source licences** come from the AboutLibraries Gradle plugin, data only and offline, so each library's licence is named and linked rather than copied, behind the app's own screen. The bundled fonts' and icons' licence texts ship as assets.
- **The goodbye screen** says "Fair winds." and leads back to the Shore as a guest. The link to a data-deletion page waits for that page (open-issues.md, slice 9).
- **Copy with no spec source:**
  - the reminder sheet's [Open settings], and the time chip's spoken "Reminder time, 9:00 AM" and "Change time"
  - the Me tab's unknown number, a dash, spoken "Bottled: not known yet"
  - Settings: "Notifications are off" [Turn on], "Not set" for no pen name, "Sign in first", "Coming soon", "Version", the quiet-hours sheet ("Nothing from BottleCast arrives between these times, the daily reminder included.", From, Until, Done), the blocked writers' rows ("A writer you blocked on 5 Oct" [Unblock], "You haven't blocked anyone."), "Signed out. You're a guest on this phone now.", "Signing out…", "Deleting your account…"
  - the delete dialog's body, which leaves out the spec's on-chain sentence until slice 6 and mainnet: "Your profile, chest, streak and drifting bottles will be removed. Bottles someone else has found or kept stay with them, without your name."
  - the deletion errors: "Deleting your account needs a connection. Nothing was removed — try again once you're back online.", "That's a different Google account. Nothing was removed — choose the one you're signed in with." and "Your account isn't fully deleted yet. Check your connection and try again — it picks up where it stopped."
  - the goodbye's "Your account is deleted. Bottles someone else found or kept stay with them, without your name." [Back to the shore]
  - the sign-in sheet's title from the Me tab and Settings, "Sign in with Google"
  - moderation's "Held, writer gone" for an orphan
- **Where the boards and the spec differ,** the spec wins:

  | Spec value, taken | Board value, not taken |
  |---|---|
  | The reminder sheet's "Want a daily nudge?" copy and "Quiet hours: nothing between…" | "Want a nudge when the tide turns?", a body promising "found" notes, "never between" |
  | A 96dp bottle with a bell and the moon | A 72dp disc with a bell and a moon dot (its glassContainer disc is kept) |
  | Me: a 96dp avatar with a 3dp moon rim, centred, the pen name as heading, dome edge at y≈260 | A 72dp avatar with a 2dp rim beside "Marc T.", the pen name in a chip, edge at 236 |
  | Me: a settings gear | A sliders icon |
  | Me: "best 14" and the shields under the streak column | A footer row, "Best streak 14 days · 1 calm-sea shield" |
  | Settings: the spec's sections, order, rows and copy, with rows at least 56dp | The board's order (Appearance first), "Discovering", 48dp rows, "Daily reminder" with its time chip |
  | Settings: "Version" as a row | "BottleCast 1.2.0" under the list |

- **From the boards, where the spec is silent:** the reminder sheet's outlined "Remind me at" row and its time chip, Settings' overline headers, surface groups, full-bleed dividers and segmented Theme buttons, and the Account rows' icons. Material gives each Theme button the widest one's width, so on a 390dp phone they sit under "Theme" rather than beside it.

## 2026-10-16 — Slice 5 spikes

Slice 5's answers, which slice 6 builds on. The spike is in `worker/`, and its README has the method and every sample.

- **A Worker signs within 10 ms of CPU once it's warm. On a cold isolate it runs well over, unless it warms up at module scope, and even then a mint lands right at the limit.** These were measured on the Free plan, from the `cpuTime` Cloudflare reports per invocation (in whole milliseconds), with throwaway keys and nothing broadcast:

  | Invocation | Warm | Cold, lazy | Cold, warmed up at module scope |
  |---|---|---|---|
  | A mint: an ID token checked, the verified mark, a 280-byte mint signed | 1–2 ms (at most 4) | 25–41 ms | 4–10 ms |
  | `/wallet/link`: an ID token checked, then a SIWE message checked and its `personal_sign` signature recovered | 2 ms (at most 9) | 19–26 ms | 4–7 ms |
  | A cron mint: a service-account JWT, the mark, a mint signed | — | 24–68 ms | 4–16 ms (5 of 8 over 10) |
  | Base Sepolia reads through viem: the pending nonce, and a fee estimate that formats the latest block | 3–15 ms (median 5) | | |
  | The same reads as one JSON-RPC batch, parsed by hand | 0–1 ms | | |

  - **Cold** means the first request after a redeploy, which starts a fresh isolate. There were ten redeploys: five began with a mint and five with a link, so each cold figure has five samples.
    - The request sent second wasn't always warm. A lazy link sent after a mint still cost 21–38 ms, probably because it reached another isolate.
    - Every cron run starts cold, since nothing else keeps its isolate alive.
    - The lazy Worker pays for noble building its secp256k1 tables and V8 compiling viem's code on first use.
  - **At the limit:** `cpuTime` comes in whole milliseconds, so the warmed-up mints reported as 10 ms may have been just over. A warm-up alone leaves no headroom.
  - **The warm-up:** while the isolate starts, it signs and recovers once and signs one offline mint. That takes startup from about 17 ms to about 45 ms (the limit is 1 s). The cron mint still ran over, probably because its service-account JWT (RSA, through `jose`) wasn't warmed up. That step's cold cost wasn't measured on its own.
  - **Nothing failed that we saw.** Every request that went over, the largest at 68 ms, still returned 200, with no 1102. Every cron run that tail caught (8 of about 13 per Worker) ended `ok`. Cloudflare's docs only promise leeway for occasional overruns, though, and mints are rare enough that most will start cold.
  - **The rest is cheap when warm:** checking the ID token, the HMAC mark and the service-account JWT run on WebCrypto and cost 0–5 ms.

  Answers the CPU half of "Worker within the free limits".
- **Subrequests:** the reads take 3 subrequests through viem, or 1 as a batch. Base Sepolia's public RPC refused 3 of 15 batches, though, answering with something other than an array, so the real Worker needs a dedicated RPC endpoint, or single calls when a batch is refused. A whole cron mint needs about 7 of its 50:
  - the Firestore token: a read from wherever it's cached, or the token exchange (a cold isolate has nothing cached);
  - the claims that are due, one query;
  - the claim and the message, one `batchGet`;
  - the Receiving wallet, one query;
  - the chain reads, one batch;
  - `eth_sendRawTransaction`;
  - the commit.
- **Proposed for slice 6** (`open-issues.md`):
  - warm the signing and recovery code up at module scope;
  - sign the Firestore token once an hour, not once a mint, by keeping the access token where the next isolate can find it (KV, say);
  - read the chain with one hand-parsed batch, falling back to single calls when it's refused;
  - mint one claim per invocation;
  - measure the real invocation again.

  An invocation that's stopped part way is safe to run again, because the contract's mint is idempotent per messageId and the claim stays pending for the next cron. If it still runs over, Workers Paid ($5 a month) is the fallback, which is the owner's call.
- **Reown: no project yet.** The owner creates it before slice 6: one Starter project, "BottleCast", allowing `com.bottlecast.app` and `com.bottlecast.app.debug` (the web origin joins in slice 7), with Reown Auth, email and social login off. Its ID goes in `android/local.properties` as `reownProjectId`, never in the repo (`open-issues.md`).
- **Privy: not asked yet,** so "Create one with Google" stays "Coming soon". Privy's pricing page (checked 2026-10-16) doesn't say whether the free Developer plan, up to 499 monthly users, includes JWT-based auth, and its dashboard puts Custom auth behind "Request access". Only Privy can answer (`open-issues.md`).
- **AppKit builds in the app.** BOM 1.6.17 was checked on a scratch branch, and nothing was merged. Slice 6 needs these:
  - Reown's `sign` module sets `dataExtractionRules` and `fullBackupContent` on its `<application>`, so the app's manifest needs `tools:replace` for both, or the merge fails.
  - It brings 132 libraries: Koin (which builds beside Hilt), Retrofit, Moshi, OkHttp, RxJava 2, SQLDelight with SQLCipher, web3j, kethereum, Bouncy Castle and Spongy Castle, the Coinbase Wallet SDK, Material Components and Compose Material 2.
  - It also brings Firebase Messaging, whose auto-init would register an FCM token at every start. Turn auto-init off until a push slice wants it.
  - It moves coroutines from 1.10.2 to 1.11.0 and AppCompat from 1.2.0 to 1.7.1, and leaves Compose, the material3 pin and Firebase where they are.
  - The unminified debug APK grows from 68.8 MB to 126.8 MB, about 21.6 MB of which is SQLCipher's native libraries for four ABIs. Slice 6 measures the release bundle, with R8.
- **The Worker lives in `worker/`,** beside `firebase/`.
- **Cloudflare:** the owner's own account. Wrangler registered the account's workers.dev subdomain by itself on the first deploy (it can be renamed in the dashboard). The spike Workers were deleted once measured.

  *Changes spec: nothing.*

## 2026-10-17 — Slice 5 follow-up: cold isolates on the Free plan

Owner's raw answers (2026-10-17): the minter "WebAssembly signer, self-held", over Coinbase's CDP Server Wallet and Workers Paid; after the first round missed, "One more round on Free"; then "I don't want a paid solution".

- **Free only.** The owner rules out Workers Paid, which replaces the 2026-10-16 fallback. Slice 6 has to fit the Free plan's 10 ms of CPU per invocation.
- **Expect cold isolates.** With BottleCast's traffic nearly every mint and link lands on a fresh isolate, and every cron run does. A keep-warm ping can't help, because isolates belong to one data centre and Cloudflare evicts them when it likes. So the cold figures are the ones that count. Running over on most of them is running over "consistently", which Cloudflare's limits page says ends in 1102.
- **It fits, with secp256k1 as WebAssembly and a warm-up at startup.** These were measured on the Free plan in Madrid, from Workers Logs' `cpuTimeMs` (whole milliseconds), with throwaway keys and nothing broadcast. Each cold figure is the first or second request after a redeploy. The noble row is slice 5's, measured the day before with `wrangler tail`, so it isn't a same-day control:

  | Variant | Cold mint (ms) | Cold link (ms) | Cron mint (ms) | Startup (ms) |
  |---|---|---|---|---|
  | noble, warmed up once (2026-10-16) | 3–10 | 4–7 | 4–16 | 37–60 |
  | WebAssembly signer, first called in the request | 6–13 | 7–19 | 4–14 | 18–41 |
  | the signer seeded and warmed up once | 5–18, median 6 | 5–9 | 3–5 (4 runs) | 23–37 |
  | the mint encoded by hand, every step warmed up once | 1–7, median 3 | 4–9, median 5 | 3–5 | 24–56 |
  | every step warmed up 30 times | 1–6, median 2 | 1–5, median 3 | 1–3 (11 runs) | 60–124 |

  Warm, a mint and a link each cost 1 ms (median).
- **What each step fixed:**
  - libsecp256k1 compiled to WebAssembly (`tiny-secp256k1` 2.2.4) signs in about 1 ms on its first call in Node, where noble pays 20–40 ms building its tables in JavaScript that V8 hasn't optimised yet. It gives noble's signatures byte for byte.
  - Its first call still cost about 4–5 ms in a request, probably because V8 compiles each WebAssembly function when it's first called. So the Worker signs and recovers once at module scope. libsecp256k1 seeds its side-channel blinding from random numbers on that first call, and Workers allows none at module scope, so the seed comes from a secret.
  - What remained was ordinary JavaScript that V8 hadn't optimised: `jose`'s ID-token check, viem's encoder and SIWE parser (about 3 ms each), and keccak (about 2 ms a mint). The mint is now encoded by hand, since it's one call in one transaction type. Every step of a mint, a link and a cron mint runs 30 times at startup, so V8 has optimised it by the first request.
- **Slice 6 builds on this:**
  - the WebAssembly signer, with its blinding seed in a Worker secret of its own;
  - the hand-encoded mint (`worker/src/mint-tx.ts`), tested against viem's bytes;
  - a startup warm-up of every hot path, 30 rounds, which adds about 40 ms of startup (the limit is 1 s);
  - the 2026-10-16 proposals, which still stand: the Firestore token signed once an hour, one batched chain read, and one claim per invocation;
  - a new measurement of the real invocations, because Firestore REST and the Firebase JWKS add work this spike didn't have. The 30 rounds lean on V8's tiering, which a workerd update could change, so slice 6's verification measures a cold invocation too.

  In reserve, if those run over: keccak as WebAssembly too, and checking the SIWE signature on-chain with an `eth_call` (free), which leaves `/wallet/link` no curve maths or keccak at all.
- **Measuring:** the network used blocked `wrangler tail`'s host, so the figures came from Workers Logs, read in the dashboard (`worker/README.md`). Workers Logs missed 10–20% of events, so a few cold samples per variant are missing.

  *Changes spec: nothing.*

## 2026-10-18 — Slice 6 planning

The owner's answers while planning slice 6 (contract, Worker, wallet linking and sealing, on Base Sepolia), and the plan they approved with them. The slice's first PR, the contract, records them all.

Owner's raw answers (2026-10-18):
- the keepsake's picture: "Hosted art per bottle";
- where it's hosted: "bottling-messages.web.app";
- "Create one with Google": "Remove it";
- the 24-hour safety check: "From the cast".

As on 2026-10-17, only free tiers that halt rather than bill.

- **The picture is hosted, and everything else stays on-chain.**
  - The keepsake's metadata is JSON that the contract builds itself: the words, the cast date, the pen name, the verified mark, the shape and the glass. Only its `image` is a URL.
  - There's one picture per shape and glass, drawn from the app's bottle rig with the wax seal. Every bottle is sea glass for now (`BottleLook.kt`), so 3 of the 9 pictures are in use.
  - The ±6° hue jitter stays in the app.
- **The pictures live on Firebase Hosting,** at `https://bottling-messages.web.app/keepsakes/`, from `web/public/keepsakes/` on the production project. Hosting on Spark serves 10 GB a month free and goes offline rather than billing. The contract's admin can move the pictures, to a domain of BottleCast's own, say, and the contract then tells marketplaces to fetch them again (ERC-4906).
- **No embedded wallet, so Privy is dropped.** "Create one with Google", its remote flag and "Creating your wallet…" leave the spec (§3.9a). Someone without a wallet keeps their bottles in their chest until they add one. Resolves the open issue "Create one with Google". Slice 5 now waits only on the Reown project ID.
- **The 24-hour safety check counts from the cast:** `sealAfter = createdAt + 24h` (spec §1.7). Resolves "When the 24-hour safety check starts".
- **Minting runs only in the Worker's cron:** once a minute, one claim per run, under a Firestore lease.
  - So there's one minter whose nonce never races, with no Durable Object. That settles the nonce part of "Worker within the free limits".
  - A single seal starts within about a minute, and a batch of 3 takes about 3 minutes.
- **Keep stays the app's own transaction, checked by the rules** (slice 4).
  - Asking to seal is a second rules-checked update to the claim: `pending_wallet` (or `failed`) becomes `cooling`, with `sealAfter` and `to`, one of the keeper's linked wallets.
  - Every later status is the Worker's. The Worker has no `/claim`. Its routes are `/wallet/nonce`, `/wallet/link`, `/wallet/unlink` and the cron.
- **Wallets:**
  - Each wallet is stored at `users/{uid}/wallets/{address}`, keyed by the lowercase address. The Worker keeps a `receiving` flag on exactly one.
  - `walletIndex/{address}` maps an address to its uid.
  - Only the Worker writes either.
  - The Firebase project implies the chain, so the ids drop the `chain:` prefix that `wallets.md` used.
  - Nothing goes on `users/{uid}`, whose keys the rules pin.
- **Deleted accounts:**
  - **The writer:** once a writer deletes their account, nobody can ask to seal their kept bottles. Seals asked for before then still finish, as decided on 2026-10-15. The writer's uid is gone by then, so those keepsakes' verified mark is an HMAC over a fixed stand-in and the messageId. It still links nothing, and casting needed a Google account, so "Bottled by a verified account" stays true.
  - **The keeper:** a seal the keeper asked for before deleting their account still finishes, to the `to` recorded on the claim.
- **Release builds keep sealing and wallets off until the mainnet step,** behind a BuildConfig flag. Until then AppKit is a debug-only dependency, so release bundles don't carry its 132 libraries.
- **`contracts/` moves to Hardhat 3 with viem,** with its versions pinned exactly, as in `worker/` and `firebase/`.
- **The slice's other open items take their proposed defaults:**
  - The spec's three-step wallet sheet wins over the Wallet-Add boards. Resolves "Board or spec where they differ" for slice 6.
  - Testnet keepsakes in a wallet get only the copy buttons that §3.8b already has, and no "Import NFT" sheet. Resolves "Testnet keepsakes in a wallet".

  *Changes spec: §0 (G9), §1.6 (the keepsake's picture), §1.7 (the claim's statuses and fields, and the wallet ids), §3.9a (no "Create one with Google").*

The slice ships as four PRs into `develop`, in order, each planned in its own session:
1. **The contract and these decisions** (`contracts/`, `docs/design/`), then the deploy to Base Sepolia, with the owner's OK.
2. **The Worker and the rules** (`worker/`, `firebase/`):
   - the Worker, with its cron, KV and secrets;
   - the rules and indexes on the debug project, after a dry run.

   Each is deployed with the owner's OK. The cold CPU re-measure follows.
3. **Wallets in the app** (`android/`): the config, the Worker client, AppKit, Add a wallet, Wallets, and the Me and Settings rows.
   - The keepsake pictures go to Hosting, through a preview channel first.
   - Slice 5 is ticked once the Reown project ID is in place.
4. **Sealing in the app** (`android/`): the Claim sheet, the progress screen, Keepsake detail, the Chest, the notification and deletion. Then slice 6 is ticked.

Choices made while building the contract, which the owner can revisit at review:

- **Name and symbol:** "BottleCast keepsakes", `BOTTLE`. Token ids count up from 1, and each keepsake is named "BottleCast #N".
- **Cast** is the metadata standard's date trait (`"display_type": "date"`, in seconds), so marketplaces show it in the viewer's own time zone.
- **The limits are the app's own:**
  - a message of at most 280 UTF-8 bytes;
  - a pen name of at most 20 UTF-16 units, where an emoji counts as 2, as in the app and the rules;
  - a glass from 0 to 2.

  It also refuses an empty messageId. The pen-name count steps from lead byte to lead byte, so even malformed UTF-8 can't store more than 60 bytes.
- **The collection's metadata** (`contractURI`, ERC-7572):
  - "Messages found in bottles on BottleCast and sealed by their finders. Keepsakes are mementos, not money.";
  - the classic sea-glass picture;
  - a link to the Play listing.

  It claims no permanence, since the same contract runs on Base Sepolia. Moving the pictures also emits ERC-7572's `ContractURIUpdated()`.
- **The compiler targets Cancun,** which Base and Polygon PoS both run, rather than solc's default.
- **The contract grants no licence** (`UNLICENSED`), since the repo has none.
