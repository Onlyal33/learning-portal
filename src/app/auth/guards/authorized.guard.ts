import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authorizedGuard: CanMatchFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthorised) {
    return true;
  }

  return router.parseUrl(authService.getLoginUrl());
};
