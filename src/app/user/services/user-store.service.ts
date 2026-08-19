import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UserService } from './user.service';
import {
  GetUserResponse,
  UpdateUserRequest,
} from '../../../../server/user-service/models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UserStoreService {
  private userService = inject(UserService);
  private requestGeneration = 0;

  private user$$ = new BehaviorSubject<GetUserResponse>({
    lastName: '',
    firstName: '',
    email: '',
    username: '',
    isActive: false,
    photo: '',
    specializationId: '',
  });
  user$ = this.user$$.asObservable();

  clearUser(): void {
    this.requestGeneration++;
    this.user$$.next({
      lastName: '',
      firstName: '',
      email: '',
      username: '',
      isActive: false,
      photo: '',
      specializationId: '',
    });
  }

  getUser(): void {
    const generation = ++this.requestGeneration;
    this.userService.getUser().subscribe({
      next: (user: GetUserResponse) => {
        if (generation === this.requestGeneration) {
          this.user$$.next(user);
        }
      },
      error: (error) => {
        console.error('Error fetching user data:', error);
        throw new Error(error);
      },
    });
  }

  deleteUser(): void {
    const generation = ++this.requestGeneration;
    this.userService.deleteUser().subscribe({
      next: () => {
        if (generation === this.requestGeneration) {
          this.clearUser();
        }
      },
      error: (error) => {
        console.error('Error deleting user:', error);
        throw new Error(error);
      },
    });
  }

  updateUser(user: UpdateUserRequest): void {
    const generation = ++this.requestGeneration;
    this.userService.updateUser(user).subscribe({
      next: () => {
        if (generation === this.requestGeneration) {
          const currentUser = this.user$$.getValue();
          this.user$$.next({ ...currentUser, ...user });
        }
      },
      error: (error) => {
        console.error('Error updating user:', error);
        throw new Error(error);
      },
    });
  }

  updatePassword(password: string): void {
    this.userService.updatePassword(password).subscribe({
      next: () => {
        //console.log('Password updated successfully:', response);
      },
      error: (error) => {
        console.error('Error updating password:', error);
        throw new Error(error);
      },
    });
  }
}
