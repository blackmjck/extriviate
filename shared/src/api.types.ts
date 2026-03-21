// A standard wrapper for all successful API responses.
// Having a consistent envelope shape means the Angular services
// always know where the data is and whether the call succeeded.
export interface ApiResponse<T> {
  success: true;
  data: T;
}

// A generic HTTP error response
export interface HttpError extends Error {
  code?: string; // optional machine-readable error code, e.g. "EMAIL_TAKEN"
  statusCode?: number;
}

// A generic inner wrapper for our custom error responses
export interface ApiErrorObject extends HttpError {
  message: string;
  field?: string; // optional field name for validation errors, e.g. "email"
}

// A standard wrapper for all API error responses
export interface APIError {
  success: false;
  error: ApiErrorObject;
}

// the union of success and error - what every API call can return.
export type ApiResult<T> = ApiResponse<T> | APIError;

// Pagination parameters - used as query params on list endpoints.
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// A paginated response wrapping a list of items
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
