import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

import { Router } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';
import { Profile } from '../../models/user.model';

@Component({
  selector: 'app-mini-profile',
  imports: [ButtonComponent, MatSlideToggleModule],
  templateUrl: './mini-profile.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './mini-profile.component.scss',
})
export class MiniProfileComponent {
  private router = inject(Router);
  private authService = inject(AuthService);

  profile: Profile = {
    id: '1',
    firstName: 'Marta',
    lastName: 'Black',
    username: 'Marta_st',
    email: 'example@example.com',
    photo: 'avatar.jpg',
    password: 'topsecret',
    isActive: true,
    userId: '1',
    dateOfBirth: '01.01.2001',
    address: '123 Main St, Anytown, USA',
  };

  navigateToAccount(): void {
    this.router.navigate(['/account']);
  }

  logout(): void {
    this.authService.logout();
  }
}
