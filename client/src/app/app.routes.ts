import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/game-editor/game-list.component').then((m) => m.GameListComponent),
  },
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
      import('./features/lobby/lobby.component').then((m) => m.LobbyComponent),
  },
  {
    path: 'games/new',
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: 'games/:id',
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
