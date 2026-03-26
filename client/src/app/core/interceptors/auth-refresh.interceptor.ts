import { inject } from '@angular/core';
import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Set to true on the retried request so the interceptor does not fire a second time. */
export const RETRY_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.context.get(RETRY_AFTER_REFRESH) &&
        !req.url.includes('/api/auth') &&
        req.headers.has('Authorization') &&
        authService.getAccessToken() !== null
      ) {
        return from(authService.refreshTokenOnce()).pipe(
          switchMap(() => {
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${authService.getAccessToken()!}` },
              context: new HttpContext().set(RETRY_AFTER_REFRESH, true),
            });
            return next(retried);
          }),
          catchError(() => {
            authService.logout();
            return throwError(() => err);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
