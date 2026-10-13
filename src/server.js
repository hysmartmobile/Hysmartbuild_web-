import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();
const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`HySmart Build API v5.12.0 listening on port ${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
});

server.keepAliveTimeout = 5_000;
server.headersTimeout = 65_000;
server.requestTimeout = 60_000;

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; draining HTTP connections.`);
  const forceTimer = setTimeout(() => {
    console.error("Forced shutdown after graceful shutdown timeout.");
    process.exit(1);
  }, 10_000);
  if (typeof forceTimer.unref === "function") forceTimer.unref();
  server.close((error) => {
    clearTimeout(forceTimer);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  shutdown("uncaughtException");
});
