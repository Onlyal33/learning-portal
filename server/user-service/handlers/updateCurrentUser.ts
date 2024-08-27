import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

const updateCurrentUser: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = JSON.parse(event.requestContext.authorizer.userId);
    const body = JSON.parse(event.body);

    const updateUserParams = {
      TableName: process.env.USER_TABLE,
      Key: {
        id: { S: userId },
      },
      UpdateExpression:
        'set #firstName = :firstName, #lastName = :lastName, #username = :username, #email = :email, #isActive = :isActive',
      ExpressionAttributeNames: {
        '#firstName': 'firstName',
        '#lastName': 'lastName',
        '#username': 'username',
        '#email': 'email',
        '#isActive': 'isActive',
      },
      ExpressionAttributeValues: {
        ':firstName': { S: body.firstName },
        ':lastName': { S: body.lastName },
        ':username': { S: body.username },
        ':email': { S: body.email },
        ':isActive': { BOOL: body.isActive },
      },
    };

    await dynamoDbClient.send(new UpdateItemCommand(updateUserParams));

    let roleTable = '';
    let roleUpdateParams = {} as UpdateItemCommandInput;

    const getStudentParams = {
      TableName: process.env.STUDENT_TABLE,
      Key: {
        userId: { S: userId },
      },
    };
    const getStudentResult = await dynamoDbClient.send(
      new GetItemCommand(getStudentParams),
    );
    if (getStudentResult.Item) {
      (roleTable = process.env.STUDENT_TABLE),
        (roleUpdateParams = {
          TableName: roleTable,
          Key: {
            userId: { S: userId },
          },
          UpdateExpression:
            'set #dateOfBirth = :dateOfBirth, #address = :address',
          ExpressionAttributeNames: {
            '#dateOfBirth': 'dateOfBirth',
            '#address': 'address',
          },
          ExpressionAttributeValues: {
            ':dateOfBirth': { S: body.dateOfBirth },
            ':address': { S: body.address },
          },
        });
    } else {
      const getTrainerParams = {
        TableName: process.env.TRAINER_TABLE,
        Key: {
          userId: { S: userId },
        },
      };
      const getTrainerResult = await dynamoDbClient.send(
        new GetItemCommand(getTrainerParams),
      );
      if (getTrainerResult.Item) {
        roleTable = process.env.TRAINER_TABLE;
        roleUpdateParams = {
          TableName: roleTable,
          Key: {
            userId: { S: userId },
          },
          UpdateExpression: 'set #specializationId = :specializationId',
          ExpressionAttributeNames: {
            '#specializationId': 'specializationId',
          },
          ExpressionAttributeValues: {
            ':specializationId': { S: body.specializationId },
          },
        };
      }
    }

    if (roleTable) {
      await dynamoDbClient.send(new UpdateItemCommand(roleUpdateParams));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User updated successfully',
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

export default updateCurrentUser;
