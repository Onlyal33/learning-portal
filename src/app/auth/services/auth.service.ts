import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private isAuthorized$$ = new BehaviorSubject<boolean>(false);
  isAuthorized$ = this.isAuthorized$$.asObservable();

  constructor(
    private http: HttpClient,
    private sessionStorageService: SessionStorageService,
    private router: Router,
    private secureDataService: SecureDataService,
  ) {}

  register(user: RegistrationRequest): void {
    this.http
      .post<RegistrationResponse>(`${this.apiUrl}/auth/register`, user)
      .subscribe({
        next: (res) => {
          this.secureDataService.setPassword(res.password);
          this.login({ email: res.username, password: res.password }, true);
        },
        error: (error) => {
          console.error('Registration failed:', error);
          throw new Error(error);
        },
      });
  }

  login(user: LoginRequest, isFirstAuth = false): void {
    this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, user).subscribe({
      next: (res) => {
        const { token } = res;
        if (token) {
          this.sessionStorageService.setToken(token);
          this.isAuthorised = true;
          if (!isFirstAuth) {
            this.router.navigate(['/home']);
          } else {
            this.router.navigate(['/registration-success']);
          }
        }
      },
      error: (error) => {
        console.error('Login failed:', error);
        throw new Error(error);
      },
    });
  }

  logout(): void {
    this.http
      .get(`${this.apiUrl}/auth/logout`, {
        observe: 'response',
      })
      .subscribe({
        next: (res) => {
          if (res.ok) {
            this.sessionStorageService.deleteToken();
            this.isAuthorised = false;
            this.router.navigate([this.getLoginUrl()]);
          }
        },
        error: (error) => {
          console.error('Logout failed:', error);
          throw new Error(error);
        },
      });
  }

  get isAuthorised(): boolean {
    console.log('AuthService: isAuthorised', this.isAuthorized$$.value);
    return this.isAuthorized$$.value;
  }

  set isAuthorised(value: boolean) {
    this.isAuthorized$$.next(value);
  }

  getLoginUrl(): string {
    return `/login`;
  }
}
