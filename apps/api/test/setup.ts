// config.ts refuses to load without these; the unit tests never open a DB.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "unit-test-secret-that-is-long-enough-0123456789";
process.env.TZ = "Europe/Moscow";
