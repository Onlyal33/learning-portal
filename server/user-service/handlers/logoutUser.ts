import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from 'aws-lambda';
import {
  getAuthorizerContext,
  unauthorizedResponse,
  UserAuthorizerContext,
} from './authorizerContext.js';
import { isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const logoutUser: APIGatewayProxyHandlerV2WithLambdaAuthorizer<
  UserAuthorizerContext
> = async (event) => {
  const authorizerContext = getAuthorizerContext(event, true);
  if (!authorizerContext) {
    return unauthorizedResponse();
  }
  const { token, expiresAt } = authorizerContext;

  try {
    const putItemCommand = new PutItemCommand({
      TableName: process.env.BLACKLISTED_TOKENS_TABLE,
      Item: {
        token: { S: token },
        expiresAt: { N: expiresAt.toString() },
      },
    });

    await dynamoDbClient.send(putItemCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User logged out successfully' }),
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

export default logoutUser;
