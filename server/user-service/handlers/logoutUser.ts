import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const logoutUser: APIGatewayProxyHandler = async (event) => {
  const token = event.requestContext.authorizer.token;

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET,
    ) as jwt.JwtPayload;
    const expiresAt = decodedToken.exp;

    if (!expiresAt) {
      throw new Error('Token does not have an expiration time');
    }

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
    return {
      statusCode: 500,
      body: JSON.stringify({
        errorCode: 500,
        message: 'Internal Server Error',
        error: error.message,
      }),
    };
  }
};

export default logoutUser;
