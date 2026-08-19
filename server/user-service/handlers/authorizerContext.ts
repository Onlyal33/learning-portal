import { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda';

export interface UserAuthorizerContext {
  userId: string;
  token?: string;
  expiresAt?: number;
}

export interface RevocableAuthorizerContext extends UserAuthorizerContext {
  token: string;
  expiresAt: number;
}

export type ProtectedEvent =
  APIGatewayProxyEventV2WithLambdaAuthorizer<UserAuthorizerContext>;

export function getAuthorizerContext(
  event: ProtectedEvent,
  requireToken: true,
): RevocableAuthorizerContext | undefined;
export function getAuthorizerContext(
  event: ProtectedEvent,
  requireToken?: false,
): UserAuthorizerContext | undefined;
export function getAuthorizerContext(
  event: ProtectedEvent,
  requireToken = false,
): UserAuthorizerContext | undefined {
  const context = event.requestContext.authorizer?.lambda;

  if (
    !context ||
    typeof context.userId !== 'string' ||
    !context.userId.trim()
  ) {
    return undefined;
  }

  if (
    requireToken &&
    (typeof context.token !== 'string' ||
      !context.token.trim() ||
      typeof context.expiresAt !== 'number' ||
      !Number.isFinite(context.expiresAt))
  ) {
    return undefined;
  }

  return context;
}

export const unauthorizedResponse = () => ({
  statusCode: 401,
  body: JSON.stringify({
    errorCode: 401,
    message: 'Unauthorized',
  }),
});
