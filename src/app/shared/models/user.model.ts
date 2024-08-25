interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  photo: string;
  password: string;
  isActive: boolean;
}

interface Student extends User {
  userId: string;
  dateOfBirth?: string;
  address?: string;
}

interface Trainer extends User {
  userId: string;
  specializationId: string;
}

export type Profile = Student | Trainer;
