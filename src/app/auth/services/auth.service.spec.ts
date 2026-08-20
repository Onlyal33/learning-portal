import type { MockedObject } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { WINDOW } from '../../shared/tokens/window.token';
import { SecureDataService } from '../../shared/services/secure-data.service';
import { AuthService } from './auth.service';
import { SessionStorageService } from './session-storage.service';
import { UserStoreService } from '../../user/services/user-store.service';
import { authorizedGuard } from '../guards/authorized.guard';

function token(payload: object): string {
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify(payload))}.signature`;
}

describe('AuthService initialization', () => {
  const now = 1000000;
  let storage: Storage;
  let router: MockedObject<Pick<Router, 'navigate' | 'parseUrl'>>;
  let httpTesting: HttpTestingController;
  let userStore: MockedObject<Pick<UserStoreService, 'clearUser'>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now * 1000));
    storage = new MapStorage();
    router = {
      navigate: vi.fn().mockName('Router.navigate'),
      parseUrl: vi.fn().mockName('Router.parseUrl'),
    };
    router.parseUrl.mockImplementation(
      (url) => ({ toString: () => url }) as ReturnType<Router['parseUrl']>,
    );
    userStore = {
      clearUser: vi.fn().mockName('UserStoreService.clearUser'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        AuthService,
        SessionStorageService,
        { provide: Router, useValue: router },
        { provide: SecureDataService, useValue: {} },
        { provide: UserStoreService, useValue: userStore },
        { provide: WINDOW, useValue: { sessionStorage: storage } },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

  it('authorizes a persisted unexpired token', () => {
    storage.setItem('SESSION_TOKEN', token({ exp: now + 1 }));

    expect(TestBed.inject(AuthService).isAuthorized).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  [
    ['malformed', 'not-a-jwt'],
    ['without an expiry', token({ sub: 'learner' })],
    ['expired', token({ exp: now - 1 })],
    ['at its expiry boundary', token({ exp: now })],
  ].forEach(([description, invalidToken]) => {
    it(`rejects ${description} persisted auth and returns to login`, () => {
      storage.setItem('SESSION_TOKEN', invalidToken);

      expect(TestBed.inject(AuthService).isAuthorized).toBe(false);
      expect(storage.getItem('SESSION_TOKEN')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  it('accepts an unexpired login token', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 1 });

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });

    expect(authService.isAuthorized).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('keeps the newest completed login when callbacks arrive out of order', () => {
    const authService = TestBed.inject(AuthService);
    const olderToken = token({ exp: now + 60, sub: 'older' });
    const newerToken = token({ exp: now + 60, sub: 'newer' });

    authService.login({ email: 'older@example.com', password: 'password' });
    authService.login({ email: 'newer@example.com', password: 'password' });

    const requests = httpTesting.match(`${environment.apiUrl}/auth/login`);
    requests[1].flush({ token: newerToken });
    requests[0].flush({ token: olderToken });

    expect(storage.getItem('SESSION_TOKEN')).toBe(newerToken);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('clears local state before a failed logout revocation completes', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 60 });
    storage.setItem('SESSION_TOKEN', validToken);
    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    router.navigate.mockClear();

    authService.logout();

    expect(authService.isAuthorized).toBe(false);
    expect(storage.getItem('SESSION_TOKEN')).toBeNull();
    expect(userStore.clearUser).toHaveBeenCalledWith();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);

    const logout = httpTesting.expectOne(`${environment.apiUrl}/auth/logout`);

    expect(logout.request.headers.get('Authorization')).toBe(
      `Bearer ${validToken}`,
    );
    logout.error(new ProgressEvent('network failure'));

    expect(authService.isAuthorized).toBe(false);
    expect(storage.getItem('SESSION_TOKEN')).toBeNull();
  });

  it('ignores a late login completion after logout', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 60 });

    authService.login({ email: 'learner@example.com', password: 'password' });
    const login = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
    authService.logout();
    login.flush({ token: validToken });

    expect(authService.isAuthorized).toBe(false);
    expect(storage.getItem('SESSION_TOKEN')).toBeNull();
  });

  it('does not let a stale 401 snapshot invalidate a newer session with a different token', () => {
    const authService = TestBed.inject(AuthService);
    const oldToken = token({ exp: now + 60, sub: 'old' });
    const newToken = token({ exp: now + 60, sub: 'new' });

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: oldToken });
    const staleSession = authService.getValidSession();

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: newToken });
    authService.invalidateSession(staleSession!);

    expect(authService.isAuthorized).toBe(true);
    expect(storage.getItem('SESSION_TOKEN')).toBe(newToken);
  });

  it('does not let a late 401 from a prior generation clear an identical-token relogin', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 60, sub: 'learner' });

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    const staleSession = authService.getValidSession();

    authService.logout();
    httpTesting.expectOne(`${environment.apiUrl}/auth/logout`).flush({});
    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    userStore.clearUser.mockClear();
    router.navigate.mockClear();

    authService.invalidateSession(staleSession!);

    expect(authService.isAuthorized).toBe(true);
    expect(storage.getItem('SESSION_TOKEN')).toBe(validToken);
    expect(userStore.clearUser).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('makes duplicate invalidation for the same token a single transition', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 60 });

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    userStore.clearUser.mockClear();
    router.navigate.mockClear();

    const session = authService.getValidSession();
    authService.invalidateSession(session!);
    authService.invalidateSession(session!);

    expect(userStore.clearUser).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('revalidates expiry when the authorized guard runs after idle time', () => {
    const validToken = token({ exp: now + 1 });
    storage.setItem('SESSION_TOKEN', validToken);
    const authService = TestBed.inject(AuthService);
    vi.setSystemTime(new Date((now + 1) * 1000));

    expect(
      TestBed.runInInjectionContext(() => authorizedGuard(null!, [], null!)),
    ).not.toBe(true);

    expect(authService.isAuthorized).toBe(false);
    expect(storage.getItem('SESSION_TOKEN')).toBeNull();
  });

  [
    ['malformed', 'not-a-jwt'],
    ['without an expiry', token({ sub: 'learner' })],
    ['expired', token({ exp: now - 1 })],
    ['at its expiry boundary', token({ exp: now })],
  ].forEach(([description, invalidToken]) => {
    it(`fails closed for a ${description} login token`, () => {
      const authService = TestBed.inject(AuthService);

      authService.login({ email: 'learner@example.com', password: 'password' });
      httpTesting
        .expectOne(`${environment.apiUrl}/auth/login`)
        .flush({ token: invalidToken });

      expect(authService.isAuthorized).toBe(false);
      expect(storage.getItem('SESSION_TOKEN')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
