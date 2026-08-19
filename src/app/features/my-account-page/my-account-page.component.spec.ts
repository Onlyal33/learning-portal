import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserStoreService } from '../../user/services/user-store.service';
import { createUserStoreServiceDouble } from '../../../testing/component-test-doubles';

import { MyAccountPageComponent } from './my-account-page.component';

describe('MyAccountPageComponent', () => {
  let component: MyAccountPageComponent;
  let fixture: ComponentFixture<MyAccountPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyAccountPageComponent],
      providers: [
        {
          provide: UserStoreService,
          useValue: createUserStoreServiceDouble(),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyAccountPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
