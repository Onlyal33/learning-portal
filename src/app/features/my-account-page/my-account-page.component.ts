import { Component } from '@angular/core';
import { ProfileComponent } from "../../shared/components/profile/profile.component";
import { ButtonComponent } from "../../shared/components/button/button.component";

@Component({
  selector: 'app-my-account-page',
  standalone: true,
  imports: [ProfileComponent, ButtonComponent],
  templateUrl: './my-account-page.component.html',
  styleUrl: './my-account-page.component.scss'
})
export class MyAccountPageComponent {

}
