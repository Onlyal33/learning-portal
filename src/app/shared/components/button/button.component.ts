import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [NgClass],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss'
})
export class ButtonComponent {

  @Input() buttonText?: string;
  @Input() type?: 'button' | 'submit' = 'button';
  @Input() variant?: 'primary' | 'primary-light' | "color-3" = 'primary';
  @Input() size?: 'sm' | 'md' | 'lg' = 'md';
  @Input()  width?: 'full' | 'auto' = 'auto';
}
