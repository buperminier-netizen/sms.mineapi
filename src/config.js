import dotenv from "dotenv";

dotenv.config();

export function readConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  return {
    port: Number(env.PORT || 7060),
    databasePath: env.DATABASE_PATH || "./data/sms-mineapi.sqlite",
    sessionSecret: env.SESSION_SECRET || "dev-only-change-me",
    adminPassword: env.ADMIN_PASSWORD || "",
    defaultDurationDays: Number(env.DEFAULT_DURATION_DAYS || 25),
    smsFetchTimeoutMs: Number(env.SMS_FETCH_TIMEOUT_MS || 10000),
    autoRefreshSeconds: Number(env.AUTO_REFRESH_SECONDS || 10)
  };
}
