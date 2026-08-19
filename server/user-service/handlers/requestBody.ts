export type JsonObject = Record<string, unknown>;

export const parseJsonObject = (body: string | null): JsonObject | null => {
  if (typeof body !== 'string') {
    return null;
  }

  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
};

export const requiredString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const optionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

export const badRequest = (message = 'Required data is missing') => ({
  statusCode: 400,
  body: JSON.stringify({ errorCode: 400, message }),
});
