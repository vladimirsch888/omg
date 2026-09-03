import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const jwtSecret = required("JWT_SECRET");
// The values that ship in .env.example and old docs. A server started with one
// of them would sign tokens anyone can forge — refuse outright rather than run.
const placeholderSecrets = ["dev-secret-change-me", "change-me-to-a-long-random-secret"];
if (placeholderSecrets.includes(jwtSecret) || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET is a placeholder or shorter than 32 characters. Generate one with: openssl rand -base64 48"
  );
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Flat reserve set aside from taxable income for the upcoming tax payment
  // (currently modelling a simplified УСН "доходы" ~7% — the precise
  // quarterly/threshold mechanics are intentionally out of scope for now).
  taxReservePercent: Number(process.env.TAX_RESERVE_PERCENT ?? 7),
  /**
   * Self-service sign-up creates a whole new organization. For a company's
   * own installation that door should be shut once the company exists: by
   * default registration works only while the database has no organizations
   * at all (first setup), and ALLOW_REGISTRATION=true reopens it.
   */
  allowRegistration: flag("ALLOW_REGISTRATION", false),
  /** Optional daily digest of renewals due / overdue, sent through a Telegram bot. */
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    /** Local hour (0–23) at which the digest goes out; TZ of the process applies. */
    digestHour: Number(process.env.TELEGRAM_DIGEST_HOUR ?? 9),
  },
};
