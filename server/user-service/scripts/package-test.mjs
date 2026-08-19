import { execFileSync } from 'node:child_process';

const runNode = (args) =>
  execFileSync(process.execPath, args, { stdio: 'inherit' });

runNode(['--test', 'scripts/package-invariants.test.mjs']);
runNode(['scripts/build.mjs']);
runNode([
  'node_modules/serverless/bin/serverless.js',
  'package',
  '--param=jwtSecretParameter=/learning-portal/test/jwt-secret',
]);
runNode(['package-artifact.smoke.mjs']);
