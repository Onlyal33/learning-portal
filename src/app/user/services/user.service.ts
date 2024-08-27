import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DeleteUserResponse,
  GetUserResponse,
  UpdatePasswordResponse,
  UpdateUserRequest,
  UpdateUserResponse,
} from '../../../../server/user-service/models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  getUser(): Observable<GetUserResponse> {
    return this.http.get<GetUserResponse>(`${this.apiUrl}/users/me`);
  }

  deleteUser(): Observable<DeleteUserResponse> {
    return this.http.delete<DeleteUserResponse>(`${this.apiUrl}/users/me`);
  }

  updateUser(user: UpdateUserRequest): Observable<UpdateUserResponse> {
    return this.http.put<UpdateUserResponse>(`${this.apiUrl}/users/me`, user);
  }

  updatePassword(password: string): Observable<UpdatePasswordResponse> {
    return this.http.put<UpdatePasswordResponse>(
      `${this.apiUrl}/users/update-password`,
      { password },
    );
  }
}
