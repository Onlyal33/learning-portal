import { Component } from '@angular/core';
import { ButtonComponent } from "../../shared/components/button/button.component";
import { Router } from '@angular/router';


@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent {
  constructor(private router: Router) {}

  onJoinButtonClick() {
    this.router.navigate(['/join']);
  }
}
