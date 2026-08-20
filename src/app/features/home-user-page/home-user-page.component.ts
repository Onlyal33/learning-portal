import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { BoxComponent } from '../../shared/components/box/box.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { Router } from '@angular/router';
import { UserStoreService } from '../../user/services/user-store.service';
import { map, Observable } from 'rxjs';

@Component({
  selector: 'app-home-user-page',
  imports: [BoxComponent, ButtonComponent],
  templateUrl: './home-user-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-user-page.component.scss',
})
export class HomeUserPageComponent {
  private router = inject(Router);
  private userStoreService = inject(UserStoreService);

  onReadButtonClicked(): void {
    this.router.navigate(['/blog']);
  }

  get firstName(): Observable<string> {
    return this.userStoreService.user$.pipe(map((user) => user.firstName));
  }
}
