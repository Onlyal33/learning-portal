import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import registerUserHandler from './registerUser.js';
import loginUserHandler from './loginUser.js';
import getCurrentUserHandler from './getCurrentUser.js';
import updateCurrentUserHandler from './updateCurrentUser.js';
import deleteCurrentUserHandler from './deleteCurrentUser.js';

const send = jest.spyOn(
  DynamoDBClient.prototype,
  'send',
) as unknown as jest.Mock;
const ssmSend = jest.spyOn(SSMClient.prototype, 'send') as unknown as jest.Mock;
const registerUser: any = registerUserHandler,
  loginUser: any = loginUserHandler;
const getCurrentUser: any = getCurrentUserHandler,
  updateCurrentUser: any = updateCurrentUserHandler,
  deleteCurrentUser: any = deleteCurrentUserHandler;
const userId = 'user-123';
const event = (body: string | null) =>
  ({ body, requestContext: { authorizer: { lambda: { userId } } } }) as any;
const user = {
  id: { S: userId },
  email: { S: 'Ada@Example.test' },
  canonicalEmail: { S: 'ada@example.test' },
  role: { S: 'student' },
  roleProfileId: { S: 'profile-123' },
  password: {
    S: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  },
};
const profile = {
  id: { S: 'profile-123' },
  userId: { S: userId },
  dateOfBirth: { S: '2000-01-01' },
  address: { S: 'Street' },
};
beforeEach(() => {
  Object.assign(process.env, {
    JWT_SECRET_PARAMETER: '/learning-portal/test/jwt-secret',
    USER_TABLE: 'UserTable',
    STUDENT_TABLE: 'StudentTable',
    TRAINER_TABLE: 'TrainerTable',
  });
  send.mockReset();
  ssmSend.mockReset().mockResolvedValue({
    Parameter: { Value: 'test-secret' },
  });
});
afterAll(() => {
  send.mockRestore();
  ssmSend.mockRestore();
});

test('registration atomically claims canonical email, user, and role profile', async () => {
  send.mockResolvedValueOnce({});
  const response = await registerUser(
    {
      body: JSON.stringify({
        email: ' Ada@Example.test ',
        role: 'student',
        firstName: 'Ada',
        lastName: 'Lovelace',
        dateOfBirth: '',
        address: '',
      }),
    } as any,
    {} as any,
    {} as any,
  );
  expect(response.statusCode).toBe(200);
  const writes = send.mock.calls[0][0].input.TransactItems;
  expect(writes).toHaveLength(3);
  expect(writes[0].Put.Item).toMatchObject({
    id: { S: 'EMAIL#ada@example.test' },
    entityType: { S: 'email-claim' },
  });
  expect(writes[1].Put.Item).toMatchObject({
    canonicalEmail: { S: 'ada@example.test' },
    role: { S: 'student' },
    roleProfileId: { S: expect.any(String) },
  });
});
test('registration maps conditional transaction claim conflicts to conflict', async () => {
  send.mockRejectedValueOnce({
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
  expect(
    (
      await registerUser(
        {
          body: JSON.stringify({
            email: 'a@example.test',
            role: 'student',
            firstName: 'A',
            lastName: 'B',
          }),
        } as any,
        {} as any,
        {} as any,
      )
    ).statusCode,
  ).toBe(409);
});
test('login performs consistent claim then owned canonical user reads without queries', async () => {
  send
    .mockResolvedValueOnce({
      Item: {
        id: { S: 'EMAIL#ada@example.test' },
        entityType: { S: 'email-claim' },
        userId: { S: userId },
      },
    })
    .mockResolvedValueOnce({ Item: user });
  const response = await loginUser(
    {
      body: JSON.stringify({
        email: ' ADA@example.test ',
        password: 'password',
      }),
    } as any,
    {} as any,
    {} as any,
  );
  expect(response.statusCode).toBe(400); // fixture hash deliberately does not match
  expect(send.mock.calls.map((call) => call[0].input)).toEqual(
    expect.arrayContaining([expect.objectContaining({ ConsistentRead: true })]),
  );
  expect(
    send.mock.calls.every(
      (call) => call[0].constructor.name !== 'QueryCommand',
    ),
  ).toBe(true);
});
test('get fails closed for dangling or mismatched role profiles', async () => {
  send
    .mockResolvedValueOnce({ Item: user })
    .mockResolvedValueOnce({ Item: { ...profile, userId: { S: 'other' } } });
  expect(
    (await getCurrentUser(event(null), {} as any, {} as any)).statusCode,
  ).toBe(400);
});
test('update leaves unchanged canonical email out of its transaction and guards ownership', async () => {
  send
    .mockResolvedValueOnce({ Item: user })
    .mockResolvedValueOnce({ Item: profile })
    .mockResolvedValueOnce({});
  const body = JSON.stringify({
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: ' ADA@example.test ',
    isActive: true,
    dateOfBirth: '',
    address: '',
  });
  expect(
    (await updateCurrentUser(event(body), {} as any, {} as any)).statusCode,
  ).toBe(200);
  const writes = send.mock.calls[2][0].input.TransactItems;
  expect(writes).toHaveLength(2);
  expect(writes[1].Update.ConditionExpression).toContain('userId');
});
test('changed email claims, updates, and deletes the old owned claim', async () => {
  send
    .mockResolvedValueOnce({ Item: user })
    .mockResolvedValueOnce({ Item: profile })
    .mockResolvedValueOnce({});
  const body = JSON.stringify({
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'new@example.test',
    isActive: true,
    dateOfBirth: '',
    address: '',
  });
  await updateCurrentUser(event(body), {} as any, {} as any);
  const writes = send.mock.calls[2][0].input.TransactItems;
  expect(writes).toHaveLength(4);
  expect(writes[0].Put.Item.id).toEqual({ S: 'EMAIL#new@example.test' });
  expect(writes[3].Delete.Key).toEqual({ id: { S: 'EMAIL#ada@example.test' } });
});
test('delete removes only the owned claim, user, and profile', async () => {
  send
    .mockResolvedValueOnce({ Item: user })
    .mockResolvedValueOnce({ Item: profile })
    .mockResolvedValueOnce({});
  expect(
    (await deleteCurrentUser(event(null), {} as any, {} as any)).statusCode,
  ).toBe(204);
  const writes = send.mock.calls[2][0].input.TransactItems;
  expect(writes).toHaveLength(3);
  expect(writes[0].Delete.ConditionExpression).toContain('userId');
});
