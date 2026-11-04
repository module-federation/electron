import { defineConfig } from "@rslib/core";

const output = {
  distPath: { root: "./dist" },
  sourceMap: { js: "source-map" },
  target: "node",
} as const;

export default defineConfig({
  lib: [
    {
      bundle: false,
      dts: { autoExtension: true },
      format: "esm",
      output,
      redirect: { dts: { extension: true } },
      syntax: "es2022",
    },
    { bundle: false, dts: { autoExtension: true }, format: "cjs", output, syntax: "es2022" },
  ],
});
