import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionStorageService } from './session-storage.service';
import { WINDOW } from '../../shared/tokens/window.token';

function token(payload: object): string {
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify(payload))}.signature`;
}

describe('SessionStorageService', () => {
  const now = 1_000_000;
  let storage: Storage;
  let service: SessionStorageService;

  beforeEach(() => {
    storage = new MapStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: WINDOW, useValue: { sessionStorage: storage } as Window },
      ],
    });
    service = TestBed.inject(SessionStorageService);
  });

  it('returns an unexpired token', () => {
    const validToken = token({ exp: now + 1 });
    service.setToken(validToken);

    expect(service.getValidToken(now)).toBe(validToken);
    expect(service.getToken()).toBe(validToken);
  });

  [
    ['malformed', 'not-a-jwt'],
    ['without an expiry', token({ sub: 'learner' })],
    ['expired', token({ exp: now - 1 })],
    ['at its expiry boundary', token({ exp: now })],
  ].forEach(([description, invalidToken]) => {
    it(`deletes and rejects a ${description} token`, () => {
      service.setToken(invalidToken);

      expect(service.getValidToken(now)).toBeNull();
      expect(service.getToken()).toBeNull();
    });
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
