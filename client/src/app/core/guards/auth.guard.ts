import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes that require a logged-in registered user.
 *
 * On a fresh page load `currentUser` is null even when a valid token is in
 * localStorage, so we attempt `loadUser()` once before deciding. This avoids
 * a spurious redirect to /login for authenticated users who just refreshed.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  await auth.loadUser();

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
