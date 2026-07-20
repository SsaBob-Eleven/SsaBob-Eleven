import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { roundEventBus } from "../realtime/round-event-bus.js";

export const eventsRouter = Router();

eventsRouter.get("/", (request, response) => {
  const { roundId } = z.object({ roundId: z.string().uuid() }).parse(request.query);

  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const unsubscribe = roundEventBus.subscribe(roundId, (event) => {
    response.write(`id: ${event.id}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  response.write(
    `data: ${JSON.stringify({
      id: "connected",
      type: "connected",
      roundId,
      occurredAt: new Date().toISOString(),
      data: { subscriberCount: roundEventBus.subscriberCount(roundId) },
    })}\n\n`,
  );
  const heartbeat = setInterval(() => {
    response.write(`: heartbeat ${Date.now()}\n\n`);
  }, env.SSE_HEARTBEAT_INTERVAL_MS);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
});
