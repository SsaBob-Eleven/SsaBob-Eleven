import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

export function notFoundHandler(request: Request, _response: Response, next: NextFunction) {
  next(new AppError(404, "ROUTE_NOT_FOUND", `${request.method} ${request.path} 경로를 찾을 수 없습니다.`));
}

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction) {
  const requestId = String(response.getHeader("X-Request-Id") ?? request.headers["x-request-id"] ?? "unknown");

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "요청 값이 올바르지 않습니다.",
        details: error.issues,
        requestId,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    response.status(409).json({
      error: {
        code: "REGISTRATION_ALREADY_EXISTS",
        message: "이미 사용 중인 값이 있어 요청을 처리할 수 없습니다.",
        details: null,
        requestId,
      },
    });
    return;
  }

  console.error(JSON.stringify({ level: "error", event: "request.failed", requestId, error }));
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "서버에서 오류가 발생했습니다.",
      details: null,
      requestId,
    },
  });
}
