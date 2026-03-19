// Game structure rules - these mirror the CHECK constraints in the database schema
export const GAME_CATEGORY_COUNT = 6; // exactly 6 columns per game
export const GAME_QUESTION_ROWS = 5; // exactly 5 questions per category
export const DAILY_DOUBLE_MAX = 2; // maximum daily doubles per game

// Display limits
export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_GAME_TITLE_LENGTH = 100;
export const MAX_USERNAME_LENGTH = 50;
export const MAX_DISPLAY_NAME_LENGTH = 100;
export const MAX_SESSION_NAME_LENGTH = 100;

// Upload limits
export const MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_IMAGE_SIZE_MBYTES = Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
export const MAX_VIDEO_SIZE_MBYTES = Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024));
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;

// Gameplay timers (milliseconds)
export const DAILY_DOUBLE_MIN_WAGER = 5;
export const BUZZ_WINDOW_DURATION_MS = 10_000; // how long buzzers stay open
export const ANSWER_TIMER_DURATION_MS = 10_000; // time to answer once buzzed in
export const ANSWER_REVEAL_DURATION_MS = 3_000; // show correct answer after round
export const TEXT_MIN_LOCK_MS = 2_000; // minimum reading-time lock
export const TEXT_MAX_LOCK_MS = 8_000; // maximum reading-time lock
export const WORDS_PER_MINUTE = 250; // used to calculate reading-time lock
export const IMAGE_MIN_VIEW_MS = 5_000; // minimum image viewing time
export const MAX_READY_WAIT_MS = 30_000; // max wait for all players ready
export const RECONNECT_GRACE_PERIOD_MS = 30_000; // disconnect grace before removal
export const GUEST_TOKEN_EXPIRY_HOURS = 4; // guest session token lifetime

// JWT
export const JWT_ACCESS_EXPIRY = '15m'; // short-lived access token
export const JWT_REFRESH_EXPIRY = '7d'; // longer-lived refresh token

// Session join
export const SESSION_CODE_LENGTH = 6; // e.g. "A3F9K2" - the short join code

// CloudFlare Turnstile Widget Testing Keys
export const CF_TEST_SITEKEYS = {
  PASS_VISIBLE: '1x00000000000000000000AA', // always passes while showing the widget
  PASS_INVISIBLE: '1x00000000000000000000BB', // always passes without showing the widget
  FAIL_VISIBLE: '2x00000000000000000000AB', // always fails while showing the widget
  FAIL_INVISIBLE: '2x00000000000000000000BB', // always fails without showing the widget
  CHALLENGE_VISIBLE: '3x00000000000000000000FF', // forces the interactive challenge
};
export const CF_SECRET_TEST_KEYS = {
  PASS: '1x0000000000000000000000000000000AA', // always passes (with the appropriate site key)
  FAIL: '2x0000000000000000000000000000000AA', // always fails (with any site key)
  FAIL_DUPLICATE: '3x0000000000000000000000000000000AA', // always fails and sends the "token already spent" error (`"timeout-or-duplicate"`)
};
export const CF_VERIFY_API = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Account lockout - brute force protection for the login endpoint
export const MAX_LOGIN_ATTEMPTS = 10; // failures before lockout kicks in
export const LOGIN_LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes
