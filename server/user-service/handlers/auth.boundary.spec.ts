import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import getCurrentUserHandler from './getCurrentUser.js';
import jwtAuthorizerHandler from './jwtAuthorizer.js';
import loginUserHandler from './loginUser.js';
import logoutUserHandler from './logoutUser.js';
import registerUserHandler from './registerUser.js';
import updatePasswordHandler from './updatePassword.js';

const dynamoSend = jest.spyOn(
  DynamoDBClient.prototype,
  'send',
) as unknown as jest.Mock;
const ssmSend = jest.spyOn(SSMClient.prototype, 'send') as unknown as jest.Mock;

const getCurrentUser: any = getCurrentUserHandler;
const jwtAuthorizer: any = jwtAuthorizerHandler;
const loginUser: any = loginUserHandler;
const logoutUser: any = logoutUserHandler;
const registerUser: any = registerUserHandler;
const updatePassword: any = updatePasswordHandler;

const userId = 'user-123';
const parameterName = '/learning-portal/test/jwt-secret';

const protectedEvent = (
  body: string | null,
  context: Record<string, unknown> = { userId },
) =>
  ({
    body,
    requestContext: { authorizer: { lambda: context } },
  }) as any;

const claimItem = {
  id: { S: 'EMAIL#ada@example.test' },
  entityType: { S: 'email-claim' },
  userId: { S: userId },
};

const userItem = (password: string) => ({
  id: { S: userId },
  email: { S: 'Ada@Example.test' },
  canonicalEmail: { S: 'ada@example.test' },
  role: { S: 'student' },
  roleProfileId: { S: 'profile-123' },
  password: { S: bcrypt.hashSync(password, 4) },
  injected: { S: 'must-not-leak' },
});

beforeEach(() => {
  Object.assign(process.env, {
    JWT_SECRET_PARAMETER: parameterName,
    USER_TABLE: 'UserTable',
    STUDENT_TABLE: 'StudentTable',
    TRAINER_TABLE: 'TrainerTable',
    BLACKLISTED_TOKENS_TABLE: 'BlacklistedTokensTable',
  });
  dynamoSend.mockReset();
  ssmSend.mockReset().mockResolvedValue({
    Parameter: { Value: 'test-secret' },
  });
});

afterAll(() => {
  dynamoSend.mockRestore();
  ssmSend.mockRestore();
});

describe('SSM signing-key boundary', () => {
  it.each([
    ['unknown account', [{}, undefined]],
    [
      'wrong password',
      [{ Item: claimItem }, { Item: userItem('other-password') }],
    ],
  ])(
    'does not read SSM for %s before the singleton is warmed',
    async (_case, results) => {
      dynamoSend
        .mockResolvedValueOnce(results[0])
        .mockResolvedValueOnce(results[1]);
      const response = await loginUser(
        {
          body: JSON.stringify({
            email: 'ada@example.test',
            password: 'password',
          }),
        },
        {},
        {},
      );

      expect(response.statusCode).toBe(400);
      expect(ssmSend).not.toHaveBeenCalled();
    },
  );

  it('decrypts the exact parameter and successfully signs a valid login', async () => {
    dynamoSend
      .mockResolvedValueOnce({ Item: claimItem })
      .mockResolvedValueOnce({ Item: userItem('password') });

    const response = await loginUser(
      {
        body: JSON.stringify({
          email: ' ADA@example.test ',
          password: 'password',
        }),
      },
      {},
      {},
    );

    expect(response.statusCode).toBe(200);
    const { token } = JSON.parse(response.body);

    expect(jwt.verify(token, 'test-secret')).toMatchObject({ id: userId });
    expect(ssmSend.mock.calls[0][0].input).toEqual({
      Name: parameterName,
      WithDecryption: true,
    });
  });

  it('gives same-second successful logins distinct nonblank JWT ids', async () => {
    dynamoSend
      .mockResolvedValueOnce({ Item: claimItem })
      .mockResolvedValueOnce({ Item: userItem('password') })
      .mockResolvedValueOnce({ Item: claimItem })
      .mockResolvedValueOnce({ Item: userItem('password') });
    const event = {
      body: JSON.stringify({ email: 'ada@example.test', password: 'password' }),
    };
    const first = await loginUser(event, {}, {});
    const second = await loginUser(event, {}, {});
    const firstClaims = jwt.decode(
      JSON.parse(first.body).token,
    ) as jwt.JwtPayload;
    const secondClaims = jwt.decode(
      JSON.parse(second.body).token,
    ) as jwt.JwtPayload;

    expect(firstClaims.iat).toBe(secondClaims.iat);
    expect(firstClaims.jti).toEqual(expect.any(String));
    expect(firstClaims.jti).not.toBe(secondClaims.jti);
  });
});

describe('authorizer and logout boundary', () => {
  const authorizerEvent = (
    authorization?: string,
    type: string | undefined = 'REQUEST',
  ) =>
    ({
      type,
      routeArn: 'arn:aws:execute-api:region:account:api/stage/GET/users/me',
      headers: authorization === undefined ? {} : { authorization },
    }) as any;

  it('is a Promise handler and authorizes an exact Bearer token with verified context', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = jwt.sign({ id: userId, exp: expiresAt }, 'test-secret');
    dynamoSend.mockResolvedValueOnce({});

    expect(jwtAuthorizerHandler).toHaveLength(1);
    const policy = await jwtAuthorizer(authorizerEvent(`Bearer ${token}`), {});

    expect(policy).toMatchObject({
      principalId: userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource:
              'arn:aws:execute-api:region:account:api/stage/GET/users/me',
          },
        ],
      },
      context: { userId, token, expiresAt },
    });

    dynamoSend.mockReset().mockResolvedValueOnce({});
    const response = await logoutUser(
      protectedEvent(null, { userId, token, expiresAt }),
      {},
      {},
    );

    expect(response.statusCode).toBe(200);
    expect(dynamoSend.mock.calls[0][0].input.Item.expiresAt).toEqual({
      N: String(expiresAt),
    });
  });

  it.each([undefined, 'Basic token', 'Bearer token extra'])(
    'rejects missing or malformed authorization header %p with Unauthorized',
    async (authorization) => {
      await expect(
        jwtAuthorizer(authorizerEvent(authorization), {}),
      ).rejects.toThrow(/^Unauthorized$/);

      expect(dynamoSend).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'TOKEN'])(
    'rejects invalid authorizer event type %p with exact Unauthorized',
    async (type) => {
      await expect(
        jwtAuthorizer(authorizerEvent(undefined, type), {}),
      ).rejects.toThrow(/^Unauthorized$/);

      expect(dynamoSend).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid token with Unauthorized', async () => {
    await expect(
      jwtAuthorizer(authorizerEvent('Bearer not-a-jwt'), {}),
    ).rejects.toThrow(/^Unauthorized$/);

    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('rejects a blacklisted token with Unauthorized', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = jwt.sign({ id: userId, exp: expiresAt }, 'test-secret');
    dynamoSend.mockResolvedValueOnce({ Item: { token: { S: token } } });

    await expect(
      jwtAuthorizer(authorizerEvent(`Bearer ${token}`), {}),
    ).rejects.toThrow(/^Unauthorized$/);
  });

  it('rejects logout context without authorizer-verified expiry', async () => {
    const response = await logoutUser(
      protectedEvent(null, { userId, token: 'token' }),
      {},
      {},
    );

    expect(response.statusCode).toBe(401);
    expect(dynamoSend).not.toHaveBeenCalled();
  });
});

describe('preserved request and persistence boundaries', () => {
  const invalidBodies = [null, '', '{', 'null', '[]', '"scalar"'];

  it.each(invalidBodies)('login rejects malformed body %p', async (body) => {
    const response = await loginUser({ body }, {}, {});

    expect(response.statusCode).toBe(400);
    expect(ssmSend).not.toHaveBeenCalled();
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it.each(invalidBodies)(
    'registration rejects malformed body %p',
    async (body) => {
      const response = await registerUser({ body }, {}, {});

      expect(response.statusCode).toBe(400);
      expect(dynamoSend).not.toHaveBeenCalled();
    },
  );

  it('returns the canonical login email after registering a custom username', async () => {
    dynamoSend.mockResolvedValueOnce({});
    const response = await registerUser(
      {
        body: JSON.stringify({
          email: ' Ada@Example.test ',
          username: 'ada',
          role: 'student',
          firstName: 'Ada',
          lastName: 'Lovelace',
        }),
      },
      {},
      {},
    );

    expect(JSON.parse(response.body).username).toBe('Ada@Example.test');
  });

  it('sanitizes direct-key user/profile reads', async () => {
    dynamoSend
      .mockResolvedValueOnce({ Item: userItem('password') })
      .mockResolvedValueOnce({
        Item: {
          id: { S: 'profile-123' },
          userId: { S: userId },
          dateOfBirth: { S: '1815-12-10' },
          injected: { S: 'must-not-leak' },
        },
      });

    const response = await getCurrentUser(protectedEvent(null), {}, {});

    expect(JSON.parse(response.body)).toEqual({
      id: userId,
      email: 'Ada@Example.test',
      dateOfBirth: '1815-12-10',
    });

    expect(
      dynamoSend.mock.calls.every(
        ([command]) =>
          command.input.ConsistentRead === true &&
          command.input.IndexName === undefined,
      ),
    ).toBe(true);
  });

  it('updates only an existing user and returns no password material', async () => {
    dynamoSend.mockResolvedValueOnce({});
    const response = await updatePassword(
      protectedEvent(JSON.stringify({ password: 'new-password' })),
      {},
      {},
    );

    expect(response.statusCode).toBe(200);
    expect(dynamoSend.mock.calls[0][0].input).toMatchObject({
      ConditionExpression: 'attribute_exists(id)',
    });

    expect(dynamoSend.mock.calls[0][0].input.ReturnValues).toBeUndefined();
    expect(response.body).not.toContain('password');
  });
});
