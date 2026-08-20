import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideRouter } from '@angular/router';
import { SecureDataService } from '../../shared/services/secure-data.service';
import { UserStoreService } from '../../user/services/user-store.service';
import {
  createSecureDataServiceDouble,
  createUserStoreServiceDouble,
} from '../../../testing/component-test-doubles';

import { RegistrationSuccessPageComponent } from './registration-success-page.component';

describe('RegistrationSuccessPageComponent', () => {
  let component: RegistrationSuccessPageComponent;
  let fixture: ComponentFixture<RegistrationSuccessPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationSuccessPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: UserStoreService,
          useValue: createUserStoreServiceDouble(),
        },
        {
          provide: SecureDataService,
          useValue: createSecureDataServiceDouble(),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationSuccessPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
