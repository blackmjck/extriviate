// Types for interacting with the Cloudflare Turnstile API

export interface TurnstileValidationSuccess {
  success: true;
  challenge_ts: string;
  hostname: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

export interface TurnstileValidationError {
  success: false;
  'error-codes': string[];
}

export type TurnstileValidationResponse = TurnstileValidationSuccess | TurnstileValidationError;
