import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import {
  getAuthorizerContext,
  unauthorizedResponse,
  UserAuthorizerContext,
} from './authorizerContext.js';
import { badRequest, parseJsonObject, requiredString } from './requestBody.js';
import { isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const updatePassword: APIGatewayProxyHandlerV2WithLambdaAuthorizer<
  UserAuthorizerContext
> = async (event) => {
  const authorizerContext = getAuthorizerContext(event);
  if (!authorizerContext) {
    return unauthorizedResponse();
  }

  const body = parseJsonObject(event.body);
  if (!body || !requiredString(body.password)) return badRequest();
  const { userId } = authorizerContext;
  const { password } = body;

  const hashedPassword = bcrypt.hashSync(password, 10);

  const params = {
    TableName: process.env.USER_TABLE,
    Key: {
      id: { S: userId },
    },
    UpdateExpression: 'SET password = :password',
    ExpressionAttributeValues: {
      ':password': { S: hashedPassword },
    },
    ConditionExpression: 'attribute_exists(id)',
  };

  try {
    const command = new UpdateItemCommand(params);
    await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Password updated successfully',
      }),
    };
  } catch (error) {
    if ((error as { name?: string })?.name === 'ConditionalCheckFailedException') {
      return { statusCode: 404, body: JSON.stringify({ errorCode: 404, message: 'User not found' }) };
    }
    if (isDynamoOverloaded(error)) return overloadResponse();
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to update password',
      }),
    };
  }
};

export default updatePassword;
