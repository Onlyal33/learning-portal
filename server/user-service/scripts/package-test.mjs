import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const serverlessPackagePath = require.resolve("serverless/package.json");
const serverlessEntry = resolve(
  dirname(serverlessPackagePath),
  require(serverlessPackagePath).bin.serverless,
);

const runNode = (args) =>
  execFileSync(process.execPath, args, { stdio: "inherit" });

runNode(["--test", "scripts/package-invariants.test.mjs"]);
runNode(["scripts/build.mjs"]);
runNode([
  serverlessEntry,
  "package",
  "--param=jwtSecretParameter=/learning-portal/test/jwt-secret",
]);
runNode(["package-artifact.smoke.mjs"]);
