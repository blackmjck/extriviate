import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { gameEditorGuard } from './features/game-editor/game-editor.guard';

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
    canDeactivate: [gameEditorGuard],
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: 'games/:id/host',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/host-session/host-session.component').then((m) => m.HostSessionComponent),
  },
  {
    path: 'games/:id',
    canActivate: [authGuard],
    canDeactivate: [gameEditorGuard],
    loadComponent: () =>
      import('./features/game-editor/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: 'categories',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/categories/category-list.component').then((m) => m.CategoryListComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'questions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/question-editor/question-list.component').then((m) => m.QuestionListComponent),
  },
  {
    path: 'questions/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/question-editor/question-editor.component').then((m) => m.QuestionEditorComponent),
  },
  {
    path: 'questions/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/question-editor/question-editor.component').then((m) => m.QuestionEditorComponent),
  },

  // ---- Public routes ----
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy/privacy.component').then((m) => m.PrivacyComponent),
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
      import('./features/game-session/game-session.component').then((m) => m.GameSessionComponent),
  },

  {
    path: '**',
    redirectTo: '',
  },
];
