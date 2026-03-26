import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { provideServiceWorker } from '@angular/service-worker';
import { zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

import { routes } from './app.routes';

zxcvbnOptions.setOptions({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
});

// Attaches `withCredentials: true` to all requests that go to /api/auth.
// This tells the browser to include the HttpOnly refresh_token cookie
// on those requests. Without this, the browser withholds the cookie
// on cross-origin requests (development: port 4200 -> port 3000).
const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/auth')) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([credentialsInterceptor, authRefreshInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
