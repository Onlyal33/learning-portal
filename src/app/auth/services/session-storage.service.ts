import { Injectable, inject } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { WINDOW } from '../../shared/tokens/window.token';

const TOKEN = 'SESSION_TOKEN';

@Injectable({
  providedIn: 'root',
})
export class SessionStorageService {
  private window = inject<Window>(WINDOW);

  setToken(token: string) {
    this.window.sessionStorage.setItem(TOKEN, token);
  }

  getToken(): string | null {
    return this.window.sessionStorage.getItem(TOKEN);
  }

  deleteToken(): void {
    this.window.sessionStorage.removeItem(TOKEN);
  }

  getValidToken(now = Math.floor(Date.now() / 1000)): string | null {
    const token = this.getToken();

    if (!token) {
      return null;
    }

    try {
      const { exp } = jwtDecode<{ exp?: unknown }>(token);

      if (typeof exp === 'number' && Number.isFinite(exp) && exp > now) {
        return token;
      }
    } catch {
      // A persisted token must never make startup or request interception throw.
    }

    this.deleteToken();
    return null;
  }
}
