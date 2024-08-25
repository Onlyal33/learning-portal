import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinBoxComponent } from './join-box.component';

describe('JoinBoxComponent', () => {
  let component: JoinBoxComponent;
  let fixture: ComponentFixture<JoinBoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinBoxComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinBoxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
