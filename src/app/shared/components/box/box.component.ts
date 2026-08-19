import { NgOptimizedImage } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-box',
  imports: [NgOptimizedImage],
  templateUrl: './box.component.html',
  styleUrl: './box.component.scss',
})
export class BoxComponent {
  @Input() title!: string;
  @Input() tag!: string;
  @Input() src!: string;
}
