// Run the Bun API server (with --watch) and the Vite dev server together.

const procs = [
  Bun.spawn(["bun", "--watch", "server/main.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bunx", "--bun", "vite"], { stdout: "inherit", stderr: "inherit" }),
];

const shutdown = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await Promise.race(procs.map((p) => p.exited));
shutdown();

export {};
