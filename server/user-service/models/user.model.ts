export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  photo: string;
  password: string;
  isActive: boolean;
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

type UserWithoutIdPassword = Omit<User, 'id' | 'password'>;

type UserWithoutIdPasswordPhoto = Omit<UserWithoutIdPassword, 'photo'>;

export interface ErrorResponse {
  errorCode: number;
  message: string;
  error?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegistrationRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  student?: StudentWithoutIds;
  trainer?: TrainerWithoutIds;
}

export type UpdateUserRequest =
  | (StudentWithoutIds & UserWithoutIdPasswordPhoto)
  | (TrainerWithoutIds & UserWithoutIdPasswordPhoto);

export interface LoginResponse {
  token: string;
}

export interface RegistrationResponse {
  username: string;
  password: string;
}

export type GetUserResponse =
  | (StudentWithoutIds & UserWithoutIdPassword)
  | (TrainerWithoutIds & UserWithoutIdPassword);

export type DeleteUserResponse = { message: string };

export type UpdateUserResponse = { message: string };

export type UpdatePasswordResponse = { message: string };
