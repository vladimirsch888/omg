import type { AuthTokenPayload } from "../utils/jwt";

export interface AppVariables {
  auth: AuthTokenPayload;
}

export interface AppEnv {
  Variables: AppVariables;
}
