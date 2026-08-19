import {
  DynamoDBClient,
  TransactWriteItem,
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
  canonicalEmail,
  emailClaimId,
  getIdentityUser,
  getRoleProfile,
} from './profileLookup.js';
import {
  badRequest,
  optionalString,
  parseJsonObject,
  requiredString,
} from './requestBody.js';

export const createUpdateCurrentUserHandler = (client: DynamoDBClient): APIGatewayProxyHandlerV2WithLambdaAuthorizer<
  UserAuthorizerContext
> => async (event) => {
  const context = getAuthorizerContext(event);
  if (!context) {
    return unauthorizedResponse();
  }

  try {
    const body = parseJsonObject(event.body);
    if (
      !body ||
      !requiredString(body.firstName) ||
      !requiredString(body.lastName) ||
      !requiredString(body.username) ||
      !requiredString(body.email) ||
      typeof body.isActive !== 'boolean'
    ) {
      return badRequest();
    }

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

    const roleUpdate =
      user.role === 'student'
        ? optionalString(body.dateOfBirth) && optionalString(body.address)
          ? {
              expression:
                'SET #dateOfBirth = :dateOfBirth, #address = :address',
              names: {
                '#dateOfBirth': 'dateOfBirth',
                '#address': 'address',
              },
              values: {
                ':dateOfBirth': { S: body.dateOfBirth ?? '' },
                ':address': { S: body.address ?? '' },
              },
            }
          : null
        : requiredString(body.specializationId)
          ? {
              expression: 'SET #specializationId = :specializationId',
              names: { '#specializationId': 'specializationId' },
              values: {
                ':specializationId': { S: body.specializationId },
              },
            }
          : null;
    if (!roleUpdate) {
      return badRequest();
    }

    const email = body.email.trim();
    const nextCanonical = canonicalEmail(email);
    if (!nextCanonical) {
      return badRequest();
    }

    const changed = nextCanonical !== user.canonicalEmail;
    const writes: TransactWriteItem[] = [];
    if (changed) {
      writes.push({
        Put: {
          TableName: process.env.USER_TABLE,
          Item: {
            id: { S: emailClaimId(email) },
            entityType: { S: 'email-claim' },
            userId: { S: user.id },
          },
          ConditionExpression: 'attribute_not_exists(id)',
        },
      });
    }

    writes.push({
      Update: {
        TableName: process.env.USER_TABLE,
        Key: { id: { S: user.id } },
        UpdateExpression:
          'SET #firstName = :firstName, #lastName = :lastName, #username = :username, #email = :email, #canonicalEmail = :canonicalEmail, #isActive = :isActive',
        ExpressionAttributeNames: {
          '#firstName': 'firstName',
          '#lastName': 'lastName',
          '#username': 'username',
          '#email': 'email',
          '#canonicalEmail': 'canonicalEmail',
          '#isActive': 'isActive',
          '#role': 'role',
          '#roleProfileId': 'roleProfileId',
        },
        ExpressionAttributeValues: {
          ':firstName': { S: body.firstName },
          ':lastName': { S: body.lastName },
          ':username': { S: body.username },
          ':email': { S: email },
          ':canonicalEmail': { S: nextCanonical },
          ':isActive': { BOOL: body.isActive },
          ':role': { S: user.role },
          ':roleProfileId': { S: user.roleProfileId },
          ':oldCanonicalEmail': { S: user.canonicalEmail },
        },
        ConditionExpression:
          'attribute_exists(id) AND #role = :role AND #roleProfileId = :roleProfileId AND #canonicalEmail = :oldCanonicalEmail',
      },
    });
    writes.push({
      Update: {
        TableName:
          user.role === 'student'
            ? process.env.STUDENT_TABLE
            : process.env.TRAINER_TABLE,
        Key: { id: { S: profile.id } },
        UpdateExpression: roleUpdate.expression,
        ExpressionAttributeNames: {
          ...roleUpdate.names,
          '#userId': 'userId',
        },
        ExpressionAttributeValues: {
          ...roleUpdate.values,
          ':userId': { S: user.id },
        },
        ConditionExpression: 'attribute_exists(id) AND #userId = :userId',
      },
    });

    if (changed) {
      writes.push({
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
      });
    }

    await client.send(
      new TransactWriteItemsCommand({ TransactItems: writes }),
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User updated successfully' }),
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

export default createUpdateCurrentUserHandler(
  new DynamoDBClient({ region: process.env.REGION }),
);
