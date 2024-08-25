import { NgIf } from '@angular/common';
import { Component } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { PasswordToggleDirective } from '../../shared/directives/password-toggle.directive';
import { LoginFormFields } from '../../shared/enums/user-forms.enum';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonComponent,
    NgIf,
    RouterLink,
    PasswordToggleDirective,
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  readonly formFields = LoginFormFields;
  loginForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router /* private authService: AuthService */
  ) {}

  ngOnInit(): void {
    this.buildForm();
  }

  private buildForm(): void {
    this.loginForm = this.fb.group({
      [this.formFields.name]: ['', Validators.required],
      [this.formFields.password]: ['', Validators.required],
    });
  }

  get name(): FormControl | null {
    return this.loginForm.get([this.formFields.name]) as FormControl;
  }

  get password(): FormControl | null {
    return this.loginForm.get([this.formFields.password]) as FormControl;
  }

  onSubmit(): void {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.valid) {
      this.router.navigate(['/account']);
      console.log(this.loginForm.value);
      /*       this.authService.login({
        name: this.loginForm.value[this.formFields.name],
        password: this.loginForm.value[this.formFields.password],
      }); */
    }
  }
}
