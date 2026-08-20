import type { MockedObject } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { GetUserResponse } from '../../../../server/user-service/models/user.model';
import { UserService } from './user.service';
import { UserStoreService } from './user-store.service';

const learner = (email: string): GetUserResponse => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email,
  photo: '',
  isActive: true,
  dateOfBirth: '',
  address: '',
});

describe('UserStoreService session ownership', () => {
  let userService: MockedObject<
    Pick<
      UserService,
      'getUser' | 'deleteUser' | 'updateUser' | 'updatePassword'
    >
  >;
  let store: UserStoreService;

  beforeEach(() => {
    userService = {
      getUser: vi.fn().mockName('UserService.getUser'),
      deleteUser: vi.fn().mockName('UserService.deleteUser'),
      updateUser: vi.fn().mockName('UserService.updateUser'),
      updatePassword: vi.fn().mockName('UserService.updatePassword'),
    };
    TestBed.configureTestingModule({
      providers: [
        UserStoreService,
        { provide: UserService, useValue: userService },
      ],
    });
    store = TestBed.inject(UserStoreService);
  });

  it('does not let a response from a cleared session repopulate user data', () => {
    const response = new Subject<GetUserResponse>();
    userService.getUser.mockReturnValue(response);
    let current: GetUserResponse | undefined;
    store.user$.subscribe((user) => (current = user));

    store.getUser();
    store.clearUser();
    response.next(learner('old-session@example.test'));

    expect(current?.email).toBe('');
  });

  it('accepts only the newest overlapping user load', () => {
    const older = new Subject<GetUserResponse>();
    const newer = new Subject<GetUserResponse>();
    userService.getUser.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    let current: GetUserResponse | undefined;
    store.user$.subscribe((user) => (current = user));

    store.getUser();
    store.getUser();
    newer.next(learner('newer@example.test'));
    older.next(learner('older@example.test'));

    expect(current?.email).toBe('newer@example.test');
  });
});
