import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors.js";

export function getEditToken(request: Request): string {
  const token = request.header("X-Edit-Token");
  if (!token) throw new AppError(401, "INVALID_EDIT_TOKEN", "편집 토큰이 필요합니다.");
  return token;
}
export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  const authorization = request.header("Authorization");
  if (authorization !== `Bearer ${env.ADMIN_TOKEN}`) {
    next(new AppError(401, "INVALID_ADMIN_TOKEN", "관리자 인증 정보가 올바르지 않습니다."));
    return;
  }
  next();
}
