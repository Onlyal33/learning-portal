import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

rmSync(".build", { recursive: true, force: true });

execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { stdio: "inherit" },
);

await build({
  entryPoints: ["index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: ".build/index.js",
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

writeFileSync(".build/package.json", '{"type":"module"}\n');
