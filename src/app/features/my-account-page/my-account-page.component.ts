import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ProfileComponent } from '../../shared/components/profile/profile.component';
import { ButtonComponent } from '../../shared/components/button/button.component';

@Component({
  selector: 'app-my-account-page',
  imports: [ProfileComponent, ButtonComponent],
  templateUrl: './my-account-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './my-account-page.component.scss',
})
export class MyAccountPageComponent {}
