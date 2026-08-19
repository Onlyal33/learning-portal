export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  photo: string;
  password: string;
  isActive: boolean;
  canonicalEmail: string;
  role: 'student' | 'trainer';
  roleProfileId: string;
}

export interface EmailClaim {
  id: string;
  entityType: 'email-claim';
  userId: string;
}

export interface Student {
  id: string;
  userId: string;
  dateOfBirth?: string;
  address?: string;
}

export interface Trainer {
  id: string;
  userId: string;
  specializationId: string;
}

export type Profile = Student | Trainer;

type TrainerWithoutIds = Omit<Trainer, 'id' | 'userId'>;

type StudentWithoutIds = Omit<Student, 'id' | 'userId'>;

type ServerOwnedUserFields =
  | 'id'
  | 'password'
  | 'canonicalEmail'
  | 'role'
  | 'roleProfileId';

type UserInput = Omit<User, ServerOwnedUserFields>;

type UserInputWithoutPhoto = Omit<UserInput, 'photo'>;

type PublicUser = Omit<
  User,
  'id' | 'password' | 'canonicalEmail' | 'role' | 'roleProfileId'
>;

export interface ErrorResponse {
  errorCode: number;
  message: string;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type RegistrationRequest = Omit<
  UserInputWithoutPhoto,
  'isActive'
> & { role: 'trainer' | 'student' } & (StudentWithoutIds | TrainerWithoutIds);

export type UpdateUserRequest =
  | (StudentWithoutIds & UserInputWithoutPhoto)
  | (TrainerWithoutIds & UserInputWithoutPhoto);

export interface LoginResponse {
  token: string;
}

export interface RegistrationResponse {
  username: string;
  password: string;
}

export type GetUserResponse =
  | (StudentWithoutIds & PublicUser)
  | (TrainerWithoutIds & PublicUser);

export type DeleteUserResponse = { message: string };

export type UpdateUserResponse = { message: string };

export type UpdatePasswordResponse = { message: string };
