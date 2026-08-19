import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const archiveUrl = 'https://d1ni2b6xgvw0s0.cloudfront.net/dynamodb_local_latest.tar.gz';
const archiveSha256 = '55b425a9a42cfc728436eaf0e4ae64d688b64d177c99c4f4c4d7e3dbb3ac6c09';
const cacheArchive = join(tmpdir(), `learning-portal-dynamodb-local-${archiveSha256}.tar.gz`);
const metadataPath = join(process.cwd(), 'dynamodb-local-metadata.json');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const verifyArchive = async (archive) => {
  await access(archive);
  if (await sha256(archive) !== archiveSha256) throw new Error(`DynamoDB Local archive checksum mismatch: ${archive}`);
  return archive;
};
const validHome = async (home) => {
  await access(join(home, 'DynamoDBLocal.jar'));
  await access(join(home, 'DynamoDBLocal_lib'));
  return home;
};
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, options);
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
});
const downloadArchive = async () => {
  if (existsSync(cacheArchive)) {
    try { return await verifyArchive(cacheArchive); } catch { await rm(cacheArchive, { force: true }); }
  }
  const response = await fetch(archiveUrl);
  if (!response.ok || !response.body) throw new Error(`DynamoDB Local download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(cacheArchive, { flags: 'wx' }));
  try { return await verifyArchive(cacheArchive); }
  catch (error) { await rm(cacheArchive, { force: true }); throw error; }
};
const extractForRun = async (archive) => {
  const home = await mkdtemp(join(tmpdir(), `learning-portal-dynamodb-local-${archiveSha256}-run-`));
  try {
    await run('tar', ['-xzf', archive, '-C', home]);
    return await validHome(home);
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
};
const assertNoRepositoryMetadata = async () => {
  try {
    await access(metadataPath);
    throw new Error(`DynamoDB Local metadata escaped its temporary run directory: ${metadataPath}`);
  } catch (error) {
    if ((error).code !== 'ENOENT') throw error;
  }
};
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});
const stop = async (child) => {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
};

const providedArchive = process.env.DYNAMODB_LOCAL_ARCHIVE;
let child;
let runHome;
let cleanupPromise;
const cleanup = () => cleanupPromise ??= (async () => {
  await stop(child);
  if (runHome) await rm(runHome, { recursive: true, force: true });
})();
const onSignal = (code) => () => { void cleanup().finally(() => process.exit(code)); };
const sigint = onSignal(130);
const sigterm = onSignal(143);
process.once('SIGINT', sigint);
process.once('SIGTERM', sigterm);
try {
  const archive = providedArchive
    ? await verifyArchive(providedArchive)
    : await downloadArchive();
  runHome = await extractForRun(archive);
  const provenance = providedArchive
    ? `verified DYNAMODB_LOCAL_ARCHIVE=${archive}`
    : `verified download=${archiveUrl}`;
  console.log(`DynamoDB Local artifact verified: sha256=${archiveSha256} provenance=${provenance} home=${runHome}`);
  const port = await freePort();
  child = spawn('java', [
    `-Djava.library.path=${join(runHome, 'DynamoDBLocal_lib')}`,
    '-jar', join(runHome, 'DynamoDBLocal.jar'), '-inMemory', '-sharedDb',
    '-disableTelemetry', '-port', String(port),
  ], { cwd: runHome, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Java is required to run DynamoDB Local')));
    child.once('exit', (code) => reject(new Error(`DynamoDB Local exited during startup (${code})`)));
    resolve();
  });
  const endpoint = `http://127.0.0.1:${port}`;
  const client = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const deadline = Date.now() + 30_000;
  for (;;) {
    try { await client.send(new ListTablesCommand({})); break; }
    catch (error) {
      if (Date.now() >= deadline) throw new Error(`DynamoDB Local did not become ready: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  client.destroy();
  await run(process.execPath, ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', '--config', 'jest.integration.config.js', '--runInBand'], {
    stdio: 'inherit', env: { ...process.env, DYNAMODB_LOCAL_ENDPOINT: endpoint, AWS_ACCESS_KEY_ID: 'local', AWS_SECRET_ACCESS_KEY: 'local', AWS_REGION: 'us-east-1' },
  });
  await assertNoRepositoryMetadata();
} finally {
  process.removeListener('SIGINT', sigint);
  process.removeListener('SIGTERM', sigterm);
  await cleanup();
}
