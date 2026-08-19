import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
  ScanCommandOutput,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { createGetCurrentUserHandler } from './getCurrentUser.js';
import { emailClaimId } from './profileLookup.js';
import { createRegisterUserHandler } from './registerUser.js';
import { createUpdateCurrentUserHandler } from './updateCurrentUser.js';

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
if (!endpoint) throw new Error('DYNAMODB_LOCAL_ENDPOINT is required for integration tests');

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const tables = {
  user: `IntegrationUser-${runId}`,
  student: `IntegrationStudent-${runId}`,
  trainer: `IntegrationTrainer-${runId}`,
};
const client = new DynamoDBClient({
  endpoint,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const register = createRegisterUserHandler(client) as any;
const getCurrentUser = createGetCurrentUserHandler(client) as any;
const updateCurrentUser = createUpdateCurrentUserHandler(client) as any;

const event = (userId: string, body: unknown = null) => ({
  body: body === null ? null : JSON.stringify(body),
  requestContext: { authorizer: { lambda: { userId } } },
});
const payload = (email: string, role: 'student' | 'trainer' = 'student') => ({
  email,
  role,
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  ...(role === 'student'
    ? { dateOfBirth: '1815-12-10', address: 'London' }
    : { specializationId: 'math' }),
});
const createTable = (TableName: string) => client.send(new CreateTableCommand({
  TableName,
  KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
  ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
}));
const item = async (table: string, id: string) => {
  const result = await client.send(new GetItemCommand({
    TableName: table, Key: { id: { S: id } }, ConsistentRead: true,
  }));
  return result.Item ? unmarshall(result.Item) : undefined;
};
const allItems = async (table: string) => {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: ScanCommandOutput['LastEvaluatedKey'];
  do {
    const result: ScanCommandOutput = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...(result.Items ?? []).map((record) => unmarshall(record)));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
};
const registeredUser = async (email: string) => {
  const claim = await item(tables.user, emailClaimId(email));
  expect(claim).toMatchObject({ entityType: 'email-claim', userId: expect.any(String) });
  const user = await item(tables.user, claim!.userId as string);
  expect(user).toBeDefined();
  return user!;
};
const updatePayload = (user: Record<string, any>, email: string) => ({
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email,
  isActive: user.isActive,
  ...(user.role === 'student'
    ? { dateOfBirth: '1815-12-10', address: 'London' }
    : { specializationId: 'math' }),
});

beforeAll(async () => {
  Object.assign(process.env, {
    USER_TABLE: tables.user,
    STUDENT_TABLE: tables.student,
    TRAINER_TABLE: tables.trainer,
  });
  await Promise.all(Object.values(tables).map(createTable));
});
afterAll(async () => {
  await Promise.all(Object.values(tables).map((TableName) => client.send(new DeleteTableCommand({ TableName }))));
  client.destroy();
});

test('concurrent case-and-whitespace equivalent registration creates one complete identity', async () => {
  const responses = await Promise.all([
    register({ body: JSON.stringify(payload(' Ada@Example.test ')) }),
    register({ body: JSON.stringify(payload('ada@example.test')) }),
  ]);
  expect(responses.map((response: any) => response.statusCode).sort()).toEqual([200, 409]);
  const claim = await item(tables.user, emailClaimId('ada@example.test'));
  const user = await item(tables.user, claim!.userId as string);
  const profile = await item(
    user!.role === 'student' ? tables.student : tables.trainer,
    user!.roleProfileId as string,
  );
  expect(claim).toMatchObject({ entityType: 'email-claim', userId: user!.id });
  expect(user).toMatchObject({ canonicalEmail: 'ada@example.test', role: 'student' });
  expect(profile).toMatchObject({ id: user!.roleProfileId, userId: user!.id });
  expect(await allItems(tables.user)).toHaveLength(2);
  expect(await allItems(tables.student)).toHaveLength(1);
  expect(await allItems(tables.trainer)).toHaveLength(0);
});

test('two users concurrently claim one target email without corrupting the loser', async () => {
  await register({ body: JSON.stringify(payload('first-owner@example.test')) });
  await register({ body: JSON.stringify(payload('second-owner@example.test')) });
  const first = await registeredUser('first-owner@example.test');
  const second = await registeredUser('second-owner@example.test');
  const target = 'shared-target@example.test';
  const responses = await Promise.all([
    updateCurrentUser(event(first.id as string, updatePayload(first, target))),
    updateCurrentUser(event(second.id as string, updatePayload(second, target))),
  ]);
  expect(responses.map((response: any) => response.statusCode).sort()).toEqual([200, 409]);
  const claim = await item(tables.user, emailClaimId(target));
  const winner = await item(tables.user, claim!.userId as string);
  const loser = winner!.id === first.id ? second : first;
  const winnerOldEmail = winner!.id === first.id
    ? 'first-owner@example.test'
    : 'second-owner@example.test';
  expect(winner).toMatchObject({ canonicalEmail: target, email: target });
  expect(await item(tables.user, emailClaimId(winnerOldEmail))).toBeUndefined();
  expect(await item(tables.user, emailClaimId(loser.canonicalEmail as string))).toMatchObject({ userId: loser.id });
  expect(await item(tables.user, loser.id as string)).toMatchObject({ canonicalEmail: loser.canonicalEmail });
});

test('competing updates from one pre-state atomically roll back the losing new claim', async () => {
  const oldEmail = 'atomic-old@example.test';
  await register({ body: JSON.stringify(payload(oldEmail)) });
  const user = await registeredUser(oldEmail);
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const originalSend = client.send.bind(client);
  const barrierClient = {
    send: async (command: any) => {
      if (command instanceof TransactWriteItemsCommand) {
        arrivals += 1;
        if (arrivals === 2) release();
        await barrier;
      }
      return originalSend(command);
    },
  } as DynamoDBClient;
  const concurrentUpdate = createUpdateCurrentUserHandler(barrierClient) as any;
  const firstEmail = 'atomic-first@example.test';
  const secondEmail = 'atomic-second@example.test';
  const responses = await Promise.all([
    concurrentUpdate(event(user.id as string, updatePayload(user, firstEmail))),
    concurrentUpdate(event(user.id as string, updatePayload(user, secondEmail))),
  ]);
  expect(responses.map((response: any) => response.statusCode).sort()).toEqual([200, 409]);
  const current = await item(tables.user, user.id as string);
  const winnerEmail = current!.canonicalEmail as string;
  const loserEmail = winnerEmail === firstEmail ? secondEmail : firstEmail;
  expect([firstEmail, secondEmail]).toContain(winnerEmail);
  expect(await item(tables.user, emailClaimId(winnerEmail))).toMatchObject({ userId: user.id });
  expect(await item(tables.user, emailClaimId(oldEmail))).toBeUndefined();
  expect(await item(tables.user, emailClaimId(loserEmail))).toBeUndefined();
});

test('register then immediately get returns both role shapes through direct strong reads', async () => {
  const reads: any[] = [];
  const originalSend = client.send.bind(client);
  const observedClient = {
    send: async (command: any) => {
      if (command instanceof GetItemCommand) reads.push(command);
      return originalSend(command);
    },
  } as DynamoDBClient;
  const localRegister = createRegisterUserHandler(observedClient) as any;
  const localGet = createGetCurrentUserHandler(observedClient) as any;
  await localRegister({ body: JSON.stringify(payload('immediate-student@example.test', 'student')) });
  await localRegister({ body: JSON.stringify(payload('immediate-trainer@example.test', 'trainer')) });
  const student = await registeredUser('immediate-student@example.test');
  const trainer = await registeredUser('immediate-trainer@example.test');
  const beforeReads = reads.length;
  const [studentResponse, trainerResponse] = await Promise.all([
    localGet(event(student.id as string)), localGet(event(trainer.id as string)),
  ]);
  expect(studentResponse.statusCode).toBe(200);
  expect(JSON.parse(studentResponse.body)).toMatchObject({ id: student.id, dateOfBirth: '1815-12-10', address: 'London' });
  expect(trainerResponse.statusCode).toBe(200);
  expect(JSON.parse(trainerResponse.body)).toMatchObject({ id: trainer.id, specializationId: 'math' });
  const handlerReads = reads.slice(beforeReads);
  expect(handlerReads).toHaveLength(4);
  for (const command of handlerReads) {
    expect(command.constructor.name).toBe('GetItemCommand');
    expect(command.input).toMatchObject({ ConsistentRead: true, Key: { id: { S: expect.any(String) } } });
    expect(command.input.IndexName).toBeUndefined();
  }
});
