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

  try {
    const command = new GetItemCommand(params);
    const result = await dynamoDbClient.send(command);
    return !!result.Item;
  } catch (error) {
    console.error('Error checking token blacklist:', error);
    throw new Error('Error checking token blacklist');
  }
};

const jwtAuthorizer = async (
  event: APIGatewayRequestAuthorizerEventV2,
  _ctx: object,
  cb: (err: string | null, policy?: APIGatewayAuthorizerResult) => void,
) => {
  if (!JWT_SECRET) {
    cb('Server error: jwt is not defined');
  }

  if (!event.type || event.type !== 'REQUEST') {
    cb('Unauthorized');
    return;
  }

  try {
    const authorizationToken = event.headers.authorization;

    if (!authorizationToken) {
      cb('Unauthorized');
      return;
    }

    const token = authorizationToken.split(' ')[1];

    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      cb('Unauthorized: Token is blacklisted');
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const policy: APIGatewayAuthorizerResult = {
      principalId: decoded.sub.toString(),
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
        userId: decoded.sub.toString(),
        token,
      },
    };

    cb(null, policy);
  } catch (error) {
    cb(`Unauthorized: ${error.message}`);
  }
};

export default jwtAuthorizer;
