import { startEvaluationWorker } from "./queue/evaluation-worker.js";

async function main(): Promise<void> {
  const worker = startEvaluationWorker();

  const shutdown = async (signal: string) => {
    console.info(`[worker] received ${signal}; shutting down`);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error("[worker] fatal startup error", error);
  process.exit(1);
});
