import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';

const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

const deleteCurrentUser: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = JSON.parse(event.requestContext.authorizer.userId);

    const transactParams = {
      TransactItems: [
        {
          Delete: {
            TableName: process.env.USER_TABLE,
            Key: {
              id: { S: userId },
            },
          },
        },
        {
          Delete: {
            TableName: process.env.STUDENT_TABLE,
            Key: {
              userId: { S: userId },
            },
          },
        },
      ],
    };

    await dynamoDbClient.send(new TransactWriteItemsCommand(transactParams));

    return {
      statusCode: 204,
      body: JSON.stringify({
        message: 'User deleted successfully',
      }),
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

export default deleteCurrentUser;
