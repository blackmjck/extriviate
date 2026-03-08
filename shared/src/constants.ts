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
