import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionStorageService } from './session-storage.service';
import {
  LoginRequest,
  RegistrationRequest,
  LoginResponse,
  RegistrationResponse,
} from '../../../../server/user-service/models/user.model';
import { SecureDataService } from '../../shared/services/secure-data.service';
import { UserStoreService } from '../../user/services/user-store.service';

export interface SessionSnapshot {
  readonly token: string;
  readonly generation: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private sessionStorageService = inject(SessionStorageService);
  private router = inject(Router);
  private secureDataService = inject(SecureDataService);
  private userStoreService = inject(UserStoreService);

  private apiUrl = environment.apiUrl;
  private isAuthorized$$ = new BehaviorSubject<boolean>(false);
  isAuthorized$ = this.isAuthorized$$.asObservable();
  private sessionGeneration = 0;

  constructor() {
    this.initializeIsAuthorized();
  }

  private initializeIsAuthorized(): void {
    const token = this.sessionStorageService.getToken();
    const validToken = this.sessionStorageService.getValidToken();
    this.isAuthorized$$.next(!!validToken);

    if (token && !validToken) {
      this.clearLocalSession();
    }
  }

  register(user: RegistrationRequest): void {
    const generation = this.startSessionAttempt();
    this.http
      .post<RegistrationResponse>(`${this.apiUrl}/auth/register`, user)
      .subscribe({
        next: (res) => {
          if (!this.isCurrentGeneration(generation)) {
            return;
          }
          this.secureDataService.setPassword(res.password);
          this.performLogin(
            { email: res.username, password: res.password },
            true,
            generation,
          );
        },
        error: () => {},
      });
  }

  login(user: LoginRequest, isFirstAuth = false): void {
    this.performLogin(user, isFirstAuth, this.startSessionAttempt());
  }

  private performLogin(
    user: LoginRequest,
    isFirstAuth: boolean,
    generation: number,
  ): void {
    this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, user).subscribe({
      next: (res) => {
        if (!this.isCurrentGeneration(generation)) {
          return;
        }
        const { token } = res;
        if (token) {
          this.sessionStorageService.setToken(token);

          if (!this.sessionStorageService.getValidToken()) {
            this.clearLocalSession();
            return;
          }

          this.isAuthorized$$.next(true);
          if (!isFirstAuth) {
            this.router.navigate(['/home']);
          } else {
            this.router.navigate(['/registration-success']);
          }
        }
      },
      error: () => {},
    });
  }

  logout(): void {
    const token = this.sessionStorageService.getToken();
    this.sessionGeneration++;
    this.clearLocalSession();

    if (!token) {
      return;
    }

    this.http
      .get(`${this.apiUrl}/auth/logout`, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      })
      .subscribe({ error: () => {} });
  }

  get isAuthorized(): boolean {
    return this.isAuthorized$$.value;
  }

  hasValidSession(): boolean {
    return this.getValidSession() !== null;
  }

  getValidSession(): SessionSnapshot | null {
    if (!this.isAuthorized) {
      return null;
    }

    const token = this.sessionStorageService.getValidToken();
    if (!token) {
      this.invalidateSession();
      return null;
    }
    return { token, generation: this.sessionGeneration };
  }

  invalidateSession(snapshot?: SessionSnapshot): void {
    if (
      snapshot &&
      (snapshot.generation !== this.sessionGeneration ||
        this.sessionStorageService.getToken() !== snapshot.token)
    ) {
      return;
    }

    this.sessionGeneration++;
    this.clearLocalSession();
  }

  getLoginUrl(): string {
    return `/login`;
  }

  navigateToLogin(): void {
    this.router.navigate([this.getLoginUrl()]);
  }

  private startSessionAttempt(): number {
    this.sessionGeneration++;
    this.sessionStorageService.deleteToken();
    this.isAuthorized$$.next(false);
    this.userStoreService.clearUser();
    return this.sessionGeneration;
  }

  private isCurrentGeneration(generation: number): boolean {
    return this.sessionGeneration === generation;
  }

  private clearLocalSession(): void {
    this.sessionStorageService.deleteToken();
    this.isAuthorized$$.next(false);
    this.userStoreService.clearUser();
    this.navigateToLogin();
  }
}
