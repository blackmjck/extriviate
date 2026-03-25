import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { gameEditorGuard } from './features/game-editor/game-editor.guard';

export const routes: Routes = [
  // ── Layout shell — header visible on all these routes ──────────────────
  {
    path: '',
    loadComponent: () =>
      import('./layouts/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      // ---- Public landing ----
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
      },

      // ---- Auth-required routes ----
      {
        path: 'games',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/game-editor/game-list.component').then((m) => m.GameListComponent),
      },
      {
        path: 'games/new',
        canActivate: [authGuard],
        canDeactivate: [gameEditorGuard],
        loadComponent: () =>
          import('./features/game-editor/game-editor.component').then(
            (m) => m.GameEditorComponent,
          ),
      },
      {
        path: 'games/:id/host',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/host-session/host-session.component').then(
            (m) => m.HostSessionComponent,
          ),
      },
      {
        path: 'games/:id',
        canActivate: [authGuard],
        canDeactivate: [gameEditorGuard],
        loadComponent: () =>
          import('./features/game-editor/game-editor.component').then(
            (m) => m.GameEditorComponent,
          ),
      },
      {
        path: 'categories',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/categories/category-list.component').then(
            (m) => m.CategoryListComponent,
          ),
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
          import('./features/question-editor/question-list.component').then(
            (m) => m.QuestionListComponent,
          ),
      },
      {
        path: 'questions/new',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/question-editor/question-editor.component').then(
            (m) => m.QuestionEditorComponent,
          ),
      },
      {
        path: 'questions/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/question-editor/question-editor.component').then(
            (m) => m.QuestionEditorComponent,
          ),
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
        path: 'logout',
        loadComponent: () =>
          import('./features/auth/logout.component').then((m) => m.LogoutComponent),
      },
      {
        path: 'signup',
        loadComponent: () =>
          import('./features/auth/signup.component').then((m) => m.SignupComponent),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      {
        path: 'join/:joinCode',
        loadComponent: () =>
          import('./features/lobby/join.component').then((m) => m.JoinComponent),
      },
    ],
  },

  // ── Game session — no header, full-screen experience ───────────────────
  {
    path: 'session/:id',
    loadComponent: () =>
      import('./features/game-session/game-session.component').then(
        (m) => m.GameSessionComponent,
      ),
  },

  {
    path: '**',
    redirectTo: '',
  },
];
