import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });
const JWT_SECRET = process.env.JWT_SECRET;

const loginUser: APIGatewayProxyHandler = async (event) => {
  const { email, password } = JSON.parse(event.body);

  if (!email || !password) {
    console.log(event.body);
    return {
      statusCode: 400,
      body: JSON.stringify({
        errorCode: 400,
        message: 'Required data is missing',
      }),
    };
  }

  const params = {
    TableName: process.env.USER_TABLE,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: marshall({
      ':email': email,
    }),
  };

  try {
    const result = await dynamoDbClient.send(new QueryCommand(params));
    const user = result.Items ? unmarshall(result.Items[0]) : null;

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: '1h',
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ token }),
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 400,
          message: 'Invalid email or password',
        }),
      };
    }
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

export default loginUser;
