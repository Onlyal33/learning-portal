import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Component, OnInit } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { NgFor, NgIf } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Profile } from '../../models/user.model';

interface ProfileInfo {
  labelText: string;
  label: string;
  value: string;
  required: boolean;
  type: 'text' | 'date';
}

const labelToLabelText: { [key: string]: string } = {
  firstName: 'First Name',
  lastName: 'Last Name',
  username: 'Username',
  email: 'Email',
  dateOfBirth: 'Date of Birth',
  address: 'Address',
  specialization: 'Specialization',
};

const getlabelText = function getlabelText(label: string): string {
  return labelToLabelText[label] || label;
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ButtonComponent,
    NgFor,
    NgIf,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  profile: Profile = {
    id: '1',
    firstName: 'Marta',
    lastName: 'Black',
    username: 'Marta_st',
    email: 'example@example.com',
    photo: 'avatar.jpg',
    password: 'topsecret',
    isActive: true,
    userId: '1',
    dateOfBirth: '01.01.2001',
    address: '123 Main St, Anytown, USA',
  };
  profileInfo!: ProfileInfo[];
  profileForm!: FormGroup;
  editMode = false;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  initializeForm(): void {
    this.profileInfo = Object.entries(this.profile)
      .filter(
        ([key]) =>
          key !== 'id' &&
          key !== 'photo' &&
          key !== 'password' &&
          key !== 'userId' &&
          key !== 'isActive',
      )
      .map(([key, value]) => ({
        label: key,
        labelText: getlabelText(key),
        value,
        required:
          key === 'firstName' ||
          key === 'lastName' ||
          key === 'username' ||
          key === 'email' ||
          key === 'specialization',
        type: key === 'dateOfBirth' ? 'date' : 'text',
      }));

    this.profileForm = this.fb.group(
      this.profileInfo.reduce(
        (acc, field) => ({
          ...acc,
          [field.label]: field.required
            ? [field.value, Validators.required]
            : [field.value],
        }),
        {},
      ),
    );

    this.profileForm.addControl(
      'isActive',
      this.fb.control(this.profile.isActive, Validators.required),
    );
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
  }

  saveProfile(): void {
    if (this.profileForm.valid) {
      this.profile = { ...this.profile, ...this.profileForm.value };
      this.toggleEditMode();
    }
  }
}
