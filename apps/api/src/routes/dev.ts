import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors.js";
import { requireAdmin } from "../middleware/auth.js";
import { DEV_ACTIONS, executeDevAction } from "../services/dev-service.js";
import { serializeRound } from "../services/serializers.js";

export const devRouter = Router();

devRouter.use((request, _response, next) => {
  if (env.NODE_ENV !== "development") {
    next(new AppError(404, "ROUTE_NOT_FOUND", `${request.method} ${request.path} 경로를 찾을 수 없습니다.`));
    return;
  }
  next();
});
devRouter.use(requireAdmin);

devRouter.post("/rounds/:roundId/actions", async (request, response) => {
  const roundId = z.string().uuid().parse(request.params.roundId);
  const body = z
    .object({
      action: z.enum(DEV_ACTIONS),
      count: z.number().int().min(1).max(26).optional(),
    })
    .strict()
    .parse(request.body);
  const result = await executeDevAction(roundId, body.action, body.count);
  response.json({ data: { round: serializeRound(result.round), message: result.message } });
});
