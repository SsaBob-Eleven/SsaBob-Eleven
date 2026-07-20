import { env } from "../config/env.js";
import { runSchedulerTick } from "../services/round-service.js";

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerTick();
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "scheduler.tick.failed", error }));
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.SCHEDULER_POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
