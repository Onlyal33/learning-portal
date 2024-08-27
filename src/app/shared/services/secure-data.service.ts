import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SecureDataService {
  private password: string | null = null;

  setPassword(password: string): void {
    this.password = password;
  }

  getPassword(): string | null {
    return this.password;
  }

  clearPassword(): void {
    this.password = null;
  }
}
