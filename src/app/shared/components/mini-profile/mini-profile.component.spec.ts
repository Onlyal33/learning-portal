import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MiniProfileComponent } from './mini-profile.component';

describe('MiniProfileComponent', () => {
  let component: MiniProfileComponent;
  let fixture: ComponentFixture<MiniProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiniProfileComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MiniProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
