import { HttpErrorResponse } from '@angular/common/http';
import { APIError } from '@extriviate/shared';

/*
 * For try/catch blocks which catch HttpErrorResponses from the API,
 * this will help identify the ungainly construction that is an
 * HttpErrorResponse wrapping an APIError that results in code like this:
 * ```typescript
 * } catch (err: any) { // throws a lint error for use of 'any'
 *   doSomethingWith(err?.error?.error?.message ?? 'A default error message');
 * }
 * ```
 * Since `any` throws a lint error but `unknown` makes the next line throw
 * more errors, we needed some custom type guards for checking responses.
 *
 * Now we can use something like this and stay type-safe:
 * ```typescript
 * } catch (err: unknown) {
 *   let message: string = 'A default error message';
 *   if (isApiErrorResponse(err)) {
 *     message = err.error.error.message; // still ugly but at least it works lol
 *   } else if (err instanceof Error) {
 *     message = err.message;
 *   }
 *   doSomethingWith(message);
 * }
 * ```
 *
 * Note: you may still want to check for message length just to be sure.
 */

export interface ApiErrorResponse extends HttpErrorResponse {
  readonly error: APIError;
}

export function isApiError(e: unknown): e is APIError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'error' in e &&
    e.error !== null &&
    typeof e.error === 'object' &&
    'message' in e.error &&
    typeof e.error.message === 'string'
  );
}

export function isApiErrorResponse(e: unknown): e is ApiErrorResponse {
  return typeof e === 'object' && e !== null && 'error' in e && isApiError(e.error);
}
