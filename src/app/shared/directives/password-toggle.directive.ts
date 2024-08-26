import { Directive, ElementRef, Input, OnInit, Renderer2 } from '@angular/core';
import { FormControl, NgControl } from '@angular/forms';

@Directive({
  selector: '[appPasswordToggle]',
  standalone: true,
})
export class PasswordToggleDirective implements OnInit {
  private iconShow!: HTMLImageElement;
  private iconHide!: HTMLImageElement;
  @Input('appPasswordToggle') control!: FormControl | null;

  constructor(
    private el: ElementRef<HTMLInputElement>,
    private renderer: Renderer2,
    private ngControl: NgControl,
  ) {}

  ngOnInit(): void {
    this.cretateIcons();
    this.addPasswordToggleButton();
  }

  private cretateIcons(): void {
    this.control = this.control || (this.ngControl.control as FormControl);

    const iconShow = this.renderer.createElement('img');
    this.renderer.setProperty(iconShow, 'src', 'login/view.svg');
    this.renderer.addClass(iconShow, 'input-wicon-icon');

    const iconHide = this.renderer.createElement('img');
    this.renderer.setProperty(iconHide, 'src', 'login/hide.svg');
    this.renderer.addClass(iconHide, 'input-wicon-icon');

    this.control.statusChanges.subscribe(() => {
      if (
        this.control?.invalid &&
        (this.control.dirty || this.control.touched)
      ) {
        this.renderer.addClass(iconHide, 'invalid');
        this.renderer.addClass(iconShow, 'invalid');
      } else {
        this.renderer.removeClass(iconHide, 'invalid');
        this.renderer.removeClass(iconShow, 'invalid');
      }
    });

    this.iconShow = iconShow;
    this.iconHide = iconHide;
  }

  private addPasswordToggleButton(): void {
    const input = this.el.nativeElement;
    this.renderer.addClass(input, 'input-wicon');

    const button: HTMLButtonElement = this.renderer.createElement('button');
    this.renderer.setProperty(button, 'type', 'button');
    this.renderer.addClass(button, 'input-wicon-button');
    this.appendIcon(button);
    this.renderer.listen(button, 'click', (event: Event) => {
      event.preventDefault();
      this.toggle(button);
    });

    const parent: HTMLElement = this.renderer.parentNode(input);
    this.renderer.appendChild(parent, button);
  }

  toggle(button: HTMLButtonElement): void {
    const input = this.el.nativeElement;
    this.renderer.setProperty(
      input,
      'type',
      input.type === 'password' ? 'text' : 'password',
    );

    this.appendIcon(button);
  }

  appendIcon(button: HTMLButtonElement): void {
    const icon =
      this.el.nativeElement.type === 'password' ? this.iconShow : this.iconHide;

    this.renderer.setProperty(button, 'innerHTML', '');
    this.renderer.appendChild(button, icon);
  }
}
