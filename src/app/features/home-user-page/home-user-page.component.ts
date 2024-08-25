import { Component } from '@angular/core';
import { BoxComponent } from '../../shared/components/box/box.component';
import { ButtonComponent } from '../../shared/components/button/button.component';

@Component({
  selector: 'app-home-user-page',
  standalone: true,
  imports: [BoxComponent, ButtonComponent],
  templateUrl: './home-user-page.component.html',
  styleUrl: './home-user-page.component.scss',
})
export class HomeUserPageComponent {
  username = 'Martha';
}
