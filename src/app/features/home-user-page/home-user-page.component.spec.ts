import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserStoreService } from '../../user/services/user-store.service';
import { createUserStoreServiceDouble } from '../../../testing/component-test-doubles';

import { HomeUserPageComponent } from './home-user-page.component';

describe('HomeUserPageComponent', () => {
  let component: HomeUserPageComponent;
  let fixture: ComponentFixture<HomeUserPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeUserPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: UserStoreService,
          useValue: createUserStoreServiceDouble(),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeUserPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
