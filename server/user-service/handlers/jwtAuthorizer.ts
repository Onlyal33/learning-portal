import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewayRequestIAMAuthorizerV2WithContextHandler,
  StatementEffect,
} from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './jwtSecret.js';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const params = {
    TableName: process.env.BLACKLISTED_TOKENS_TABLE,
    Key: {
      token: { S: token },
    },
  };

  const command = new GetItemCommand(params);
  const result = await dynamoDbClient.send(command);
  return !!result.Item;
};

type AuthorizerContext = {
  userId: string;
  token: string;
  expiresAt: number;
};

const unauthorized = (): never => {
  throw new Error('Unauthorized');
};

const jwtAuthorizer: APIGatewayRequestIAMAuthorizerV2WithContextHandler<
  AuthorizerContext
> = async (event: APIGatewayRequestAuthorizerEventV2) => {
  if (!event.type || event.type !== 'REQUEST') {
    return unauthorized();
  }

  try {
    const authorizationHeader =
      event.headers?.authorization ?? event.headers?.Authorization;
    const match = authorizationHeader?.match(/^Bearer ([^\s]+)$/i);

    if (!match || match[0] !== authorizationHeader) {
      return unauthorized();
    }

    const token = match[1];

    const jwtSecret = await getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret);

    if (
      typeof decoded === 'string' ||
      !decoded ||
      typeof decoded.id !== 'string' ||
      !decoded.id.trim() ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      return unauthorized();
    }

    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return unauthorized();
    }

    return {
      principalId: String(decoded.id),
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow' as StatementEffect,
            Resource: event.routeArn,
          },
        ],
      },
      context: {
        userId: decoded.id,
        token,
        expiresAt: decoded.exp,
      },
    };
  } catch {
    return unauthorized();
  }
};

export default jwtAuthorizer;
