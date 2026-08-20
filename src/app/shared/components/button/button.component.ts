import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-button',
  imports: [NgClass],
  templateUrl: './button.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  @Input() buttonText?: string;
  @Input() type?: 'button' | 'submit' = 'button';
  @Input() variant?: 'primary' | 'primary-light' | 'color-3' = 'primary';
  @Input() size?: 'sm' | 'md' | 'lg' = 'md';
  @Input() width?: 'full' | 'auto' = 'auto';
}
