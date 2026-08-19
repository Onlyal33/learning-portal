import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { createAuthServiceDouble } from '../../../testing/component-test-doubles';

import { RegistrationPageComponent } from './registration-page.component';
import { trainerRegistrationFormFieldsArray } from '../../shared/enums/user-forms.enum';

describe('StudentRegistrationPageComponent', () => {
  let component: RegistrationPageComponent;
  let fixture: ComponentFixture<RegistrationPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { params: of({ type: 'student' }) },
        },
        { provide: AuthService, useValue: createAuthServiceDouble() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the backend specializationId contract for trainer registration', () => {
    expect(
      trainerRegistrationFormFieldsArray.find(
        (field) => field.label === 'Specialization',
      )?.name,
    ).toBe('specializationId');
  });
});
