import { NgFor, NgIf, NgOptimizedImage } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  studentRegistrationFormFieldsArray,
  trainerRegistrationFormFieldsArray,
} from '../../shared/enums/user-forms.enum';
import { AuthService } from '../../auth/services/auth.service';

@Component({
  selector: 'app-registration-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonComponent,
    NgIf,
    NgFor,
    RouterLink,
    NgOptimizedImage,
  ],
  templateUrl: './registration-page.component.html',
  styleUrl: './registration-page.component.scss',
})
export class RegistrationPageComponent implements OnInit {
  registrationForm!: FormGroup;
  formType!: 'student' | 'trainer';
  formFields!:
    | typeof studentRegistrationFormFieldsArray
    | typeof trainerRegistrationFormFieldsArray;
  src!: string;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
  ) {}

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
