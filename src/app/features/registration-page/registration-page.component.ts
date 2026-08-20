import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  studentRegistrationFormFieldsArray,
  trainerRegistrationFormFieldsArray,
} from '../../shared/enums/user-forms.enum';
import { AuthService } from '../../auth/services/auth.service';

@Component({
  selector: 'app-registration-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonComponent,
    NgOptimizedImage,
  ],
  templateUrl: './registration-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './registration-page.component.scss',
})
export class RegistrationPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  registrationForm!: FormGroup;
  formType!: 'student' | 'trainer';
  formFields!:
    | typeof studentRegistrationFormFieldsArray
    | typeof trainerRegistrationFormFieldsArray;
  src!: string;

  ngOnInit(): void {
    this.buildForm();
  }

  private buildForm(): void {
    this.route.params.subscribe((params) => {
      this.formType = params['type'];
    });

    this.formFields =
      this.formType === 'student'
        ? studentRegistrationFormFieldsArray
        : trainerRegistrationFormFieldsArray;
    this.src = `registration/reg-${this.formType}s.jpg`;

    this.registrationForm = this.fb.group(
      this.formFields.reduce(
        (acc, field) => ({
          ...acc,
          [field.name]: field.required ? ['', Validators.required] : [''],
        }),
        {},
      ),
    );

    this.formFields.forEach((field) => {
      Object.defineProperty(this, field.name, {
        get: function () {
          return this.registrationForm.get(field.name) as FormControl;
        },
      });
    });
  }

  onSubmit(): void {
    this.registrationForm.markAllAsTouched();

    if (this.registrationForm.valid) {
      this.authService.register({
        ...this.registrationForm.value,
        role: this.formType,
      });
    }
  }
}
