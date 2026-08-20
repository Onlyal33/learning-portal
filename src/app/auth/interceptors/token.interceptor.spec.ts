import type { Mock, MockedObject } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpEvent,
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
  provideHttpClient,
  withXhr,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService, SessionSnapshot } from '../services/auth.service';
import { tokenInterceptor } from './token.interceptor';
import { environment } from '../../../environments/environment';
import { SessionStorageService } from '../services/session-storage.service';
import { WINDOW } from '../../shared/tokens/window.token';
import { SecureDataService } from '../../shared/services/secure-data.service';
import { UserStoreService } from '../../user/services/user-store.service';

function token(payload: object): string {
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify(payload))}.signature`;
}

describe('tokenInterceptor', () => {
  const now = 1000000;
  let authService: {
    isAuthorized: boolean;
    invalidateSession: Mock;
    getValidSession: Mock;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now * 1000));
    authService = {
      isAuthorized: true,
      invalidateSession: vi.fn(),
      getValidSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('adds exactly one Bearer authorization header for a valid authorized token', () => {
    const validToken = token({ exp: now + 1 });
    authService.getValidSession.mockReturnValue(session(validToken));
    const next = vi.fn().mockReturnValue(of(new HttpResponse({ status: 200 })));

    invoke(next).subscribe();

    const forwarded = vi.mocked(next).mock.lastCall![0] as HttpRequest<unknown>;

    expect(forwarded.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(
      forwarded.headers
        .keys()
        .filter((key) => key.toLowerCase() === 'authorization').length,
    ).toBe(1);
  });

  [
    ['malformed', 'not-a-jwt'],
    ['without an expiry', token({ sub: 'learner' })],
    ['expired', token({ exp: now - 1 })],
    ['at its expiry boundary', token({ exp: now })],
  ].forEach(([description]) => {
    it(`fails closed for ${description} tokens without invoking the handler`, () => {
      authService.getValidSession.mockReturnValue(null);
      const next = vi.fn();
      let failure: unknown;

      invoke(next).subscribe({ error: (error) => (failure = error) });

      expect(next).not.toHaveBeenCalled();
      expect(authService.invalidateSession).not.toHaveBeenCalled();
      expect(failure).toEqual(expect.any(Error));
    });
  });

  it('passes unauthenticated API requests through without Authorization', () => {
    authService.isAuthorized = false;
    const next = vi.fn().mockReturnValue(of(new HttpResponse({ status: 200 })));

    invoke(next).subscribe();

    expect(
      (vi.mocked(next).mock.lastCall![0] as HttpRequest<unknown>).headers.has(
        'Authorization',
      ),
    ).toBe(false);
  });

  it('invalidates only the session token attached to an API 401', () => {
    const response = new HttpErrorResponse({ status: 401 });
    const validToken = token({ exp: now + 1 });
    const validSession = session(validToken);
    authService.getValidSession.mockReturnValue(validSession);
    const next = vi.fn().mockReturnValue(throwError(() => response));
    let failure: unknown;

    invoke(next).subscribe({ error: (error) => (failure = error) });

    expect(authService.invalidateSession).toHaveBeenCalledWith(validSession);
    expect(failure).toBe(response);
  });

  it('does not attach a token or invalidate for an external 401', () => {
    const response = new HttpErrorResponse({ status: 401 });
    const next = vi.fn().mockReturnValue(throwError(() => response));

    invoke(next, 'https://example.com/users/me').subscribe({ error: () => {} });

    const forwarded = vi.mocked(next).mock.lastCall![0] as HttpRequest<unknown>;

    expect(forwarded.headers.has('Authorization')).toBe(false);
    expect(authService.invalidateSession).not.toHaveBeenCalled();
  });

  it('does not treat an API prefix-confusion URL as an API request', () => {
    const next = vi.fn().mockReturnValue(of(new HttpResponse({ status: 200 })));
    const confusedUrl = `${environment.apiUrl}-attacker/users/me`;

    invoke(next, confusedUrl).subscribe();

    const forwarded = vi.mocked(next).mock.lastCall![0] as HttpRequest<unknown>;

    expect(forwarded.headers.has('Authorization')).toBe(false);
  });

  it('delegates duplicate API 401 handling without directly mutating storage', () => {
    const response = new HttpErrorResponse({ status: 401 });
    const validToken = token({ exp: now + 1 });
    authService.getValidSession.mockReturnValue(session(validToken));
    const next = vi.fn().mockReturnValue(throwError(() => response));

    invoke(next).subscribe({ error: () => {} });
    invoke(next).subscribe({ error: () => {} });

    expect(authService.invalidateSession).toHaveBeenCalledTimes(2);
  });

  function invoke(next: Mock, url = `${environment.apiUrl}/protected`) {
    return TestBed.runInInjectionContext(() =>
      tokenInterceptor(new HttpRequest('GET', url), next),
    );
  }

  function session(token: string): SessionSnapshot {
    return { token, generation: 1 };
  }
});

describe('tokenInterceptor session generations', () => {
  const now = 1000000;
  let storage: Storage;
  let router: MockedObject<Pick<Router, 'navigate'>>;
  let userStore: MockedObject<Pick<UserStoreService, 'clearUser'>>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now * 1000));
    storage = new MapStorage();
    router = { navigate: vi.fn().mockName('Router.navigate') };
    userStore = { clearUser: vi.fn().mockName('UserStoreService.clearUser') };
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

  it('does not let a late 401 clear an identical-token session from a newer generation', () => {
    const authService = TestBed.inject(AuthService);
    const validToken = token({ exp: now + 60, sub: 'learner' });
    const lateResponse = new Subject<HttpEvent<unknown>>();
    const next = vi.fn().mockReturnValue(lateResponse);

    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    TestBed.runInInjectionContext(() =>
      tokenInterceptor(
        new HttpRequest('GET', `${environment.apiUrl}/protected`),
        next,
      ),
    ).subscribe({ error: () => {} });

    expect(
      (vi.mocked(next).mock.lastCall![0] as HttpRequest<unknown>).headers.get(
        'Authorization',
      ),
    ).toBe(`Bearer ${validToken}`);

    authService.logout();
    httpTesting.expectOne(`${environment.apiUrl}/auth/logout`).flush({});
    authService.login({ email: 'learner@example.com', password: 'password' });
    httpTesting
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: validToken });
    userStore.clearUser.mockClear();
    router.navigate.mockClear();

    lateResponse.error(new HttpErrorResponse({ status: 401 }));

    expect(authService.isAuthorized).toBe(true);
    expect(storage.getItem('SESSION_TOKEN')).toBe(validToken);
    expect(userStore.clearUser).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
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
