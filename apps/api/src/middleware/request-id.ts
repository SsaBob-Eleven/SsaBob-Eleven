import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(request: Request, response: Response, next: NextFunction) {
  const id = request.header("X-Request-Id") ?? randomUUID();
  response.setHeader("X-Request-Id", id);
  next();
}
