export enum LoginFormFields {
  name = 'name',
  password = 'password',
}

export enum StudentRegistrationFormFields {
  firstName = 'firstName',
  lastName = 'lastName',
  email = 'email',
  address = 'address',
  dateOfBirth = 'dateOfBirth',
}

export enum TrainerRegistrationFormFields {
  firstName = 'firstName',
  lastName = 'lastName',
  email = 'email',
  specialization = 'specialization',
}

export const studentRegistrationFormFields = {
  firstName: { name: 'firstName', label: 'First name', required: true },
  lastName: { name: 'lastName', label: 'Last name', required: true },
  email: { name: 'email', label: 'Email', required: true },
  address: { name: 'address', label: 'Address  (optional)', required: false },
  dateOfBirth: { name: 'dateOfBirth', label: 'Date of birth (optional)', required: false },
}

export const trainerRegistrationFormFieldsArray = [
  { name: 'firstName', label: 'First name', required: true, type: 'text' },
  { name: 'lastName', label: 'Last name', required: true, type: 'text' },
  { name: 'email', label: 'Email', required: true, type: 'text' },
  { name: 'specialization', label: 'Specialization', required: true, type: 'text' },
]

export const studentRegistrationFormFieldsArray = [
  { name: 'firstName', label: 'First name', required: true, type: 'text' },
  { name: 'lastName', label: 'Last name', required: true, type: 'text' },
  { name: 'email', label: 'Email', required: true, type: 'text' },
  { name: 'address', label: 'Address  (optional)', required: false, type: 'text' },
  { name: 'dateOfBirth', label: 'Date of birth (optional)', required: false, type: 'text' },
]