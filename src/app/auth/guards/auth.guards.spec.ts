import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authorizedGuard } from './authorized.guard';
import { notAuthorizedGuard } from './not-authorized.guard';

describe('auth guards', () => {
  let authService: { hasValidSession: jasmine.Spy; getLoginUrl: jasmine.Spy };
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = {
      hasValidSession: jasmine.createSpy().and.returnValue(false),
      getLoginUrl: jasmine.createSpy().and.returnValue('/login'),
    };
    router = jasmine.createSpyObj<Router>('Router', ['parseUrl']);
    router.parseUrl.and.callFake(
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
    authService.hasValidSession.and.returnValue(true);

    expect(
      TestBed.runInInjectionContext(() => authorizedGuard(null!, [], null!)),
    ).toBeTrue();

    authService.hasValidSession.and.returnValue(false);

    expect(
      TestBed.runInInjectionContext(() =>
        authorizedGuard(null!, [], null!),
      )?.toString(),
    ).toBe('/login');
  });

  it('allows public routes only when unauthorized', () => {
    authService.hasValidSession.and.returnValue(false);

    expect(
      TestBed.runInInjectionContext(() => notAuthorizedGuard(null!, null!)),
    ).toBeTrue();

    authService.hasValidSession.and.returnValue(true);

    expect(
      TestBed.runInInjectionContext(() =>
        notAuthorizedGuard(null!, null!),
      )?.toString(),
    ).toBe('/home');
  });
});
