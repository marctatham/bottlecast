import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// One set of settings for the tests and for Ignition's deploys (its production profile), so the
// tests run the bytecode that ships. Cancun is pinned rather than left to the compiler's default:
// Base runs it, and so does Polygon PoS, the drop-in swap the design keeps open.
const compiler = {
  version: "0.8.34",
  settings: {
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 200 },
  },
};

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: compiler,
      production: compiler,
    },
  },
  networks: {
    baseSepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: "https://sepolia.base.org",
      // From Hardhat's keystore (`npx hardhat keystore set BASE_SEPOLIA_DEPLOYER_KEY`), never the
      // repo. Hardhat asks for it only when a task uses this network.
      accounts: [configVariable("BASE_SEPOLIA_DEPLOYER_KEY")],
    },
  },
});
