import { Component, inject } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
  selector: 'app-header',
  imports: [ButtonComponent, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private router = inject(Router);
  private authService = inject(AuthService);

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
    if (this.authService.isAuthorized) {
      this.authService.logout();
    } else {
      this.router.navigate(['/login']);
    }
  }

  get isAuthorized(): boolean {
    return this.authService.isAuthorized;
  }
}
