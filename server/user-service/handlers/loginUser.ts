import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { isDynamoOverloaded, overloadResponse } from './dynamoErrors.js';
import { getJwtSecret } from './jwtSecret.js';
import { canonicalEmail, emailClaimId } from './profileLookup.js';
import { badRequest, parseJsonObject, requiredString } from './requestBody.js';

const client = new DynamoDBClient({ region: process.env.REGION });

const invalid = () => ({
  statusCode: 400,
  body: JSON.stringify({
    errorCode: 400,
    message: 'Invalid email or password',
  }),
});

const loginUser: APIGatewayProxyHandler = async (event) => {
  const body = parseJsonObject(event.body);
  if (!body || !requiredString(body.email) || !requiredString(body.password)) {
    return badRequest();
  }

  try {
    const normalizedEmail = canonicalEmail(body.email);
    const claimResult = await client.send(
      new GetItemCommand({
        TableName: process.env.USER_TABLE,
        Key: { id: { S: emailClaimId(normalizedEmail) } },
        ConsistentRead: true,
      }),
    );
    if (!claimResult.Item) {
      return invalid();
    }

    const claim = unmarshall(claimResult.Item);
    if (
      claim.entityType !== 'email-claim' ||
      typeof claim.userId !== 'string' ||
      !claim.userId.trim() ||
      claim.userId.startsWith('EMAIL#')
    ) {
      return invalid();
    }

    const userResult = await client.send(
      new GetItemCommand({
        TableName: process.env.USER_TABLE,
        Key: { id: { S: claim.userId } },
        ConsistentRead: true,
      }),
    );
    if (!userResult.Item) {
      return invalid();
    }

    const user = unmarshall(userResult.Item);
    if (
      user.id !== claim.userId ||
      user.canonicalEmail !== normalizedEmail ||
      typeof user.email !== 'string' ||
      typeof user.password !== 'string' ||
      !(await bcrypt.compare(body.password, user.password))
    ) {
      return invalid();
    }

    const secret = await getJwtSecret();

    const token = jwt.sign(
      { id: user.id, email: user.email, jti: crypto.randomUUID() },
      secret,
      { expiresIn: '1h' },
    );
    return { statusCode: 200, body: JSON.stringify({ token }) };
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

export default loginUser;
