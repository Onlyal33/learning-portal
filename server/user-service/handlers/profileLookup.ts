import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export type UserRole = 'student' | 'trainer';
export type IdentityUser = Record<string, unknown> & {
  id: string;
  canonicalEmail: string;
  role: UserRole;
  roleProfileId: string;
};
export type RoleProfile = {
  id: string;
  userId: string;
  role: UserRole;
  data: Record<string, unknown>;
};

export const canonicalEmail = (email: string): string =>
  email.trim().toLowerCase();

export const emailClaimId = (email: string): string =>
  `EMAIL#${canonicalEmail(email)}`;

export const getIdentityUser = async (
  client: DynamoDBClient,
  userId: string,
): Promise<IdentityUser | null> => {
  const result = await client.send(
    new GetItemCommand({
      TableName: process.env.USER_TABLE,
      Key: { id: { S: userId } },
      ConsistentRead: true,
    }),
  );
  if (!result.Item) {
    return null;
  }

  const user = unmarshall(result.Item);
  return user.id === userId &&
    !userId.startsWith('EMAIL#') &&
    typeof user.canonicalEmail === 'string' &&
    canonicalEmail(user.canonicalEmail) === user.canonicalEmail &&
    user.canonicalEmail.length > 0 &&
    (user.role === 'student' || user.role === 'trainer') &&
    typeof user.roleProfileId === 'string' &&
    user.roleProfileId.trim().length > 0
    ? (user as IdentityUser)
    : null;
};

export const getRoleProfile = async (
  client: DynamoDBClient,
  user: IdentityUser,
): Promise<RoleProfile | null> => {
  const result = await client.send(
    new GetItemCommand({
      TableName:
        user.role === 'student'
          ? process.env.STUDENT_TABLE
          : process.env.TRAINER_TABLE,
      Key: { id: { S: user.roleProfileId } },
      ConsistentRead: true,
    }),
  );
  if (!result.Item) {
    return null;
  }

  const data = unmarshall(result.Item);
  return data.id === user.roleProfileId && data.userId === user.id
    ? {
        id: user.roleProfileId,
        userId: user.id,
        role: user.role,
        data,
      }
    : null;
};
