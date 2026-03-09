import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ---- Auth-required routes ----
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/game-editor/game-list.component').then((m) => m.GameListComponent),
  },
  {
    path: 'games/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: 'games/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },

  // ---- Public routes ----
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'join/:joinCode',
    loadComponent: () =>
      import('./features/lobby/join.component').then((m) => m.JoinComponent),
  },
  {
    path: 'session/:id',
    loadComponent: () =>
      import('./features/game-session/game-session.component').then((m) => m.GameSessionComponent),
  },

  {
    path: '**',
    redirectTo: '',
  },
];
