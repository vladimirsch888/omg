import bcrypt from "bcryptjs";
import { z } from "zod";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Minimal password policy: 8+ characters and not a single repeated character
 * or a plain digit run. Deliberately lenient — the real defence against
 * guessing is the login rate limit — but "111111" should not pass.
 */
export const passwordSchema = z
  .string()
  .min(8, "Пароль должен быть не короче 8 символов")
  .max(128, "Пароль слишком длинный")
  .refine((p) => !/^(.)\1+$/.test(p), "Пароль не должен состоять из одного повторяющегося символа")
  .refine((p) => !/^\d+$/.test(p), "Пароль не должен состоять только из цифр");
