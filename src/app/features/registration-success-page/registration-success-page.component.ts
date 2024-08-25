import { Component } from '@angular/core';
import { ButtonComponent } from "../../shared/components/button/button.component";
import { Router } from '@angular/router';

@Component({
  selector: 'app-registration-success-page',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './registration-success-page.component.html',
  styleUrl: './registration-success-page.component.scss'
})
export class RegistrationSuccessPageComponent {
  constructor(private router: Router) {}

  onMyAccountClick(): void {
    this.router.navigate(['/account']);
  }
  onHomeClick(): void {
    this.router.navigate(['/home']);
  }
}
