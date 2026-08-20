import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { JoinBoxComponent } from './join-box.component';

describe('JoinBoxComponent', () => {
  let component: JoinBoxComponent;
  let fixture: ComponentFixture<JoinBoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinBoxComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(JoinBoxComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('header', 'Start learning');
    fixture.componentRef.setInput('text', 'Learn at your own pace.');
    fixture.componentRef.setInput('src', 'join/trainers.png');
    fixture.componentRef.setInput('onClick', vi.fn().mockName('onClick'));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain(
      'Start learning',
    );
  });
});
