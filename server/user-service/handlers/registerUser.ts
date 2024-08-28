import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

const registerUser: APIGatewayProxyHandler = async (event) => {
  try {
    const parsed = JSON.parse(event.body);
    const { email, role, ...userData } = parsed;

    if (!email || !role || (role === 'trainer' && !userData.specializationId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 400,
          message: 'Required data is missing',
        }),
      };
    }

    const queryParams = {
      TableName: process.env.USER_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: email },
      },
    };

    const queryResult = await dynamoDbClient.send(
      new QueryCommand(queryParams),
    );

    if (queryResult.Items && queryResult.Items.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 400,
          message: 'User already exists',
        }),
      };
    }

    const password = crypto.randomBytes(16).toString('base64').slice(0, 16);
    const encryptedPassword = bcrypt.hashSync(password, 10);

    const userId = uuidv4();
    const newUser = {
      id: userId,
      email,
      password: encryptedPassword,
      isActive: true,
      username: email,
      ...userData,
    };

    const userParams = {
      TableName: process.env.USER_TABLE,
      Item: marshall(newUser),
    };

    await dynamoDbClient.send(new PutItemCommand(userParams));

    const roleId = uuidv4();
    let roleParams;

    if (role === 'student') {
      const studentData = {
        id: roleId,
        userId,
        dateOfBirth: userData.dateOfBirth || '',
        address: userData.address || '',
      };
      roleParams = {
        TableName: process.env.STUDENT_TABLE,
        Item: marshall(studentData),
      };
    } else if (role === 'trainer') {
      const trainerData = {
        id: roleId,
        userId,
        specializationId: userData.specializationId,
      };
      roleParams = {
        TableName: process.env.TRAINER_TABLE,
        Item: marshall(trainerData),
      };
    }

    await dynamoDbClient.send(new PutItemCommand(roleParams));

    return {
      statusCode: 200,
      body: JSON.stringify({ username: newUser.username, password }),
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

export default registerUser;
