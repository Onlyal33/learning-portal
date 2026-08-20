import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [ButtonComponent],
  templateUrl: './home-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent {
  private router = inject(Router);

  onJoinButtonClick() {
    this.router.navigate(['/join']);
  }
}
