# BottleCast keepsakes

`BottleCastKeepsakes` is the ERC-721 contract that a kept bottle is sealed into (slice 6, `docs/design/decisions.md`, 2026-10-18). The Worker's minter seals one bottle per cron run. Debug builds seal on Base Sepolia; Base mainnet is a separate release step that the owner approves.

It's a Hardhat 3 project with viem, and its tests run on node:test.

## What it does
- **`mint(to, messageId, text, castAt, penName, writerMark, glass)`:** only the `MINTER_ROLE` can call it. It returns the token id, and ids count up from 1.
  - It's idempotent per messageId. A bottle that's already sealed returns its token, and nothing is minted or moved, whoever `to` is. So a mint sent twice, or retried after a timeout, is safe.
  - It refuses:
    - an empty messageId;
    - text over 280 UTF-8 bytes, the app's `MessageLimits.MAX_BYTES`;
    - a pen name over 20 UTF-16 units, the app's `PEN_NAME_MAX`, where an emoji counts as 2;
    - a glass above 2.
  - `castAt` is in seconds. `penName` is empty for an unsigned bottle. `writerMark` is the Worker's HMAC over the writer's uid and the messageId.
- **`tokenURI(id)`** returns `data:application/json;base64,` and JSON built on-chain from the stored record:
  - `name` is "BottleCast #N";
  - `description` is the message, JSON-escaped;
  - `image` is `imageBase` + `<shape>-<glass>.png`;
  - `attributes` are Shape, Glass, Cast (`display_type` date), Pen name (only when the bottle is signed), and Writer, "A verified account".

  The shape is byte 0 of SHA-256(messageId), mod 3: classic, flask or gourd, the same seed as the app's `bottleLookFor`. The glass is 0 seaglass, 1 amber or 2 moonglass, in the app's `BottleTint` order.
- **Lookups:**
  - `tokenOfMessage(messageId)` returns 0 if the bottle isn't sealed;
  - `keepsake(id)` returns the stored record;
  - `imageBase()`;
  - `contractURI()` returns the collection's metadata (ERC-7572).
- **`setImageBase(base)`:** admin only. The base must end in `/`, since the file name is appended as is. It emits ERC-4906's `BatchMetadataUpdate(1, type(uint256).max)` and ERC-7572's `ContractURIUpdated()`, so marketplaces fetch the pictures again.
- **Roles:**
  - `DEFAULT_ADMIN_ROLE` grants roles and moves the pictures;
  - `MINTER_ROLE` is the Worker's minter.

  Neither can move anyone's keepsake. The constructor refuses a zero admin, who could never be replaced.

**The pictures** are nine PNGs, one per shape and glass, at `https://bottling-messages.web.app/keepsakes/`. They're drawn from the app's bottle rig into `web/public/keepsakes/` in slice 6's third PR. Every bottle is sea glass for now, so three of them are in use.

**Gas**, measured on the in-process network:
- deploying: about 2.64M;
- sealing a short bottle: about 200k;
- sealing a 280-byte message with a 20-character pen name: about 410k;
- a repeat mint of a sealed bottle: about 30k.

## Test
```shell
npm ci
npx hardhat test
npm run check
```

`npm run check` builds the contract, then type-checks the tests and the Ignition module against the generated artifact types.

## Deploy to Base Sepolia
Each deploy needs the owner's OK (`CLAUDE.md`). The deployer's key lives in Hardhat's keystore, never in the repo or a `.env` file.

1. The owner stores the deployer's private key, typing it into the prompt:
   ```shell
   npx hardhat keystore set BASE_SEPOLIA_DEPLOYER_KEY
   ```
   On Sepolia the deployer is a throwaway key, and it becomes the admin.
2. Fund the deployer from a Base Sepolia faucet.
3. Write `ignition/parameters/baseSepolia.json`, naming the Worker's minter address:
   ```json
   { "BottleCastKeepsakes": { "minter": "0x…" } }
   ```
   `admin` defaults to the deployer and `imageBase` to the hosted folder. Set either one here to change it.
4. Deploy. It asks for the keystore's password, so the owner runs it in their own terminal:
   ```shell
   npx hardhat ignition deploy ignition/modules/BottleCastKeepsakes.ts --network baseSepolia --parameters ignition/parameters/baseSepolia.json
   ```
5. Commit `ignition/deployments/chain-84532/` and the parameters file. They hold only public addresses and the build that was deployed.

**Deployed:** not yet.
