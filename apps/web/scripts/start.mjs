import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.PORT ?? "3000";
const nextBin = new URL("../../../node_modules/next/dist/bin/next", import.meta.url);
const webRoot = fileURLToPath(new URL("..", import.meta.url));

const child = spawn(
  process.execPath,
  [nextBin.pathname, "start", "--hostname", "0.0.0.0", "--port", port],
  {
    cwd: webRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
