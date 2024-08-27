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
