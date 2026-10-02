import { defineConfig } from "vitest/config";

// Security-rules tests need the Firestore emulator: `npm run test:rules` (requires firebase-tools + Java).
export default defineConfig({
  test: { include: ["tests/rules/**/*.test.ts"], environment: "node", testTimeout: 20000 },
});
