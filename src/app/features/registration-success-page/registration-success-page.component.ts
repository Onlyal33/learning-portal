import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { UserStoreService } from '../../user/services/user-store.service';
import { SecureDataService } from '../../shared/services/secure-data.service';

@Component({
  selector: 'app-registration-success-page',
  imports: [ButtonComponent],
  templateUrl: './registration-success-page.component.html',
  styleUrl: './registration-success-page.component.scss',
})
export class RegistrationSuccessPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private userStoreService = inject(UserStoreService);
  private secureDataService = inject(SecureDataService);

  password!: string;

  ngOnInit(): void {
    this.password =
      this.secureDataService.getPassword() ||
      'There was an error with your registration. Contact support, please';
  }

  ngOnDestroy(): void {
    this.secureDataService.clearPassword();
  }

  onMyAccountClick(): void {
    this.router.navigate(['/account']);
  }
  onHomeClick(): void {
    this.router.navigate(['/home']);
  }

  get username(): Observable<string> {
    return this.userStoreService.user$.pipe(map((user) => user.username));
  }
}
