import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Component } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { Profile } from '../../models/user.model';

@Component({
  selector: 'app-mini-profile',
  standalone: true,
  imports: [ButtonComponent, NgIf, MatSlideToggleModule],
  templateUrl: './mini-profile.component.html',
  styleUrl: './mini-profile.component.scss',
})
export class MiniProfileComponent {
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

  constructor(private router: Router) {}

  navigateToAccount(): void {
    this.router.navigate(['/account']);
  }

  logout(): void {
    this.router.navigate(['/']);
  }
}
