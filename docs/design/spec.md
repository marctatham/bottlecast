# BottleCast: final design spec, "Moonlit Shore" (merged)

> Precedence: `docs/design/decisions.md` overrides this spec; this spec overrides the boards in `docs/design/boards/` except where §6 says otherwise. Build order: see `docs/design/README.md` (it replaces §5).

Version 1.1 · 2026-10-12 · Owner decisions and review fixes merged (see "Owner decisions" in §0). Android (Kotlin, Compose, Material3 1.5.0-beta01, pinned ahead of the Compose BOM for MotionScheme.expressive, the wavy progress indicators and MaterialShapes; decisions.md, 2026-10-13) plus static web pages (Firebase Hosting, bottling-messages.web.app). All layouts use a 360×800dp reference frame with 16dp side gutters. The canvas boards are drawn at 390×844; where a board and this spec disagree, this spec wins (§6).

---

## 0. Decision and grafts

**Winner: Moonlit Shore.** Three reasons:
- It keeps the look the owner already has and likes: Roboto Slab, sage pills, the cyan glass bottle and the big charcoal arc. It also makes that look the actual brand. Today the sage comes from dynamic colour (wallpaper-based Material You), because `BottlingTheme(dynamicColor = true)` is the default in `common/ui/Theme.kt:83` and minSdk is 33.
- It is the cheapest direction to build: one bottle rig, one scenery system, stable M3 components, and a fallback for every experimental API.
- Its copy maps 1:1 onto the zero-cost backend pipeline, so nothing over-promises.

**Owner decisions (2026-10-12).** They override anything below that disagrees.
- **Look:** Moonlit Shore, with dynamic colour off.
- **Mint on keep, wallet-last.** "Keep" is instant, free and Firestore-only ("Kept"). Sealing mints a keepsake into the finder's own linked wallet after the 24-hour safety check, and BottleCast pays the network fee. No custody.
- **Chain:** Base mainnet in release builds (label "Base", explorer basescan.org). Base Sepolia in debug builds only, the one place the "Test network" chip appears. Polygon PoS is a later drop-in swap (same contract; only the label changes).
- **Writer identity on-chain:** a verified-human mark. Every keepsake record says "Bottled by a verified account ✓": a keyed hash (HMAC with a Worker secret over the writer's uid and the messageId, so a writer's keepsakes can't be linked to each other), never a name, email, photo or raw uid. A pen name goes on-chain only if the writer signed that bottle with it; the choice is snapshotted at cast time. Bottles are anonymous by default ("— A stranger at sea").
- **Seal opt-out:** on Preview, "Let the finder seal this as a keepsake" (on by default).
- **Account = passport, wallets = display cases.** One Google account links any number of wallets with a free "Prove it's yours" signature: SIWE (EIP-4361) signed with plain `personal_sign` and verified in the Worker. One wallet is "Receiving". A wallet never signs anyone in.
- **Calendar-day tides:** a new bottle arrives at local midnight. The reminder fires at a time the user sets (default 9:00 AM) and respects quiet hours (default 10 PM – 8 AM). No 20-hour cooldown.
- **Reporting:** a report hides the bottle for the reporter at once; it leaves the sea only after several reports or an admin review. Reporting is never rewarded (G4 dropped). The Report dialog and gifts offer "Block this writer".
- **Terms:** an explicit checkbox before the first cast.
- **Gifts:** recipients can keep a gift from the `/b/{token}` web page by connecting a wallet, with no app. Notifications say "Your bottle for Mum was opened".

**Grafted from the runners-up (and where each idea lands):**

| # | Idea | From | Lands in |
|---|---|---|---|
| G1 | 24-hour safety check before sealing, then it seals automatically | Journal (also Glowtide's "glass cooling") | Claim progress "Waiting" state, Chest chip, Keepsake detail |
| G2 | Calm-sea shields: your first cast each day gives you one (hold up to 2). A shield covers one missed day. Empty-sea days never break streaks | Glowtide | Streak pill, Cast success, Profile, notifications |
| G3 | Unkept finds wait in your chest for 7 days, then drift back to the sea | Journal + Glowtide | Reveal (back), Chest, Detail |
| G4 | ~~Reporting gives one replacement find per day~~ Dropped 2026-10-12: reporting is never rewarded | Journal | — |
| G5 | "While you were away" banner as the fallback when there is no push yet | Journal | Shore A/B |
| G6 | "See exactly what you'll sign" accordion | Journal + Glowtide | Add-a-wallet step 2 |
| G7 | Prefetch the bottle on the Shore; never gate the reveal on an animation | Glowtide (+ repo fix b1d8a34) | Discover |
| G8 | "No shaking needed" help sheet and single-activation Uncork | Glowtide | Discover |
| G9 | Seeded one-of-a-kind silhouette (Classic / Flask / Gourd) from SHA-256(messageId). No rarity. The same art in the app and the share card, and the same shape in the keepsake's hosted picture | Glowtide (rarity removed) | Bottle rig, Chest, Detail, contract |
| G10 | "Seal automatically when I keep" setting, plus a batch-sealing list | Glowtide | Settings, Claim, wallet step 3 |
| G11 | Private "Who's it for?" label, shown only to the sender | Glowtide | Compose (Someone specific), Gift link, notifications |
| G12 | Gift link expires after 30 days and washes back into the sender's chest; the sender can call it back | Journal | Gift link, Chest |
| G13 | Suggested pen name ("Surprise me") after first sign-in, never derived from the Google name; bottles stay anonymous by default | Journal | Sign-in success, pen-name sheet |
| G14 | Byline "— A stranger at sea" | Journal (adapted) | Reveal, Preview, share card |
| G15 | Kindness line in Compose; consent checklist, seal opt-out switch and first-cast terms checkbox on Preview | Journal / Glowtide | Compose, Preview |
| G16 | Settings toggles for "Shake to uncork" and "Haptics" | Journal | Settings, Discover |
| G17 | Report reasons widened (including sexual content) | Journal + Glowtide | Report dialog |
| G18 | Full-screen milestone celebration for Full moon (7-day streak) and first seal only | Journal + Glowtide | Achievements |
| G19 | "Harbour closed" state when the free daily quota is exhausted | Glowtide | Edge states |
| G20 | Delete-account checkbox confirmation | Glowtide | Settings |
| G21 | Share-card toggles: Show my stats / Show my badges / Show my photo | Journal | Share profile |

**Edits to the winner itself:**
- Finder-side "Reserved" becomes **"Kept"**, so there is one less word to learn. The same word works from both sides.
- Added an `inkMuted` token. The original ink at 55% placeholder measured 3.3:1, which fails AA.
- Added an `outline` token for interactive borders that must reach 3:1.

**Deliberately not taken:**
- Rarity tiers, Atlas, ranks and points (loot-box optics, cost).
- Fraunces, Caveat and Fredoka (brand drift).
- Pip the mascot and about 25 hand-inked illustrations (cost).
- Rotated or deckled cards (legibility).
- A required report reason.
- A replacement find for reporting (G4): dropped after review, because it turned reports into free re-rolls.

---

## 1. Foundations

### 1.1 Theme strategy
- `dynamicColor = false`. There are two fixed themes:
  - **Night** (dark, the hero look, matching the owner's screenshots).
  - **Dawn** (light).
- Settings › Appearance › Theme offers: System / Night / Dawn. The default is System.
- Ship the theme change on its own first, so the owner can sign off on the codified look.
- Edge-to-edge with transparent status and navigation bars. Status-bar icons are light on Night and dark on Dawn. This fixes today's dark-icons-on-dark bug.
- Set the window background in themes.xml to `background`, so there is no white flash.
- Add the SplashScreen API: `dome` background with the bottle glyph in `glass` (decisions.md, 2026-10-13).

### 1.2 Colour tokens (hex)

| Token | Night (dark) | Dawn (light) | Use |
|---|---|---|---|
| background | #0D1214 | #F6F4EE | Window, the sea below the arc, sand by day |
| dome | #20272A | #D5E4E3 | The arc and dome fill (CustomBox circle) |
| domeGlow | #2E383B | #EEF5F3 | Radial moonlight at the top of the dome. Decorative only |
| surface | #161D20 | #FFFFFF | Cards, chest items, list groups, link card |
| surfaceHigh | #222A2D | #EEF1EC | Sheets, dialogs, NavigationBar, stats card, toasts, snackbars |
| outline | #7E8B85 | #6F7C75 | **New.** Interactive borders at 3:1 or more: text fields, unselected radios and checkboxes, outlined chips, locked-badge ring (5.3:1 / 4.0:1 on background) |
| outlineVariant | #343E41 | #CBD3CE | Dividers and progress tracks. Decorative only, never the only cue |
| onSurface | #E8ECE6 | #1A2320 | Primary text and icons |
| onSurfaceVariant | #A9B4AE | #4F5B55 | Secondary text, captions, counters, inactive nav labels |
| primary | #C3CFC6 | #3F5A4C | Sea-glass sage: filled pills, switches, radios, text buttons, outlined-pill stroke |
| onPrimary | #17201B | #FFFFFF | Labels on primary |
| primaryContainer | #2E3A34 | #D6E4DA | Streak pill, nav indicator, selected option cards, tonal pills, "Kept" chip |
| onPrimaryContainer | #DCE8DF | #10261A | Text and icons on primaryContainer |
| glass | #63D3FF | #006688 | Links, progress rings, ripples, "Drifting", focus ring (2dp) |
| glassContainer | #0E3A4A | #CBEFFF | Info banners, Translate chip, Drifting and Sealing chips |
| onGlassContainer | #63D3FF | #006688 | Text and icons on glassContainer |
| moon | #F0E0C4 | #7A5A1E | Treasure accent: overlines, the wax seal, collected badges, the moon disc. Also the "Sealed" chip fill |
| onMoon | #2B241A | #FFFFFF | Text on a moon fill |
| moonContainer | #3A3122 | #F6E8CC | Collected-badge fill, the "Waiting" chip, the debug-only "Test network" chip, wallet nudge banner |
| onMoonContainer | #F0E0C4 | #4A3510 | Text on moonContainer |
| parchment | #E9DFCB | #FFF9EC | The message card only. Night adds a 1dp moon rim at 20% (outside the edge) plus a 24dp glass glow at 10%. Dawn adds a 1dp `parchmentEdge` (#E6DCC6) border plus a 2dp shadow |
| ink | #2B241A | #2B241A | Message text on parchment |
| inkMuted | #645C4F | #6B6459 | **New.** Byline, placeholder (italic), counter on parchment |
| inkLink | #006688 | #006688 | Links and cursor on parchment |
| error | #FFB4A8 | #B3261E | Validation after an attempt, destructive text |
| errorContainer | #5C1A12 | #FBDAD5 | Error banners, the "Under review" and "Sealing failed" chips, Report button fill |
| onErrorContainer | #FFDAD4 | #410E0B | Text on errorContainer |
| scrim | #000000 at 60% | #1A2320 at 40% | Behind sheets and dialogs |
| brandSeed | #00C2FF | #00C2FF | Bottle glass fill, notification accent. **Never text** |
| tint.seaGlass / tint.amber / tint.moonglass | #00C2FF / #E8A93A / #E9E4D6 | same | Bottle tints. Illustration only |
| google button | fill #131314, stroke #8E918F, text #E3E3E3 | fill #FFFFFF, stroke #747775, text #1F1F1F | "Continue with Google", following Google's brand spec |

**Contrast, computed (WCAG 2.x):**

| Pair | Night | Dawn |
|---|---|---|
| onSurfaceVariant on background | 8.8 | 6.5 |
| onSurfaceVariant on surfaceHigh | 6.8 | 6.2 |
| onSurfaceVariant on dome | 7.1 | 5.4 |
| primary on background | 11.7 | 6.9 |
| onPrimary on primary | 10.4 | 7.6 |
| glass on background | 11.0 | 5.9 |
| glass on glassContainer | 7.1 | 5.3 |
| moon on background | 14.5 | 5.8 |
| onMoonContainer on moonContainer | 9.8 | 9.6 |
| ink on parchment | 11.6 | 14.6 |
| inkMuted on parchment | 5.0 | 5.6 |
| inkLink on parchment | 4.9 | about 6 |
| error on background | 11.1 | 5.9 |
| onErrorContainer on errorContainer | 10.1 | — |
| outline on background (page dots; Compose editor edge on Dawn) | 5.3 | 4.0 |
| outline on parchment (Compose editor border) | — | 4.2 |

**Fails, never use:** moon on parchment (1.0, Night); onSurfaceVariant text or outline strokes on parchment (1.6 / 2.7, Night); outlineVariant for dots or borders (1.7 / 1.4); inkLink at 40% as a stroke (about 1.9); brandSeed glass as the only edge of a Dawn tap target (1.9).

The dome-vs-background difference in Dawn is decorative (about 1.13:1). Nothing relies on it.

**Status chips.** Every chip is at least 32dp tall (48dp touch target; it grows with large text), uses labelLarge, and always pairs a leading 18dp icon with text, never colour alone. On parchment (the today's-find card, Keepsake detail) chips use ink tokens instead: 1dp inkMuted border, ink text and icon.

| Status | Fill / text | Icon |
|---|---|---|
| Not kept · 5d left | outlined (outline) / onSurfaceVariant | waves |
| Kept | primaryContainer / onPrimaryContainer | inventory_2 (chest) |
| Waiting · 5h | moonContainer / onMoonContainer | hourglass_top |
| Sealing… | glassContainer / onGlassContainer | 12dp spinner |
| Sealed | moon / onMoon | wax-seal glyph |
| Sealing failed · Retry | errorContainer / onErrorContainer | error |
| Corked | surfaceHigh / onSurface | cork glyph |
| Drifting | glassContainer / onGlassContainer | waves |
| Found | outlined primary / primary | footprint |
| Waiting to be opened / Opened | glassContainer / onGlassContainer | link |
| Under review | errorContainer / onErrorContainer | flag |
| Base | glassContainer / onGlassContainer | link |
| Test network (debug builds only, never in release) | moonContainer / onMoonContainer | science |

### 1.3 Typography
Fonts:
- **Roboto Slab** is the voice.
- **Roboto Flex** is for reading.
- **Roboto Mono** is for on-chain facts.

All three are bundled in `res/font/`; nothing downloads, so devices show what the screenshot tests capture. Roboto Flex is the variable font, with `wght` and `opsz` (the style's size, like CSS `font-optical-sizing: auto`) set per style. Licences are in `android/licenses/`.

| Style | Family / weight | sp size / line | Used for |
|---|---|---|---|
| displaySmall | Slab Black | 36/44 | Web wordmark, onboarding p1 wordmark |
| countdown | Slab SemiBold, tabular figures | 36/44 | "3h 12m" |
| headlineMedium | Slab SemiBold | 28/36 | Screen heroes ("A bottle washed ashore", "Corked and cast", "Sealed") |
| headlineSmall | Slab SemiBold | 24/32 | App bar titles, sheet and dialog titles, profile name |
| titleLarge | Slab Bold | 22/30 | Message ≤120 chars |
| titleLarge-long | Slab Medium | 20/28 | Message 121–240 chars (switches automatically) |
| titleMedium | Slab SemiBold | 16/24 | Button labels (sentence case, **no emoji**), list titles, chest excerpts |
| wordmark | Slab Black | 20/28 | Top-left on Shore |
| statNumeral | Slab Black, tabular figures | 28/32 | Profile and share-card stats (Shore uses Slab SemiBold 18) |
| bodyLarge | Flex Regular | 16/24 | Paragraphs, sheet bodies |
| bodyMedium | Flex Regular | 14/20 | Supporting text, bylines on surfaces, meta |
| bodySmall | Flex Regular | 12/16 | Legal text, footnotes, disclosures |
| labelLarge | Flex Medium | 14/20 | Chips, tabs, nav labels, segmented buttons |
| labelSmall | Flex SemiBold, +0.8 tracking, UPPERCASE | 11/16 | Overlines ("FOUND TODAY · DAY 6"), stat captions |
| mono | Roboto Mono Regular | 13/18 | 0x12…9aF (middle elided) plus a copy button |

Rules:
- Text scales to 200%. The dome shrinks first, then the stacks reflow and scroll.
- Remove the -100dp title offset.
- Centre messages of 60 characters or fewer; start-align longer ones.
- Emoji may appear in user messages and notification bodies, never in labels.

### 1.4 Shape, dome and elevation
**Radii:**

| Radius | Used for |
|---|---|
| full (pill) | Every button (primary 56dp, full width; secondary and tonal 48–56dp), chips, streak pill, segmented buttons, nav indicator |
| 28dp | Parchment card |
| 24dp | Cards, chest items, stats card, link card, list groups |
| 16dp | Sheet option rows, text fields, toasts, snackbars, banners |
| 32dp | Sheet top corners, dialogs |
| 4dp | Focus outlines |

Badges use the MaterialShapes cookie/scallop (Material3 1.5, experimental opt-in). Avatars are plain circles (decisions.md, 2026-10-13).

**The dome.** This is CustomBox: a circle of radius 0.5 × screen height. Its bottom edge sits at one of three heights:

| Height | Edge position | Screens |
|---|---|---|
| full | 60% (y≈480) | Shore, onboarding, cast success, gift open |
| expanded | 70% (y≈560) | Discover |
| compact | 30–45% | Reveal, Claim progress, Chest header, Profile, Share card |

- Changes of height animate the circle centre as a shared element (450ms, emphasized).
- A 1dp "moonpath" traces the arc: moon at 25% on Night, glass at 30% on Dawn, fading out at both ends.

**Elevation:**
- Night is tonal only (background → surface → surfaceHigh). The only exception is the parchment's moonlit rim and glow.
- Dawn: cards get a 1dp shadow; parchment gets a 2dp shadow plus its border.
- Sheets sit flat over the scrim.

### 1.5 Motion and haptics
- Motion uses `MaterialTheme.motionScheme` = `MotionScheme.expressive()` (Material3 1.5):
  - Spatial springs with bounce for physical objects (bottle, cork, seal, badges).
  - Effect springs with no bounce for colour and opacity.
- Non-spring tweens: 200ms micro, 300ms component, 450ms screen.

**Signature moments**

1. **Breathing tide (Shore).**
   - The arc edge moves ±2dp on an 8s sine.
   - Three moon glints (24×2dp dashes, moon at 40%) drift across the sea over 12s, staggered.
   - The moon halo's alpha moves between 0.9 and 1.0 over 6s.
   - The bottle bobs at 0.6×.
   - Everything pauses when the screen isn't RESUMED.
2. **Shake to uncork.**
   - Each detected shake: the bottle springs to ±8° (damping 0.4, stiffness 400) and the cork ring advances by one third. The ring is a CircularWavyProgressIndicator. **Progress never decays.**
   - The pop:
     - The cork flies up and left (300ms, rotating 220°).
     - A 120ms moonlight flash (domeGlow 0 → 0.6 → 0).
     - The scroll slides out of the neck and morphs into the parchment card. This uses SharedTransitionLayout; the fallback is AnimatedContent with scale and fade (450ms).
     - One moonlight sheen sweeps across the card (900ms).
3. **Cast** (about 2.4s; tap anywhere to skip).
   - The parchment rolls up (scaleY 1 → 0.08, 280ms) and slips into the bottle (220ms).
   - The cork springs on.
   - The bottle follows a Bézier toss to the horizon (900ms; scale 1 → 0.12; rotation 0 → −25°).
   - Three glass ripple rings appear, 170ms apart.
   - The dome settles from 70% to 60%.
4. **Wax seal.**
   - The disc drops onto the card (scale 1.4 → 1, bouncy).
   - While Sealing, a slow wavy ring circles it.
   - On Sealed, one moon ring expands and fades.
5. **Achievement toast.** It springs down from the top while the badge pops from 0.6 to 1, with 6 moon sparkles (600ms).
6. **Countdown.** The digits roll up each minute (AnimatedContent).
7. **Predictive back.** Full-screen flows scale from 1 to 0.9 and gain 32dp corners, revealing the Shore underneath. Sheets use M3's built-in behaviour.

**Haptics.** Check `arePrimitivesSupported()` before using composition primitives; otherwise use the predefined effects. Send named constants through `ViewCompat.performHapticFeedback` with `HapticFeedbackConstantsCompat` (androidx.core 1.19.1 is already in the repo), which falls back on older APIs. Respect the system touch-feedback setting and the in-app Haptics toggle (G16).

| Moment | Effect | Fallback |
|---|---|---|
| Each shake (1, 2, 3) | PRIMITIVE_LOW_TICK at scale 0.3 / 0.6 / 0.9 | EFFECT_TICK |
| Hold reaches 33% and 66% | TICK | EFFECT_TICK |
| Cork pop | QUICK_RISE, then CLICK | EFFECT_HEAVY_CLICK |
| Cork on, seal stamp, splash | THUD | EFFECT_HEAVY_CLICK |
| Keep or Cast success | performHapticFeedback(CONFIRM) | — |
| Blocked submit | REJECT | — |
| Character limit hit | HapticFeedbackConstantsCompat.SEGMENT_TICK | CLOCK_TICK on API 33 (SEGMENT_TICK is API 34; minSdk is 33) |
| Achievement | TICK, 80ms gap, TICK | — |

**Reduced motion.** This applies when the system animator scale is 0 or the in-app "Reduce motion" switch is on.
- No infinite transitions: the tide, glints, halo and bob stop.
- Any Lottie is pinned to a still frame.
- Discover shows a still bottle and a primary "Open bottle" button. Shaking still works, but nothing wobbles.
- The reveal is a 150ms crossfade, or instant at scale 0.
- Cast becomes a 200ms crossfade to a static success illustration.
- The seal appears without dropping. Toasts fade in. Countdown digits swap in place.
- Haptics stay on, because they convey state rather than motion.

### 1.6 Illustration and iconography
**Style: soft glass under moonlight,** as the bottle rig draws it:
- Cyan glass at 70% opacity with white specular highlights.
- A cream scroll (#F0E0D0 / #E0C0A0) and a tan cork.
- No outlines.

**The bottle rig.** The bottle is redrawn as Compose ImageVectors: body, neck/cork, scroll, ribbon tag, ripple. The rig:
- is driven directly by shake progress;
- is tinted by bottle style;
- freezes cleanly under reduced motion;
- replaces `message_from_bottle.json`, which has an outlined aubergine style, Chinese "成为密友" end text and a licence to confirm.

The Shore and Cast success draw the rig too, so no Lottie ships (decided 2026-10-14).

**Seeded silhouette (G9).** `seed = SHA-256(messageId)`:
- byte 0 mod 3 picks Classic, Flask or Gourd;
- byte 1 adds a ±6° hue jitter within the writer's chosen tint.

The web pages port the same function. A keepsake uses byte 0 only (decided 2026-10-18):
- Its `tokenURI` is JSON the contract builds on-chain: the words, cast date, pen name, verified mark, shape and glass.
- Its `image` is a hosted picture, one per shape and glass, at `https://bottling-messages.web.app/keepsakes/<shape>-<glass>.png`.

So the hue jitter is app-only. There is **no rarity**. The copy says "one of a kind", never "rare".

**Scenery:**
- Moon: a soft disc (moon at 85%) with a 64dp halo, top-right of the dome. Never a face.
- Sea: the background colour plus glints and ripples only.
- Dawn: the moon becomes a pale sun-moon, a #F6E8CC disc (Dawn moonContainer) with a soft moon glow at 12%, and the dome becomes mist (decisions.md, 2026-10-13).

**Spot illustrations** (160dp, built from the rig):

| Scene | Used for |
|---|---|
| Calm sea with a moon reflection | Sea is empty |
| Bottle in three fog bands | Offline |
| Bottle with a stuck, tilted cork | Sealing failed |
| Bottle with a tiny lighthouse beam | Under review |
| Chest with its lid ajar | Empty chest / no wallets |
| Bottle with a moon ribbon tag | Gift |
| Closed harbour gate | Quota exhausted |

**Wax seal:** a moon disc with a scalloped edge and an embossed bottle glyph. It is **the** single visual that means "on-chain". On a sealed keepsake it carries a small check, meaning "Bottled by a verified account".

**Badges:** a scallop shape filled with moonContainer, holding a moon-coloured glyph. Locked badges are a 2dp `outline` ring with the glyph at 50% and a progress line underneath.

**Icons:** Material Symbols Rounded, weight 400, fill 0, 24dp, bundled as `ic_symbol_*` vector drawables. The Shore (house-with-waves) and the bottle have no Symbol and are custom `ic_glyph_*` vectors drawn from the TEMPLATE.md paths.

### 1.7 Vocabulary and lifecycle
Primary copy avoids crypto jargon. Detail rows name each technical term exactly once.

| UI word | Meaning | Backend |
|---|---|---|
| Corked | Saved, not afloat yet (offline queue) | A cast still in Firestore's offline queue; nothing is stored as corked |
| Drifting | Afloat in the sea pool | `status = afloat`, `rand` set, `reportCount` below 3 |
| Found | Someone uncorked it. One finder at a time: the find holds it for 7 days | `status = found`, `foundAt` (when the hold began), `findCount`; the finder's `finds/{messageId}_{uid}` (`held`, `thrown_back` or `reported`) and the day's `daily/{uid}_{date}` |
| Not kept · 5d left | The finder hasn't kept it; it drifts back after 7 days (G3) | Worked out as `foundAt` + 7 days, never stored; an expired hold is findable again |
| Kept | Claimed. In your chest, not on-chain. Keeping is for good: a kept bottle never drifts again | `messages/{id}.status = kept` and `keptAt` (never removed); the finder's find `kept`; `claims/{messageId}` (`keeperUid`, `status = pending_wallet`, `keptAt`), which only the keeper reads |
| Waiting · 5h | Safety check: a bottle seals only once it's 24 hours old, counted from its cast (G1). An older bottle seals as soon as it's kept to a wallet | Asking to seal moves the claim from `pending_wallet` (or `failed`) to `status = cooling`, with `sealAfter = messages.createdAt + 24h` and `to`, the keeper's linked wallet it seals to. The rules check that update; every later status is the Worker's, whose cron mints one claim a minute (decided 2026-10-18) |
| Sealing… | Mint transaction sent | `status = minting`, `txHash`, `nonce` |
| Sealed | Minted to your wallet | `status = minted`, `tokenId`, `txHash`, `mintedAt`; the bottle's `messages/{id}.sealedAt`, which only the Worker writes |
| Sealing hit a snag | The mint failed; the bottle stays kept | `status = failed`, `error`. Asking again moves it back to `cooling` |
| Sealing · delayed | The minter is low on funds, or a send was refused; the Worker keeps trying | `delayedSince` on the claim |
| Keepsake | The NFT. The details row reads "Keepsake (NFT · ERC-721)" | `BottleCastKeepsakes` on Base. Token ids count up from 1, and `tokenURI` is on-chain JSON with a hosted picture (§1.6) |
| Bottled by a verified account ✓ | On every keepsake record: proof that a signed-in BottleCast account wrote it, without saying which. Drawn as the check on the wax seal | A keyed hash written on-chain at mint: HMAC-SHA256 with a Worker secret over the writer's uid and the messageId, so a writer's keepsakes can't be linked to each other. Never a name, email, photo or raw uid |
| Pen name (on a bottle) | Shown only if the writer signed that bottle with it at cast time; changing settings later never changes a cast bottle or its keepsake | `messages/{id}.penName` snapshot (null = "— A stranger at sea"), copied on-chain at mint |
| Sealable | The writer's per-bottle choice on Preview: "Let the finder seal this as a keepsake" (on by default) | `messages/{id}.sealable`; false = it can be kept but never sealed |
| View on Basescan | The button that opens a keepsake or wallet on the block explorer: basescan.org (debug builds: sepolia.basescan.org) | — |
| Base | The network keepsakes are sealed on in release builds; BottleCast pays the fee. Polygon PoS is a later drop-in swap (same contract; only the label and explorer change) | Base mainnet, chainId 8453 |
| Test network | Debug builds only: keepsakes are sealed on Base Sepolia and carry the "Test network" chip. Never shown in release builds | chainId 84532 |
| Prove it's yours | A free signature that links a wallet to the account | SIWE (EIP-4361) message written by the Worker (`/wallet/nonce`), signed with plain `personal_sign`, verified by the Worker (`/wallet/link`; EIP-1271 for smart wallets). Not Reown Auth or SIWX. The Worker then writes `users/{uid}/wallets/{address}`, with `receiving` on exactly one, and `walletIndex/{address}` → uid. The id is the lowercase address with no chain prefix, since the Firebase project implies the chain. Only the Worker writes either |

### 1.8 Copy rules
- Sentence case. No emoji in labels.
- Warm, never shaming: "Streak resting", never "You lost your streak!".
- Never say "earn", "value", "worth", "rare", "rarity", "profit" or "invest" in the UI. Badges are "collected" and shields are "given". Say "keep", "collect" and "seal".
- Where a no-money line is needed, say "Keepsakes are mementos, not money."
- Fees: "Free for you — BottleCast covers the tiny network fee." Never show a price.
- Permanence ("for good", "can't be erased", "lasts even if BottleCast doesn't", "Keep it forever") is only said about Base mainnet. Debug builds on Base Sepolia say "Test-network keepsakes are just for testing and may be reset."
- Every error says what is safe ("Your bottle is safe…") and what to do next.

---

## 2. Navigation and flows

**Structure:**
- An M3 NavigationBar: surfaceHigh, 80dp, always-visible labels, a primaryContainer pill indicator. Three tabs:
  - **Shore** (house-with-waves icon).
  - **Chest** (chest icon, with a badge dot when bottles are Not kept or waiting to seal, or a cast was found).
  - **Me** (24dp avatar).
- Casting is a pill on the Shore, not a tab. There is no FAB.
- Immersive full-screen routes hide the bar: Onboarding, Discover, Reveal, Claim progress, Compose, Preview, Cast success, Gift link, Gift open, Keepsake detail, Achievements, Wallets, Settings, Share profile, Public profile.
- Sheets: Sign-in, Claim, Add a wallet, Translate download, Notification rationale, Achievement detail, Move keepsake, Pen name, Handle, Learn more, Uncork help.
- Dialogs: Report, Throw back confirm (undo snackbar instead), Discard draft, Unlink, Sign out, Delete account, Pull from sea, Cancel link.

**Routes** (Navigation Compose 2.10, type-safe `@Serializable`):
- Onboarding
- Shore, Chest(tab), Me
- Discover(source = daily | gift, token?)
- Reveal(messageId)
- ClaimProgress(claimId)
- Compose(mode = sea | specific), ComposePreview, CastSuccess(messageId)
- GiftLink(shareId), GiftOpen(token)
- Keepsake(itemId)
- Achievements, Wallets, Settings, ShareProfile
- PublicProfile(handle)

**Flow map:**
1. **First launch:** Onboarding (3 panels) → Shore A. The silent anonymous guest uid is created the first time it's needed (the first prefetch or find), never during onboarding: on Spark with Identity Platform, Firebase Auth allows 3,000 daily active users and 100 new accounts per hour per IP, and anonymous guests may count (the docs conflict; check the project's Auth tier). "I'd rather cast one" → sign-in sheet → Compose.
2. **Daily:** Shore A → Discover (shake, tap or hold; **the find is recorded at the pop**) → Reveal. From Reveal:
   - **Keep** → (sign-in sheet if guest) → Claim sheet:
     - Chest → Kept result → Shore B.
     - Seal with a wallet → Waiting or Sealing → Sealed / Failed.
     - Seal without a wallet → Add-a-wallet sheet → Sealing.
   - **Share** → Sharesheet.
   - **Throw back** → Shore B, with an undo snackbar.
   - **Flag** → Report dialog (optional "Also block this writer") → the card is hidden for you → Shore B. No replacement find (G4 dropped).
   - **Back** → Shore B, with the snackbar "It'll wait in your chest for 7 days."
   - After the first-ever find, returning to the Shore opens the notification rationale sheet.
3. **Cast:** Shore "Cast a bottle" → (sign-in if guest) → Compose → Preview → cast animation → Cast success → Shore. With "Someone specific": Preview "Cork it & get link" → Gift link → Sharesheet → Done → Shore.
4. **Chest:** Found or Cast tab → Keepsake detail. From detail: Seal (Claim sheet or Add a wallet), Move (move sheet → wallet app), Share, View on Basescan (Custom Tab), Throw back, Report, Pull from sea, Cancel link.
5. **Me:** Profile →
   - Achievements → badge sheet.
   - Wallets → Add-a-wallet sheet / Unlink.
   - Share my profile → (handle sheet) → Sharesheet.
   - Send a bottle to someone → Compose(specific).
   - Gear → Settings.
6. **App Links** (autoVerify, assetlinks.json on Hosting):
   - `/b/{token}` → Gift open → Discover(gift) → Reveal ("SENT TO YOU") → Keep.
   - `/u/{handle}` → PublicProfile.
   - No app installed: the static web pages. On `/b/{token}` the recipient can also keep the bottle with a wallet, with no app and no Google sign-in (3.15c).
7. **Notification taps:**
   - Daily → Shore A (or Shore B with a snackbar if today's bottle is already found).
   - Found / Kept / Gift opened → Keepsake detail of that cast.
   - Sealing done → Keepsake detail.

**Back rules:**
- Predictive back everywhere.
- Discover before the pop → Shore A, and the day is not used.
- Reveal and Claim progress → Shore B. Sealing continues in the background.
- Compose with text → discard dialog.
- Cast success → always the Shore, never back into Compose.
- Tab roots → Shore. Shore → exit.

---

## 3. Screens

### 3.1 First-launch onboarding (3 panels)
**Purpose:** teach the premise and the one-bottle-a-day rule, then drop the user into their first find. No sign-in.

**Layout:**
- HorizontalPager, full-bleed.
- Full dome (edge at y≈464) with domeGlow and a 40dp moon at (72%, 12%).
- "Skip" text button, top-right, 48dp target (pages 1–2 only).
- Illustration centred in the dome (y≈150–360, about 240dp wide).
- Below the arc:
  - headlineMedium, centred (y≈490).
  - 8dp gap, then bodyLarge in onSurfaceVariant (max 3 lines).
  - Page dots at y≈640: 8dp dots in `outline` (outlineVariant is only 1.7:1 / 1.4:1); the active one is a 24×8 primary pill.
- Bottom, 24dp above the gesture inset:
  - Pages 1–2: a 56dp primary pill.
  - Page 3: a primary pill, an 8dp gap, then an outlined pill.
- Illustrations:
  - Page 1: the bobbing bottle.
  - Page 2: the bottle on sand under the moon, with a glass tide ring two-thirds full.
  - Page 3: parchment with the wax seal stamping once (600ms).

**Copy:**

| Page | Title | Body |
|---|---|---|
| 1 | Messages, adrift | People cast short notes into the sea. Every so often, one washes up for you. |
| 2 | One bottle a day | A new bottle washes up every day at midnight. Open it whenever suits you. |
| 3 | Keep what moves you | Keep a bottle and it's yours. If you like, seal it on-chain as a one-of-a-kind keepsake. No wallet needed to start. |

- Buttons: "Next" · "Find my first bottle" (primary) · "I'd rather cast one" (outlined) · "Skip".
- TalkBack: "Page 2 of 3".

**States:**
- Shown on first launch only (DataStore flag).
- Replay from Settings › How BottleCast works: an X replaces Skip, and the last button reads "Got it".
- Reduced motion: static art.
- Font scale above 150%: the art shrinks to 140dp and the copy scrolls.
- Dawn variant.

### 3.2 Sign-in (lazy Google sheet)
**Purpose:** the only sign-in UI. It appears just before cast, keep, gift, share profile or add wallet, then resumes that action.

**Layout:** ModalBottomSheet on surfaceHigh (32dp top corners, drag handle, 24dp padding), top to bottom:
- 64dp bottle glyph (glass) with a moon dot.
- 16dp gap, then the title (headlineSmall, centred).
- 8dp gap, then the body (bodyLarge, onSurfaceVariant, centred).
- Optional carry-over chip (primaryContainer, wave icon).
- 24dp gap, then the Google button: full width, 56dp, pill, brand colours, 20dp G logo.
- 8dp gap, then a "Not now" text button (48dp).
- 16dp gap, then the legal line (bodySmall) with underlined links to Terms and Privacy Policy. These open Custom Tabs on bottling-messages.web.app.

**Copy:**
- Titles by context:
  - "Sign in to cast your bottle"
  - "Sign in to keep this bottle"
  - "Sign in to open your gift"
  - "Sign in to share your profile"
  - "Sign in to add a wallet"
- Body: "We use your Google account so your chest and streak follow you to any phone. Your name never appears on bottles unless you choose a pen name."
- Carry-over chip: "Your 3-day streak and today's find come with you". Until streaks exist (slice 4), it reads "Today's find comes with you", shown only while the guest holds a live find today.
- If that Google account already exists, the guest's live find is handed over to it, as long as the account has no find today and has never found that bottle (decided 2026-10-14).
- Button: "Continue with Google". Secondary: "Not now".
- Legal: "By continuing you agree to the Terms and the Privacy Policy."
- Error: "Couldn't sign you in. Check your connection and try again."
- Success snackbar (G13): "Signed in. Your bottles stay anonymous unless you pick a pen name." [Pick one]. This opens the pen-name sheet:
  - Title "Your pen name"
  - Field
  - Helper "Shown only on bottles you choose to sign. 3–20 characters."
  - Buttons [Surprise me] [Save]. "Surprise me" generates names like "Driftwood", "Quiet Otter" or "Tidewise", never from the Google name.

**States:**
- Idle.
- Loading: the label becomes a spinner; the sheet can't be dismissed and the handle is hidden.
- Cancelled in Credential Manager: the sheet stays, no error.
- Error: inline error with an icon above the button.
- Offline: the button is disabled, with the caption "You're offline".
- Success: the sheet fades out over 200ms and the pending action continues.
  - Guest uid: `linkWithCredential`.
  - If the Google account already exists: switch to it and move today's find across, if that account has no find today.
- "Sign in anonymously" is removed. Legacy anonymous posters are asked to link Google the next time they cast.

### 3.3 Home / Shore
Shared frame: edge-to-edge 360×800, full dome (edge at y≈480), breathing tide, NavigationBar at y 720–800.

**Top row** (y 36–84, 16dp gutters):
- Left: wordmark "BottleCast" (Slab Black 20).
- Right: streak pill (36dp tall, 48dp target, primaryContainer). It holds a wave icon, "6-day streak" in labelLarge, then up to two 14dp shield glyphs (G2).

**While-you-were-away banner (G5):** under the top row when present. glassContainer, 16dp radius, 48dp minimum height.

**State A: a bottle is waiting**
- The bottle sits centred at y≈210 (260×170dp, drawn by the rig), bobbing.
- Headline at y≈318: "A bottle washed ashore" (headlineMedium).
- Body at y≈360: "Today's bottle is waiting for you." (bodyLarge, onSurfaceVariant, 32dp side padding).
- Below the arc: three moon glints.
- Stats row at y≈500–548: three items 24dp apart, each a Slab SemiBold 18 numeral over a labelSmall caption. The whole row is one 48dp target that opens Me.
- Primary pill at y≈580 (56dp): bottle icon + "Find today's bottle".
- 8dp gap, then an outlined pill (56dp, 1dp primary stroke): "Cast a bottle".
- **The candidate bottle is prefetched while State A is visible (G7).**

**State B: found today, next tide.** This is also the canonical "daily limit reached" screen.
- In the dome: the moon centred at y≈170 (56dp disc plus halo), wrapped by a 128dp tide ring. The ring is a 4dp glass stroke on an outlineVariant track; its fill is the share of the local day that has passed (midnight to midnight).
- At y≈260: labelSmall "NEXT TIDE IN", then the countdown "3h 12m".
- Then titleLarge "You found today's bottle" and the body.
- **Today's-find card** straddling the arc at y≈420–490:
  - Parchment, 24dp radius, 16dp margins, 64dp tall.
  - One-line Slab ink excerpt with an ellipsis.
  - Trailing status chip in the ink style (1dp inkMuted border, ink text and icon) and a chevron. Surface-token chips fall to 1.6–2.7:1 on parchment.
  - Tapping it reopens Reveal read-only.
- Below the arc:
  - Stats row (y≈512).
  - Reminder AssistChip with a bell icon, glassContainer, shown only when notifications are off.
  - Primary "Cast a bottle", then outlined "Open your chest".

**Copy:**
- Stats: "12 BOTTLED" · "30 FOUND" · "9 KEPT".
- Streak pill TalkBack: "Tide streak, 6 days, 1 calm-sea shield".
- State B:
  - "NEXT TIDE IN" / "3h 12m"
  - Headline: "You found today's bottle"
  - Body: "A new one washes up at midnight."
  - Card: "“Hey, that's pretty cool 🙂”" with chip "Kept" or "Not kept · 7d left"
  - Reminder chip: "Remind me at 9:00 AM" (opens the reminder sheet, 3.16a)
  - Buttons: "Cast a bottle", "Open your chest"
- Banner (G5): "While you were away, 2 of your bottles were found." [See them]
- Shield used, one-time snackbar: "A calm sea kept your 6-day streak."
- Streak at 0: the pill reads "Start a streak".
- Streak broken: "Streak resting — find today's bottle to start a new one."

**Rules (G2):**
- Tides follow the calendar: a new bottle arrives at local midnight, and each local day allows exactly one find. There is no cooldown. The find is recorded in a create-only `daily/{uid}_{yyyy-mm-dd}` doc, so rules reject a second find on the same local date.
- The streak counts consecutive local calendar days with a find.
- Your first cast each day gives you a shield. You can hold up to 2.
- A missed day automatically uses one shield.
- Days when the sea is empty never break a streak.
- Each day goes in the order it happens (decided 2026-10-15): the day's first cast gives its shield, then a day with no find uses one. So a day with a cast but no find never rests a streak.
- The records: the create-only daily find records, and `streakDays/{uid}_{date}` marks for the day's first cast (in the cast's own commit), a calm sea and a streak carried over from a guest. The phone folds them, keeping its fold up to three days ago.
- There are no paid items, ever.

**States:**
- A and B.
- Countdown formats: over 1h "3h 12m"; under 1h "42 min"; under 1 min "Any moment…".
- At zero: crossfade to State A with a ripple and a TICK.
- Guest: stats show Found and Kept only; no error.
- Offline: banner "You're offline — today's bottle will be here when you're back"; the primary is disabled.
- Sea empty and known in advance: the headline becomes "The sea is calm today" and the primary becomes "Cast a bottle".
- Reached via a deep link after today's find: State B plus a snackbar.
- Admin: an overflow item "Moderation" replaces the old "View ALL".
- Reduced motion: everything is static.
- 200% font: the bottle hides and the stats wrap.
- Dawn variant.

### 3.4 Compose a message
**Layout:** no nav bar; imePadding.
- **Top app bar:** close X on the left, centred title "Cast a bottle" (headlineSmall).
- **y≈80:** SingleChoiceSegmentedButtonRow, 48dp tall: [waves icon "Anyone at sea"] [link icon "Someone specific"].
- **Someone specific only:** a single-line OutlinedTextField (16dp radius, `outline` border) "Who's it for?" with the helper "Only you see this" (G11).
- **Parchment editor card:** 16dp margins, 28dp radius, 20dp padding, minimum 240dp, grows to fill. A 1dp `outline` border marks the field: on Dawn, parchment on background is only 1.05:1 and the #E6DCC6 border about 1.3:1, while outline reaches 4.0–4.2:1.
  - BasicTextField in Slab Medium 20/28, ink; cursor in inkLink.
  - Placeholder in italic inkMuted. It rotates daily.
  - Bottom row inside the card: helper on the left (labelLarge, inkMuted, with an icon); tabular counter on the right.
- **Chip row:** AssistChips "Nudge me" (sparkle icon where on-device AI is available, lightbulb otherwise) and "Polish" (only where available). They use different ML Kit GenAI APIs, all in Beta: Nudge and the Preview tone check use the Prompt API (the shortest device list); Polish and "A gentler version" use the Rewriting API (fixed styles such as Rephrase and Friendly, in 7 languages). Check each feature's status on its own (available, downloadable, downloading, unavailable), show "Warming up…" while a model downloads, and hide Polish and the tone check when the writing language isn't supported.
- **"BOTTLE" row:** three 48dp swatches with names underneath:
  - Sea glass
  - Amber (locked: "Reach a 3-day streak")
  - Moonglass (locked: "Reach a 7-day streak")
  - Below the swatches, the caption "Its shape is a surprise. Every bottle is one of a kind." (G9)
- **Signing:** the pen-name choice lives on Preview (3.4b), not here.
- **Bottom bar** (surfaceHigh, 16dp padding, rides the keyboard):
  - The kindness line, shown only when the keyboard is closed (G15).
  - Primary pill "Preview".

**Copy:**
- Placeholders:
  - "If you could send a message to anyone, anywhere, what would it say?"
  - "What's something small that made today better?"
  - "Tell a stranger something you wish someone had told you."
- Helpers:
  - "At least 10 characters"
  - "English · detected on your phone"
  - "That's the limit — bottles are small."
  - "Emoji take extra room"
- Counter: "42 / 240".
- Nudge suggestions (3 chips above the keyboard): "To whoever finds this:", "Today I learned…", "A small thank-you to…".
- Signing: see Preview (3.4b).
- Kindness line: "Strangers will read this. Keep it kind."
- Discard dialog: "Toss this draft?" [Keep writing] [Toss].
- Cast-limit chip: "1 cast left today".

**States:**
- **Empty:** Preview disabled.
- **Under minimum:** the counter stays neutral. The red helper appears only after tapping the disabled Preview, with a REJECT haptic.
- **Length:** measured on the **trimmed** text, so whitespace-only input never passes.
- **220+ characters:** the counter switches from inkMuted to ink and reads "20 left", counting down, so the warning isn't colour alone. Never moon on parchment (1.02:1).
- **240 characters or 280 UTF-8 bytes:** input stops, with a SEGMENT_TICK (CLOCK_TICK on API 33, via HapticFeedbackConstantsCompat).
- **Nudge loading:** "Warming up…" while the model downloads.
- **No AI:** Nudge draws from 30 curated prompts; Polish is hidden.
- **Offline:** writing is allowed.
- **Draft:** autosaved locally, debounced at 1s.
- **Restored draft:** snackbar "We kept your draft." [Start fresh].
- **Cap:** 5 casts a day, enforced by the rules; "That's 5 bottles today — the sea needs a rest."

### 3.4b Preview and tone check
Preview stays a separate route: it is where the writer consents to permanence.

**Layout:**
- **Top bar:** back arrow (labelled "Edit"), title "Preview".
- **Overline:** "HOW IT WASHES UP" (labelSmall, moon).
- **Bottle:** 120dp, chosen tint, over a compact dome (edge at y≈260).
- **Parchment card:** exactly as it will appear on Reveal.
- **Recipient row:** ListItem on surface, 16dp radius.
- **Consent checklist (G15):** surface card, 24dp radius, three 40dp rows, each with an icon and bodyMedium text.
- **Bottle settings:** a surface group (24dp radius) of two switch rows, saved on the bottle when it's cast (`penName`, `sealable`):
  - "Sign with my pen name (Driftwood)". The default comes from Settings › "Sign new bottles with my pen name" (off); gifts default to on. With no pen name yet, the row reads "Set a pen name…" and opens the pen-name sheet.
  - "Let the finder seal this as a keepsake", on by default. Helper: "If they keep it, your words go on Base for good, marked 'Bottled by a verified account'. Your name and email never do."
- **Terms (first cast only):** an unticked checkbox, "I agree to the Community guidelines and Terms" (both links). The primary stays disabled until it's ticked; the acceptance time and terms version are saved on the user doc.
- **Tone-check row** (Nano only):
  - Expands into a moonContainer card when flagged.
- **Bottom:** primary pill, then an "Edit" text button.

**Copy:**
- Byline: "— A stranger at sea · just now", or "— Driftwood · just now" when the pen-name switch is on.
- Recipient: "Drifting to: anyone at sea" / "For: Mum (whoever has your link)".
- Checklist:
  - "You can't edit a bottle once it's cast"
  - "Whoever finds it can read and share it"
  - "If they keep and seal it, your words go on Base, a public blockchain, for good" (debug builds: "…go on a test network, just for testing")
- Tone check:
  - "Tone check · Looks kind"
  - "Checking tone on your phone…"
  - Flagged: "This might land harder than you mean." [See a gentler version] [Keep mine]
  - Gentler-version sheet: "A gentler version" [Use this] [Keep mine], with the caption "Suggested on your phone. Nothing is sent anywhere."
- Primary: "Cast it" (Someone specific: "Cork it & get link").
- Offline primary: "Cast when back online".

**States:**
- No AI: the tone row is hidden.
- Checking: at most 2s, then skipped silently.
- Flagged: advisory only, never blocking.
- Guest taps the primary: the sign-in sheet, then the action continues.
- Casting: the button shows a spinner.
- Error: "Couldn't cast. Your words are saved." [Try again].
- ML Kit Language ID runs here, and `lang` is stored on the message.

### 3.5 Casting animation and success
**Layout:**
- About 2.4s of animation (section 1.5). Tap to skip.
- Then the full dome. The bottle bobs at 12% scale on the horizon (y≈470) with three static ripples.
- In the dome: headlineMedium at y≈250, then bodyLarge.
- Below the arc at y≈540: a **journey row** of five small chips joined by 1dp lines:
  - Corked: done (primaryContainer with a check).
  - Drifting: active (glassContainer with a pulsing dot).
  - Found: pending (outlined).
  - Kept: pending (outlined).
  - Sealed: pending (outlined). Left out when the writer switched sealing off.
- Caption (bodySmall, centred).
- Shield row (G2): a primaryContainer chip with a shield icon.
- Bottom: primary "Back to shore", text button "See it in your chest".

**Copy:**
- "Corked and cast" / "Your bottle is drifting. Someone will find it soon."
- Caption: "Nothing goes on-chain unless someone keeps and seals it."
- Shield chip: "+1 calm-sea shield — it covers one missed day"
- Offline variant: "Corked — it'll set sail when you're back online." The Drifting chip reads "Waiting for connection".

**States:**
- Animating; success; offline-queued.
- First cast: the "Message in a bottle" toast after 600ms.
- 10th cast: "Tidewriter".
- Shield cap reached: the shield row is hidden.
- Someone specific: this screen is replaced by Gift link (3.15).
- Reduced motion: a static frame with a 200ms crossfade.
- Back always goes to the Shore.

### 3.6 Discover: shake to uncork
**Layout:**
- No nav bar. Transparent top bar: back arrow on the left; a 48dp "?" help button on the right (G8).
- Expanded dome (edge at y≈560), animated in from 60%.
- **Bottle rig:** 200dp tall, tilted 12°, on a faint sand mound centred at y≈300. It is drawn in its seeded silhouette and the writer's tint. The bottle is a button (tap or long-press).
- **Cork ring:** 72dp wavy indicator around the neck. Glass on an outlineVariant track, with ticks at 1/3 and 2/3.
- Headline at y≈470 (headlineSmall), then the body.
- Below the arc at y≈600: an outlined pill "Tap to uncork", 12dp gap, then a bodyMedium hint.

**Detection:**
- TYPE_ACCELEROMETER at SENSOR_DELAY_GAME.
- A peak above 2.4g counts, with 250ms debounce. Three peaks pop the cork.
- Registered only while RESUMED.
- Hold the bottle for 1.2s to fill the ring. Releasing early drains it.
- **The find is committed at the pop**, never on entry.
- The reveal never waits on an animation: data is prefetched, and if it hasn't arrived the scroll waits half-out.

**Copy:**
- "Shake to uncork" / "Give your phone a few gentle shakes."
- Alternative: "Tap to uncork" · "or press and hold the bottle"
- No accelerometer, or Settings "Shake to uncork" off: "Tap to uncork" / "Tap the bottle three times, or press and hold."
- Reduced motion: "Your bottle is here", primary pill "Open bottle".
- Help sheet: "No shaking needed" / "Tap Uncork, press and hold the bottle, or shake — whichever you like. Leaving now won't use up today's bottle." [Got it]
- TalkBack on the bottle: "Uncork bottle. Double-tap to open." A single activation pops it.
- Late data: "Unrolling…"

**States:**
- Idle (bottle bobs, ring at 0).
- 1/3 and 2/3 (wobble, ring advances, tick).
- Holding.
- Pop: haptic, shared transition to Reveal.
- Data late: the scroll stays half-out with a shimmer for up to 4s.
- Error: the bottle slipping-back art, "The bottle slipped back into the sea. Today's bottle is still waiting." [Try again]
- Sea empty: see 3.18, with the note "This didn't use up today's bottle."
- Already found: redirect to Shore B, with the daily-limit snackbar (3.18).
- Offline: "Fog rolled in" full state.
- Gift mode: the caption "This one doesn't use up today's bottle."

### 3.7 Reveal: the message
*Keep writes at once, after the sign-in sheet for a guest; the Claim sheet, the full-screen Kept result and "Seal it" wait for slice 6 (decisions, 2026-10-15).*

**Layout:**
- Compact dome (edge at y≈230). No nav bar.
- **Top bar (64dp):** back arrow on the left; on the right, a 48dp outlined flag button with the tooltip "Report".
- **Overline** at y≈92 (labelSmall, moon, centred).
- **Parchment card:** x 16–344, from y≈116. Height hugs the content: minimum 220dp, maximum 60% of the screen, scrolling inside with fade edges. 28dp radius, moonlit rim on Night, 24dp padding. Inside:
  - The message (titleLarge, or titleLarge-long above 120 characters).
  - 16dp gap, then a 1dp ink-at-12% divider.
  - Byline row: on the left the byline (bodyMedium, inkMuted); on the right the translate chip (inkLink text and icon, 1dp solid inkLink stroke; at 40% alpha it measured about 1.9:1), shown only when the language differs from the device and is not `und`.
- **20dp gap:** a row of two 48dp tonal pills (primaryContainer): Share (share icon) and "Throw back" (waves icon).
- **Pinned bottom:** primary pill 56dp with a chest icon, "Keep this bottle"; 8dp gap; bodySmall helper, centred.

**Byline rules:**
- Default: "— A stranger at sea · cast 3 days ago".
- When the writer signed that bottle with their pen name at cast time: "— Driftwood · cast 3 days ago".
- Gifts: the sender's pen name (default on for gifts) or "— Someone who thought of you".
- **Never** the Google name, email or photo.
- Your own bottles never wash up on your shore.

**Copy:**
- Overline: "FOUND TODAY · DAY 6" (gifts: "SENT TO YOU").
- Translate chip: "Translate from Spanish".
- After translating: "Translated from Spanish · Show original", plus the attribution "Translated by Google" (bodySmall).
- Download sheet:
  - "Download Spanish? (~30 MB)"
  - "Translation happens on your phone, so it needs the language pack once. Wi-Fi recommended."
  - [Download now] [Wait for Wi-Fi]
- Downloading chip: a bobbing-bottle indeterminate loader, "Getting Spanish…", and a Cancel ×.
- Translate error: "Couldn't translate right now. Try again on Wi-Fi."
- Buttons: "Share", "Throw back", "Keep this bottle".
- Helper: "Free. No wallet needed."
- Throw-back snackbar: "Back to the sea it goes." [Undo]
- Leaving without keeping, snackbar on Shore B: "It'll wait in your chest for 7 days."

**States:**
- Default; long message (inner scroll).
- Translate: chip present / downloading / translated (crossfade) / error (the original always stays).
- On mobile data: the Wi-Fi sheet first.
- Already kept (reopened later): the primary becomes the chip "In your chest · Kept" plus a text button "Seal it".
- Reported: the card collapses (300ms) into a slim bar "You reported this message. It's hidden for you." [Undo] (5s), then 3.19.
- Guest taps Keep: the sign-in sheet.
- First ever find: the "Beachcomber" toast. On returning to the Shore, the notification rationale sheet.
- Reduced motion: no sheen.

### 3.8 Claim flow (wallet-last)

**3.8a Claim sheet: "Keep this bottle"**

ModalBottomSheet on surfaceHigh, 24dp padding:
- Title (headlineSmall) and body (bodyMedium, onSurfaceVariant).
- Two radio option cards, 12dp apart (16dp radius, minimum 80dp, 16dp padding):
  - Unselected: surface fill with a 1dp outline border.
  - Selected: primaryContainer fill with a 2dp primary border.
  - Each card: a leading 40dp icon (chest in glass; wax seal in moon), a titleMedium title, bodyMedium support text, and a trailing radio.
  - Card 2 shows a mono address and a "Change" text button when a wallet exists.
- Disclosure row: info icon plus bodySmall, with a "Learn more" link in glass.
- Primary "Keep it", 56dp.

Copy:
- Title "Keep this bottle" / body "It's yours either way. Choose where it lives."
- Card 1: "Keep it in my chest" / "It's yours. Seal it on-chain whenever you like."
- Card 2 with a wallet: "Keep & seal to my wallet" / "Rainbow · 0x12…9aF" [Change]
- Card 2 without a wallet: "Add a wallet & seal" / "Takes about a minute. We'll walk you through it."
- Disclosure: "Sealing writes this message, its date and a 'Bottled by a verified account' mark to Base, a public blockchain, as a keepsake (NFT). It's free for you — BottleCast covers the tiny network fee — and it can't be erased." [Learn more] Debug builds: "…to a test network (Base Sepolia). Test-network keepsakes are just for testing and may be reset."
- Learn-more sheet:
  - "What does sealing mean?"
  - "Sealing turns your bottle into a keepsake (an NFT) in a wallet you control. It's recorded on Base, a public blockchain, so it lasts even if BottleCast doesn't. It's free for you — BottleCast covers the tiny network fee. Keepsakes are mementos, not money. Every bottle gets a 24-hour safety check first."

States:
- Default selection: card 2 if a receiving wallet exists **and** "Seal automatically when I keep" is on (G10); otherwise card 1.
- Guest: sign-in first.
- Submitting: the button shows a spinner and the sheet is locked.
- Race: "Someone else just kept this one." [Close]
- Offline: the button is disabled, with "Keeping needs a connection".
- Under review: the sheet won't open; a snackbar explains why.
- Writer switched sealing off (`sealable = false`): only card 1 shows, with the line "The writer asked for this one to stay off-chain. It's yours to keep in your chest." Every other way to seal it (Reveal's "Seal it", Keepsake detail, the Chest wallet banner, the web "Keep it with a wallet") is hidden too.

**3.8b Claim progress (full screen)**

Layout:
- Compact dome (edge at y≈340) with the moon.
- Mini parchment card (180×200, 20dp radius) with the first 3 lines, and a 56dp wax seal at its bottom-right.
- Below the arc:
  - headlineMedium title (y≈370), then bodyMedium.
  - A vertical stepper of three rows 48dp apart. Each row has a 24dp node (done: primary check; active: glass wavy spinner; pending: outline ring), a labelLarge label and a bodySmall meta line.
  - Sealed only: chips "Keepsake #142" and "Base" (debug builds add "Test network"), a seal-glyph line "Bottled by a verified account", then a "View on Basescan ↗" text button in glass.
- Bottom: primary pill plus an outlined pill.

| State | Title / body | Steps or details | Buttons |
|---|---|---|---|
| **Kept** (no wallet) | "Kept. It's waiting in your chest." / "Add a wallet whenever you like and we'll seal it as a keepsake. No rush — it stays yours." | — | "Done", "Add a wallet". The card shrinks into the Chest tab, which gets a dot. |
| **Waiting (G1)** | "Kept. Sealing starts soon." / "Every bottle gets a day of safety checks before anything permanent is written. We'll seal this one in about 5 hours, all by itself." | Kept ✓ · "Safety check · seals in 5h" (hourglass) · "In your wallet · Rainbow 0x12…9aF" | "Back to shore", "View in chest" |
| **Sealing** | "Sealing your keepsake…" / "This usually takes under a minute. You can leave — we'll finish in the background." | "Kept · just now" ✓ · "Sealing on Base…" · "In your wallet · Rainbow 0x12…9aF" | "Back to shore", "View in chest" |
| **Sealed** | "Sealed" / "It's a keepsake now — one of a kind, and yours." | Chips; "View on Basescan ↗"; tip "Don't see it in your wallet? Most wallets show Base keepsakes on their own. If yours doesn't, add it with these:" and copy buttons for the contract address and keepsake ID (debug builds always show them, because wallets don't auto-detect testnet NFTs) | "Back to shore", "Share" |
| **Failed** | "Sealing hit a snag" / "Your bottle is safe and still yours." | Error chip "Couldn't reach the network" | "Try again", "Later". The retry is idempotent per messageId. |
| **Batch (G10)**, after linking a wallet | "Sealing 3 bottles" (one after another: the Worker mints one claim per invocation) | One 64dp row per bottle: glyph, excerpt, chip (Waiting · 5h / Sealing… / Sealed / Sealing failed · Retry) | "Back to shore" |

Additional states:
- First seal: the full-screen "Sealed with care" celebration (G18).
- Left mid-seal: a local notification when done. The Chest item shows "Sealing…".
- Sealing delayed (the minter wallet is low on funds, or the Worker's free daily limit is used up): chip "Sealing · delayed" and "Sealing is taking longer than usual. Your bottle is safe — we'll finish as soon as we can." The Worker retries; there's no button.
- Reduced motion: static seal.

### 3.9 Wallet connect and manage

**3.9a Add-a-wallet sheet (3 steps)**

Full-height ModalBottomSheet. Steps slide horizontally (300ms). Steps 2–3 have a back arrow.

Step 1:
- Title and body.
- A 120dp mini diagram: a 48dp avatar scallop with thin glass lines to two 32dp wallet chips, one solid and one dashed.
- One option ListItem (surface, 16dp radius, 72dp) with a 40dp icon, titleMedium title, bodyMedium support and a chevron.
- An expandable "What's a wallet?" row.
- A text button "Not now — keep bottles in my chest".

Step 1 copy:
- "Add a wallet" / "Your BottleCast account stays the same. A wallet is just a place to keep keepsakes — add as many as you like and pick one to receive them."
- The option: "Connect a wallet app" / "MetaMask, Rainbow, Coinbase Wallet and more". This opens the Reown AppKit picker, themed with our tokens. AppKit only connects the wallet and asks it to sign: the Worker writes the SIWE (EIP-4361) message and verifies the plain `personal_sign` signature. No Reown Auth, one-click auth or SIWX, because Reown's free plan caps those at 500 monthly users and cuts off at the limit. A plain signature also needs no network switch in the wallet.
- No embedded wallet: "Create one with Google" was dropped (decided 2026-10-18). Someone without a wallet keeps their bottles in their chest until they add one.
- "What's a wallet?" → "Think of it as a keyring for digital things. It lives in an app you control — BottleCast can never move anything out of it."

Step 2, "Prove it's yours":
- 56dp wallet icon, wallet name (titleMedium) and mono address.
- Title and body.
- Three check rows with primary checks: "No fees", "No access to your funds", "Unlink anytime".
- **"See exactly what you'll sign" accordion (G6).** It expands a surface block (16dp radius) with mono 12/18 text, maximum 8 lines:

> bottling-messages.web.app wants you to sign in with your Ethereum account: 0x12…9aF
> Link this wallet to BottleCast
> URI: https://bottling-messages.web.app · Chain ID: 8453 (debug builds: 84532) · Nonce: 8f2a91c4 · Expires in 10 minutes

- Primary "Open Rainbow to sign", then a text button "Cancel".

Step 2 copy:
- "Prove it's yours" / "Rainbow will ask you to sign a message. Signing is free, moves nothing, and only proves this wallet is yours."

Step 3, "Wallet linked":
- A 64dp check in a primaryContainer circle that springs in.
- "Wallet linked" / "Rainbow · 0x12…9aF will receive your keepsakes."
- If kept bottles exist: a moonContainer switch card, ON by default: "Seal 3 kept bottles to this wallet now".
- Primary "Done". If the switch was on, this leads to the batch screen (3.8b).

States:
- Waiting for the wallet: spinner, "Waiting for Rainbow… Come back here once you've signed."
- Rejected: "No problem — nothing changed." [Try again]
- Already linked to another account: an error banner "This wallet belongs to another BottleCast account. Unlink it there first." Accounts are never merged.
- No wallet app installed: "No wallet app on this phone yet." plus the explainer.
- Nonce expired: "That took a while — let's try again."
- Offline: the option is disabled.
- Guest: sign-in first.

**3.9b Wallets: one account, many wallets** (from Me or Settings)

Layout:
- Top bar "Wallets".
- Explainer card (surface, 24dp radius, 20dp padding): an 80dp diagram on the left, title and body on the right.
- labelSmall "LINKED WALLETS".
- A 24dp-radius group of 72dp ListItems. Each row: 40dp wallet icon, name, mono address plus " · Base", a radio (selected means Receiving), and a 48dp overflow. The receiving row also shows a "Receiving" chip.
- Outlined pill "Add another wallet".
- bodySmall footer.

Copy:
- Card: "One account, many wallets" / "You sign in with Google — that's your account. Wallets are optional places to keep keepsakes. The one marked Receiving gets new ones."
- Footer: "Switching the receiving wallet asks that wallet to sign once. Keepsakes already sealed stay where they are."
- Overflow: Copy address · View on Basescan ↗ · Unlink (error colour).
- Unlink dialog: "Unlink Rainbow?" / "Keepsakes already sealed stay in that wallet — they're on-chain and yours. New ones will go to your receiving wallet." [Cancel] [Unlink]
  - If it's the last wallet, add: "New bottles you keep will wait in your chest."
- Empty: "No wallets yet" / "Your bottles stay safe in your chest until you add one." [Add a wallet]

States:
- Empty; one wallet (radio hidden, chip shown); many wallets.
- Switching the receiving wallet reuses step 2.
- Copied: a snackbar.
- Offline: read-only.

### 3.10 Treasure chest / collection
**Layout:** nav bar visible (Chest selected).
- Compact dome header (edge at y≈180): "Your chest" (headlineSmall) at y≈64, then the summary line.
- PrimaryTabRow straddling the arc (48dp): "Found (14)" | "Cast (12)".
- A FilterChip row (32dp visual, 48dp target).
- Optional wallet-nudge banner: moonContainer, 16dp radius, seal icon, title, body, an "Add a wallet" text button and a 48dp ×.
- LazyColumn of items (surface, 24dp radius, 16dp padding, 12dp gap). Each item:
  - A leading 40dp bottle glyph in its seeded silhouette and tint, with a seal overlay when Sealed.
  - A 2-line excerpt (titleMedium) and a meta line (bodySmall).
  - A trailing status chip.

**Copy:**
- Summary: "9 kept · 2 sealed · 1 not kept yet".
- Filters:
  - Found: All / Not kept / Kept / Sealed.
  - Cast: All / Drifting / Found / Kept / Sealed / Gifts / Under review.
- Banner: "3 bottles could become keepsakes" / "Add a wallet to seal them — or leave them here, they're yours either way." [Add a wallet]
- Meta: "Found 5 Oct · Spanish" / "Cast 3 Oct · Sent by link · for Mum".
- Gift chips: "Waiting to be opened", "Opened", "Kept", "Link expired · back with you", "Called back".
- Empty Found: "Your chest is empty" / "Today's bottle is waiting on the shore." [Go to the shore]
- Empty Cast: "You haven't cast a bottle yet" / "Write a few words for a stranger." [Cast a bottle]

**States:**
- Loading: 3 skeleton cards (static under reduced motion).
- Empty per tab; filter with no results: "Nothing here yet".
- Guest: Found works; Cast shows "Sign in to cast and track your bottles" [Sign in].
- Until slices 6 and 7: no Sealed or Gifts filters, no wallet banner, and the summary leaves out "sealed".
- Offline: cached data plus a banner.
- Expiring unkept bottle: the meta reads "Drifts away tomorrow — keep it to hold on to it."
- The nav dot clears once the tab is viewed.

### 3.11 Message detail (from the chest)
**Layout:**
- Top bar: back arrow, Share icon, 48dp overflow.
- Full-width parchment card. When Sealed, a 56dp wax seal overlaps its top-right corner.
- Status row: chip plus a bodySmall subtitle.
- Traits line (bodySmall): "Flask · Amber glass" (G9).
- **"JOURNEY"** (labelSmall): a vertical timeline of 12dp dots joined by a 1dp line. Done dots are primary, pending ones outlineVariant. Each has a labelLarge label and a bodySmall date.
- **"ON-CHAIN RECORD"** (shown when Sealing or Sealed): a 24dp-radius surface group of 56dp rows, label on the left and value on the right, mono where relevant, with copy buttons. Then "View on Basescan ↗".
- **"WHAT'S PUBLIC"**: a glassContainer info card.
- Bottom actions, by state.
- Until slice 6: no "On-chain record" or "What's public", no Seal or Move, and Kept has no actions.

**Copy:**
- Journey: "Cast · 3 Oct", "Found · 5 Oct", "Kept · 5 Oct", "Sealed · 6 Oct". For your own casts: "Found by someone · 5 Oct".
- On-chain rows:
  - "Type — Keepsake (NFT · ERC-721)"
  - "Writer — Bottled by a verified account ✓"
  - "Pen name — Driftwood" (only when the writer signed this bottle)
  - "Network — Base" (debug builds: "Base Sepolia [Test network]")
  - "Keepsake ID — #142"
  - "Wallet — Rainbow · 0x12…9aF"
  - "Contract — 0xB077…1e5C"
  - "Transaction — 0x9f3a…c27b"
- What's public: "The message, its dates, a 'Bottled by a verified account' mark (it doesn't say who) and — if the writer chose — their pen name. Never anyone's Google name, email or photo."
- Actions by state:

| State | Actions |
|---|---|
| Not kept | "Keep this bottle · 5 days left" |
| Kept | "Seal to my wallet" (or "Add a wallet to seal") |
| Waiting | Disabled "Seals in 5h" |
| Sealed | Tonal "Move to another wallet", outlined "Share" |

- Move sheet: "Moving happens in your wallet" / "Keepsakes in your wallet are fully yours, so moving one is done in the wallet app. Moving needs a tiny network fee in ETH on Base, paid from that wallet; BottleCast only covers sealing." [Open Rainbow] [Copy keepsake ID]
- Overflow:
  - Found items: "Throw back", "Report".
  - Drifting casts: "Pull from the sea", which confirms "Pull this bottle from the sea? No one will find it." [Cancel] [Pull it].
  - Gifts: "Copy link again", "Cancel link".

**States:**
- Not kept / Kept / Waiting / Sealing / Sealed / Sealing failed ("Try again").
- Under review: actions disabled; card "This bottle was reported, so it's out of the sea while we take a look."
- Removed: "This bottle was taken out of the sea for breaking the community guidelines." The message is hidden.
- Own cast: read-only journey, with no information about the keeper.
- Offline: cached, with "Last updated 2h ago".

### 3.12 Profile (own): the Me tab
**Layout:** nav bar visible.
- Compact dome (edge at y≈260). Transparent top bar with a 48dp settings gear on the right.
- Avatar: a 96dp scallop (fallback circle) with a 3dp moon rim at y≈96. It shows the Google photo **only if "Show my photo" is on**; otherwise the pen-name initial on moonContainer.
- The heading is the pen name, never the Google name, which only Settings › Account shows (decided 2026-10-15).
- Name (headlineSmall), then the handle and join date (bodyMedium).
- Stats card straddling the arc (y≈236–336): surfaceHigh, 24dp radius. Four columns, each a statNumeral over a caption. The streak column adds "best 14" and the shield count.
- "Achievements" (titleMedium) with a "6 of 15" chip and a "See all" text button; then a row of five 56dp badges.
- ListItems (surface, 24dp radius, 72dp):
  - Wallets.
  - "Send a bottle to someone", which opens Compose(specific).
- Tonal pill "Share my profile".

**Copy:**
- "Driftwood" / "@marct · casting since Oct 2026"
- Stats: "12 BOTTLED", "30 FOUND", "9 KEPT", "6 STREAK · best 14 · 1 shield".
- Wallets: "2 linked · Receiving: Rainbow" (none: "Add a wallet (optional)").
- Guest: "Guest sailor" / "Sign in to keep bottles and carry your streak to any phone." [Continue with Google]
- No pen name: "Anonymous sailor" + [Set a pen name]

**States:** signed in; guest (Found and Streak only, achievements locked, wallet row hidden); no pen name; photo hidden; loading skeleton; offline cached; just-collected badge pulses once.

### 3.13 Public profile share card and web landing
**In-app "Share profile":**
- Top bar.
- Card preview: 328×410dp, 24dp radius. It is a captured composable exported at 1080×1350:
  - Dome over the top 55%, with the moon and two glints.
  - 88dp avatar.
  - Pen name (Slab Black 28) and handle.
  - Four stats at 22sp.
  - Three collected badges (40dp).
  - Footer strip: wordmark plus a mono URL at 11sp.
- SegmentedButton "Night | Dawn".
- Switch rows (G21): "Show my stats", "Show my badges", "Show my photo" (off by default, with the helper "Your photo could link you to bottles you sign with your pen name.").
- Primary "Share" (image plus text via the Sharesheet), outlined "Copy link".

Copy:
- Share text: "Come find a message in a bottle with me: bottling-messages.web.app/u/marct"
- Handle sheet: "Pick a handle for your link" with an "@" prefix field, empty or suggested from the pen name, never from the Google name. Error: "That handle's taken — try another."

**Web `/u/{handle}`:**
- Static Firebase Hosting page, 360 wide, same CSS tokens, `prefers-color-scheme`.
- Header wordmark.
- Dome hero (edge at about 300px): avatar initial, pen name (Slab 900, 28px), "Casting since Oct 2026".
- Stats card straddling the arc.
- Badge grid.
- CTA card: "Find a message in a bottle" / "A new one washes ashore every day. Free, no ads." [Get it on Google Play].
- Footer: "BottleCast is a free hobby project. Keepsakes are mementos, not money." plus Privacy / Terms / Data deletion.
- Generic Open Graph tags: "A sailor on BottleCast".
- When opened through the App Link, the same layout appears natively, read-only, with the CTA "Find today's bottle".

**States:**
- No handle: the handle sheet first.
- Guest: sign-in first.
- Rendering shimmer (about 300ms).
- Share error: "Couldn't create the image. Copy the link instead."
- Private profile: the web shows "This sailor keeps their profile private." Sharing warns: "Your profile is private — the link will show a private page." [Make public] [Share anyway]
- Not found: "No sailor by that name."
- iOS or desktop: "BottleCast is on Android for now."

### 3.14 Achievements gallery and unlock moment
**Layout:**
- Top bar "Achievements".
- Header: "6 of 15 collected", then a 4dp LinearProgressIndicator (glass on outlineVariant).
- LazyVerticalGrid, 3 columns, 16dp gutters. Each cell:
  - An 88dp scallop badge.
  - Collected: moonContainer fill with a moon glyph.
  - Locked: a 2dp `outline` ring, the glyph at 50%, plus a small progress ring.
  - The name in labelLarge (2 lines max), plus a progress line ("3/7") when locked.
- Tap opens a sheet: 120dp badge, name, description, then "Collected 5 Oct 2026" or a progress bar, and a tonal "Share" for collected badges.

**The 15 achievements:**

| # | Name | How to collect | Unlocks |
|---|---|---|---|
| 1 | Message in a bottle | Cast your first | — |
| 2 | Beachcomber | Uncork your first | — |
| 3 | Finders keepers | Keep a bottle | — |
| 4 | Sealed with care | Seal your first keepsake | — |
| 5 | Message received | Someone found your bottle | — |
| 6 | Treasured | Someone kept your bottle | — |
| 7 | Three tides | 3-day streak | Amber |
| 8 | Full moon | 7-day streak | Moonglass |
| 9 | Lighthouse keeper | 30-day streak | — |
| 10 | Polyglot shore | Translate a message | — |
| 11 | Cartographer | Bottles in 5 languages | — |
| 12 | For you | Send a bottle by link | — |
| 13 | Tidewriter | Cast 10 | — |
| 14 | Catch and release | Throw one back | — |
| 15 | Night owl | Find between midnight and 4am | Hidden ("???") until collected |

Reporting and AI use are never rewarded.

**Unlock toast:**
- A global overlay below the status bar: 16dp margins, 72dp, surfaceHigh, 16dp radius, 1dp moon rim at 30%.
- A 48dp badge, the labelSmall moon overline "ACHIEVEMENT UNLOCKED", the name (titleMedium) and a chevron.
- Two ticks; auto-dismiss after 4s; announced through a polite live region.
- Several unlocks queue 1.2s apart.

**Milestone celebration (G18), Full moon and Sealed with care only:**
- Full-screen scrim, a 200dp badge with a moon ring burst.
- Titles: "Full moon" / "Seven tides in a row. You've unlocked the Moonglass bottle." or "Sealed with care" / "Your first keepsake is on the public record."
- [Share] [Lovely]

**States:** guest ("Sign in to save your achievements"); partial; all collected ("Every tide, conquered."); reduced motion (fades only, no sparkle or burst).

### 3.15 Send a bottle to someone specific
**Flow:**
- Compose(specific) with "Who's it for?" → Preview → "Cork it & get link".
- On the server, `shares/{128-bit id}` is created. Rules allow `get` and deny `list`.
- **The bottle never enters the public sea.**

**3.15a Gift link (sender)**

Layout:
- Full screen, compact dome (edge at y≈300). In it, a 140dp bottle with a moon ribbon tag, bobbing.
- Below the arc:
  - headlineMedium title, then bodyMedium.
  - Link card (surface, 24dp radius): a link icon, the mono URL elided in the middle, and a 48dp copy button.
  - "Show QR code" toggle, which reveals a 200dp QR on a white 16dp tile (scannable in both themes).
  - Warning row: lock icon plus bodySmall.
- Bottom: primary "Share link", outlined "Done".

Copy:
- "Your bottle for Mum is ready" / "Only people with this link can open it. The first person to keep it makes it theirs."
- "bottling-messages.web.app/b/k3J9…Qe"
- Meta: "Works for 30 days. If nobody opens it, it washes back into your chest." (G12)
- Warning: "Send it privately — anyone holding the link can open it."
- Share text: "I put a message in a bottle for you 🌊 bottling-messages.web.app/b/k3J9…"
- Snackbar: "Link copied"
- Cancel dialog (from Chest): "Call this bottle back?" / "The link stops working and the bottle comes back to your chest." [Keep it out] [Call it back]

States:
- Generating (skeleton).
- Ready / copied / QR shown.
- Failed: "Couldn't make a link. Your bottle is saved." [Try again]
- Later: Waiting to be opened → Opened → Kept → Sealed, or Expired / Called back.
- First gift: the "For you" achievement.

**3.15b Recipient in-app ("A bottle for you")**

Layout:
- App Link → full dome, close X. A ribbon bottle at y≈220.
- Overline "A BOTTLE FOR YOU", headline "Someone sent you a message", body "This one doesn't use up today's bottle."
- Primary "Uncork it" → Discover(gift) → Reveal ("SENT TO YOU"). In the gift variant, Throw back becomes "Not now". The overflow adds "Report or block sender": the Report dialog with "Also block this writer". The block is stored server-side, so the recipient never sees the sender's account.
- Keep → sign-in ("Sign in to open your gift") → Claim sheet (wallet-last).

States:
- Already kept: "This bottle has already been kept." / "Bottles can only have one keeper." [Go to the shore]
- Own link: "This is your bottle — send the link to someone else." [Share link]
- Invalid: "This link doesn't lead to a bottle. It may have been mistyped."
- Expired: "This bottle drifted away — the link expired."
- Called back: "The sender called this bottle back."
- Offline.

**3.15c Recipient web `/b/{token}`**

Layout:
- Static page, same tokens, dark by default.
- Header wordmark.
- CSS dome hero with an inline SVG bottle (bob stops under `prefers-reduced-motion`).
- "Someone sent you a message in a bottle" / "From Driftwood" (the sender's pen name) or "From someone who thought of you".
- Pill "Uncork it". On tap, it becomes the parchment card with the message and byline (one Firestore REST `get`, not the Firebase JS SDK, to stay inside Hosting's 360 MB a day; the same goes for `/u/{handle}`).
- Then a "Keep it forever" card with two ways to keep it:
  - In the app: "Open BottleCast to keep this bottle in your chest." [Open in BottleCast] [Get it on Google Play]
  - With a wallet, no app or Google sign-in needed: outlined [Keep it with a wallet], helper "Connect a wallet to keep it as a keepsake on Base — free, BottleCast covers the network fee." The wallet picker (Reown AppKit for the web) loads only on tap, and not from Firebase Hosting (360 MB a day). The wallet signs the Worker's SIWE message with `personal_sign`; Worker `/gift/claim` verifies it, records that wallet as the keeper and seals to it after the 24-hour safety check. States: waiting for the wallet; "Kept. It'll be sealed to 0x12…9aF soon."; rejected ("No problem — nothing changed."); already kept. Hidden when the writer switched sealing off.
  - Caption: "Didn't open? Tap the link again after installing."
- Footer disclaimer.
- Generic Open Graph tags: "You've got a message in a bottle".

States: unopened / uncorked / already kept ("This bottle already has a keeper.", message hidden) / expired / invalid / iOS or desktop (readable; "BottleCast is on Android for now.") / noscript (Play link).

### 3.16 Notifications
**3.16a Rationale sheet**

When it appears:
- After the first find, on returning to the Shore.
- Later, only from the Shore B chip or Settings. The chip shows while reminders are off or Android holds them back, and hides for a week after Android's prompt is refused.

Layout: ModalBottomSheet (surfaceHigh):
- A 96dp bottle with a bell and the moon.
- Title, then the body.
- "Remind me at" row: a time chip, default "9:00 AM", that opens the M3 TimePicker.
- A caption with a moon icon: "Quiet hours: nothing between 10 PM and 8 AM." Both can be changed in Settings › Reminders.
- Checkbox: "Also tell me when my bottles are found". It is hidden until push exists.
- Primary "Turn on reminders" (launches POST_NOTIFICATIONS), then a text button "Not now".

Copy:
- "Want a daily nudge?" / "One gentle reminder a day, at a time you pick. That's it — no spam."
- Granted: snackbar "Reminders on — we'll nudge you at 9:00 AM"
- Denied: no re-ask for 7 days.
- Permanently denied, or notifications off in Android settings: "Reminders are turned off for BottleCast in Android settings." [Open settings]. Coming back with them allowed turns the reminder on.
- When `shouldShowRequestPermissionRationale()` is true, add "You can turn it off anytime."

**3.16b Example notifications** (shade mock)

All use a small monochrome bottle icon with the brandSeed #00C2FF accent.

| # | Notification | Channel / source | Title / text | Action |
|---|---|---|---|---|
| 1 | Daily bottle | "Daily bottle" (default importance). A local WorkManager job at the user's reminder time (default 9:00 AM) each local day; skipped if today's bottle is already found or the app is in the foreground | "A new bottle washed ashore" / "Today's message is waiting. Keep your 6-day streak going." | [Find it] |
| 2 | Your bottle was found | "Your bottles". Worker → FCM HTTP v1 push | "Your bottle was found" / "Someone just uncorked “If you could send a message to anyone…”" (BigText) | [See it] |
| 3 | Bottle kept | "Your bottles" | "Your bottle was kept" / "It's someone's keepsake now." | — |
| 4 | Gift opened | "Gifts" | "Your bottle for Mum was opened" (uses the private label, G11; it never names who opened it, since anyone with the link can) | — |
| 5 | Sealing done | Local | "Sealed on Base" / "Keepsake #142 is now in your Rainbow wallet." | [View] |

- Quiet hours (default 10 PM – 8 AM, Settings › Reminders) hold back every BottleCast notification, the daily reminder included, until they end.
- Achievements are in-app toasts only. Their channel ("Achievements", low importance) is off by default.
- v1 fallback for 2–4: the Chest badge dot plus the Shore "While you were away" banner.

### 3.17 Settings
**Layout:**
- Top bar "Settings".
- A LazyColumn of sections. Each has a labelSmall header (onSurfaceVariant) and a 24dp-radius surface group of 56–72dp ListItems with dividers.
- "Delete account" is in the error colour.

**Sections:**

| Section | Rows |
|---|---|
| Reminders | "Daily bottle reminder" (switch) · "Remind me at — 9:00 AM" (M3 TimePicker) · "Quiet hours — 10 PM – 8 AM" · "When my bottles are found" (switch; caption "Coming soon" until push exists) · "Gift updates" (switch) |
| Language & translation | "Translate messages into — English (phone language)" · "Downloaded languages — Spanish · 30 MB" [Remove] · "Download packs on Wi-Fi only" (switch) · "Writing help (Nudge, Polish, Tone check)" — "On your phone", or "Not available on this phone — prompts still work" |
| Wallets & keepsakes | "Wallets — 2 linked · Receiving: Rainbow" · "Seal automatically when I keep" (switch, G10) · "What goes on the public record?" |
| Privacy | "Pen name — Driftwood" · "Sign new bottles with my pen name" (switch, off; it only sets Preview's default, and each bottle keeps what was chosen when it was cast) · "Show my profile publicly" (switch) · "Show my photo on my profile" (switch, off) · "Blocked writers — 1" (a list with Unblock) |
| Appearance & feel | "Theme — System / Night / Dawn" · "Reduce motion — Follows system" · "Shake to uncork" (switch, G16) · "Haptics" (switch, G16) |
| About | "How BottleCast works" · "Community guidelines" · "Privacy policy" · "Terms" · "Translations by Google ML Kit" · "Open-source licences" · "Version 1.2.0" |
| Account | "Signed in with Google · Marc T." (the Google avatar appears only here) · "Sign out" · "Delete account" |

**Dialogs:**
- Sign out: "Sign out?" / "You'll go back to guest mode on this phone." [Cancel] [Sign out]
- Delete:
  - "Delete your account?" / "Your profile, chest, streak and drifting bottles will be removed. Bottles someone else has found or kept stay with them, without your name." (decided 2026-10-15). From slice 6, on mainnet, add: "Keepsakes already sealed on-chain can't be erased — they stay in your wallets."
  - Checkbox (G20): "I understand this can't be undone"
  - [Cancel] [Delete account] (enabled only once the box is ticked)

**States:**
- Guest: Account shows "Continue with Google"; Wallets and Privacy are disabled with "Sign in first".
- AI unsupported / downloading (row progress).
- Notifications denied: reminder rows disabled, with "Notifications are off · Turn on".
- Delete in progress: blocking progress, then a goodbye screen ("Fair winds.") with a link to the data-deletion page, once that page exists (slice 9).

### 3.18 Edge, empty and error states
**Template:** a centred column with a 160dp spot illustration, a 16dp gap, titleLarge, an 8dp gap, bodyMedium (maximum 3 lines), a 24dp gap, one pill, and an optional text button.
- Banners: 16dp radius, 48dp minimum, glassContainer for info and errorContainer for errors, placed under the top bar.
- Snackbars: surfaceHigh with a primary action.

| State | Copy |
|---|---|
| Sea is empty | "The sea is calm today" / "No bottles are drifting right now. Be the first — cast one for someone to find." [Cast a bottle] · note "This didn't use up today's bottle, and your streak is safe." |
| Daily limit reached | Shore B plus the snackbar "You've already found today's bottle — next tide in 3h 12m." |
| Offline | Banner "You're offline. Your chest is still here; new bottles need a connection." · Discover full state "Fog rolled in" / "Reconnect to find today's bottle." [Try again] · Translation with downloaded packs still works |
| Mint failed | Chip "Sealing failed · Retry" · full state "Sealing hit a snag" / "Your bottle is safe and still yours." [Try again] |
| AI unsupported | Nudge silently uses curated prompts; Polish and Tone check are hidden · Settings "Not available on this phone — prompts still work" |
| AI busy / quota | "Writing help is resting. Try again in a moment." |
| Translation pack failed | "Couldn't get Spanish. Try again on Wi-Fi." The original stays. |
| Under review | Reporter: "You reported this message. It's hidden for you." · Author's chip "Under review" plus "This bottle was reported, so it's out of the sea while we take a look." · Removed: "This bottle was taken out of the sea for breaking the community guidelines." |
| Unkept expiring | "This bottle drifts away tomorrow. Keep it to hold on to it." |
| No accelerometer | Discover: "Tap to uncork" variant |
| Sign-in unavailable | "Google sign-in isn't available on this device." |
| Generic | "Something went adrift" / "We couldn't load this. Check your connection and try again." [Try again] (replaces the unlabelled system error icon) |
| Harbour closed (G19) | "The harbour's closed for today" / "BottleCast runs on free services, and today's free allowance is used up. Your chest, streak and bottles are safe. We'll reopen around {time}." {time} is when that quota resets, in local time: Firebase at midnight US Pacific, Cloudflare Workers at midnight UTC; never a fixed time or "tomorrow". Used for the Firestore, Auth (3,000 daily users) and Worker (100k requests a day) limits; a minter low on funds shows "Sealing delayed" (3.8b) instead. |
| Cast limit | "That's 5 bottles today — the sea needs a rest. Try again tomorrow." |

Rules:
- Every illustration has a contentDescription, or is marked decorative.
- Error copy never blames the user.
- Back always works.
- Nothing consumes the daily bottle unless the pop was recorded.

### 3.19 Report dialog (restyled, now real)
**Layout:** M3 AlertDialog on surfaceHigh (32dp radius, 24dp padding):
- A 24dp flag icon in error, centred.
- Title (headlineSmall, centred), then the body (bodyMedium).
- An optional radio list of five 48dp rows. Nothing is preselected.
- A divider, then the checkbox "Also block this writer" (unchecked), with the helper "You won't find their bottles again. They won't be told."
- Buttons, right-aligned: text "Cancel" (primary) and a filled pill "Report" (errorContainer / onErrorContainer).

**Copy:**
- "Report this bottle?" / "It disappears for you right away. We'll review it, and it leaves the sea for everyone if it breaks the rules."
- Reasons: "Hurtful or hateful" · "Sexual content" · "Shares someone's personal info" · "Spam or ads" · "Something else" (G17).
- [Cancel] [Report]

**After reporting** (no replacement find: G4 was dropped):
- The card collapses to "Reported. Thanks for keeping the sea kind." If the writer was blocked, add "You won't find their bottles again."
- Primary "Back to the shore". Today's bottle stays used, so reporting can't be used to re-roll.

**States:**
- Submitting: no spinner. The dialog closes at once, and the write waits out the undo window (§3.7).
- Offline: queued through Firestore offline persistence; "Reported — we'll send it when you're back online".
- Already reported: the flag is filled; tapping shows "You've reported this".
- Blocked: none of that writer's bottles or gifts reach you again. Settings › Privacy › "Blocked writers" can undo it.
- Writes: `reports/{messageId}_{uid}` (one per reporter per bottle), and the reporter's find marked `reported`, which is their hidden list, so it disappears for them at once. Only the bottle's current finder can report it, and the report keeps their 7-day hold. Others can find it again once the hold ends, until 3 different people have reported it or an admin pulls it (`status = under_review`). From the third report the discovery queries and the rules both leave it out of the sea.
- Blocking writes `users/{uid}/blockedWriters/{writerUid}`, and the phone skips that writer's bottles by the writer id each one carries. Slice 6's Worker takes this over (`/block` with the messageId), storing the writer server-side so the reporter never learns who wrote it.
- The admin reviews it in the hidden Moderation list.

---

## 4. Accessibility checklist
- Every text pair meets AA (section 1.2). Interactive borders reach 3:1 or more (`outline`). Status is never shown by colour alone.
- Touch targets are 48dp or more. Pills are 56dp.
- Focus ring: 2dp glass, following the shape.
- Text scales to 200% with no clipping. The dome shrinks, then content scrolls.
- Shake is never the only path: tap, hold and single-activation all work. TalkBack labels are on the bottle, the ring state ("Cork loosening, 2 of 3"), the countdown and the streak.
- Reduced motion has a complete path. Haptics stay on, and can be toggled.
- Emoji are removed from labels.
- Turn on `supportsRtl=true`, mirror the layouts, and keep the moon top-end.
- Achievement toasts and errors are announced through polite live regions.
- Heights are minimums, never fixed: status chips (32dp), the today's-find card (64dp), the toast (72dp) and the nav bar (80dp) grow with the text, so nothing clips at 200%.
- Timed controls (the Reported [Undo] bar, undo snackbars, the achievement toast) stay up for at least `AccessibilityManager.getRecommendedTimeoutMillis()`; with TalkBack on, snackbars with an action don't time out.
- At large text sizes Reveal drops its 60%-height card cap and the whole page scrolls, so there's no tiny nested scroll.
- The countdown is announced on focus and when it reaches zero, never every minute.
- On Dawn, the Discover bottle (brandSeed glass, 1.9:1 on sand) gets a 1dp `glass` outline, so the tap target reaches 3:1.

## 5. Build order (each step ships on its own)
1. Theme tokens with dynamicColor off, edge-to-edge and status-bar fix; Shore A/B; type-safe routes.
2. Discover (rig, shake, prefetch) and Reveal; the real Report (hidden for the reporter, N-report threshold, block); the data model (`createdAt`, `lang`, `status`, `rand`, `id`, `penName`, `sealable`, `reportCount`) and the `daily/{uid}_{date}` find record.
3. Compose and Preview, Cast success, lazy sign-in plus the guest upgrade.
4. Chest and Keepsake detail (Kept only); streak and shields; local reminders.
5. Spikes first: Worker signing within 10 ms CPU, Privy custom JWT on the free plan, a Reown project ID. Then the contract (`contracts/`) and the Cloudflare Worker: `/claim`, `/wallet/nonce`, `/wallet/link` (SIWE via `personal_sign`), minting one claim per invocation. Then Wallets, Sealing and the 24-hour safety check, all on Base Sepolia. Moving to Base mainnet is a separate release step that the owner approves.
6. Gifts (including keeping from `/b/{token}` with a wallet), share cards, web pages, App Links.
7. Achievements, translation, on-device AI extras, edge states.

## 6. Canvas boards vs this spec
The canvas boards (`*.dc.html`, 390×844, Night unless named) are a visual reference drawn from this spec and the owner decisions. Where a board and this spec disagree, this spec wins, except for these accepted layout changes:
- Onboarding: the dome edge sits higher (y≈440 of 844) so the copy fits.
- Shore B: the reminder chip sits in the dome, under the body and above the today's-find card.
- Keepsake detail: the Sealed chip and "Keepsake #142" sit inside the parchment card, beside the wax seal.
- Share card preview: 342×380.

Board shortcuts the app does not copy:
- Settings squeezes rows to 48px and the About links into a 2×2 grid to fit a 1400px board. The app uses 56dp minimum rows in one scrolling list (3.17).
- Add a wallet is drawn as two full-screen steps with the seal switch on step 2. The app follows 3.9a's three-step sheet.
- Reveal (Keep first), Compose ("Your bottle", "Into the sea | To someone"), Preview ("Cork & cast", no bottle or overline) and Gift-Compose (its own pen-name switch) differ in order or wording; 3.4–3.7 and 3.15 win.
- Superseded copy: Notify-Rationale (use 3.16a); Settings' "When someone finds my bottle" (needs "Coming soon" until push exists); Edge-HarbourClosed's fixed "8:00 AM" (3.18); Edge-UnderReview's "Someone reported it" (3.11); Onboarding-3, which merges pages 2 and 3 (3.1); Web-Profile showing "Marc T." publicly (public pages show the pen name, 3.13); the Foundations caption "No rarity, no prices." (use "Nothing is ranked or priced.").
- Achievements and Achievement-Unlock use a different badge list ("Sealed with wax", "Prolific"…) from 3.14 and the Profile board; 3.14 wins until the owner picks one.
- Keepsake-Testnet is the only board with the "Test network" chip: it shows the debug-build variant.
