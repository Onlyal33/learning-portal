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

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);

  if (authService.isAuthorised) {
    const token = inject(SessionStorageService).getToken();
    console.log('token', token);
    if (token) {
      req = req.clone({
        headers: req.headers.set('Authorization', token),
      });
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
