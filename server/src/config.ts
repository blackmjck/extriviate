import "dotenv/config";
// dotenv/config is the side-effect import that loads .env into process.env
// It must be imported before anything else that reads process.env

function requireEnvVar(name: string): string {
  // Helper that throws immediately if a required env var is missing.
  // This gives a clear startup error instead of a cryptic runtime crash.
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalVar(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  server: {
    port: parseInt(optionalVar("PORT", "3000"), 10),
    host: optionalVar("HOST", "0.0.0.0"),
    // 0.0.0.0 binds to all network interfaces - required on Render
    nodeEnv: optionalVar("NODE_ENV", "development"),
  },
  db: {
    url: requireEnvVar("DATABASE_URL"),
  },
  redis: {
    url: optionalVar("REDIS_URL", ""),
    // Optional - if not set, the server runs without Redis.
    // The only degradation is that logout does not immediately invalidate
    // tokens; they expire naturally (access: 15m, refresh: 7d).
  },
  jwt: {
    secret: requireEnvVar("JWT_SECRET"),
    accessExpiry: optionalVar("JWT_ACCESS_EXPIRY", "15m"),
    refreshExpiry: optionalVar("JWT_REFRESH_EXPIRY", "7d"),
  },
  r2: {
    accountId: requireEnvVar("R2_ACCOUNT_ID"),
    accessKeyId: requireEnvVar("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvVar("R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnvVar("R2_BUCKET_NAME"),
    publicBaseUrl: requireEnvVar("R2_PUBLIC_BASE_URL"),
    // e.g. https://pub-YOURHASH.r2.dev
    // Kept as a config value rather than hardcoded as it can vary per environment
  },
  client: {
    url: optionalVar("CLIENT_URL", "http://localhost:4200"),
    // Used by CORS to allow requests from the Angular dev server
  },
} as const;
