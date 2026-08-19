import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserStoreService } from '../../../user/services/user-store.service';
import { createUserStoreServiceDouble } from '../../../../testing/component-test-doubles';

import { ProfileComponent } from './profile.component';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        {
          provide: UserStoreService,
          useValue: createUserStoreServiceDouble(),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
