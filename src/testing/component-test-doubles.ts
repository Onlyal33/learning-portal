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
    login: jasmine.createSpy('login'),
    logout: jasmine.createSpy('logout'),
    register: jasmine.createSpy('register'),
  };
}

export function createUserStoreServiceDouble(): Pick<
  UserStoreService,
  'user$' | 'updateUser'
> {
  return {
    user$: new BehaviorSubject(testUser).asObservable(),
    updateUser: jasmine.createSpy('updateUser'),
  };
}

export function createSecureDataServiceDouble(): Pick<
  SecureDataService,
  'getPassword' | 'clearPassword'
> {
  return {
    getPassword: jasmine
      .createSpy('getPassword')
      .and.returnValue('temporary-password'),
    clearPassword: jasmine.createSpy('clearPassword'),
  };
}
