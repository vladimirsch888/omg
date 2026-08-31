import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/asyncHandler";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
