import { Component, inject } from '@angular/core';
import { JoinBoxComponent } from '../../shared/components/join-box/join-box.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-join-page',
  imports: [JoinBoxComponent],
  templateUrl: './join-page.component.html',
  styleUrl: './join-page.component.scss',
})
export class JoinPageComponent {
  private router = inject(Router);

  onJoinAsStudentClick(): void {
    this.router.navigate(['/registration', 'student']);
  }

  onJoinAsTrainerClick(): void {
    this.router.navigate(['/registration', 'trainer']);
  }
}
