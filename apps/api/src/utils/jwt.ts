import { sign, verify } from "hono/jwt";
import { config } from "../config";

export interface AuthTokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  /** Must match User.tokenVersion; a mismatch means "logged out everywhere". */
  tokenVersion: number;
  exp: number;
}

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

export function signToken(payload: Omit<AuthTokenPayload, "exp">): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SEVEN_DAYS_IN_SECONDS;
  return sign({ ...payload, exp }, config.jwtSecret);
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  return (await verify(token, config.jwtSecret, "HS256")) as unknown as AuthTokenPayload;
}
