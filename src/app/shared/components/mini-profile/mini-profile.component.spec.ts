import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniProfileComponent } from './mini-profile.component';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/services/auth.service';

describe('MiniProfileComponent', () => {
  let component: MiniProfileComponent;
  let fixture: ComponentFixture<MiniProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiniProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { logout: vi.fn().mockName('logout') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MiniProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
