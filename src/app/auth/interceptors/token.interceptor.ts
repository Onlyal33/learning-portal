import {
  HttpEvent,
  HttpEventType,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SessionStorageService } from '../services/session-storage.service';
import { jwtDecode } from 'jwt-decode';

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const sessionStorageService = inject(SessionStorageService);

  if (authService.isAuthorized) {
    const token = sessionStorageService.getToken();
    if (token) {
      const decodedToken: { exp: number } = jwtDecode(token);
      const currentTime = Math.floor(Date.now() / 1000);

      if (decodedToken.exp < currentTime) {
        sessionStorageService.deleteToken();
        authService.isAuthorized = false;
        authService.navigateToLogin();
      } else {
        const clonedReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        });
        return next(clonedReq);
      }
    }
  }

  return next(req).pipe(
    tap((event) => {
      if (event.type === HttpEventType.Response && event.status === 401) {
        authService.logout();
      }
    }),
  );
};
