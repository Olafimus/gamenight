import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { startCleanupJob } from "./jobs/cleanup";

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
const { app, hub } = createApp({ db, env });
const cleanupTimer = startCleanupJob(db, hub);
const server = app.listen(env.port, () => {
  console.log(`server listening on http://localhost:${env.port}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  clearInterval(cleanupTimer);
  hub.close(); // ends SSE connections so server.close() can finish
  server.close(() => {
    pool
      .end()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  server.closeAllConnections?.();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
