import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Flat reserve set aside from taxable income for the upcoming tax payment
  // (currently modelling a simplified УСН "доходы" ~7% — the precise
  // quarterly/threshold mechanics are intentionally out of scope for now).
  taxReservePercent: Number(process.env.TAX_RESERVE_PERCENT ?? 7),
};
