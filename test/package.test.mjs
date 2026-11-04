import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

test("package exposes both module formats", async () => {
  const esm = await import("../packages/electron/dist/index.js");
  const cjs = createRequire(import.meta.url)("../packages/electron/dist/index.cjs");
  assert.equal(typeof esm, "object");
  assert.equal(typeof cjs, "object");
});
