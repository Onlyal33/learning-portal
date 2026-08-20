import type { Mock, MockedObject } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authorizedGuard } from './authorized.guard';
import { notAuthorizedGuard } from './not-authorized.guard';

describe('auth guards', () => {
  let authService: {
    hasValidSession: Mock;
    getLoginUrl: Mock;
  };
  let router: MockedObject<Pick<Router, 'parseUrl'>>;

  beforeEach(() => {
    authService = {
      hasValidSession: vi.fn().mockReturnValue(false),
      getLoginUrl: vi.fn().mockReturnValue('/login'),
    };
    router = {
      parseUrl: vi.fn().mockName('Router.parseUrl'),
    };
    router.parseUrl.mockImplementation(
      (url) => ({ toString: () => url }) as ReturnType<Router['parseUrl']>,
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows authorized routes only for valid authorized state', () => {
    authService.hasValidSession.mockReturnValue(true);

    expect(
      TestBed.runInInjectionContext(() => authorizedGuard(null!, [], null!)),
    ).toBe(true);

    authService.hasValidSession.mockReturnValue(false);

    expect(
      TestBed.runInInjectionContext(() =>
        authorizedGuard(null!, [], null!),
      )?.toString(),
    ).toBe('/login');
  });

  it('allows public routes only when unauthorized', () => {
    authService.hasValidSession.mockReturnValue(false);

    expect(
      TestBed.runInInjectionContext(() => notAuthorizedGuard(null!, null!)),
    ).toBe(true);

    authService.hasValidSession.mockReturnValue(true);

    expect(
      TestBed.runInInjectionContext(() =>
        notAuthorizedGuard(null!, null!),
      )?.toString(),
    ).toBe('/home');
  });
});
