import { Injectable } from '@angular/core';
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

  constructor(private userService: UserService) {}

  getUser(): void {
    this.userService.getUser().subscribe({
      next: (user: GetUserResponse) => {
        this.user$$.next(user);
      },
      error: (error) => {
        console.error('Error fetching user data:', error);
        throw new Error(error);
      },
    });
  }

  deleteUser(): void {
    this.userService.deleteUser().subscribe({
      next: () => {
        //console.log('User deleted successfully:', response);
        this.user$$.next({
          lastName: '',
          firstName: '',
          email: '',
          username: '',
          isActive: false,
          photo: '',
          specializationId: '',
        });
      },
      error: (error) => {
        console.error('Error deleting user:', error);
        throw new Error(error);
      },
    });
  }

  updateUser(user: UpdateUserRequest): void {
    this.userService.updateUser(user).subscribe({
      next: () => {
        // console.log('User updated successfully:', updatedUser);
        const currentUser = this.user$$.getValue();
        this.user$$.next({ ...currentUser, ...user });
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
