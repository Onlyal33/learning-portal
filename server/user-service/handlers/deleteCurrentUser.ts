import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from 'aws-lambda';
import {
  getAuthorizerContext,
  unauthorizedResponse,
  UserAuthorizerContext,
} from './authorizerContext.js';
import { conflictResponse, isDynamoConflict, isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';
import {
  emailClaimId,
  getIdentityUser,
  getRoleProfile,
} from './profileLookup.js';

const client = new DynamoDBClient({ region: process.env.REGION });

const deleteCurrentUser: APIGatewayProxyHandlerV2WithLambdaAuthorizer<
  UserAuthorizerContext
> = async (event) => {
  const context = getAuthorizerContext(event);
  if (!context) {
    return unauthorizedResponse();
  }

  try {
    const user = await getIdentityUser(client, context.userId);
    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ errorCode: 404, message: 'User not found' }),
      };
    }

    const profile = await getRoleProfile(client, user);
    if (!profile) {
      return {
        statusCode: 400,
        body: JSON.stringify({ errorCode: 400, message: 'Invalid role' }),
      };
    }

    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: process.env.USER_TABLE,
              Key: { id: { S: emailClaimId(user.canonicalEmail) } },
              ConditionExpression:
                '#entityType = :entityType AND #userId = :userId',
              ExpressionAttributeNames: {
                '#entityType': 'entityType',
                '#userId': 'userId',
              },
              ExpressionAttributeValues: {
                ':entityType': { S: 'email-claim' },
                ':userId': { S: user.id },
              },
            },
          },
          {
            Delete: {
              TableName: process.env.USER_TABLE,
              Key: { id: { S: user.id } },
              ConditionExpression:
                'attribute_exists(id) AND #role = :role AND #roleProfileId = :profileId AND #canonicalEmail = :canonicalEmail',
              ExpressionAttributeNames: {
                '#role': 'role',
                '#roleProfileId': 'roleProfileId',
                '#canonicalEmail': 'canonicalEmail',
              },
              ExpressionAttributeValues: {
                ':role': { S: user.role },
                ':profileId': { S: user.roleProfileId },
                ':canonicalEmail': { S: user.canonicalEmail },
              },
            },
          },
          {
            Delete: {
              TableName:
                user.role === 'student'
                  ? process.env.STUDENT_TABLE
                  : process.env.TRAINER_TABLE,
              Key: { id: { S: profile.id } },
              ConditionExpression:
                'attribute_exists(id) AND #userId = :userId',
              ExpressionAttributeNames: { '#userId': 'userId' },
              ExpressionAttributeValues: { ':userId': { S: user.id } },
            },
          },
        ],
      }),
    );
    return {
      statusCode: 204,
      body: JSON.stringify({ message: 'User deleted successfully' }),
    };
  } catch (error) {
    if (isDynamoConflict(error)) {
      return conflictResponse('Concurrent user update');
    }
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

export default deleteCurrentUser;
