type DynamoError = {
  name?: string;
  CancellationReasons?: Array<{ Code?: string } | undefined>;
  $retryable?: unknown;
  $metadata?: { httpStatusCode?: number };
};

export type DynamoErrorClassification = 'conflict' | 'overloaded' | 'unknown';

const retryableNames = new Set([
  'ProvisionedThroughputExceededException', 'RequestLimitExceeded',
  'ThrottlingException', 'Throttling', 'TransactionConflictException',
  'TransactionInProgressException', 'InternalServerError', 'ServiceUnavailable',
]);

export const classifyDynamoError = (error: unknown): DynamoErrorClassification => {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const dynamoError = error as DynamoError;
  if (dynamoError.name === 'ConditionalCheckFailedException') return 'conflict';
  const cancellationReasons = dynamoError.CancellationReasons;
  if (dynamoError.name === 'TransactionCanceledException') {
    if (cancellationReasons?.some((reason) =>
      reason?.Code === 'TransactionConflict' ||
      reason?.Code === 'ProvisionedThroughputExceeded' ||
      reason?.Code === 'ThrottlingError',
    )) return 'overloaded';
    const meaningfulReasons = cancellationReasons
      ?.map((reason) => reason?.Code)
      .filter((code): code is string => code !== undefined && code !== 'None') ?? [];
    if (
      meaningfulReasons.length > 0 &&
      meaningfulReasons.every((code) => code === 'ConditionalCheckFailed')
    ) return 'conflict';
  }
  if (
    retryableNames.has(dynamoError.name ?? '') ||
    cancellationReasons?.some((reason) =>
      reason?.Code === 'TransactionConflict' ||
      reason?.Code === 'ProvisionedThroughputExceeded' ||
      reason?.Code === 'ThrottlingError',
    ) || dynamoError.$retryable !== undefined ||
    dynamoError.$metadata?.httpStatusCode === 429 || dynamoError.$metadata?.httpStatusCode === 503
  ) return 'overloaded';
  return 'unknown';
};

export const isDynamoConflict = (error: unknown): boolean =>
  classifyDynamoError(error) === 'conflict';

export const isDynamoOverloaded = (error: unknown): boolean =>
  classifyDynamoError(error) === 'overloaded';

export const conflictResponse = (message: string) => ({
  statusCode: 409,
  body: JSON.stringify({ errorCode: 409, message }),
});

export const overloadResponse = () => ({
  statusCode: 503,
  headers: { 'Retry-After': '1' },
  body: JSON.stringify({ errorCode: 503, message: 'Service temporarily unavailable' }),
});
