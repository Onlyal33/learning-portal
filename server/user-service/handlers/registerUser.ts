import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { conflictResponse, isDynamoConflict, isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';
import { canonicalEmail, emailClaimId } from './profileLookup.js';
import {
  badRequest,
  optionalString,
  parseJsonObject,
  requiredString,
} from './requestBody.js';

export const createRegisterUserHandler = (
  client: DynamoDBClient,
): APIGatewayProxyHandler => async (event) => {
  try {
    const body = parseJsonObject(event.body);
    if (
      !body ||
      !requiredString(body.email) ||
      (body.role !== 'student' && body.role !== 'trainer') ||
      !requiredString(body.firstName) ||
      !requiredString(body.lastName) ||
      !optionalString(body.username) ||
      !optionalString(body.photo) ||
      !optionalString(body.dateOfBirth) ||
      !optionalString(body.address) ||
      !optionalString(body.specializationId) ||
      (body.role === 'trainer' && !requiredString(body.specializationId))
    ) {
      return badRequest();
    }

    const email = body.email.trim();
    const normalizedEmail = canonicalEmail(email);
    if (!normalizedEmail) {
      return badRequest();
    }

    const userId = crypto.randomUUID();
    const roleProfileId = crypto.randomUUID();
    const password = crypto.randomBytes(16).toString('base64').slice(0, 16);
    const user = {
      id: userId,
      email,
      canonicalEmail: normalizedEmail,
      role: body.role,
      roleProfileId,
      password: bcrypt.hashSync(password, 10),
      isActive: true,
      username: requiredString(body.username) ? body.username : email,
      firstName: body.firstName,
      lastName: body.lastName,
      ...(typeof body.photo === 'string' && { photo: body.photo }),
    };
    const profile =
      body.role === 'student'
        ? {
            id: roleProfileId,
            userId,
            dateOfBirth: body.dateOfBirth ?? '',
            address: body.address ?? '',
          }
        : {
            id: roleProfileId,
            userId,
            specializationId: body.specializationId,
          };

    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: process.env.USER_TABLE,
              Item: marshall({
                id: emailClaimId(email),
                entityType: 'email-claim',
                userId,
              }),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Put: {
              TableName: process.env.USER_TABLE,
              Item: marshall(user),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Put: {
              TableName:
                body.role === 'student'
                  ? process.env.STUDENT_TABLE
                  : process.env.TRAINER_TABLE,
              Item: marshall(profile),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
        ],
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ username: email, password }),
    };
  } catch (error) {
    if (isDynamoConflict(error)) {
      return conflictResponse('User already exists');
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

export default createRegisterUserHandler(
  new DynamoDBClient({ region: process.env.REGION }),
);
