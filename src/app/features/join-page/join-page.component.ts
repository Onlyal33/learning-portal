import { Component } from '@angular/core';
import { ButtonComponent } from "../../shared/components/button/button.component";
import { JoinBoxComponent } from "../../shared/components/join-box/join-box.component";
import { Router } from '@angular/router';

@Component({
  selector: 'app-join-page',
  standalone: true,
  imports: [ButtonComponent, JoinBoxComponent],
  templateUrl: './join-page.component.html',
  styleUrl: './join-page.component.scss'
})
export class JoinPageComponent {
  constructor(private router: Router) {}

  onJoinAsStudentClick(): void {
    this.router.navigate(['/registration', 'student']);
  }

  onJoinAsTrainerClick(): void {
    this.router.navigate(['/registration', 'trainer']);
  }
}
