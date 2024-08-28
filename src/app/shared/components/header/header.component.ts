import { Component } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { NgIf } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ButtonComponent, NgIf, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}
  isMenuOpen = false;

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  onLogoClick(): void {
    this.router.navigate(['/']);
  }

  onJoinButtonClick(): void {
    this.router.navigate(['/join']);
  }

  onSignInButtonClick(): void {
    if (this.authService.isAuthorised) {
      this.authService.logout();
    } else {
      this.router.navigate(['/login']);
    }
  }

  get isAuthorised(): boolean {
    return this.authService.isAuthorised;
  }
}
