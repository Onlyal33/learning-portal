import { Component, Input } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-join-box',
  standalone: true,
  imports: [ButtonComponent, NgOptimizedImage],
  templateUrl: './join-box.component.html',
  styleUrl: './join-box.component.scss',
})
export class JoinBoxComponent {
  constructor(private router: Router) {}

  @Input() text!: string;
  @Input() src!: string;
  @Input() header!: string;
  @Input() onClick!: () => void;

  handleClick() {
    if (this.onClick) {
      this.onClick();
    }
  }
}
