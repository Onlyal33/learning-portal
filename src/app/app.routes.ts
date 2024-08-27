import { Routes } from '@angular/router';
import { notAuthorizedGuard } from './auth/guards/not-authorized.guard';
import { authorizedGuard } from './auth/guards/authorized.guard';
import { NotFoundComponent } from './shared/components/not-found/not-found.component';

export const routes: Routes = [
  {
    path: 'join',
    loadComponent: () =>
      import('./features/join-page/join-page.component').then(
        (mod) => mod.JoinPageComponent,
      ),
    canActivate: [notAuthorizedGuard],
  },
  {
    path: 'blog',
    loadComponent: () =>
      import('./features/blog-page/blog-page.component').then(
        (mod) => mod.BlogPageComponent,
      ),
  },
  {
    path: 'pricing',
    loadComponent: () =>
      import('./features/pricing-page/pricing-page.component').then(
        (mod) => mod.PricingPageComponent,
      ),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about-page/about-page.component').then(
        (mod) => mod.AboutPageComponent,
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login-page/login-page.component').then(
        (mod) => mod.LoginPageComponent,
      ),
    canActivate: [notAuthorizedGuard],
  },
  {
    path: 'registration/:type',
    loadComponent: () =>
      import('./features/registration-page/registration-page.component').then(
        (mod) => mod.RegistrationPageComponent,
      ),
    canActivate: [notAuthorizedGuard],
  },
  {
    path: 'registration-success',
    loadComponent: () =>
      import(
        './features/registration-success-page/registration-success-page.component'
      ).then((mod) => mod.RegistrationSuccessPageComponent),
    canActivate: [authorizedGuard],
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./features/home-user-page/home-user-page.component').then(
        (mod) => mod.HomeUserPageComponent,
      ),
    canActivate: [authorizedGuard],
  },
  {
    path: 'account',
    loadComponent: () =>
      import('./features/my-account-page/my-account-page.component').then(
        (mod) => mod.MyAccountPageComponent,
      ),
    canActivate: [authorizedGuard],
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/home-page/home-page.component').then(
        (mod) => mod.HomePageComponent,
      ),
    canActivate: [notAuthorizedGuard],
  },
  {
    path: '**',
    component: NotFoundComponent,
  },
];
