/* eslint-disable @typescript-eslint/no-unused-vars */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from 'aws-lambda';
import { getIdentityUser, getRoleProfile } from './profileLookup.js';
import {
  getAuthorizerContext,
  unauthorizedResponse,
  UserAuthorizerContext,
} from './authorizerContext.js';
import { isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';

export const createGetCurrentUserHandler = (dynamoDbClient: DynamoDBClient): APIGatewayProxyHandlerV2WithLambdaAuthorizer<
  UserAuthorizerContext
> => async (event) => {
  const authorizerContext = getAuthorizerContext(event);
  if (!authorizerContext) {
    return unauthorizedResponse();
  }

  try {
    const { userId: id } = authorizerContext;
    const user = await getIdentityUser(dynamoDbClient, id);
    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          errorCode: 404,
          message: 'User not found',
        }),
      };
    }

    const profile = await getRoleProfile(dynamoDbClient, user);
    if (!profile) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 400,
          message: 'Invalid role',
        }),
      };
    }

    const publicUser = Object.fromEntries(
      ['id', 'firstName', 'lastName', 'username', 'email', 'photo', 'isActive']
        .filter((key) => user[key] !== undefined)
        .map((key) => [key, user[key]]),
    );
    const publicRoleFields = profile.role === 'student'
      ? ['dateOfBirth', 'address']
      : ['specializationId'];
    const publicRole = Object.fromEntries(
      publicRoleFields
        .filter((key) => profile.data[key] !== undefined)
        .map((key) => [key, profile.data[key]]),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ...publicUser, ...publicRole }),
    };
  } catch (error) {
    if (isDynamoOverloaded(error)) return overloadResponse();
    return {
      statusCode: 500,
      body: JSON.stringify({
        errorCode: 500,
        message: 'Internal Server Error',
      }),
    };
  }
};

export default createGetCurrentUserHandler(
  new DynamoDBClient({ region: process.env.REGION }),
);
