import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db.js";
import { startScheduler } from "./worker/scheduler.js";

const app = createApp();
const server = createServer(app);
const stopScheduler = startScheduler();

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", event: "server.started", port: env.PORT }));
});

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "server.stopping", signal }));
  stopScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
