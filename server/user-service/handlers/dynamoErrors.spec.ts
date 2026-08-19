import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import registerUserHandler from './registerUser.js';
import updatePasswordHandler from './updatePassword.js';
import { classifyDynamoError } from './dynamoErrors.js';

const send = jest.spyOn(DynamoDBClient.prototype, 'send') as unknown as jest.Mock;

afterAll(() => send.mockRestore());

test.each([
  [{ name: 'ConditionalCheckFailedException' }, 'conflict'],
  [{ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] }, 'conflict'],
  [{ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }] }, 'conflict'],
  [{ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'ValidationError' }] }, 'unknown'],
  [{ name: 'TransactionCanceledException' }, 'unknown'],
  [{ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'TransactionConflict' }] }, 'overloaded'],
  [{ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'ThrottlingError' }] }, 'overloaded'],
  [{ name: 'ProvisionedThroughputExceededException' }, 'overloaded'],
  [{ name: 'ValidationException' }, 'unknown'],
])('classifies DynamoDB errors truthfully', (error, expected) => {
  expect(classifyDynamoError(error)).toBe(expected);
});

test('maps retryable registration capacity errors to 503 with Retry-After', async () => {
  send.mockReset().mockRejectedValueOnce({ name: 'ThrottlingException' });
  const response: any = await (registerUserHandler as any)(
    { body: JSON.stringify({ email: 'ada@example.test', role: 'student', firstName: 'Ada', lastName: 'Lovelace' }) }, {}, {},
  );
  expect(response.statusCode).toBe(503);
  expect(response.headers).toEqual({ 'Retry-After': '1' });
});

test('does not label a missing password-update user as conflict or capacity', async () => {
  send.mockReset().mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
  const response: any = await (updatePasswordHandler as any)(
    { body: JSON.stringify({ password: 'next' }), requestContext: { authorizer: { lambda: { userId: 'missing' } } } }, {}, {},
  );
  expect(response.statusCode).toBe(404);
});
