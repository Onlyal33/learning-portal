import { vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../app/auth/services/auth.service';
import { SecureDataService } from '../app/shared/services/secure-data.service';
import { UserStoreService } from '../app/user/services/user-store.service';
import { GetUserResponse } from '../../server/user-service/models/user.model';

export const testUser: GetUserResponse = {
  lastName: 'Learner',
  firstName: 'Test',
  email: 'test@example.com',
  username: 'test-user',
  isActive: true,
  photo: 'avatar.jpg',
  specializationId: '',
};

export function createAuthServiceDouble(): Pick<
  AuthService,
  'isAuthorized' | 'login' | 'logout' | 'register'
> {
  return {
    isAuthorized: false,
    login: vi.fn().mockName('login'),
    logout: vi.fn().mockName('logout'),
    register: vi.fn().mockName('register'),
  };
}

export function createUserStoreServiceDouble(): Pick<
  UserStoreService,
  'user$' | 'updateUser'
> {
  return {
    user$: new BehaviorSubject(testUser).asObservable(),
    updateUser: vi.fn().mockName('updateUser'),
  };
}

export function createSecureDataServiceDouble(): Pick<
  SecureDataService,
  'getPassword' | 'clearPassword'
> {
  return {
    getPassword: vi
      .fn()
      .mockName('getPassword')
      .mockReturnValue('temporary-password'),
    clearPassword: vi.fn().mockName('clearPassword'),
  };
}
