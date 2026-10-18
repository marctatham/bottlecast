import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/** Where the keepsake pictures live: Firebase Hosting, from `web/public/keepsakes/` (decisions.md, 2026-10-18). */
export const DEFAULT_IMAGE_BASE = "https://bottling-messages.web.app/keepsakes/";

/**
 * Deploys BottleCastKeepsakes. Parameters:
 * - `admin`, who can grant roles and move the pictures; the deploying account unless it's given;
 * - `minter`, the Worker's minter address, which every deploy must name;
 * - `imageBase`, where the pictures live.
 */
export default buildModule("BottleCastKeepsakes", (m) => {
  const admin = m.getParameter("admin", m.getAccount(0));
  const minter = m.getParameter<string>("minter");
  const imageBase = m.getParameter("imageBase", DEFAULT_IMAGE_BASE);

  const keepsakes = m.contract("BottleCastKeepsakes", [admin, minter, imageBase]);

  return { keepsakes };
});
