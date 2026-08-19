import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEventV2,
  StatementEffect,
} from 'aws-lambda';
import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
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

const jwtAuthorizer = async (
  event: APIGatewayRequestAuthorizerEventV2,
  _ctx: object,
  cb: (err: string | null, policy?: APIGatewayAuthorizerResult) => void,
) => {
  if (!JWT_SECRET) {
    cb('Server error: jwt is not defined');
    return;
  }

  if (!event.type || event.type !== 'REQUEST') {
    cb('Unauthorized: Invalid event type');
    return;
  }

  try {
    const authorizationToken =
      event.headers['authorization'] || event.headers['Authorization'];

    if (!authorizationToken) {
      cb('Unauthorized: No authorization token');
      return;
    }

    const token = authorizationToken.split(' ')[1];

    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      cb('Unauthorized: Authorization token is blacklisted');
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === 'string') {
      cb('Unauthorized: Invalid authorization token');
      return;
    }

    const policy: APIGatewayAuthorizerResult = {
      principalId: decoded.id,
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
      },
    };

    cb(null, policy);
  } catch (error) {
    cb(`Unauthorized: ${error.message}`);
  }
};

export default jwtAuthorizer;
