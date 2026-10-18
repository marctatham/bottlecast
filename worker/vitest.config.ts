// The unit tests run in Node: test/*.test.ts, over src/ without the Workers runtime.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
