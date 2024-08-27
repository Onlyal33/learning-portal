/* eslint-disable @typescript-eslint/no-unused-vars */
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { Profile, Student, Trainer } from '../models/user.model';

const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

const getCurrentUser: APIGatewayProxyHandler = async (event) => {
  try {
    const id = JSON.parse(event.requestContext.authorizer.userId);

    const getUserParams = {
      TableName: process.env.USER_TABLE,
      Key: {
        id: { S: id },
      },
    };

    const getUserResult = await dynamoDbClient.send(
      new GetItemCommand(getUserParams),
    );

    if (!getUserResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          errorCode: 404,
          message: 'User not found',
        }),
      };
    }

    const { password, ...user } = unmarshall(getUserResult.Item);

    let roleData = {} as Profile;
    let role = '';

    const getStudentParams = {
      TableName: process.env.STUDENT_TABLE,
      Key: {
        userId: { S: id },
      },
    };
    const getStudentResult = await dynamoDbClient.send(
      new GetItemCommand(getStudentParams),
    );
    if (getStudentResult.Item) {
      roleData = unmarshall(getStudentResult.Item) as Student;
      role = 'student';
    } else {
      const getTrainerParams = {
        TableName: process.env.TRAINER_TABLE,
        Key: {
          userId: { S: id },
        },
      };
      const getTrainerResult = await dynamoDbClient.send(
        new GetItemCommand(getTrainerParams),
      );
      if (getTrainerResult.Item) {
        roleData = unmarshall(getTrainerResult.Item) as Trainer;
        role = 'trainer';
      }
    }

    if (!role) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 400,
          message: 'Invalid role',
        }),
      };
    }

    const { id: roleTableId, userId, ...roleDataWtioutId } = roleData;

    const combinedUserData = { ...user, ...roleDataWtioutId };

    return {
      statusCode: 200,
      body: JSON.stringify(combinedUserData),
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

export default getCurrentUser;
