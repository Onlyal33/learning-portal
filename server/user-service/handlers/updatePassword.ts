import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const updatePassword: APIGatewayProxyHandler = async (event) => {
  const userId = JSON.parse(event.requestContext.authorizer.userId);
  const { password } = JSON.parse(event.body);

  if (!password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'password is required' }),
    };
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const params: UpdateItemCommandInput = {
    TableName: process.env.USER_TABLE,
    Key: {
      userId: { S: userId },
    },
    UpdateExpression: 'SET password = :password',
    ExpressionAttributeValues: {
      ':password': { S: hashedPassword },
    },
    ReturnValues: 'UPDATED_NEW',
  };

  try {
    const command = new UpdateItemCommand(params);
    const result = await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Password updated successfully',
        result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to update password',
        error: error.message,
      }),
    };
  }
};

export default updatePassword;
