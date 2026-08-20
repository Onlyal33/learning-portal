import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BoxComponent } from './box.component';

describe('BoxComponent', () => {
  let component: BoxComponent;
  let fixture: ComponentFixture<BoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoxComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BoxComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Featured course');
    fixture.componentRef.setInput('tag', 'Learning');
    fixture.componentRef.setInput('src', 'box-1.jpg');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h6')?.textContent).toContain(
      'Featured course',
    );
  });
});
