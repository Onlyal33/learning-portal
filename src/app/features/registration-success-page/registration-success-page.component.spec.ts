import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegistrationSuccessPageComponent } from './registration-success-page.component';

describe('RegistrationSuccessPageComponent', () => {
  let component: RegistrationSuccessPageComponent;
  let fixture: ComponentFixture<RegistrationSuccessPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationSuccessPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegistrationSuccessPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
