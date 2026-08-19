import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);

  if (!isApiRequest(req.url)) {
    return next(req);
  }

  let requestSession: ReturnType<AuthService['getValidSession']> = null;
  if (authService.isAuthorized) {
    const session = authService.getValidSession();

    if (!session) {
      return throwError(() => new Error('Invalid authentication token'));
    }

    requestSession = session;
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${session.token}`,
      },
    });
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        requestSession
      ) {
        authService.invalidateSession(requestSession);
      }
      return throwError(() => error);
    }),
  );
};

function isApiRequest(url: string): boolean {
  try {
    const apiUrl = new URL(environment.apiUrl);
    const requestUrl = new URL(url);
    const basePath = apiUrl.pathname.replace(/\/$/, '');
    const requestPath = requestUrl.pathname;

    return (
      requestUrl.origin === apiUrl.origin &&
      (basePath === '' ||
        basePath === '/' ||
        requestPath === basePath ||
        requestPath.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
}
